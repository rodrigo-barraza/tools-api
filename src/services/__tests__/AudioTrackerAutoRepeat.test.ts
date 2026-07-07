import { describe, it, expect, afterEach } from "vitest";
import {
  createTrackerSession,
  addTrackerChannel,
  writeTrackerPattern,
  toSynthesizerConfig,
  deleteTrackerSession,
} from "../AudioTrackerSessionManager.ts";
import {
  generateAudioWav,
  computeTimelineDuration,
} from "../SoundSynthesizerService.ts";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const sessionIdsToCleanup: string[] = [];

afterEach(() => {
  for (const sessionId of sessionIdsToCleanup) {
    deleteTrackerSession(sessionId);
  }
  sessionIdsToCleanup.length = 0;
});

function trackSession(sessionId: string): string {
  sessionIdsToCleanup.push(sessionId);
  return sessionId;
}

const STANDARD_NODES = {
  oscillator: { type: "oscillator" as const, waveform: "sine" as const },
  envelope: {
    type: "envelope" as const,
    attack: 0.005,
    decay: 0.1,
    sustain: 0.5,
    release: 0.1,
  },
};

// ────────────────────────────────────────────────────────────
// 1. Auto-Repeat Count Computation
// ────────────────────────────────────────────────────────────

describe("toSynthesizerConfig — Auto-Repeat Pattern Fill", () => {
  it("sets repeat count when pattern is shorter than target duration", () => {
    const session = createTrackerSession({ duration: 10, tempo: 128 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "bass" });

    // 4 quarter notes at 128 BPM = 4 × 0.46875s ≈ 1.875s
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "bass",
      rows: Array.from({ length: 4 }, (_, index) => ({
        note: index % 2 === 0 ? "C2" : "E2",
        duration: "1/4",
      })),
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();

    const track = result.config!.tracks![0];
    // Pattern is ~1.875s, target is 10s → ceil(10 / 1.875) = 6 repeats
    expect(track.repeat).toBeDefined();
    expect(track.repeat).toBeGreaterThanOrEqual(5);
    expect(track.repeat).toBeLessThanOrEqual(7);
  });

  it("does not set repeat when pattern already fills the target duration", () => {
    const session = createTrackerSession({ duration: 5, tempo: 120 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });

    // 20 quarter notes at 120 BPM = 20 × 0.5s = 10s > 5s target
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: Array.from({ length: 20 }, () => ({
        note: "C4",
        duration: "1/4",
      })),
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();

    const track = result.config!.tracks![0];
    expect(track.repeat).toBeUndefined();
  });

  it("does not set repeat when no target duration is configured", () => {
    const session = createTrackerSession({ tempo: 120 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });

    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [{ note: "C4", duration: "1/4" }],
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();

    const track = result.config!.tracks![0];
    expect(track.repeat).toBeUndefined();
  });

  it("clamps repeat count to maximum of 64", () => {
    // Very short pattern, very long target → repeat should be capped at 64
    const session = createTrackerSession({ duration: 60, tempo: 120 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "tick" });

    // 1 sixteenth note at 120 BPM = 0.125s → 60 / 0.125 = 480, clamped to 64
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "tick",
      rows: [{ note: "C5", duration: "1/16" }],
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();

    const track = result.config!.tracks![0];
    expect(track.repeat).toBe(64);
  });

  it("computes independent repeat counts for each channel", () => {
    const session = createTrackerSession({ duration: 10, tempo: 120 });
    trackSession(session.sessionId);

    // Channel 1: short pattern (2 quarter notes = 1s)
    addTrackerChannel(session.sessionId, { channelId: "bass" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "bass",
      rows: [
        { note: "C2", duration: "1/4" },
        { note: "G2", duration: "1/4" },
      ],
    });

    // Channel 2: longer pattern (8 quarter notes = 4s)
    addTrackerChannel(session.sessionId, { channelId: "melody" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "melody",
      rows: Array.from({ length: 8 }, () => ({
        note: "E4",
        duration: "1/4",
      })),
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();

    const bassTrack = result.config!.tracks![0];
    const melodyTrack = result.config!.tracks![1];

    // Bass: 1s pattern → ceil(10/1) = 10 repeats
    // Melody: 4s pattern → ceil(10/4) = 3 repeats
    expect(bassTrack.repeat).toBeGreaterThan(melodyTrack.repeat!);
    expect(bassTrack.repeat).toBeGreaterThanOrEqual(9);
    expect(melodyTrack.repeat).toBeGreaterThanOrEqual(2);
    expect(melodyTrack.repeat).toBeLessThanOrEqual(4);
  });

  it("handles patterns with REST rows correctly in duration computation", () => {
    const session = createTrackerSession({ duration: 10, tempo: 120 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "rhythm" });

    // Pattern with alternating notes and rests
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "rhythm",
      rows: [
        { note: "C4", duration: "1/4" },
        { note: "REST", duration: "1/4" },
        { note: "E4", duration: "1/4" },
        { note: "REST", duration: "1/4" },
      ],
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();

    const track = result.config!.tracks![0];
    // REST rows advance time but don't produce NoteConfig entries,
    // but the actual notes still have time offsets that reflect the full pattern span.
    // The pattern spans 4 × 0.5s = 2s total, so repeat should fill 10s
    expect(track.repeat).toBeDefined();
    expect(track.repeat).toBeGreaterThanOrEqual(3);
  });
});

// ────────────────────────────────────────────────────────────
// 2. Audio Content Verification — The Actual Bug Fix
// ────────────────────────────────────────────────────────────

describe("Auto-Repeat — Audio Content Fills Target Duration", () => {
  it("short pattern at 128 BPM fills the full 10-second duration with actual audio", () => {
    const session = createTrackerSession({ duration: 10, tempo: 128 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "bass" });

    // 8 quarter notes at 128 BPM ≈ 3.75s of note content
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "bass",
      rows: Array.from({ length: 8 }, (_, index) => ({
        note: index % 2 === 0 ? "G1" : "A1",
        duration: "1/4",
        velocity: 1.0,
      })),
    });

    const configResult = toSynthesizerConfig(session.sessionId);
    expect(configResult.config).not.toBeNull();

    const audioResult = generateAudioWav(configResult.config!);
    const reportedDuration = audioResult.sampleCount / 44100;

    // Buffer should be at least 10 seconds
    expect(reportedDuration).toBeGreaterThanOrEqual(9.9);

    // Decode the WAV and verify audio content exists in the second half
    const audioBuffer = Buffer.from(audioResult.audioBase64, "base64");
    const headerSize = 44;
    const bytesPerSample = 2;
    const channelCount = 2;
    const totalAudioFrames = (audioBuffer.length - headerSize) / (bytesPerSample * channelCount);

    // Check the last 30% of the track for non-silence
    const startCheckFrame = Math.floor(totalAudioFrames * 0.7);
    let maximumAmplitudeInLastThird = 0;

    for (let frame = startCheckFrame; frame < totalAudioFrames; frame++) {
      const byteOffset = headerSize + frame * bytesPerSample * channelCount;
      if (byteOffset + 1 < audioBuffer.length) {
        const sampleValue = audioBuffer.readInt16LE(byteOffset);
        maximumAmplitudeInLastThird = Math.max(
          maximumAmplitudeInLastThird,
          Math.abs(sampleValue),
        );
      }
    }

    // With auto-repeat, the last 30% should have actual audio content (not silence)
    // 16-bit audio silence threshold: anything above ~100 indicates real audio
    expect(maximumAmplitudeInLastThird).toBeGreaterThan(100);
  });

  it("pattern with mixed durations fills the full target duration", () => {
    const session = createTrackerSession({ duration: 8, tempo: 100 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, {
      channelId: "mixed",
      instrument: "synth_bass",
    });

    // Mixed note durations: 1/4 + 1/8 + 1/8 + 1/4 = 1 beat = 0.6s at 100 BPM
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "mixed",
      rows: [
        { note: "C3", duration: "1/4" },
        { note: "E3", duration: "1/8" },
        { note: "G3", duration: "1/8" },
        { note: "C4", duration: "1/4" },
      ],
    });

    const configResult = toSynthesizerConfig(session.sessionId);
    expect(configResult.config).not.toBeNull();

    const track = configResult.config!.tracks![0];
    expect(track.repeat).toBeDefined();
    expect(track.repeat).toBeGreaterThanOrEqual(2);

    const audioResult = generateAudioWav(configResult.config!);
    const reportedDuration = audioResult.sampleCount / 44100;

    expect(reportedDuration).toBeGreaterThanOrEqual(7.9);
  });

  it("multi-channel auto-repeat produces correct timeline duration", () => {
    const session = createTrackerSession({ duration: 10, tempo: 128 });
    trackSession(session.sessionId);

    // Bass: 4 quarter notes ≈ 1.875s
    addTrackerChannel(session.sessionId, { channelId: "bass" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "bass",
      rows: Array.from({ length: 4 }, () => ({
        note: "C2",
        duration: "1/4",
      })),
    });

    // Drums: 8 eighth notes ≈ 1.875s
    addTrackerChannel(session.sessionId, { channelId: "drums" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "drums",
      rows: Array.from({ length: 8 }, () => ({
        note: "C4",
        duration: "1/8",
      })),
    });

    const configResult = toSynthesizerConfig(session.sessionId);
    expect(configResult.config).not.toBeNull();

    // Both tracks should have repeat counts set
    for (const track of configResult.config!.tracks!) {
      expect(track.repeat).toBeDefined();
      expect(track.repeat).toBeGreaterThanOrEqual(2);
    }

    // The expanded timeline should be at least the target duration
    const timelineDuration = computeTimelineDuration(
      configResult.config!.tracks!,
      configResult.config!.nodes!,
      configResult.config!.tempo!,
      configResult.config!.timeSignature![0],
    );

    expect(timelineDuration).toBeGreaterThanOrEqual(9.5);
  });
});

// ────────────────────────────────────────────────────────────
// 3. Edge Cases
// ────────────────────────────────────────────────────────────

describe("Auto-Repeat — Edge Cases", () => {
  it("pattern that exactly matches target duration gets no repeat", () => {
    const session = createTrackerSession({ duration: 4, tempo: 120 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "exact" });

    // 8 quarter notes at 120 BPM = 8 × 0.5s = 4.0s — exactly matches
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "exact",
      rows: Array.from({ length: 8 }, () => ({
        note: "C4",
        duration: "1/4",
      })),
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();

    const track = result.config!.tracks![0];
    // Pattern duration (4s) is NOT less than target (4s), so no repeat
    expect(track.repeat).toBeUndefined();
  });

  it("single-note pattern repeats correctly", () => {
    const session = createTrackerSession({ duration: 5, tempo: 120 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "single" });

    // 1 quarter note at 120 BPM = 0.5s
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "single",
      rows: [{ note: "A4", duration: "1/4" }],
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();

    const track = result.config!.tracks![0];
    // 0.5s pattern → ceil(5 / 0.5) = 10 repeats
    expect(track.repeat).toBe(10);
  });

  it("empty channel (no notes) does not get a repeat and does not crash", () => {
    const session = createTrackerSession({ duration: 10, tempo: 120 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "silent" });
    addTrackerChannel(session.sessionId, { channelId: "active" });

    // Only write to active channel
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "active",
      rows: [{ note: "C4", duration: "1/4" }],
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();

    // Only the active channel should produce a track
    // (empty channels are skipped by toSynthesizerConfig)
    expect(result.config!.tracks!.length).toBe(1);
  });

  it("numeric duration values in rows are handled for repeat computation", () => {
    const session = createTrackerSession({ duration: 10, tempo: 120 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "numeric" });

    // Using numeric seconds directly: 2 notes × 0.3s = 0.6s pattern
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "numeric",
      rows: [
        { note: "C4", duration: 0.3 },
        { note: "E4", duration: 0.3 },
      ],
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();

    const track = result.config!.tracks![0];
    // 0.6s pattern → ceil(10 / 0.6) = 17 repeats
    expect(track.repeat).toBeDefined();
    expect(track.repeat).toBeGreaterThanOrEqual(15);
    expect(track.repeat).toBeLessThanOrEqual(18);
  });
});
