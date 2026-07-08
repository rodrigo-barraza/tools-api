import { describe, it, expect } from "vitest";
import {
  synthesizeSpeech,
  getSupportedVoices,
  isEspeakAvailable,
} from "../TextToSpeechService.ts";

// ═══════════════════════════════════════════════════════════════
//  getSupportedVoices
// ═══════════════════════════════════════════════════════════════

describe("getSupportedVoices", () => {
  it("returns a map of voice codes to display names", () => {
    const voices = getSupportedVoices();
    expect(typeof voices).toBe("object");
    expect(Object.keys(voices).length).toBeGreaterThan(10);
    expect(voices["en-us"]).toBe("English (American)");
    expect(voices["en-gb"]).toBe("English (British)");
    expect(voices["fr"]).toBe("French");
    expect(voices["ja"]).toBe("Japanese");
  });

  it("returns a defensive copy (not a reference)", () => {
    const voicesFirst = getSupportedVoices();
    const voicesSecond = getSupportedVoices();
    expect(voicesFirst).not.toBe(voicesSecond);
    expect(voicesFirst).toEqual(voicesSecond);
  });
});

// ═══════════════════════════════════════════════════════════════
//  isEspeakAvailable
// ═══════════════════════════════════════════════════════════════

describe("isEspeakAvailable", () => {
  it("returns a boolean", async () => {
    const available = await isEspeakAvailable();
    expect(typeof available).toBe("boolean");
  });
});

// ═══════════════════════════════════════════════════════════════
//  synthesizeSpeech — Validation
// ═══════════════════════════════════════════════════════════════

describe("synthesizeSpeech — input validation", () => {
  it("throws on empty text", async () => {
    await expect(synthesizeSpeech({ text: "" })).rejects.toThrow("required");
  });

  it("throws on whitespace-only text", async () => {
    await expect(synthesizeSpeech({ text: "   " })).rejects.toThrow("required");
  });

  it("throws on text exceeding 10,000 characters", async () => {
    await expect(
      synthesizeSpeech({ text: "x".repeat(10_001) }),
    ).rejects.toThrow("maximum length");
  });
});

// ═══════════════════════════════════════════════════════════════
//  synthesizeSpeech — Synthesis (requires espeak-ng)
// ═══════════════════════════════════════════════════════════════

describe("synthesizeSpeech — audio generation", async () => {
  const available = await isEspeakAvailable();

  it.skipIf(!available)("synthesizes speech with default parameters", async () => {
    const result = await synthesizeSpeech({ text: "Hello world" });
    expect(result.audioBase64).toBeTruthy();
    expect(result.audioBase64.length).toBeGreaterThan(100);
    expect(result.mimeType).toBe("audio/wav");
    expect(result.voice).toBe("en-us");
    expect(result.textLength).toBe(11);
    expect(result.durationEstimateSeconds).toBeGreaterThan(0);
  });

  it.skipIf(!available)("respects custom voice parameter", async () => {
    const result = await synthesizeSpeech({
      text: "Bonjour le monde",
      voice: "fr",
    });
    expect(result.voice).toBe("fr");
    expect(result.audioBase64.length).toBeGreaterThan(100);
  });

  it.skipIf(!available)("respects speed and pitch parameters", async () => {
    const resultSlow = await synthesizeSpeech({
      text: "Testing speed",
      speed: 100,
      pitch: 30,
    });
    const resultFast = await synthesizeSpeech({
      text: "Testing speed",
      speed: 400,
      pitch: 80,
    });
    // Both should succeed but with different audio data
    expect(resultSlow.audioBase64).toBeTruthy();
    expect(resultFast.audioBase64).toBeTruthy();
    // The duration estimate should be different
    expect(resultSlow.durationEstimateSeconds).toBeGreaterThan(
      resultFast.durationEstimateSeconds,
    );
  });

  it.skipIf(!available)("produces valid WAV base64", async () => {
    const result = await synthesizeSpeech({ text: "WAV check" });
    const wavBuffer = Buffer.from(result.audioBase64, "base64");
    // WAV files start with "RIFF" magic bytes
    expect(wavBuffer.toString("ascii", 0, 4)).toBe("RIFF");
    // Followed by file size, then "WAVE"
    expect(wavBuffer.toString("ascii", 8, 12)).toBe("WAVE");
  });
});
