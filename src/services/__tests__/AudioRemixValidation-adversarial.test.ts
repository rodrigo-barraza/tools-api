import { describe, it, expect } from "vitest";
import { validateAudioRemixInput } from "../AudioRemixValidation.ts";

// ═══════════════════════════════════════════════════════════════
// ADVERSARIAL TESTS — AudioRemixValidation
//
// Hand-crafted edge cases targeting input source bypass, per-
// operation parameter boundary exploitation, type coercion
// tricks, and operation chaining edge cases.
// ═══════════════════════════════════════════════════════════════

// ── Input Source Validation ─────────────────────────────────

describe("AudioRemixValidation adversarial — input source", () => {
  it("missing input should be rejected", () => {
    const result = validateAudioRemixInput({});
    expect(result).not.toBeNull();
    expect(result).toContain("Missing required parameter");
  });

  it("empty string input should be rejected", () => {
    const result = validateAudioRemixInput({ input: "" });
    expect(result).not.toBeNull();
  });

  it("whitespace-only input should be rejected", () => {
    const result = validateAudioRemixInput({ input: "   " });
    expect(result).not.toBeNull();
  });

  it("http:// input should pass", () => {
    expect(validateAudioRemixInput({ input: "http://example.com/audio.mp3" })).toBeNull();
  });

  it("https:// input should pass", () => {
    expect(validateAudioRemixInput({ input: "https://example.com/audio.mp3" })).toBeNull();
  });

  it("data: URI input should pass", () => {
    expect(validateAudioRemixInput({ input: "data:audio/wav;base64,UklGRg==" })).toBeNull();
  });

  it("absolute file path should pass", () => {
    expect(validateAudioRemixInput({ input: "/tmp/audio.wav" })).toBeNull();
  });

  it("relative file path should be rejected", () => {
    const result = validateAudioRemixInput({ input: "audio.wav" });
    expect(result).not.toBeNull();
    expect(result).toContain("Invalid 'input'");
  });

  it("ftp:// protocol should be rejected", () => {
    const result = validateAudioRemixInput({ input: "ftp://example.com/audio.wav" });
    expect(result).not.toBeNull();
  });

  it("javascript: URI should be rejected", () => {
    const result = validateAudioRemixInput({ input: "javascript:alert(1)" });
    expect(result).not.toBeNull();
  });

  it("null input should be rejected", () => {
    const result = validateAudioRemixInput({ input: null as any });
    expect(result).not.toBeNull();
  });
});

// ── Preset Validation ───────────────────────────────────────

describe("AudioRemixValidation adversarial — presets", () => {
  const validPresets = [
    "chipmunk", "demon_voice", "nightcore", "vaporwave",
    "slowed_reverb", "underwater", "radio", "telephone",
    "robot", "cave", "vinyl", "megaphone",
  ];

  it("all valid presets should pass", () => {
    for (const preset of validPresets) {
      expect(
        validateAudioRemixInput({ input: "https://example.com/a.mp3", preset }),
      ).toBeNull();
    }
  });

  it("invalid preset should be rejected", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/a.mp3",
      preset: "hacker",
    });
    expect(result).not.toBeNull();
    expect(result).toContain("Invalid preset");
  });

  it("numeric preset should be rejected", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/a.mp3",
      preset: 42 as any,
    });
    expect(result).not.toBeNull();
  });

  it("undefined preset should be skipped (pass)", () => {
    expect(
      validateAudioRemixInput({ input: "https://example.com/a.mp3", preset: undefined }),
    ).toBeNull();
  });

  it("null preset should be skipped (pass)", () => {
    expect(
      validateAudioRemixInput({ input: "https://example.com/a.mp3", preset: null as any }),
    ).toBeNull();
  });
});

// ── Output Format Validation ────────────────────────────────

describe("AudioRemixValidation adversarial — outputFormat", () => {
  it("valid formats should pass", () => {
    for (const format of ["wav", "mp3", "ogg", "opus"]) {
      expect(
        validateAudioRemixInput({ input: "https://a.com/a.mp3", outputFormat: format }),
      ).toBeNull();
    }
  });

  it("invalid format should be rejected", () => {
    const result = validateAudioRemixInput({
      input: "https://a.com/a.mp3",
      outputFormat: "flac",
    });
    expect(result).not.toBeNull();
    expect(result).toContain("Invalid outputFormat");
  });

  it("uppercase format should be rejected (case-sensitive)", () => {
    const result = validateAudioRemixInput({
      input: "https://a.com/a.mp3",
      outputFormat: "WAV",
    });
    expect(result).not.toBeNull();
  });
});

// ── SampleRate Validation ───────────────────────────────────

describe("AudioRemixValidation adversarial — sampleRate", () => {
  it("sampleRate of 8000 should pass (lower bound)", () => {
    expect(validateAudioRemixInput({
      input: "https://a.com/a.mp3",
      sampleRate: 8000,
    })).toBeNull();
  });

  it("sampleRate of 48000 should pass (upper bound)", () => {
    expect(validateAudioRemixInput({
      input: "https://a.com/a.mp3",
      sampleRate: 48000,
    })).toBeNull();
  });

  it("sampleRate of 7999 should be rejected", () => {
    const result = validateAudioRemixInput({
      input: "https://a.com/a.mp3",
      sampleRate: 7999,
    });
    expect(result).not.toBeNull();
    expect(result).toContain("Invalid sampleRate");
  });

  it("sampleRate of 48001 should be rejected", () => {
    const result = validateAudioRemixInput({
      input: "https://a.com/a.mp3",
      sampleRate: 48001,
    });
    expect(result).not.toBeNull();
  });

  it("NaN sampleRate should be rejected", () => {
    const result = validateAudioRemixInput({
      input: "https://a.com/a.mp3",
      sampleRate: NaN,
    });
    expect(result).not.toBeNull();
  });
});

// ── Operation Type Validation ───────────────────────────────

describe("AudioRemixValidation adversarial — operation types", () => {
  const validInput = "https://a.com/a.mp3";

  it("operations must be an array", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: "pitch_shift" as any,
    });
    expect(result).not.toBeNull();
    expect(result).toContain("must be an array");
  });

  it("operation without type should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ gain: 5 }],
    });
    expect(result).not.toBeNull();
    expect(result).toContain("missing required 'type'");
  });

  it("null operation element should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [null as any],
    });
    expect(result).not.toBeNull();
    expect(result).toContain("must be an object");
  });

  it("unknown operation type should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "hack_audio" }],
    });
    expect(result).not.toBeNull();
    expect(result).toContain("unknown operation type");
  });

  it("empty operations array should pass", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [],
    })).toBeNull();
  });
});

// ── Per-Operation Parameter Boundaries ──────────────────────

describe("AudioRemixValidation adversarial — pitch_shift parameters", () => {
  const validInput = "https://a.com/a.mp3";

  it("semitones at -24 should pass (lower bound)", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "pitch_shift", semitones: -24 }],
    })).toBeNull();
  });

  it("semitones at 24 should pass (upper bound)", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "pitch_shift", semitones: 24 }],
    })).toBeNull();
  });

  it("semitones at -25 should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "pitch_shift", semitones: -25 }],
    });
    expect(result).not.toBeNull();
    expect(result).toContain("semitones");
  });

  it("semitones at 25 should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "pitch_shift", semitones: 25 }],
    });
    expect(result).not.toBeNull();
  });
});

describe("AudioRemixValidation adversarial — tempo/speed parameters", () => {
  const validInput = "https://a.com/a.mp3";

  it("factor at 0.25 should pass (lower bound)", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "tempo", factor: 0.25 }],
    })).toBeNull();
  });

  it("factor at 4.0 should pass (upper bound)", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "speed", factor: 4.0 }],
    })).toBeNull();
  });

  it("factor at 0.24 should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "tempo", factor: 0.24 }],
    });
    expect(result).not.toBeNull();
    expect(result).toContain("factor");
  });

  it("factor at 4.1 should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "speed", factor: 4.1 }],
    });
    expect(result).not.toBeNull();
  });
});

describe("AudioRemixValidation adversarial — echo array length mismatch", () => {
  const validInput = "https://a.com/a.mp3";

  it("delays and decays with same length should pass", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "echo", delays: [100, 200], decays: [0.5, 0.3] }],
    })).toBeNull();
  });

  it("delays and decays with different lengths should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "echo", delays: [100], decays: [0.5, 0.3] }],
    });
    expect(result).not.toBeNull();
    expect(result).toContain("same length");
  });

  it("decay value above 0.9 should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "echo", delays: [100], decays: [0.95] }],
    });
    expect(result).not.toBeNull();
    expect(result).toContain("decays");
  });
});

describe("AudioRemixValidation adversarial — trim start >= end", () => {
  const validInput = "https://a.com/a.mp3";

  it("start < end should pass", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "trim", start: 1, end: 5 }],
    })).toBeNull();
  });

  it("start === end should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "trim", start: 5, end: 5 }],
    });
    expect(result).not.toBeNull();
    expect(result).toContain("start");
  });

  it("start > end should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "trim", start: 10, end: 5 }],
    });
    expect(result).not.toBeNull();
  });

  it("negative start should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "trim", start: -1 }],
    });
    expect(result).not.toBeNull();
  });
});

describe("AudioRemixValidation adversarial — stereo_pan boundaries", () => {
  const validInput = "https://a.com/a.mp3";

  it("pan at -1 (full left) should pass", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "stereo_pan", pan: -1 }],
    })).toBeNull();
  });

  it("pan at 1 (full right) should pass", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "stereo_pan", pan: 1 }],
    })).toBeNull();
  });

  it("pan at -1.1 should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "stereo_pan", pan: -1.1 }],
    });
    expect(result).not.toBeNull();
    expect(result).toContain("pan");
  });

  it("pan at 1.1 should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "stereo_pan", pan: 1.1 }],
    });
    expect(result).not.toBeNull();
  });
});

describe("AudioRemixValidation adversarial — bitcrush boundaries", () => {
  const validInput = "https://a.com/a.mp3";

  it("bits at 1 should pass (lower bound)", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "bitcrush", bits: 1 }],
    })).toBeNull();
  });

  it("bits at 16 should pass (upper bound)", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "bitcrush", bits: 16 }],
    })).toBeNull();
  });

  it("bits at 0 should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "bitcrush", bits: 0 }],
    });
    expect(result).not.toBeNull();
  });

  it("bits at 17 should be rejected", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "bitcrush", bits: 17 }],
    });
    expect(result).not.toBeNull();
  });
});

// ── Multi-operation Chaining ────────────────────────────────

describe("AudioRemixValidation adversarial — operation chaining", () => {
  const validInput = "https://a.com/a.mp3";

  it("multiple valid operations should pass", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [
        { type: "pitch_shift", semitones: 5 },
        { type: "reverb", delay: 50, decay: 0.5 },
        { type: "normalize" },
      ],
    })).toBeNull();
  });

  it("first invalid operation in chain should cause rejection", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [
        { type: "pitch_shift", semitones: 5 },
        { type: "invalid_op" },
        { type: "normalize" },
      ],
    });
    expect(result).not.toBeNull();
    expect(result).toContain("operations[1]");
  });

  it("parameterless operations should pass without extra fields", () => {
    for (const operationType of ["normalize", "reverse"]) {
      expect(validateAudioRemixInput({
        input: validInput,
        operations: [{ type: operationType }],
      })).toBeNull();
    }
  });
});
