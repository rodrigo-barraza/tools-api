import { describe, it, expect, afterEach } from "vitest";
import {
  createTrackerSession,
  getTrackerSession,
  addTrackerChannel,
  writeTrackerPattern,
  toSynthesizerConfig,
  deleteTrackerSession,
} from "../AudioTrackerSessionManager.ts";
import {
  generateAudioWav,
  renderModularGraph,
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
// 1. Session Parameter Storage
// ────────────────────────────────────────────────────────────

describe("createTrackerSession — Parameter Storage", () => {
  it("stores duration, tempo, time signature, sample rate, swing, and humanize", () => {
    const session = createTrackerSession({
      duration: 15,
      tempo: 140,
      timeSignature: [3, 4],
      sampleRate: 22050,
      swing: 0.3,
      humanize: 0.2,
    });
    trackSession(session.sessionId);

    expect(session.duration).toBe(15);
    expect(session.tempo).toBe(140);
    expect(session.timeSignature).toEqual([3, 4]);
    expect(session.sampleRate).toBe(22050);
    expect(session.swing).toBe(0.3);
    expect(session.humanize).toBe(0.2);
  });

  it("clamps duration to 0.1–60.0", () => {
    const tooShort = createTrackerSession({ duration: 0.01 });
    trackSession(tooShort.sessionId);
    expect(tooShort.duration).toBe(0.1);

    const tooLong = createTrackerSession({ duration: 120 });
    trackSession(tooLong.sessionId);
    expect(tooLong.duration).toBe(60.0);
  });

  it("clamps tempo to 20–300", () => {
    const tooSlow = createTrackerSession({ tempo: 5 });
    trackSession(tooSlow.sessionId);
    expect(tooSlow.tempo).toBe(20);

    const tooFast = createTrackerSession({ tempo: 500 });
    trackSession(tooFast.sessionId);
    expect(tooFast.tempo).toBe(300);
  });

  it("leaves duration undefined when not provided", () => {
    const session = createTrackerSession({ tempo: 120 });
    trackSession(session.sessionId);
    expect(session.duration).toBeUndefined();
  });

  it("applies sensible defaults when no options are given", () => {
    const session = createTrackerSession();
    trackSession(session.sessionId);

    expect(session.tempo).toBe(120);
    expect(session.timeSignature).toEqual([4, 4]);
    expect(session.sampleRate).toBe(44100);
    expect(session.swing).toBe(0);
    expect(session.humanize).toBe(0);
    expect(session.duration).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// 2. Parameter Preservation Across Workflow Steps
// ────────────────────────────────────────────────────────────

describe("Session Parameter Preservation — Full Tracker Workflow", () => {
  it("preserves all session parameters after add_channel and write_pattern", () => {
    const session = createTrackerSession({
      duration: 10,
      tempo: 128,
      timeSignature: [4, 4],
      sampleRate: 44100,
      swing: 0.4,
      humanize: 0.15,
    });
    trackSession(session.sessionId);

    // Step: add_channel — should not mutate session-level params
    addTrackerChannel(session.sessionId, {
      channelId: "bass",
      instrument: "synth_bass",
    });

    const afterChannel = getTrackerSession(session.sessionId)!;
    expect(afterChannel.duration).toBe(10);
    expect(afterChannel.tempo).toBe(128);
    expect(afterChannel.timeSignature).toEqual([4, 4]);
    expect(afterChannel.sampleRate).toBe(44100);
    expect(afterChannel.swing).toBe(0.4);
    expect(afterChannel.humanize).toBe(0.15);

    // Step: write_pattern — should not mutate session-level params
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "bass",
      rows: [
        { note: "C2", duration: "1/4" },
        { note: "E2", duration: "1/4" },
        { note: "G2", duration: "1/4" },
        { note: "C3", duration: "1/4" },
      ],
    });

    const afterPattern = getTrackerSession(session.sessionId)!;
    expect(afterPattern.duration).toBe(10);
    expect(afterPattern.tempo).toBe(128);
    expect(afterPattern.timeSignature).toEqual([4, 4]);
    expect(afterPattern.sampleRate).toBe(44100);
    expect(afterPattern.swing).toBe(0.4);
    expect(afterPattern.humanize).toBe(0.15);

    // Step: add second channel + pattern — still preserved
    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "E4", duration: "1/8" },
        { note: "G4", duration: "1/8" },
      ],
    });

    const afterSecondChannel = getTrackerSession(session.sessionId)!;
    expect(afterSecondChannel.duration).toBe(10);
    expect(afterSecondChannel.tempo).toBe(128);
    expect(afterSecondChannel.channels).toHaveLength(2);
  });

  it("preserves multiple pattern writes on the same channel", () => {
    const session = createTrackerSession({ duration: 10, tempo: 128 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "melody" });

    // First batch
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "melody",
      rows: Array.from({ length: 8 }, (_, index) => ({
        note: `C${3 + (index % 3)}`,
        duration: "1/4" as const,
      })),
    });

    // Second batch (appended)
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "melody",
      rows: Array.from({ length: 8 }, (_, index) => ({
        note: `E${3 + (index % 3)}`,
        duration: "1/4" as const,
      })),
    });

    const afterBothWrites = getTrackerSession(session.sessionId)!;
    expect(afterBothWrites.duration).toBe(10);
    expect(afterBothWrites.tempo).toBe(128);
    expect(afterBothWrites.channels[0].pattern).toHaveLength(16);
  });
});

// ────────────────────────────────────────────────────────────
// 3. toSynthesizerConfig — Propagation to Renderer
// ────────────────────────────────────────────────────────────

describe("toSynthesizerConfig — Parameter Propagation", () => {
  it("propagates all session parameters into the SynthesizerConfig", () => {
    const session = createTrackerSession({
      duration: 10,
      tempo: 128,
      timeSignature: [3, 4],
      sampleRate: 22050,
      swing: 0.5,
      humanize: 0.2,
    });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [{ note: "C4", duration: "1/4" }],
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();

    const config = result.config!;
    expect(config.duration).toBe(10);
    expect(config.tempo).toBe(128);
    expect(config.timeSignature).toEqual([3, 4]);
    expect(config.sampleRate).toBe(22050);
    expect(config.swing).toBe(0.5);
    expect(config.humanize).toBe(0.2);
    expect(config.soundType).toBe("modular");
  });

  it("omits duration from config when session has no target duration", () => {
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
    expect(result.config!.duration).toBeUndefined();
  });

  it("omits swing/humanize from config when they are zero", () => {
    const session = createTrackerSession({ tempo: 120, swing: 0, humanize: 0 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [{ note: "C4", duration: "1/4" }],
    });

    const result = toSynthesizerConfig(session.sessionId);
    expect(result.config).not.toBeNull();
    expect(result.config!.swing).toBeUndefined();
    expect(result.config!.humanize).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// 4. Duration Floor Semantics in renderModularGraph
// ────────────────────────────────────────────────────────────

describe("renderModularGraph — Duration Floor Semantics", () => {
  const shortNotes = [
    { time: 0, duration: 0.5, note: "C4" },
    { time: 0.5, duration: 0.5, note: "E4" },
  ];

  it("uses config.duration as a minimum buffer length when notes are shorter", () => {
    const result = renderModularGraph({
      soundType: "modular",
      sampleRate: 44100,
      tempo: 120,
      duration: 10,
      nodes: STANDARD_NODES,
      tracks: [{ nodeChain: ["oscillator", "envelope"], notes: shortNotes }],
    });

    // renderModularGraph returns stereo interleaved: length = frames × 2
    const actualDuration = result.length / 2 / 44100;
    expect(actualDuration).toBeGreaterThanOrEqual(9.9);
    expect(actualDuration).toBeLessThanOrEqual(10.1);
  });

  it("does not truncate audio when notes exceed config.duration (Math.max, not override)", () => {
    const longNotes = Array.from({ length: 30 }, (_, index) => ({
      time: index * 0.5,
      duration: 0.5,
      note: "C4",
    }));

    const timelineDuration = computeTimelineDuration(
      [{ nodeChain: ["oscillator", "envelope"], notes: longNotes }],
      STANDARD_NODES,
      120,
      4,
    );

    const result = renderModularGraph({
      soundType: "modular",
      sampleRate: 44100,
      tempo: 120,
      duration: 5,
      nodes: STANDARD_NODES,
      tracks: [{ nodeChain: ["oscillator", "envelope"], notes: longNotes }],
    });

    const actualDuration = result.length / 2 / 44100;
    expect(actualDuration).toBeGreaterThanOrEqual(timelineDuration - 0.2);
  });

  it("falls back to timeline computation when no config.duration is set", () => {
    const timelineDuration = computeTimelineDuration(
      [{ nodeChain: ["oscillator", "envelope"], notes: shortNotes }],
      STANDARD_NODES,
      120,
      4,
    );

    const result = renderModularGraph({
      soundType: "modular",
      sampleRate: 44100,
      tempo: 120,
      nodes: STANDARD_NODES,
      tracks: [{ nodeChain: ["oscillator", "envelope"], notes: shortNotes }],
    });

    const actualDuration = result.length / 2 / 44100;
    expect(actualDuration).toBeCloseTo(timelineDuration, 0);
  });
});

// ────────────────────────────────────────────────────────────
// 5. Tempo Fidelity — Beat Fraction Timing
// ────────────────────────────────────────────────────────────

describe("Tempo Fidelity — Beat Fractions Respect Session Tempo", () => {
  it("quarter notes at 128 BPM produce ~0.469s per note", () => {
    const session = createTrackerSession({ tempo: 128 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "test" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "test",
      rows: Array.from({ length: 4 }, () => ({
        note: "C4",
        duration: "1/4",
      })),
    });

    const result = toSynthesizerConfig(session.sessionId);
    const config = result.config!;
    const notes = config.tracks![0].notes;

    // At 128 BPM: 1 beat = 60/128 = 0.46875s
    const expectedBeatDuration = 60 / 128;

    for (const note of notes) {
      const noteDuration = typeof note.duration === "number"
        ? note.duration
        : parseFloat(String(note.duration));
      expect(noteDuration).toBeCloseTo(expectedBeatDuration, 4);
    }

    // Total span should be ~4 × 0.46875 = 1.875s
    const lastNote = notes[notes.length - 1];
    const lastNoteTime = typeof lastNote.time === "number"
      ? lastNote.time
      : parseFloat(String(lastNote.time));
    const totalSpan = lastNoteTime + expectedBeatDuration;
    expect(totalSpan).toBeCloseTo(4 * expectedBeatDuration, 3);
  });

  it("eighth notes at 90 BPM produce ~0.333s per note", () => {
    const session = createTrackerSession({ tempo: 90 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "test" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "test",
      rows: Array.from({ length: 4 }, () => ({
        note: "E4",
        duration: "1/8",
      })),
    });

    const result = toSynthesizerConfig(session.sessionId);
    const notes = result.config!.tracks![0].notes;

    // At 90 BPM: 1 eighth note = (60/90)/2 = 0.333...s
    const expectedEighthDuration = 60 / 90 / 2;

    for (const note of notes) {
      const noteDuration = typeof note.duration === "number"
        ? note.duration
        : parseFloat(String(note.duration));
      expect(noteDuration).toBeCloseTo(expectedEighthDuration, 4);
    }
  });

  it("different tempos produce proportionally different durations for the same beat fractions", () => {
    // 8 quarter notes at 120 BPM = 4 seconds
    const sessionSlow = createTrackerSession({ tempo: 120 });
    trackSession(sessionSlow.sessionId);
    addTrackerChannel(sessionSlow.sessionId, { channelId: "test" });
    writeTrackerPattern({
      sessionId: sessionSlow.sessionId,
      channelId: "test",
      rows: Array.from({ length: 8 }, () => ({ note: "C4", duration: "1/4" })),
    });
    const configSlow = toSynthesizerConfig(sessionSlow.sessionId).config!;

    // 8 quarter notes at 240 BPM = 2 seconds (half the time)
    const sessionFast = createTrackerSession({ tempo: 240 });
    trackSession(sessionFast.sessionId);
    addTrackerChannel(sessionFast.sessionId, { channelId: "test" });
    writeTrackerPattern({
      sessionId: sessionFast.sessionId,
      channelId: "test",
      rows: Array.from({ length: 8 }, () => ({ note: "C4", duration: "1/4" })),
    });
    const configFast = toSynthesizerConfig(sessionFast.sessionId).config!;

    const slowLastNote = configSlow.tracks![0].notes[7];
    const fastLastNote = configFast.tracks![0].notes[7];

    const slowEndTime = (slowLastNote.time as number) + (slowLastNote.duration as number);
    const fastEndTime = (fastLastNote.time as number) + (fastLastNote.duration as number);

    // 120 BPM track should be exactly 2× the length of the 240 BPM track
    expect(slowEndTime / fastEndTime).toBeCloseTo(2.0, 4);
  });
});

// ────────────────────────────────────────────────────────────
// 6. generateAudioWav — Stereo Frame Count
// ────────────────────────────────────────────────────────────

describe("generateAudioWav — Stereo Frame Count Correctness", () => {
  it("returns sampleCount as audio frames, not interleaved buffer length", () => {
    const result = generateAudioWav({
      soundType: "modular",
      sampleRate: 44100,
      tempo: 120,
      nodes: STANDARD_NODES,
      tracks: [
        {
          nodeChain: ["oscillator", "envelope"],
          notes: [
            { time: 0, duration: 0.5, note: "C4" },
            { time: 0.5, duration: 0.5, note: "E4" },
          ],
        },
      ],
    });

    // sampleCount / sampleRate should give the actual duration in seconds,
    // NOT double it (the old bug where stereo interleaved length was returned)
    const reportedDuration = result.sampleCount / 44100;
    expect(reportedDuration).toBeGreaterThan(0.9);
    expect(reportedDuration).toBeLessThan(2.5);
  });

  it("regression: 22 quarter notes at 128 BPM reports ~10.6s not ~21.2s", () => {
    const twentyTwoQuarterNotes = Array.from({ length: 22 }, (_, index) => ({
      time: index * (60 / 128),
      duration: 60 / 128,
      note: index < 8 ? "G1" : "A1",
    }));

    const result = generateAudioWav({
      soundType: "modular",
      sampleRate: 44100,
      tempo: 128,
      nodes: STANDARD_NODES,
      tracks: [
        {
          nodeChain: ["oscillator", "envelope"],
          notes: twentyTwoQuarterNotes,
        },
      ],
    });

    const reportedDuration = result.sampleCount / 44100;
    // 22 × 0.46875s = 10.3125s + release ≈ 10.5s
    // Old bug reported ~21.2s (exactly 2× due to stereo interleaving)
    expect(reportedDuration).toBeGreaterThanOrEqual(10);
    expect(reportedDuration).toBeLessThanOrEqual(12);
  });

  it("mono synthesis modes return correct sampleCount too", () => {
    const result = generateAudioWav({
      soundType: "melody",
      sampleRate: 44100,
      melody: [
        { note: "C4", duration: 0.5 },
        { note: "E4", duration: 0.5 },
      ],
    });

    // Melody mode is mono — sampleCount should equal frames directly
    const reportedDuration = result.sampleCount / 44100;
    expect(reportedDuration).toBeGreaterThanOrEqual(0.9);
    expect(reportedDuration).toBeLessThanOrEqual(1.5);
  });
});

// ────────────────────────────────────────────────────────────
// 7. Full End-to-End Pipeline — Original Bug Reproduction
// ────────────────────────────────────────────────────────────

describe("Full Pipeline — init → add_channel → write_pattern → render", () => {
  it("reproduces and verifies the fix for the original 4s-instead-of-10s bug", () => {
    // Exact reproduction: user asked for 10s at 128 BPM, LLM only wrote 8 quarter notes
    const session = createTrackerSession({ duration: 10, tempo: 128 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "bass" });

    // Only 8 quarter notes — at 128 BPM this is only ~4s of note content
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
    expect(configResult.config!.duration).toBe(10);
    expect(configResult.config!.tempo).toBe(128);

    // Generate the actual audio
    const audioResult = generateAudioWav(configResult.config!);
    const reportedDuration = audioResult.sampleCount / 44100;

    // With the duration floor fix: should be at least 10 seconds
    // Before the fix: would have been ~4 seconds
    expect(reportedDuration).toBeGreaterThanOrEqual(9.9);
    expect(reportedDuration).toBeLessThanOrEqual(10.2);
  });

  it("produces correct duration when LLM writes enough notes to exceed target", () => {
    const session = createTrackerSession({ duration: 5, tempo: 120 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });

    // 20 quarter notes at 120 BPM = 10 seconds — exceeds the 5s target
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: Array.from({ length: 20 }, () => ({
        note: "C4",
        duration: "1/4",
      })),
    });

    const audioResult = generateAudioWav(toSynthesizerConfig(session.sessionId).config!);
    const reportedDuration = audioResult.sampleCount / 44100;

    // Should NOT truncate to 5s — Math.max ensures notes win
    expect(reportedDuration).toBeGreaterThanOrEqual(9.5);
  });

  it("produces correct duration with no target duration set", () => {
    const session = createTrackerSession({ tempo: 120 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });

    // 8 quarter notes at 120 BPM = 4 seconds
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: Array.from({ length: 8 }, () => ({
        note: "C4",
        duration: "1/4",
      })),
    });

    const audioResult = generateAudioWav(toSynthesizerConfig(session.sessionId).config!);
    const reportedDuration = audioResult.sampleCount / 44100;

    // 8 × 0.5s = 4s + release ≈ 4.2s
    expect(reportedDuration).toBeGreaterThanOrEqual(3.8);
    expect(reportedDuration).toBeLessThanOrEqual(5.0);
  });

  it("multi-channel composition preserves tempo across all channels", () => {
    const session = createTrackerSession({ duration: 10, tempo: 128 });
    trackSession(session.sessionId);

    // Channel 1: bass with quarter notes
    addTrackerChannel(session.sessionId, { channelId: "bass" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "bass",
      rows: Array.from({ length: 16 }, () => ({
        note: "C2",
        duration: "1/4",
      })),
    });

    // Channel 2: melody with eighth notes
    addTrackerChannel(session.sessionId, { channelId: "melody" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "melody",
      rows: Array.from({ length: 32 }, (_, index) => ({
        note: `C${4 + (index % 2)}`,
        duration: "1/8",
      })),
    });

    const configResult = toSynthesizerConfig(session.sessionId);
    const config = configResult.config!;

    // Both channels should share the same tempo
    expect(config.tempo).toBe(128);
    expect(config.duration).toBe(10);
    expect(config.tracks).toHaveLength(2);

    // Bass: 16 quarter notes at 128 BPM = 16 × 0.46875 = 7.5s
    // Melody: 32 eighth notes at 128 BPM = 32 × 0.234375 = 7.5s
    // Both should end at roughly the same time
    const bassNotes = config.tracks![0].notes;
    const melodyNotes = config.tracks![1].notes;

    const bassEnd = (bassNotes[bassNotes.length - 1].time as number)
      + (bassNotes[bassNotes.length - 1].duration as number);
    const melodyEnd = (melodyNotes[melodyNotes.length - 1].time as number)
      + (melodyNotes[melodyNotes.length - 1].duration as number);

    expect(bassEnd).toBeCloseTo(melodyEnd, 3);

    // Generate audio — should be at least 10s due to duration floor
    const audioResult = generateAudioWav(config);
    const reportedDuration = audioResult.sampleCount / 44100;
    expect(reportedDuration).toBeGreaterThanOrEqual(9.9);
  });
});
