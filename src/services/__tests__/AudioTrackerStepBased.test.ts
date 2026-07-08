import { describe, it, expect, afterEach } from "vitest";
import {
  createTrackerSession,
  addTrackerChannel,
  writeTrackerPattern,
  toSynthesizerConfig,
  getTrackerSession,
  deleteTrackerSession,
} from "../AudioTrackerSessionManager.ts";

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const trackedSessions: string[] = [];

function trackSession(sessionId: string): void {
  trackedSessions.push(sessionId);
}

afterEach(() => {
  for (const sessionId of trackedSessions) {
    deleteTrackerSession(sessionId);
  }
  trackedSessions.length = 0;
});

// ────────────────────────────────────────────────────────────
// 1. linesPerBeat Session Initialization
// ────────────────────────────────────────────────────────────

describe("Step Grid — linesPerBeat Initialization", () => {
  it("defaults linesPerBeat to 4 when not specified", () => {
    const session = createTrackerSession({ tempo: 120 });
    trackSession(session.sessionId);
    expect(session.linesPerBeat).toBe(4);
  });

  it("accepts custom linesPerBeat values", () => {
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 8 });
    trackSession(session.sessionId);
    expect(session.linesPerBeat).toBe(8);
  });

  it("clamps linesPerBeat to valid range [1, 16]", () => {
    const tooLow = createTrackerSession({ linesPerBeat: 0 });
    trackSession(tooLow.sessionId);
    expect(tooLow.linesPerBeat).toBe(1);

    const tooHigh = createTrackerSession({ linesPerBeat: 32 });
    trackSession(tooHigh.sessionId);
    expect(tooHigh.linesPerBeat).toBe(16);
  });

  it("persists linesPerBeat in session state", () => {
    const session = createTrackerSession({ tempo: 140, linesPerBeat: 6 });
    trackSession(session.sessionId);
    const retrieved = getTrackerSession(session.sessionId);
    expect(retrieved?.linesPerBeat).toBe(6);
  });
});

// ────────────────────────────────────────────────────────────
// 2. Step Grid — Note Timing
// ────────────────────────────────────────────────────────────

describe("Step Grid — Note Timing", () => {
  it("places notes at correct grid positions based on row index", () => {
    // LPB=4, 120 BPM: rowDuration = 60/120/4 = 0.125s
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },
        { note: "D4" },
        { note: "E4" },
        { note: "F4" },
      ],
    });

    const result = toSynthesizerConfig(session.sessionId);
    const notes = result.config!.tracks![0].notes;

    expect(notes).toHaveLength(4);
    expect(notes[0].time).toBeCloseTo(0.0, 4);
    expect(notes[1].time).toBeCloseTo(0.125, 4);
    expect(notes[2].time).toBeCloseTo(0.25, 4);
    expect(notes[3].time).toBeCloseTo(0.375, 4);
  });

  it("calculates single-step note duration when no sustain follows", () => {
    // Each note is immediately followed by another note → 1 step duration
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },
        { note: "D4" },
        { note: "E4" },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;

    const expectedRowDuration = 60 / 120 / 4; // 0.125s
    for (const note of notes) {
      expect(note.duration as number).toBeCloseTo(expectedRowDuration, 4);
    }
  });
});

// ────────────────────────────────────────────────────────────
// 3. Step Grid — Sustain/Empty Rows (---)
// ────────────────────────────────────────────────────────────

describe("Step Grid — Sustain Rows", () => {
  it("extends note duration through --- sustain rows", () => {
    // C4 followed by 3 sustain rows = 4 steps = 1 quarter note at LPB=4
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },
        { note: "---" },
        { note: "---" },
        { note: "---" },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;

    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe("C4");
    expect(notes[0].time).toBeCloseTo(0.0, 4);
    // 4 steps × 0.125s = 0.5s (quarter note at 120 BPM)
    expect(notes[0].duration as number).toBeCloseTo(0.5, 4);
  });

  it("supports ... as an alias for ---", () => {
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },
        { note: "..." },
        { note: "..." },
        { note: "..." },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;
    expect(notes).toHaveLength(1);
    expect(notes[0].duration as number).toBeCloseTo(0.5, 4);
  });

  it("handles mixed note and sustain patterns", () => {
    // C4 (2 steps) → E4 (1 step) → G4 (3 steps)
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },      // step 0: C4 trigger
        { note: "---" },     // step 1: sustain C4
        { note: "E4" },      // step 2: E4 trigger (cuts C4)
        { note: "G4" },      // step 3: G4 trigger (cuts E4)
        { note: "---" },     // step 4: sustain G4
        { note: "---" },     // step 5: sustain G4
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;
    const rowDuration = 60 / 120 / 4; // 0.125s

    expect(notes).toHaveLength(3);

    // C4: starts at 0, spans 2 steps
    expect(notes[0].note).toBe("C4");
    expect(notes[0].time).toBeCloseTo(0.0, 4);
    expect(notes[0].duration as number).toBeCloseTo(2 * rowDuration, 4);

    // E4: starts at step 2, spans 1 step
    expect(notes[1].note).toBe("E4");
    expect(notes[1].time).toBeCloseTo(2 * rowDuration, 4);
    expect(notes[1].duration as number).toBeCloseTo(1 * rowDuration, 4);

    // G4: starts at step 3, spans 3 steps (to end of pattern)
    expect(notes[2].note).toBe("G4");
    expect(notes[2].time).toBeCloseTo(3 * rowDuration, 4);
    expect(notes[2].duration as number).toBeCloseTo(3 * rowDuration, 4);
  });
});

// ────────────────────────────────────────────────────────────
// 4. Step Grid — Note-Off (===, OFF, KEY_OFF)
// ────────────────────────────────────────────────────────────

describe("Step Grid — Note-Off Events", () => {
  it("=== terminates the previous note early", () => {
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },      // step 0
        { note: "---" },     // step 1: sustain
        { note: "===" },     // step 2: note-off → C4 plays for 2 steps
        { note: "---" },     // step 3: silence (nothing to sustain)
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;
    const rowDuration = 60 / 120 / 4;

    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe("C4");
    // C4 spans steps 0-1, terminated by === at step 2
    expect(notes[0].duration as number).toBeCloseTo(2 * rowDuration, 4);
  });

  it("OFF works the same as ===", () => {
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },
        { note: "---" },
        { note: "OFF" },
        { note: "---" },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;
    expect(notes).toHaveLength(1);
    expect(notes[0].duration as number).toBeCloseTo(2 * (60 / 120 / 4), 4);
  });

  it("note-off does not produce a NoteConfig entry", () => {
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "===" },     // note-off with nothing playing
        { note: "---" },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;
    expect(notes).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// 5. Step Grid — REST/SILENCE (note-off alias)
// ────────────────────────────────────────────────────────────

describe("Step Grid — REST/SILENCE Events", () => {
  it("REST terminates the previous note (same as note-off)", () => {
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },
        { note: "---" },
        { note: "REST" },
        { note: "E4" },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;
    const rowDuration = 60 / 120 / 4;

    expect(notes).toHaveLength(2);
    // C4 plays for 2 steps (terminated by REST)
    expect(notes[0].duration as number).toBeCloseTo(2 * rowDuration, 4);
    // E4 plays for 1 step (last row)
    expect(notes[1].time as number).toBeCloseTo(3 * rowDuration, 4);
    expect(notes[1].duration as number).toBeCloseTo(1 * rowDuration, 4);
  });

  it("SILENCE works the same as REST", () => {
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },
        { note: "SILENCE" },
        { note: "E4" },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;
    expect(notes).toHaveLength(2);
    expect(notes[0].duration as number).toBeCloseTo(60 / 120 / 4, 4);
  });
});

// ────────────────────────────────────────────────────────────
// 6. Step Grid — Velocity Preservation
// ────────────────────────────────────────────────────────────

describe("Step Grid — Velocity", () => {
  it("preserves per-note velocity in NoteConfig output", () => {
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4", velocity: 0.5 },
        { note: "E4", velocity: 0.8 },
        { note: "G4" },  // no velocity → undefined (synthesizer defaults to 1.0)
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;

    expect(notes[0].velocity).toBe(0.5);
    expect(notes[1].velocity).toBe(0.8);
    expect(notes[2].velocity).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// 7. Step Grid — Different LPB Values
// ────────────────────────────────────────────────────────────

describe("Step Grid — Variable LPB", () => {
  it("LPB=2 produces 8th note grid resolution", () => {
    // LPB=2, 120 BPM: rowDuration = 60/120/2 = 0.25s (8th note)
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 2 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },
        { note: "E4" },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;

    expect(notes[0].time).toBeCloseTo(0.0, 4);
    expect(notes[0].duration as number).toBeCloseTo(0.25, 4);
    expect(notes[1].time).toBeCloseTo(0.25, 4);
    expect(notes[1].duration as number).toBeCloseTo(0.25, 4);
  });

  it("LPB=8 produces 32nd note grid resolution", () => {
    // LPB=8, 120 BPM: rowDuration = 60/120/8 = 0.0625s (32nd note)
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 8 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },
        { note: "---" },
        { note: "---" },
        { note: "---" },
        { note: "---" },
        { note: "---" },
        { note: "---" },
        { note: "---" },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;

    // 1 note spanning 8 steps = 8 × 0.0625 = 0.5s (quarter note)
    expect(notes).toHaveLength(1);
    expect(notes[0].duration as number).toBeCloseTo(0.5, 4);
  });

  it("LPB=1 produces quarter note grid resolution", () => {
    // LPB=1, 120 BPM: rowDuration = 60/120/1 = 0.5s (quarter note)
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 1 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "C4" },
        { note: "E4" },
        { note: "G4" },
        { note: "C5" },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;

    expect(notes).toHaveLength(4);
    // Each note = 0.5s (quarter note)
    for (const note of notes) {
      expect(note.duration as number).toBeCloseTo(0.5, 4);
    }
  });
});

// ────────────────────────────────────────────────────────────
// 8. Step Grid — Empty Pattern (no notes)
// ────────────────────────────────────────────────────────────

describe("Step Grid — Edge Cases", () => {
  it("pattern of only empty rows produces zero notes", () => {
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "---" },
        { note: "---" },
        { note: "---" },
        { note: "---" },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;
    expect(notes).toHaveLength(0);
  });

  it("last note in pattern extends to pattern end", () => {
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [
        { note: "---" },
        { note: "---" },
        { note: "C4" },  // note at step 2, extends to end (step 3)
        { note: "---" },
      ],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;
    const rowDuration = 60 / 120 / 4;

    expect(notes).toHaveLength(1);
    expect(notes[0].time as number).toBeCloseTo(2 * rowDuration, 4);
    // Sustains through step 3 (to end of pattern)
    expect(notes[0].duration as number).toBeCloseTo(2 * rowDuration, 4);
  });

  it("single note with no sustain rows gets 1-step duration", () => {
    const session = createTrackerSession({ tempo: 120, linesPerBeat: 4 });
    trackSession(session.sessionId);

    addTrackerChannel(session.sessionId, { channelId: "lead" });
    writeTrackerPattern({
      sessionId: session.sessionId,
      channelId: "lead",
      rows: [{ note: "C4" }],
    });

    const notes = toSynthesizerConfig(session.sessionId).config!.tracks![0].notes;
    expect(notes).toHaveLength(1);
    expect(notes[0].duration as number).toBeCloseTo(60 / 120 / 4, 4);
  });
});
