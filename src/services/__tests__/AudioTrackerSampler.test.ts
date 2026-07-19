import { describe, it, expect, afterEach } from "vitest";
import {
  createTrackerSession,
  addTrackerChannel,
  writeTrackerPattern,
  toSynthesizerConfig,
  deleteTrackerSession,
  type TrackerChannelSample,
} from "../AudioTrackerSessionManager.ts";
import {
  SamplerNode,
  renderModularGraph,
  noteToFreq,
  type SynthesizerConfig,
} from "../SoundSynthesizerService.ts";
import { decodeAudioToPcm } from "../AudioInputService.ts";

const createdSessions: string[] = [];

function makeSession(options: Parameters<typeof createTrackerSession>[0] = {}) {
  const session = createTrackerSession(options);
  createdSessions.push(session.sessionId);
  return session;
}

afterEach(() => {
  while (createdSessions.length > 0) {
    deleteTrackerSession(createdSessions.pop()!);
  }
});

function makeRampSample(length = 1000, sampleRate = 44100): TrackerChannelSample {
  const pcm = new Float32Array(length);
  for (let i = 0; i < length; i++) pcm[i] = i / length;
  return {
    pcm,
    sourceSampleRate: sampleRate,
    rootNote: "C4",
    loop: false,
    durationSeconds: length / sampleRate,
    sourceLabel: "test-ramp",
  };
}

// ────────────────────────────────────────────────────────────
// SamplerNode — playback and repitching
// ────────────────────────────────────────────────────────────

describe("SamplerNode", () => {
  const rootFrequency = noteToFreq("C4");

  it("plays back verbatim at the root note when rates match", () => {
    const pcm = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    const sampler = new SamplerNode(pcm, 44100, rootFrequency, false, 44100);
    const output = [0, 0, 0, 0, 0].map(() => sampler.process(rootFrequency));
    expect(output[0]).toBeCloseTo(0.1, 6);
    expect(output[1]).toBeCloseTo(0.2, 6);
    expect(output[4]).toBeCloseTo(0.5, 6);
  });

  it("advances twice as fast one octave above the root", () => {
    const pcm = new Float32Array(100).map((_, i) => i / 100);
    const sampler = new SamplerNode(pcm, 44100, rootFrequency, false, 44100);
    const octaveUp = noteToFreq("C5");
    sampler.process(octaveUp);
    sampler.process(octaveUp);
    // After 2 process calls at 2x speed the position is 4 source samples in
    expect(sampler.position).toBeCloseTo(4, 6);
  });

  it("compensates for source/output sample-rate mismatch", () => {
    const pcm = new Float32Array(100);
    const sampler = new SamplerNode(pcm, 22050, rootFrequency, false, 44100);
    sampler.process(rootFrequency);
    sampler.process(rootFrequency);
    // 22050 Hz source played at 44100 Hz advances half a source sample per tick
    expect(sampler.position).toBeCloseTo(1, 6);
  });

  it("goes silent after a one-shot sample ends", () => {
    const pcm = new Float32Array([0.5, 0.5, 0.5]);
    const sampler = new SamplerNode(pcm, 44100, rootFrequency, false, 44100);
    sampler.process(rootFrequency);
    sampler.process(rootFrequency);
    sampler.process(rootFrequency);
    expect(sampler.process(rootFrequency)).toBe(0);
    expect(sampler.process(rootFrequency)).toBe(0);
  });

  it("wraps around when looping is enabled", () => {
    const pcm = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const sampler = new SamplerNode(pcm, 44100, rootFrequency, true, 44100);
    for (let i = 0; i < 4; i++) sampler.process(rootFrequency);
    // Fifth call has wrapped back to the start of the buffer
    expect(sampler.process(rootFrequency)).toBeCloseTo(0.1, 6);
  });

  it("is silent for zero/negative frequency (REST rows)", () => {
    const pcm = new Float32Array([0.5, 0.5]);
    const sampler = new SamplerNode(pcm, 44100, rootFrequency, false, 44100);
    expect(sampler.process(0)).toBe(0);
    expect(sampler.position).toBe(0);
  });

  it("interpolates linearly between source samples", () => {
    const pcm = new Float32Array([0.0, 1.0]);
    // Half-rate source: position advances 0.5 per output sample
    const sampler = new SamplerNode(pcm, 22050, rootFrequency, false, 44100);
    expect(sampler.process(rootFrequency)).toBeCloseTo(0.0, 6);
    expect(sampler.process(rootFrequency)).toBeCloseTo(0.5, 6);
  });
});

// ────────────────────────────────────────────────────────────
// Tracker conversion — sampler channels
// ────────────────────────────────────────────────────────────

describe("toSynthesizerConfig with sampler channels", () => {
  it("builds a sampler node with a click-guard envelope and effects", () => {
    const session = makeSession();
    const sample = makeRampSample();
    addTrackerChannel(session.sessionId, {
      channelId: "vox",
      sample,
      effects: { reverb: { wet: 0.4 } },
    });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "vox",
      rows: [{ note: "C4" }, { note: "E4" }],
    });

    const { config } = toSynthesizerConfig(session.sessionId);
    expect(config).not.toBeNull();
    const nodes = config!.nodes!;
    expect(nodes["vox_sampler"]).toMatchObject({
      type: "sampler",
      sampleSourceRate: 44100,
      rootNote: "C4",
      loop: false,
    });
    expect(nodes["vox_sampler"].samplePcm).toBe(sample.pcm);
    expect(nodes["vox_env"]).toMatchObject({
      type: "envelope",
      attack: 0.002,
      sustain: 1.0,
    });
    expect(nodes["vox_reverb"]).toMatchObject({ type: "reverb", wet: 0.4 });
    expect(config!.tracks![0].nodeChain).toEqual([
      "vox_sampler",
      "vox_env",
      "vox_reverb",
    ]);
  });

  it("remaps drum trigger rows to the sample's root note", () => {
    const session = makeSession();
    addTrackerChannel(session.sessionId, {
      channelId: "kit",
      sample: makeRampSample(),
    });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "kit",
      rows: [{ note: "KICK" }, { note: "REST" }, { note: "SNARE" }],
    });

    const { config } = toSynthesizerConfig(session.sessionId);
    const notes = config!.tracks![0].notes;
    expect(notes).toHaveLength(2);
    expect(notes.every((note) => note.note === "C4")).toBe(true);
    // A sampler channel with drum symbols must NOT become a drum_synth
    expect(
      Object.values(config!.nodes!).some((node) => node.type === "drum_synth"),
    ).toBe(false);
  });

  it("keeps oscillator channels unchanged alongside sampler channels", () => {
    const session = makeSession();
    addTrackerChannel(session.sessionId, {
      channelId: "vox",
      sample: makeRampSample(),
    });
    addTrackerChannel(session.sessionId, {
      channelId: "bass",
      instrument: "synth_bass",
    });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "vox",
      rows: [{ note: "C4" }],
    });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "bass",
      rows: [{ note: "C2" }],
    });

    const { config } = toSynthesizerConfig(session.sessionId);
    expect(config!.nodes!["vox_sampler"].type).toBe("sampler");
    expect(config!.nodes!["bass_osc"].type).toBe("oscillator");
  });
});

// ────────────────────────────────────────────────────────────
// End-to-end render — sampler audio reaches the mix
// ────────────────────────────────────────────────────────────

describe("renderModularGraph with a sampler track", () => {
  it("renders non-silent output from sample PCM", () => {
    const pcm = new Float32Array(4410);
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = Math.sin((2 * Math.PI * 220 * i) / 44100) * 0.8;
    }
    const config: SynthesizerConfig = {
      soundType: "modular",
      sampleRate: 44100,
      nodes: {
        smp: {
          type: "sampler",
          samplePcm: pcm,
          sampleSourceRate: 44100,
          rootNote: "C4",
          loop: false,
        },
        env: { type: "envelope", attack: 0.002, decay: 0, sustain: 1.0, release: 0.01 },
      },
      tracks: [
        {
          nodeChain: ["smp", "env"],
          notes: [{ time: 0, duration: 0.1, note: "C4" }],
        },
      ],
      duration: 0.2,
    };

    const stereo = renderModularGraph(config);
    let peakDuringNote = 0;
    for (let i = 0; i < Math.floor(0.09 * 44100) * 2; i++) {
      peakDuringNote = Math.max(peakDuringNote, Math.abs(stereo[i]));
    }
    expect(peakDuringNote).toBeGreaterThan(0.1);

    // After the note ends (plus release), output returns to silence
    let peakAfterNote = 0;
    for (let i = Math.floor(0.15 * 44100) * 2; i < stereo.length; i++) {
      peakAfterNote = Math.max(peakAfterNote, Math.abs(stereo[i]));
    }
    expect(peakAfterNote).toBeLessThan(0.001);
  });
});

// ────────────────────────────────────────────────────────────
// decodeAudioToPcm — real ffmpeg round trip
// ────────────────────────────────────────────────────────────

function buildWavBuffer(
  samples: Float32Array,
  sampleRate: number,
): Buffer {
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
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
  return buffer;
}

describe("decodeAudioToPcm", () => {
  it("decodes a WAV to mono float PCM at the requested rate", async () => {
    const sourceRate = 44100;
    const seconds = 0.5;
    const samples = new Float32Array(Math.floor(sourceRate * seconds));
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sourceRate) * 0.5;
    }
    const wav = buildWavBuffer(samples, sourceRate);

    const decoded = await decodeAudioToPcm(wav, {
      sampleRate: sourceRate,
      maxDurationSeconds: 15,
    });

    expect(decoded.truncated).toBe(false);
    expect(decoded.sampleRate).toBe(sourceRate);
    expect(decoded.durationSeconds).toBeCloseTo(seconds, 1);
    // Signal survives the round trip at roughly the source amplitude
    let peak = 0;
    for (const value of decoded.pcm) peak = Math.max(peak, Math.abs(value));
    expect(peak).toBeGreaterThan(0.4);
    expect(peak).toBeLessThan(0.6);
  });

  it("truncates decodes past maxDurationSeconds and flags it", async () => {
    const sourceRate = 8000;
    const samples = new Float32Array(sourceRate * 2); // 2s of silence
    const wav = buildWavBuffer(samples, sourceRate);

    const decoded = await decodeAudioToPcm(wav, {
      sampleRate: 8000,
      maxDurationSeconds: 1,
    });

    expect(decoded.truncated).toBe(true);
    expect(decoded.pcm.length).toBe(8000);
    expect(decoded.durationSeconds).toBeCloseTo(1, 5);
  });

  it("rejects undecodable input", async () => {
    await expect(
      decodeAudioToPcm(Buffer.from("definitely not audio data"), {
        sampleRate: 44100,
        maxDurationSeconds: 15,
      }),
    ).rejects.toThrow();
  });
});
