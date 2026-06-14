import { describe, it, expect } from "vitest";
import { validateSynthesizerInput } from "../SoundSynthesizerValidation.ts";

describe("validateSynthesizerInput", () => {
  it("returns null for a valid simple tone config", () => {
    const result = validateSynthesizerInput({
      waveform: "sine",
      frequency: 440,
      duration: 1.0,
    });
    expect(result).toBeNull();
  });

  it("returns null for a valid preset effect config", () => {
    const result = validateSynthesizerInput({
      presetEffect: "laser",
    });
    expect(result).toBeNull();
  });

  it("returns null for a valid modular config", () => {
    const result = validateSynthesizerInput({
      soundType: "modular",
      tempo: 120,
      nodes: {
        oscillator: { type: "oscillator", waveform: "sine" },
        envelope: { type: "envelope", attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.15 },
      },
      tracks: [
        {
          nodeChain: ["oscillator", "envelope", "destination"],
          notes: [{ time: "1.1.1", duration: "0.1.0", note: "C4" }],
        },
      ],
    });
    expect(result).toBeNull();
  });

  it("returns null for a valid melody config", () => {
    const result = validateSynthesizerInput({
      soundType: "melody",
      melody: [
        { note: "C4", duration: 0.5 },
        { note: "E4", duration: 0.5 },
      ],
    });
    expect(result).toBeNull();
  });

  it("rejects invalid soundType", () => {
    const result = validateSynthesizerInput({
      soundType: "invalid_type" as never,
    });
    expect(result).toContain("Invalid soundType");
    expect(result).toContain("invalid_type");
  });

  it("rejects invalid waveform", () => {
    const result = validateSynthesizerInput({
      waveform: "wobble" as never,
    });
    expect(result).toContain("Invalid waveform");
    expect(result).toContain("wobble");
  });

  it("rejects invalid presetEffect", () => {
    const result = validateSynthesizerInput({
      presetEffect: "thunder" as never,
    });
    expect(result).toContain("Invalid presetEffect");
    expect(result).toContain("thunder");
  });

  it("rejects invalid instrument", () => {
    const result = validateSynthesizerInput({
      instrument: "theremin",
    });
    expect(result).toContain("Invalid instrument");
    expect(result).toContain("theremin");
  });

  it("accepts valid instrument preset", () => {
    const result = validateSynthesizerInput({
      instrument: "piano",
      frequency: 440,
    });
    expect(result).toBeNull();
  });

  it("rejects frequency below valid range", () => {
    const result = validateSynthesizerInput({
      frequency: 0,
    });
    expect(result).toContain("Invalid frequency");
  });

  it("rejects frequency above valid range", () => {
    const result = validateSynthesizerInput({
      frequency: 30000,
    });
    expect(result).toContain("Invalid frequency");
  });

  it("accepts note name as frequency", () => {
    const result = validateSynthesizerInput({
      frequency: "C4",
    });
    expect(result).toBeNull();
  });

  it("rejects duration below valid range", () => {
    const result = validateSynthesizerInput({
      duration: 0.001,
    });
    expect(result).toContain("Invalid duration");
  });

  it("rejects duration above valid range", () => {
    const result = validateSynthesizerInput({
      duration: 120,
    });
    expect(result).toContain("Invalid duration");
  });

  it("rejects sampleRate below valid range", () => {
    const result = validateSynthesizerInput({
      sampleRate: 4000,
    });
    expect(result).toContain("Invalid sampleRate");
  });

  it("rejects sampleRate above valid range", () => {
    const result = validateSynthesizerInput({
      sampleRate: 96000,
    });
    expect(result).toContain("Invalid sampleRate");
  });

  it("rejects tempo below valid range", () => {
    const result = validateSynthesizerInput({
      tempo: 5,
    });
    expect(result).toContain("Invalid tempo");
  });

  it("rejects tempo above valid range", () => {
    const result = validateSynthesizerInput({
      tempo: 1500,
    });
    expect(result).toContain("Invalid tempo");
  });

  it("rejects melody mode without melody array", () => {
    const result = validateSynthesizerInput({
      soundType: "melody",
    });
    expect(result).toContain("non-empty 'melody' array");
  });

  it("rejects melody mode with empty melody array", () => {
    const result = validateSynthesizerInput({
      soundType: "melody",
      melody: [],
    });
    expect(result).toContain("non-empty 'melody' array");
  });

  it("rejects melody step missing both note and frequency", () => {
    const result = validateSynthesizerInput({
      soundType: "melody",
      melody: [{ duration: 0.5 } as never],
    });
    expect(result).toContain("Melody step at index 0");
    expect(result).toContain("note");
  });

  it("rejects modular mode without nodes", () => {
    const result = validateSynthesizerInput({
      soundType: "modular",
      tracks: [
        {
          nodeChain: ["oscillator"],
          notes: [{ time: "1.1.1", duration: "0.1.0", note: "C4" }],
        },
      ],
    });
    expect(result).toContain("'nodes' object");
  });

  it("rejects modular mode without tracks", () => {
    const result = validateSynthesizerInput({
      soundType: "modular",
      nodes: {
        oscillator: { type: "oscillator" },
      },
    });
    expect(result).toContain("non-empty 'tracks' array");
  });

  it("rejects node with invalid type", () => {
    const result = validateSynthesizerInput({
      soundType: "modular",
      nodes: {
        myNode: { type: "compressor" as never },
      },
      tracks: [
        {
          nodeChain: ["myNode"],
          notes: [{ time: "1.1.1", duration: "0.1.0", note: "C4" }],
        },
      ],
    });
    expect(result).toContain("invalid type 'compressor'");
  });

  it("rejects node without type property", () => {
    const result = validateSynthesizerInput({
      soundType: "modular",
      nodes: {
        myNode: {} as never,
      },
      tracks: [
        {
          nodeChain: ["myNode"],
          notes: [{ time: "1.1.1", duration: "0.1.0", note: "C4" }],
        },
      ],
    });
    expect(result).toContain("missing its 'type'");
  });

  it("rejects tracks with unresolved node names", () => {
    const result = validateSynthesizerInput({
      soundType: "modular",
      nodes: {
        oscillator: { type: "oscillator" },
      },
      tracks: [
        {
          nodeChain: ["oscillator", "missing_filter", "destination"],
          notes: [{ time: "1.1.1", duration: "0.1.0", note: "C4" }],
        },
      ],
    });
    expect(result).toContain("undefined nodes");
    expect(result).toContain("missing_filter");
  });

  it("rejects track without nodeChain", () => {
    const result = validateSynthesizerInput({
      soundType: "modular",
      nodes: {
        oscillator: { type: "oscillator" },
      },
      tracks: [
        {
          nodeChain: [],
          notes: [{ time: "1.1.1", duration: "0.1.0", note: "C4" }],
        },
      ],
    });
    expect(result).toContain("non-empty 'nodeChain'");
  });

  it("rejects track without notes", () => {
    const result = validateSynthesizerInput({
      soundType: "modular",
      nodes: {
        oscillator: { type: "oscillator" },
      },
      tracks: [
        {
          nodeChain: ["oscillator"],
          notes: [],
        },
      ],
    });
    expect(result).toContain("non-empty 'notes'");
  });

  it("allows destination in nodeChain without defining it in nodes", () => {
    const result = validateSynthesizerInput({
      soundType: "modular",
      nodes: {
        oscillator: { type: "oscillator" },
      },
      tracks: [
        {
          nodeChain: ["oscillator", "destination"],
          notes: [{ time: "1.1.1", duration: "0.1.0", note: "C4" }],
        },
      ],
    });
    expect(result).toBeNull();
  });

  it("returns null for completely empty config (defaults to simple tone)", () => {
    const result = validateSynthesizerInput({});
    expect(result).toBeNull();
  });
});
