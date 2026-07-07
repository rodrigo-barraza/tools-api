import { describe, it, expect } from "vitest";
import { validateAudioRemixInput } from "../AudioRemixValidation.ts";

// ═══════════════════════════════════════════════════════════════
// AudioRemixValidation — Input Validation Tests
//
// Tests the pure validation layer for the remix_audio tool.
// Covers input source validation, preset validation, operation
// type enumeration, and per-operation parameter bounds.
// ═══════════════════════════════════════════════════════════════

describe("validateAudioRemixInput — Input Source Validation", () => {
  it("returns null for a valid HTTPS URL input", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
    });
    expect(result).toBeNull();
  });

  it("returns null for a valid HTTP URL input", () => {
    const result = validateAudioRemixInput({
      input: "http://example.com/song.wav",
    });
    expect(result).toBeNull();
  });

  it("returns null for a valid data URI input", () => {
    const result = validateAudioRemixInput({
      input: "data:audio/wav;base64,UklGR...",
    });
    expect(result).toBeNull();
  });

  it("returns null for a valid absolute file path input", () => {
    const result = validateAudioRemixInput({
      input: "/home/user/audio/song.wav",
    });
    expect(result).toBeNull();
  });

  it("rejects missing input", () => {
    const result = validateAudioRemixInput({});
    expect(result).toContain("Missing required parameter");
  });

  it("rejects empty string input", () => {
    const result = validateAudioRemixInput({ input: "" });
    expect(result).toContain("Missing required parameter");
  });

  it("rejects whitespace-only input", () => {
    const result = validateAudioRemixInput({ input: "   " });
    expect(result).toContain("Missing required parameter");
  });

  it("rejects relative file path", () => {
    const result = validateAudioRemixInput({ input: "song.mp3" });
    expect(result).toContain("Invalid 'input'");
  });

  it("rejects ftp:// protocol", () => {
    const result = validateAudioRemixInput({ input: "ftp://server/file.wav" });
    expect(result).toContain("Invalid 'input'");
  });
});

describe("validateAudioRemixInput — Preset Validation", () => {
  const validPresets = [
    "chipmunk", "demon_voice", "nightcore", "vaporwave", "slowed_reverb",
    "underwater", "radio", "telephone", "robot", "cave", "vinyl", "megaphone",
  ];

  for (const preset of validPresets) {
    it(`accepts valid preset: ${preset}`, () => {
      const result = validateAudioRemixInput({
        input: "https://example.com/song.mp3",
        preset,
      });
      expect(result).toBeNull();
    });
  }

  it("rejects unknown preset", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      preset: "alien_voice",
    });
    expect(result).toContain("Invalid preset");
    expect(result).toContain("alien_voice");
  });

  it("rejects non-string preset", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      preset: 42 as unknown as string,
    });
    expect(result).toContain("Invalid preset");
  });
});

describe("validateAudioRemixInput — Output Format Validation", () => {
  for (const format of ["wav", "mp3", "ogg", "opus"]) {
    it(`accepts valid format: ${format}`, () => {
      const result = validateAudioRemixInput({
        input: "https://example.com/song.mp3",
        outputFormat: format,
      });
      expect(result).toBeNull();
    });
  }

  it("rejects unsupported format", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      outputFormat: "flac",
    });
    expect(result).toContain("Invalid outputFormat");
  });
});

describe("validateAudioRemixInput — Sample Rate Validation", () => {
  it("accepts valid sample rate at lower bound (8000)", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      sampleRate: 8000,
    });
    expect(result).toBeNull();
  });

  it("accepts valid sample rate at upper bound (48000)", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      sampleRate: 48000,
    });
    expect(result).toBeNull();
  });

  it("rejects sample rate below minimum", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      sampleRate: 4000,
    });
    expect(result).toContain("sampleRate");
    expect(result).toContain("8000");
  });

  it("rejects sample rate above maximum", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      sampleRate: 96000,
    });
    expect(result).toContain("sampleRate");
  });

  it("rejects NaN sample rate", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      sampleRate: NaN,
    });
    expect(result).toContain("sampleRate");
  });
});

describe("validateAudioRemixInput — Operations Array Validation", () => {
  it("accepts an empty operations array (no-op passthrough)", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      operations: [],
    });
    expect(result).toBeNull();
  });

  it("rejects operations that is not an array", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      operations: "reverse" as unknown as Array<Record<string, unknown>>,
    });
    expect(result).toContain("must be an array");
  });

  it("rejects operation without type property", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      operations: [{ gain: 5 }],
    });
    expect(result).toContain("operations[0]");
    expect(result).toContain("'type'");
  });

  it("rejects unknown operation type", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      operations: [{ type: "time_stretch" }],
    });
    expect(result).toContain("operations[0]");
    expect(result).toContain("unknown operation type");
  });

  it("rejects null element in operations array", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      operations: [null as unknown as Record<string, unknown>],
    });
    expect(result).toContain("operations[0]");
    expect(result).toContain("must be an object");
  });

  it("reports the correct index for a mid-array error", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      operations: [
        { type: "reverse" },
        { type: "normalize" },
        { type: "nonexistent" },
      ],
    });
    expect(result).toContain("operations[2]");
  });
});

describe("validateAudioRemixInput — Per-Operation Parameter Bounds", () => {
  const validInput = "https://example.com/song.mp3";

  // pitch_shift
  it("accepts pitch_shift with semitones at bounds", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "pitch_shift", semitones: -24 }],
    })).toBeNull();
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "pitch_shift", semitones: 24 }],
    })).toBeNull();
  });

  it("rejects pitch_shift with semitones out of range", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "pitch_shift", semitones: 25 }],
    });
    expect(result).toContain("semitones");
    expect(result).toContain("-24");
  });

  // tempo / speed — factor bounds
  it("rejects tempo with factor below 0.25", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "tempo", factor: 0.1 }],
    });
    expect(result).toContain("factor");
    expect(result).toContain("0.25");
  });

  it("rejects speed with factor above 4.0", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "speed", factor: 5.0 }],
    });
    expect(result).toContain("factor");
  });

  // reverb
  it("rejects reverb with delay out of range", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "reverb", delay: 600 }],
    });
    expect(result).toContain("delay");
    expect(result).toContain("500");
  });

  it("rejects reverb with decay above 0.9", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "reverb", decay: 0.95 }],
    });
    expect(result).toContain("decay");
  });

  // echo
  it("rejects echo with mismatched delays/decays lengths", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "echo", delays: [200, 400], decays: [0.4] }],
    });
    expect(result).toContain("same length");
  });

  it("rejects echo with decay value above 0.9", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "echo", delays: [200], decays: [0.95] }],
    });
    expect(result).toContain("decays");
    expect(result).toContain("0.9");
  });

  // lowpass/highpass frequency
  it("rejects lowpass with frequency below 20 Hz", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "lowpass", frequency: 10 }],
    });
    expect(result).toContain("frequency");
    expect(result).toContain("20");
  });

  it("rejects highpass with frequency above 20000 Hz", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "highpass", frequency: 25000 }],
    });
    expect(result).toContain("frequency");
  });

  // bandpass / equalizer width
  it("rejects bandpass with width out of range", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "bandpass", frequency: 1000, width: 15000 }],
    });
    expect(result).toContain("width");
  });

  // equalizer gain
  it("rejects equalizer with gain out of range", () => {
    const result = validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "equalizer", frequency: 1000, gain: 25 }],
    });
    expect(result).toContain("gain");
    expect(result).toContain("-20");
  });

  // bass_boost / treble_boost gain
  it("rejects bass_boost with gain out of range", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "bass_boost", gain: -25 }],
    })).toContain("gain");
  });

  // distortion gain / color
  it("rejects distortion with gain above 100", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "distortion", gain: 150 }],
    })).toContain("gain");
  });

  it("rejects distortion with color above 100", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "distortion", color: 101 }],
    })).toContain("color");
  });

  // tremolo / vibrato
  it("rejects tremolo with depth out of range", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "tremolo", depth: 1.5 }],
    })).toContain("depth");
  });

  it("rejects vibrato with frequency below 0.1", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "vibrato", frequency: 0.05 }],
    })).toContain("frequency");
  });

  // volume
  it("rejects volume with level above 3.0", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "volume", level: 4.0 }],
    })).toContain("level");
  });

  // fade_in / fade_out
  it("rejects fade_in with duration below 0.01", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "fade_in", duration: 0.001 }],
    })).toContain("duration");
  });

  it("rejects fade_out with duration above 60", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "fade_out", duration: 120 }],
    })).toContain("duration");
  });

  // trim
  it("rejects trim with start >= end", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "trim", start: 5, end: 3 }],
    })).toContain("'start' must be less than 'end'");
  });

  it("rejects trim with negative start", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "trim", start: -1 }],
    })).toContain("'start' must be >= 0");
  });

  // stereo_pan
  it("rejects stereo_pan out of range", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "stereo_pan", pan: 1.5 }],
    })).toContain("pan");
  });

  // bitcrush
  it("rejects bitcrush with bits out of range", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "bitcrush", bits: 0 }],
    })).toContain("bits");
  });

  it("rejects bitcrush with sampleRate out of range", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "bitcrush", sampleRate: 50 }],
    })).toContain("sampleRate");
  });

  // crystalizer
  it("rejects crystalizer with intensity out of range", () => {
    expect(validateAudioRemixInput({
      input: validInput,
      operations: [{ type: "crystalizer", intensity: 15 }],
    })).toContain("intensity");
  });
});

describe("validateAudioRemixInput — All Valid Operation Types (No Parameters)", () => {
  const validOperationTypes = [
    "pitch_shift", "tempo", "speed", "reverb", "echo", "lowpass", "highpass",
    "bandpass", "equalizer", "bass_boost", "treble_boost", "distortion",
    "chorus", "flanger", "phaser", "tremolo", "vibrato", "compressor",
    "normalize", "reverse", "fade_in", "fade_out", "trim", "volume",
    "stereo_pan", "bitcrush", "crystalizer",
  ];

  for (const operationType of validOperationTypes) {
    it(`accepts ${operationType} with no optional parameters`, () => {
      const result = validateAudioRemixInput({
        input: "https://example.com/song.mp3",
        operations: [{ type: operationType }],
      });
      expect(result).toBeNull();
    });
  }
});

describe("validateAudioRemixInput — Multi-Operation Chains", () => {
  it("validates a realistic remix chain", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      operations: [
        { type: "trim", start: 5, end: 30 },
        { type: "pitch_shift", semitones: -3 },
        { type: "reverb", delay: 60, decay: 0.5 },
        { type: "fade_in", duration: 2 },
        { type: "fade_out", duration: 3 },
        { type: "normalize" },
      ],
    });
    expect(result).toBeNull();
  });

  it("reports the first invalid operation in a chain", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      operations: [
        { type: "reverse" },
        { type: "pitch_shift", semitones: 30 }, // invalid — index 1
        { type: "lowpass", frequency: 5 }, // also invalid — index 2
      ],
    });
    expect(result).toContain("operations[1]");
  });

  it("accepts preset + operations combined", () => {
    const result = validateAudioRemixInput({
      input: "https://example.com/song.mp3",
      preset: "nightcore",
      operations: [{ type: "fade_out", duration: 2 }],
    });
    expect(result).toBeNull();
  });
});
