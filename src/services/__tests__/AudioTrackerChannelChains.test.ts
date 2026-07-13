import { describe, it, expect, afterEach } from "vitest";
import {
  createTrackerSession,
  addTrackerChannel,
  writeTrackerPattern,
  toSynthesizerConfig,
  deleteTrackerSession,
  resolveDurationSteps,
  getAuthoredDurationSeconds,
} from "../AudioTrackerSessionManager.ts";
import { INSTRUMENT_PRESETS } from "../SoundSynthesizerService.ts";

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

describe("resolveDurationSteps", () => {
  it("passes through integer step counts", () => {
    expect(resolveDurationSteps(4, 4)).toBe(4);
    expect(resolveDurationSteps(1, 4)).toBe(1);
  });

  it("clamps to the 1-64 range", () => {
    expect(resolveDurationSteps(0.4, 4)).toBe(1);
    expect(resolveDurationSteps(999, 4)).toBe(64);
  });

  it("accepts numeric strings as step counts", () => {
    expect(resolveDurationSteps("4", 4)).toBe(4);
  });

  it("converts beat fractions using linesPerBeat", () => {
    // 1/4 note = 1 beat = linesPerBeat steps
    expect(resolveDurationSteps("1/4", 4)).toBe(4);
    expect(resolveDurationSteps("1/8", 4)).toBe(2);
    expect(resolveDurationSteps("1/16", 4)).toBe(1);
    expect(resolveDurationSteps("1/2", 4)).toBe(8);
    expect(resolveDurationSteps("1/4", 2)).toBe(2);
  });

  it("supports dotted and triplet modifiers", () => {
    expect(resolveDurationSteps("1/4d", 4)).toBe(6); // 1.5 beats
    expect(resolveDurationSteps("1/8d", 4)).toBe(3);
    expect(resolveDurationSteps("1/4t", 4)).toBe(3); // 2/3 beat... rounded
  });

  it("rejects uninterpretable values instead of silently defaulting", () => {
    expect(resolveDurationSteps("fast", 4)).toBeNull();
    expect(resolveDurationSteps("0/4", 4)).toBeNull();
    expect(resolveDurationSteps(NaN, 4)).toBeNull();
    expect(resolveDurationSteps(-2, 4)).toBeNull();
  });
});

describe("writeTrackerPattern — duration expansion", () => {
  it("expands beat-fraction durations into sustain rows", () => {
    const session = makeSession({ tempo: 120, linesPerBeat: 4 });
    addTrackerChannel(session.sessionId, { channelId: "lead" });

    const result = writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4", duration: "1/4" },
        { note: "E4", duration: "1/8" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.totalRows).toBe(6); // 4 steps + 2 steps
  });

  it("returns a row-indexed error for invalid durations", () => {
    const session = makeSession();
    addTrackerChannel(session.sessionId, { channelId: "lead" });

    const result = writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4", duration: 2 },
        { note: "E4", duration: "andante" },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Row 1");
    expect(result.error).toContain("'andante'");
  });
});

describe("toSynthesizerConfig — channel chains", () => {
  it("builds a drum_synth chain for channels containing drum triggers", () => {
    const session = makeSession();
    addTrackerChannel(session.sessionId, { channelId: "drums" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "drums",
      rows: [
        { note: "KICK", duration: 2 },
        { note: "SNARE", duration: 2 },
      ],
    });

    const { config } = toSynthesizerConfig(session.sessionId);
    expect(config).not.toBeNull();
    const nodeTypes = Object.values(config!.nodes!).map((node) => node.type);
    expect(nodeTypes).toContain("drum_synth");
    expect(nodeTypes).not.toContain("oscillator");
  });

  it("maps instrument preset waveform and envelope onto the channel chain", () => {
    const session = makeSession();
    addTrackerChannel(session.sessionId, {
      channelId: "keys",
      instrument: "piano",
    });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "keys",
      rows: [{ note: "C4", duration: 4 }],
    });

    const { config } = toSynthesizerConfig(session.sessionId);
    const nodes = Object.values(config!.nodes!);
    const oscillator = nodes.find((node) => node.type === "oscillator");
    const envelope = nodes.find((node) => node.type === "envelope");
    expect(oscillator?.waveform).toBe(INSTRUMENT_PRESETS.piano.waveform);
    expect(envelope?.attack).toBe(INSTRUMENT_PRESETS.piano.envelope.attack);
    expect(envelope?.release).toBe(INSTRUMENT_PRESETS.piano.envelope.release);
  });

  it("lets an explicit waveform override the instrument preset", () => {
    const session = makeSession();
    addTrackerChannel(session.sessionId, {
      channelId: "keys",
      instrument: "piano",
      waveform: "square",
    });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "keys",
      rows: [{ note: "C4", duration: 4 }],
    });

    const { config } = toSynthesizerConfig(session.sessionId);
    const oscillator = Object.values(config!.nodes!).find(
      (node) => node.type === "oscillator",
    );
    expect(oscillator?.waveform).toBe("square");
  });

  it("skips auto-repeat and target padding in preview mode", () => {
    // 8 rows at 120 BPM / LPB 4 = 1s of content, 10s target
    const session = makeSession({ tempo: 120, linesPerBeat: 4, duration: 10 });
    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [{ note: "C4", duration: 8 }],
    });

    const preview = toSynthesizerConfig(session.sessionId, { forPreview: true });
    expect(preview.config!.duration).toBeUndefined();
    expect(preview.config!.tracks![0].repeat).toBeUndefined();

    const full = toSynthesizerConfig(session.sessionId);
    expect(full.config!.duration).toBe(10);
    expect(full.config!.tracks![0].repeat).toBeGreaterThan(1);
  });
});

describe("getAuthoredDurationSeconds", () => {
  it("reports the longest channel's pattern length in seconds", () => {
    const session = makeSession({ tempo: 120, linesPerBeat: 4, duration: 10 });
    addTrackerChannel(session.sessionId, { channelId: "lead" });
    addTrackerChannel(session.sessionId, { channelId: "bass" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [{ note: "C4", duration: 16 }], // 16 steps = 2s
    });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "bass",
      rows: [{ note: "G1", duration: 8 }], // 8 steps = 1s
    });

    expect(getAuthoredDurationSeconds(session)).toBeCloseTo(2.0, 5);
  });
});
