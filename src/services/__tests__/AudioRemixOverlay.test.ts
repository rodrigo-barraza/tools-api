import { describe, it, expect } from "vitest";
import { processAudio } from "../AudioRemixService.ts";
import { validateAudioRemixInput } from "../AudioRemixValidation.ts";
import { decodeAudioToPcm } from "../AudioInputService.ts";

const SAMPLE_RATE = 44100;

function buildWavDataUri(samples: Float32Array, sampleRate: number): string {
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return `data:audio/wav;base64,${buffer.toString("base64")}`;
}

function silence(seconds: number): string {
  return buildWavDataUri(
    new Float32Array(Math.floor(SAMPLE_RATE * seconds)),
    SAMPLE_RATE,
  );
}

function tone(seconds: number, frequency = 440, amplitude = 0.5): string {
  const samples = new Float32Array(Math.floor(SAMPLE_RATE * seconds));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE) * amplitude;
  }
  return buildWavDataUri(samples, SAMPLE_RATE);
}

function rms(pcm: Float32Array, startSeconds: number, endSeconds: number): number {
  const start = Math.floor(startSeconds * SAMPLE_RATE);
  const end = Math.min(Math.floor(endSeconds * SAMPLE_RATE), pcm.length);
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / (end - start));
}

describe("processAudio overlays", () => {
  it("mixes an overlay into the base track at the given offset", async () => {
    const result = await processAudio({
      input: silence(2),
      overlays: [{ source: tone(0.5), offset: 1.0 }],
    });

    expect(result.appliedOperations).toContain("overlay×1");
    expect(result.durationSeconds).toBeCloseTo(2, 0);

    const decoded = await decodeAudioToPcm(result.buffer, {
      sampleRate: SAMPLE_RATE,
      maxDurationSeconds: 15,
    });
    // Silent before the overlay enters, audible during it
    expect(rms(decoded.pcm, 0.1, 0.9)).toBeLessThan(0.01);
    expect(rms(decoded.pcm, 1.05, 1.4)).toBeGreaterThan(0.1);
  });

  it("mixes multiple overlays, each with its own offset", async () => {
    const result = await processAudio({
      input: silence(3),
      overlays: [
        { source: tone(0.4, 330), offset: 0.5 },
        { source: tone(0.4, 550), offset: 2.0 },
      ],
    });

    const decoded = await decodeAudioToPcm(result.buffer, {
      sampleRate: SAMPLE_RATE,
      maxDurationSeconds: 15,
    });
    expect(rms(decoded.pcm, 0.6, 0.85)).toBeGreaterThan(0.1);
    expect(rms(decoded.pcm, 1.2, 1.9)).toBeLessThan(0.01);
    expect(rms(decoded.pcm, 2.1, 2.35)).toBeGreaterThan(0.1);
  });

  it("cuts overlays at the base length by default, extends with mixDuration longest", async () => {
    const cut = await processAudio({
      input: silence(1),
      overlays: [{ source: tone(2.5) }],
    });
    expect(cut.durationSeconds).toBeLessThan(1.3);

    const extended = await processAudio({
      input: silence(1),
      overlays: [{ source: tone(2.5) }],
      mixDuration: "longest",
    });
    expect(extended.durationSeconds).toBeGreaterThan(2.2);
  });

  it("concatenates segments end-to-end after the input", async () => {
    const result = await processAudio({
      input: tone(1, 220),
      concatenate: [tone(1, 440), silence(0.5)],
    });

    expect(result.appliedOperations).toContain("concat×2");
    expect(result.durationSeconds).toBeCloseTo(2.5, 0);
  });

  it("combines operations on the base with overlays", async () => {
    const result = await processAudio({
      input: tone(2, 220, 0.3),
      operations: [{ type: "volume", level: 0.5 }],
      overlays: [{ source: tone(0.5, 660), offset: 0.5, volume: 2 }],
    });
    expect(result.appliedOperations).toEqual(["volume", "overlay×1"]);
    expect(result.durationSeconds).toBeCloseTo(2, 0);
  });
});

describe("validateAudioRemixInput — overlays/concatenate", () => {
  const validInput = { input: "https://example.com/a.wav" };

  it("accepts a well-formed overlay list", () => {
    expect(
      validateAudioRemixInput({
        ...validInput,
        overlays: [{ source: "https://example.com/b.wav", offset: 2, volume: 1.5 }],
      }),
    ).toBeNull();
  });

  it("rejects the 'attached' sentinel on overlay sources with targeted guidance", () => {
    const error = validateAudioRemixInput({
      ...validInput,
      overlays: [{ source: "attached" }],
    });
    expect(error).toMatch(/only works for the main 'input'/);
  });

  it("caps the overlay count at 8", () => {
    const overlays = Array.from({ length: 9 }, () => ({
      source: "https://example.com/b.wav",
    }));
    expect(validateAudioRemixInput({ ...validInput, overlays })).toMatch(
      /Too many overlays/,
    );
  });

  it("rejects out-of-range offset and volume", () => {
    expect(
      validateAudioRemixInput({
        ...validInput,
        overlays: [{ source: "https://example.com/b.wav", offset: 999 }],
      }),
    ).toMatch(/offset/);
    expect(
      validateAudioRemixInput({
        ...validInput,
        overlays: [{ source: "https://example.com/b.wav", volume: 9 }],
      }),
    ).toMatch(/volume/);
  });

  it("rejects invalid concatenate entries and mixDuration values", () => {
    expect(
      validateAudioRemixInput({ ...validInput, concatenate: ["not-a-url"] }),
    ).toMatch(/concatenate\[0\]/);
    expect(
      validateAudioRemixInput({ ...validInput, mixDuration: "both" }),
    ).toMatch(/mixDuration/);
  });
});
