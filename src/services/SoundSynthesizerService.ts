import logger from "../logger.ts";

export type WaveformType =
  | "sine"
  | "triangle"
  | "sawtooth"
  | "square"
  | "noise";

// ────────────────────────────────────────────────────────────
// Instrument Presets — pre-configured synthesis parameters
// ────────────────────────────────────────────────────────────

export interface InstrumentPresetConfig {
  waveform: WaveformType;
  harmonics: number[];
  envelope: ADSREnvelope;
  modulatorFrequency?: number;
  modulationIndex?: number;
  lfo?: { frequency: number; pitchDepth?: number; amplitudeDepth?: number };
}

export const INSTRUMENT_PRESETS: Record<string, InstrumentPresetConfig> = {
  acoustic_guitar: {
    waveform: "triangle",
    harmonics: [1.0, 0.8, 0.6, 0.35, 0.2, 0.12, 0.06],
    envelope: { attack: 0.005, decay: 0.35, sustain: 0.15, release: 0.4 },
  },
  electric_guitar: {
    waveform: "sawtooth",
    harmonics: [1.0, 0.7, 0.5, 0.35, 0.25, 0.15],
    envelope: { attack: 0.003, decay: 0.2, sustain: 0.5, release: 0.3 },
  },
  nylon_guitar: {
    waveform: "sine",
    harmonics: [1.0, 0.6, 0.35, 0.15, 0.08],
    envelope: { attack: 0.01, decay: 0.45, sustain: 0.12, release: 0.5 },
  },
  piano: {
    waveform: "triangle",
    harmonics: [1.0, 0.5, 0.28, 0.14, 0.07, 0.03],
    envelope: { attack: 0.005, decay: 0.9, sustain: 0.25, release: 0.6 },
  },
  electric_piano: {
    waveform: "sine",
    harmonics: [1.0, 0.4, 0.15],
    envelope: { attack: 0.003, decay: 0.6, sustain: 0.35, release: 0.4 },
    modulatorFrequency: 14,
    modulationIndex: 25,
  },
  organ: {
    waveform: "sine",
    harmonics: [1.0, 0.0, 0.8, 0.0, 0.6, 0.0, 0.4, 0.0, 0.2],
    envelope: { attack: 0.02, decay: 0.05, sustain: 0.9, release: 0.1 },
  },
  trumpet: {
    waveform: "square",
    harmonics: [1.0, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1],
    envelope: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.15 },
    modulatorFrequency: 6,
    modulationIndex: 8,
  },
  violin: {
    waveform: "sawtooth",
    harmonics: [1.0, 0.75, 0.5, 0.3, 0.2, 0.12],
    envelope: { attack: 0.08, decay: 0.15, sustain: 0.7, release: 0.2 },
    lfo: { frequency: 5.5, pitchDepth: 3.0 },
  },
  cello: {
    waveform: "sawtooth",
    harmonics: [1.0, 0.8, 0.55, 0.35, 0.2, 0.1],
    envelope: { attack: 0.12, decay: 0.2, sustain: 0.65, release: 0.3 },
    lfo: { frequency: 4.8, pitchDepth: 2.5 },
  },
  flute: {
    waveform: "sine",
    harmonics: [1.0, 0.15, 0.05],
    envelope: { attack: 0.08, decay: 0.1, sustain: 0.75, release: 0.15 },
    lfo: { frequency: 5.0, amplitudeDepth: 0.08 },
  },
  clarinet: {
    waveform: "square",
    harmonics: [1.0, 0.0, 0.75, 0.0, 0.5, 0.0, 0.25],
    envelope: { attack: 0.04, decay: 0.1, sustain: 0.8, release: 0.12 },
  },
  synth_lead: {
    waveform: "sawtooth",
    harmonics: [1.0, 0.6, 0.3],
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.7, release: 0.2 },
    lfo: { frequency: 6.0, pitchDepth: 4.0 },
  },
  synth_pad: {
    waveform: "triangle",
    harmonics: [1.0, 0.4, 0.2, 0.1],
    envelope: { attack: 0.6, decay: 0.4, sustain: 0.7, release: 0.8 },
    lfo: { frequency: 3.5, pitchDepth: 2.0, amplitudeDepth: 0.05 },
  },
  synth_bass: {
    waveform: "sawtooth",
    harmonics: [1.0, 0.7, 0.4, 0.2],
    envelope: { attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.15 },
  },
  bass_guitar: {
    waveform: "triangle",
    harmonics: [1.0, 0.7, 0.45, 0.2, 0.1],
    envelope: { attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.25 },
  },
  marimba: {
    waveform: "sine",
    harmonics: [1.0, 0.0, 0.3, 0.0, 0.1],
    envelope: { attack: 0.002, decay: 0.5, sustain: 0.0, release: 0.3 },
  },
  vibraphone: {
    waveform: "sine",
    harmonics: [1.0, 0.0, 0.4, 0.0, 0.15],
    envelope: { attack: 0.002, decay: 0.8, sustain: 0.1, release: 0.5 },
    lfo: { frequency: 4.5, amplitudeDepth: 0.15 },
  },
  harmonica: {
    waveform: "square",
    harmonics: [1.0, 0.5, 0.3, 0.2],
    envelope: { attack: 0.03, decay: 0.08, sustain: 0.75, release: 0.1 },
    lfo: { frequency: 6.0, amplitudeDepth: 0.06 },
  },
};

// ────────────────────────────────────────────────────────────
// Music Theory — Chord & Scale Utilities
// ────────────────────────────────────────────────────────────

const CHORD_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  "m": [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "9": [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
  "6": [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  add9: [0, 4, 7, 14],
  "5": [0, 7],
  "11": [0, 4, 7, 10, 14, 17],
  "13": [0, 4, 7, 10, 14, 21],
};

const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  minor_pentatonic: [0, 3, 5, 7, 10],
  major_pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
  melodic_minor: [0, 2, 3, 5, 7, 9, 11],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  whole_tone: [0, 2, 4, 6, 8, 10],
};

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const FLAT_TO_SHARP: Record<string, string> = {
  "Db": "C#",
  "Eb": "D#",
  "Fb": "E",
  "Gb": "F#",
  "Ab": "G#",
  "Bb": "A#",
  "Cb": "B",
};

function normalizeNoteName(rawNote: string): string {
  if (rawNote.length === 2 && rawNote[1] === "b") {
    return FLAT_TO_SHARP[rawNote] || rawNote;
  }
  return rawNote;
}

function noteNameToSemitone(noteName: string): number {
  const normalized = normalizeNoteName(noteName);
  const index = NOTE_NAMES.indexOf(normalized);
  return index >= 0 ? index : 0;
}

function semitoneToNoteName(semitone: number, octave: number): string {
  const wrappedSemitone = ((semitone % 12) + 12) % 12;
  const adjustedOctave = octave + Math.floor(semitone / 12);
  return `${NOTE_NAMES[wrappedSemitone]}${adjustedOctave}`;
}

export function isChordNotation(noteString: string): boolean {
  const chordNotationPattern = /^[A-G][#b]?(maj7|min7|dim7|aug7|maj9|min9|min6|add9|maj|min|dim|aug|sus2|sus4|m7|m9|m|7|9|11|13|6|5)(\d)?$/i;
  return chordNotationPattern.test(noteString.trim());
}

export function expandChordToNotes(chordString: string): string[] {
  const trimmed = chordString.trim();
  const chordMatch = trimmed.match(
    /^([A-G][#b]?)(maj7|min7|dim7|aug7|maj9|min9|min6|add9|maj|min|dim|aug|sus2|sus4|m7|m9|m|7|9|11|13|6|5)?(\d)?$/i,
  );
  if (!chordMatch) return [trimmed];

  const rootName = chordMatch[1];
  const chordType = (chordMatch[2] || "maj").toLowerCase();
  const octave = parseInt(chordMatch[3] || "4", 10);

  const intervals = CHORD_INTERVALS[chordType];
  if (!intervals) return [trimmed];

  const rootSemitone = noteNameToSemitone(rootName);
  return intervals.map((interval) =>
    semitoneToNoteName(rootSemitone + interval, octave),
  );
}

export function getScaleNotes(
  rootNote: string,
  scaleName: string,
  octave = 4,
  octaveCount = 1,
): string[] {
  const intervals =
    SCALE_INTERVALS[scaleName.toLowerCase().replace(/\s+/g, "_")];
  if (!intervals) return [];

  const rootSemitone = noteNameToSemitone(rootNote);
  const scaleNotes: string[] = [];

  for (let octaveOffset = 0; octaveOffset < octaveCount; octaveOffset++) {
    for (const interval of intervals) {
      scaleNotes.push(
        semitoneToNoteName(rootSemitone + interval, octave + octaveOffset),
      );
    }
  }

  return scaleNotes;
}

// ────────────────────────────────────────────────────────────
// Tempo-Synced Beat Duration Parsing
// ────────────────────────────────────────────────────────────

export function parseBeatDuration(
  value: string | number,
  tempo: number,
): number {
  if (typeof value === "number") return value;
  if (!value) return 0.25;

  const beatFractionMatch = value.trim().match(/^1\/(\d+)(d|t)?$/i);
  if (beatFractionMatch) {
    const denominator = parseInt(beatFractionMatch[1], 10);
    const modifier = beatFractionMatch[2]?.toLowerCase();
    const wholeNoteDuration = (60.0 / tempo) * 4.0;
    const baseDuration = wholeNoteDuration / denominator;
    if (modifier === "d") return baseDuration * 1.5;
    if (modifier === "t") return baseDuration * (2.0 / 3.0);
    return baseDuration;
  }

  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0.25 : parsed;
}

// ────────────────────────────────────────────────────────────
// Track Repeat / Looping Expansion
// ────────────────────────────────────────────────────────────

export function expandTrackRepeats(
  notes: NoteConfig[],
  repeatCount: number,
  tempo: number,
  beatsPerBar: number,
): NoteConfig[] {
  if (repeatCount <= 1) return notes;

  const clampedRepeats = Math.min(Math.max(repeatCount, 1), 64);

  let patternDuration = 0;
  for (const note of notes) {
    const startTime = parseTimeMarker(note.time, tempo, beatsPerBar);
    const noteDuration = parseTimeMarker(note.duration, tempo, beatsPerBar);
    patternDuration = Math.max(patternDuration, startTime + noteDuration);
  }

  const paddedPatternDuration = patternDuration + 0.01;
  const expandedNotes: NoteConfig[] = [];

  for (let iteration = 0; iteration < clampedRepeats; iteration++) {
    const timeOffset = iteration * paddedPatternDuration;
    for (const note of notes) {
      const originalStart = parseTimeMarker(note.time, tempo, beatsPerBar);
      expandedNotes.push({
        ...note,
        time: originalStart + timeOffset,
      });
    }
  }

  return expandedNotes;
}

export interface ADSREnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface LFOConfig {
  frequency: number;
  pitchDepth?: number;
  amplitudeDepth?: number;
}

export interface DelayConfig {
  delayTime: number;
  feedback: number;
}

export interface MelodyStep {
  note: number | string;
  duration: string | number;
  velocity?: number; // 0.0–1.0, default 1.0
}

export type NodeWaveformType =
  | "sine"
  | "triangle"
  | "sawtooth"
  | "square"
  | "noise";

export interface NodeConfig {
  type:
    | "oscillator"
    | "noise"
    | "biquad_filter"
    | "envelope"
    | "delay"
    | "stereo_panner"
    | "gain"
    | "reverb"
    | "drum_synth"
    | "distortion";
  waveform?: NodeWaveformType;
  detune?: number; // in cents
  frequency?: number | string;
  noiseType?: "white" | "pink";
  filterType?: "lowpass" | "highpass" | "bandpass";
  cutoff?: number;
  Q?: number;
  modulate?: Record<string, string>; // e.g. { cutoff: "filter_env" }
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  delayTime?: number;
  feedback?: number;
  pingPong?: boolean;
  pan?: number;
  gain?: number;
  wet?: number;
  decayTime?: number;
  // Distortion-specific fields
  algorithm?: "soft_clip" | "hard_clip" | "bitcrush";
  drive?: number;
  bitDepth?: number;
  downsample?: number;
}

export interface PitchBendConfig {
  target: string | number;
  startTime?: number;
  endTime?: number;
}

export interface NoteConfig {
  time: string | number; // e.g. "1.1.1" or numeric seconds
  duration: string | number; // e.g. "0.2.0" or numeric seconds
  note: string | number; // e.g. "C4", frequency, or drum name e.g. "KICK"
  velocity?: number; // 0.0–1.0, default 1.0
  pitchBend?: PitchBendConfig;
}

export interface TrackConfig {
  nodeChain: string[];
  notes: NoteConfig[];
  volume?: number; // 0.0–2.0, default 1.0
  repeat?: number; // number of times to repeat the pattern (default 1)
}

export interface SynthesizerConfig {
  soundType?:
    | "synthesizer"
    | "sound_effect"
    | "modular";
  presetEffect?:
    | "laser"
    | "coin"
    | "powerup"
    | "jump"
    | "explosion"
    | "synthwave_bass"
    | "ambient_pad"
    | "sci_fi_sweep";
  duration?: number;
  waveform?: WaveformType;
  frequency?: number | string;
  endFrequency?: number | string;
  modulatorFrequency?: number;
  modulationIndex?: number;
  envelope?: ADSREnvelope;
  harmonics?: number[];
  lfo?: LFOConfig;

  delay?: DelayConfig;
  sampleRate?: number;

  // Instrument preset shorthand
  instrument?: string;

  // Advanced Modular Synthesizer additions
  tempo?: number;
  nodes?: Record<string, NodeConfig>;
  tracks?: TrackConfig[];

  // Groove and humanization
  swing?: number; // 0.0–1.0, shifts every other 16th note forward
  humanize?: number; // 0.0–1.0, random per-note timing jitter

  // Time signature: [beatsPerBar, beatUnit] e.g. [3, 4] for 3/4, [6, 8] for 6/8
  timeSignature?: [number, number];
}

// ────────────────────────────────────────────────────────────
// Core DSP Node and Processor Classes
// ────────────────────────────────────────────────────────────

export class BiquadFilter {
  // Coefficients
  b0 = 1.0;
  b1 = 0.0;
  b2 = 0.0;
  a0 = 1.0;
  a1 = 0.0;
  a2 = 0.0;

  // Buffer state
  x1 = 0.0;
  x2 = 0.0;
  y1 = 0.0;
  y2 = 0.0;

  type: "lowpass" | "highpass" | "bandpass";
  sampleRate: number;

  constructor(
    type: "lowpass" | "highpass" | "bandpass" = "lowpass",
    sampleRate = 44100,
  ) {
    this.type = type;
    this.sampleRate = sampleRate;
  }

  updateCoefficients(cutoff: number, VALUE: number): void {
    const cappedCutoff = Math.min(
      Math.max(cutoff, 10.0),
      this.sampleRate / 2.0 - 50.0,
    );
    const cappedQ = Math.max(VALUE, 0.1);

    const omega = (2.0 * Math.PI * cappedCutoff) / this.sampleRate;
    const sn = Math.sin(omega);
    const cs = Math.cos(omega);
    const alpha = sn / (2.0 * cappedQ);

    if (this.type === "lowpass") {
      this.b0 = (1.0 - cs) / 2.0;
      this.b1 = 1.0 - cs;
      this.b2 = (1.0 - cs) / 2.0;
      this.a0 = 1.0 + alpha;
      this.a1 = -2.0 * cs;
      this.a2 = 1.0 - alpha;
    } else if (this.type === "highpass") {
      this.b0 = (1.0 + cs) / 2.0;
      this.b1 = -(1.0 + cs);
      this.b2 = (1.0 + cs) / 2.0;
      this.a0 = 1.0 + alpha;
      this.a1 = -2.0 * cs;
      this.a2 = 1.0 - alpha;
    } else {
      // bandpass
      this.b0 = alpha;
      this.b1 = 0.0;
      this.b2 = -alpha;
      this.a0 = 1.0 + alpha;
      this.a1 = -2.0 * cs;
      this.a2 = 1.0 - alpha;
    }
  }

  process(x: number): number {
    const y =
      (this.b0 * x +
        this.b1 * this.x1 +
        this.b2 * this.x2 -
        this.a1 * this.y1 -
        this.a2 * this.y2) /
      this.a0;

    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;

    return isNaN(y) || !isFinite(y) ? 0.0 : y;
  }
}

export class DelayLine {
  buffer: Float32Array;
  writeIndex = 0;

  constructor(size: number) {
    this.buffer = new Float32Array(size);
  }

  write(value: number): void {
    this.buffer[this.writeIndex] = value;
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
  }

  read(offset: number): number {
    const index =
      (this.writeIndex - offset + this.buffer.length) % this.buffer.length;
    return this.buffer[index];
  }
}

export class CombFilter {
  delayLine: DelayLine;
  feedback: number;
  delaySamples: number;

  constructor(delaySamples: number, feedback: number) {
    this.delaySamples = delaySamples;
    this.delayLine = new DelayLine(delaySamples + 1);
    this.feedback = feedback;
  }

  process(x: number): number {
    const delayed = this.delayLine.read(this.delaySamples);
    const output = x + delayed * this.feedback;
    this.delayLine.write(output);
    return delayed;
  }
}

export class AllpassFilter {
  delayLine: DelayLine;
  g: number;
  delaySamples: number;

  constructor(delaySamples: number, g: number) {
    this.delaySamples = delaySamples;
    this.delayLine = new DelayLine(delaySamples + 1);
    this.g = g;
  }

  process(x: number): number {
    const delayed = this.delayLine.read(this.delaySamples);
    const workflow = x + this.g * delayed;
    const y = -this.g * workflow + delayed;
    this.delayLine.write(workflow);
    return y;
  }
}

export class SchroederReverb {
  combsLeft: CombFilter[] = [];
  combsRight: CombFilter[] = [];
  allpassesLeft: AllpassFilter[] = [];
  allpassesRight: AllpassFilter[] = [];
  wet = 0.3;

  constructor(sampleRate = 44100, wet = 0.3, decay = 0.5) {
    this.wet = wet;
    const delayTimesLeft = [0.0297, 0.0371, 0.0411, 0.0437];
    const delayTimesRight = [0.0317, 0.0351, 0.0429, 0.0449];

    const feedbackValue = Math.min(Math.max(decay * 0.85, 0.1), 0.95);

    for (const time of delayTimesLeft) {
      this.combsLeft.push(
        new CombFilter(Math.floor(time * sampleRate), feedbackValue),
      );
    }
    for (const time of delayTimesRight) {
      this.combsRight.push(
        new CombFilter(Math.floor(time * sampleRate), feedbackValue),
      );
    }

    const allpassTimesLeft = [0.005, 0.0017];
    const allpassTimesRight = [0.0053, 0.0019];

    for (const time of allpassTimesLeft) {
      this.allpassesLeft.push(
        new AllpassFilter(Math.floor(time * sampleRate), 0.7),
      );
    }
    for (const time of allpassTimesRight) {
      this.allpassesRight.push(
        new AllpassFilter(Math.floor(time * sampleRate), 0.7),
      );
    }
  }

  process(left: number, right: number): { left: number; right: number } {
    let combsSumLeft = 0.0;
    for (const comb of this.combsLeft) {
      combsSumLeft += comb.process(left);
    }
    combsSumLeft /= this.combsLeft.length;

    let combsSumRight = 0.0;
    for (const comb of this.combsRight) {
      combsSumRight += comb.process(right);
    }
    combsSumRight /= this.combsRight.length;

    let allpassSumLeft = combsSumLeft;
    for (const ap of this.allpassesLeft) {
      allpassSumLeft = ap.process(allpassSumLeft);
    }

    let allpassSumRight = combsSumRight;
    for (const ap of this.allpassesRight) {
      allpassSumRight = ap.process(allpassSumRight);
    }

    return {
      left: left * (1.0 - this.wet) + allpassSumLeft * this.wet,
      right: right * (1.0 - this.wet) + allpassSumRight * this.wet,
    };
  }
}

export class DistortionNode {
  algorithm: "soft_clip" | "hard_clip" | "bitcrush";
  drive: number;
  bitDepth: number;
  downsampleFactor: number;
  sampleCounter = 0;
  heldSample = 0.0;

  constructor(
    algorithm: "soft_clip" | "hard_clip" | "bitcrush" = "soft_clip",
    drive = 4.0,
    bitDepth = 8,
    downsampleFactor = 1,
  ) {
    this.algorithm = algorithm;
    this.drive = Math.max(1.0, Math.min(drive, 100.0));
    this.bitDepth = Math.max(2, Math.min(bitDepth, 16));
    this.downsampleFactor = Math.max(1, Math.min(downsampleFactor, 32));
  }

  process(input: number): number {
    switch (this.algorithm) {
      case "soft_clip":
        return Math.tanh(this.drive * input);

      case "hard_clip":
        return Math.max(-1.0, Math.min(1.0, this.drive * input));

      case "bitcrush": {
        this.sampleCounter++;
        if (this.sampleCounter >= this.downsampleFactor) {
          this.sampleCounter = 0;
          const quantizationLevels = Math.pow(2, this.bitDepth);
          const driven = Math.max(-1.0, Math.min(1.0, this.drive * input));
          this.heldSample =
            Math.round(driven * quantizationLevels) / quantizationLevels;
        }
        return this.heldSample;
      }
    }
  }
}

export class DelayNode {
  leftDelayLine: DelayLine;
  rightDelayLine: DelayLine;
  delaySamples: number;
  feedback: number;
  pingPong: boolean;

  constructor(delaySamples: number, feedback: number, pingPong = false) {
    this.delaySamples = delaySamples;
    this.feedback = feedback;
    this.pingPong = pingPong;
    this.leftDelayLine = new DelayLine(delaySamples + 1);
    this.rightDelayLine = new DelayLine(delaySamples + 1);
  }

  process(left: number, right: number): { left: number; right: number } {
    const delayedLeft = this.leftDelayLine.read(this.delaySamples);
    const delayedRight = this.rightDelayLine.read(this.delaySamples);

    let nextLeftInput = left;
    let nextRightInput = right;

    if (this.pingPong) {
      nextLeftInput += delayedRight * this.feedback;
      nextRightInput += delayedLeft * this.feedback;
    } else {
      nextLeftInput += delayedLeft * this.feedback;
      nextRightInput += delayedRight * this.feedback;
    }

    this.leftDelayLine.write(nextLeftInput);
    this.rightDelayLine.write(nextRightInput);

    return {
      left: left + delayedLeft,
      right: right + delayedRight,
    };
  }
}

export class OscillatorNode {
  waveform: WaveformType;
  detune = 0.0; // in cents
  sampleRate: number;
  phase = 0.0;

  constructor(
    waveform: WaveformType = "sine",
    detune = 0.0,
    sampleRate = 44100,
  ) {
    this.waveform = waveform;
    this.detune = detune;
    this.sampleRate = sampleRate;
  }

  process(frequency: number): number {
    const detunedFrequency = frequency * Math.pow(2.0, this.detune / 1200.0);
    this.phase += (2.0 * Math.PI * detunedFrequency) / this.sampleRate;
    this.phase = this.phase % (2.0 * Math.PI);

    switch (this.waveform) {
      case "sine":
        return Math.sin(this.phase);
      case "triangle": {
        const normalized = this.phase / (2.0 * Math.PI);
        return 2.0 * Math.abs(2.0 * normalized - 1.0) - 1.0;
      }
      case "sawtooth": {
        const normalized = this.phase / (2.0 * Math.PI);
        return 2.0 * normalized - 1.0;
      }
      case "square":
        return this.phase >= Math.PI ? 1.0 : -1.0;
      case "noise":
        return Math.random() * 2.0 - 1.0;
    }
  }
}

export class NoiseNode {
  noiseType: "white" | "pink";
  b0 = 0.0;
  b1 = 0.0;
  b2 = 0.0;
  b3 = 0.0;
  b4 = 0.0;
  b5 = 0.0;
  b6 = 0.0;

  constructor(noiseType: "white" | "pink" = "white") {
    this.noiseType = noiseType;
  }

  process(): number {
    const whiteNoise = Math.random() * 2.0 - 1.0;
    if (this.noiseType === "white") {
      return whiteNoise;
    } else {
      // Kellet's pink noise refinement
      this.b0 = 0.99886 * this.b0 + whiteNoise * 0.0555179;
      this.b1 = 0.99332 * this.b1 + whiteNoise * 0.0750759;
      this.b2 = 0.969 * this.b2 + whiteNoise * 0.153852;
      this.b3 = 0.8665 * this.b3 + whiteNoise * 0.3104856;
      this.b4 = 0.55 * this.b4 + whiteNoise * 0.5329522;
      this.b5 = -0.7616 * this.b5 - whiteNoise * 0.016898;
      const pinkSample =
        this.b0 +
        this.b1 +
        this.b2 +
        this.b3 +
        this.b4 +
        this.b5 +
        this.b6 +
        whiteNoise * 0.5362;
      this.b6 = whiteNoise * 0.115926;
      return pinkSample * 0.11;
    }
  }
}

export class EnvelopeNode {
  attack: number;
  decay: number;
  sustain: number;
  release: number;

  constructor(attack = 0.05, decay = 0.1, sustain = 0.8, release = 0.15) {
    this.attack = attack;
    this.decay = decay;
    this.sustain = sustain;
    this.release = release;
  }

  getValue(elapsedTime: number, noteDuration: number): number {
    if (elapsedTime < noteDuration) {
      if (elapsedTime < this.attack) {
        if (this.attack === 0.0) return 1.0;
        return elapsedTime / this.attack;
      } else if (elapsedTime < this.attack + this.decay) {
        if (this.decay === 0.0) return this.sustain;
        const delta = elapsedTime - this.attack;
        return 1.0 - (1.0 - this.sustain) * (delta / this.decay);
      } else {
        return this.sustain;
      }
    } else {
      const releaseTime = elapsedTime - noteDuration;
      if (releaseTime >= this.release) return 0.0;
      if (this.release === 0.0) return 0.0;

      let releaseStartAmplitude = this.sustain;
      if (noteDuration < this.attack) {
        releaseStartAmplitude = noteDuration / this.attack;
      } else if (noteDuration < this.attack + this.decay) {
        const delta = noteDuration - this.attack;
        releaseStartAmplitude =
          1.0 - (1.0 - this.sustain) * (delta / this.decay);
      }

      return releaseStartAmplitude * (1.0 - releaseTime / this.release);
    }
  }
}

export class DrumSynthNode {
  type: "kick" | "snare" | "hat";
  sampleRate: number;
  phase = 0.0;
  highHatFilter: BiquadFilter | null = null;

  constructor(type: "kick" | "snare" | "hat", sampleRate = 44100) {
    this.type = type;
    this.sampleRate = sampleRate;
    if (type === "hat") {
      this.highHatFilter = new BiquadFilter("highpass", sampleRate);
      this.highHatFilter.updateCoefficients(7500.0, 1.2);
    }
  }

  process(elapsedTime: number): number {
    if (this.type === "kick") {
      const kickDuration = 0.14;
      if (elapsedTime > kickDuration) return 0.0;
      const kickFrequency =
        42.0 + (160.0 - 42.0) * Math.exp(-elapsedTime * 48.0);
      this.phase += (2.0 * Math.PI * kickFrequency) / this.sampleRate;
      const kickAmplitude = Math.exp(-elapsedTime * 22.0);
      return Math.sin(this.phase) * kickAmplitude;
    } else if (this.type === "snare") {
      const snareDuration = 0.2;
      if (elapsedTime > snareDuration) return 0.0;
      const tonalFrequency = 175.0;
      this.phase += (2.0 * Math.PI * tonalFrequency) / this.sampleRate;
      const tonalAmplitude =
        Math.sin(this.phase) * Math.exp(-elapsedTime * 40.0) * 0.3;
      const whiteNoise =
        (Math.random() * 2.0 - 1.0) * Math.exp(-elapsedTime * 18.0) * 0.7;
      return tonalAmplitude + whiteNoise;
    } else {
      const hatDuration = 0.08;
      if (elapsedTime > hatDuration) return 0.0;
      const whiteNoise =
        (Math.random() * 2.0 - 1.0) * Math.exp(-elapsedTime * 85.0) * 0.85;
      if (this.highHatFilter) {
        return this.highHatFilter.process(whiteNoise);
      }
      return whiteNoise;
    }
  }
}

export class ModularVoice {
  noteConfig: NoteConfig;
  elapsedTime = 0.0;
  sampleRate: number;
  velocity: number;
  pitchBendConfig: PitchBendConfig | undefined;
  baseFrequency: number;
  bendTargetFrequency: number;

  oscillators: Record<string, OscillatorNode> = {};
  noises: Record<string, NoiseNode> = {};
  filters: Record<string, BiquadFilter> = {};
  envelopes: Record<string, EnvelopeNode> = {};
  drumSynths: Record<string, DrumSynthNode> = {};
  distortions: Record<string, DistortionNode> = {};

  constructor(
    noteConfig: NoteConfig,
    nodeConfigs: Record<string, NodeConfig>,
    sampleRate: number,
  ) {
    this.noteConfig = noteConfig;
    this.sampleRate = sampleRate;
    this.velocity = Math.max(0.0, Math.min(noteConfig.velocity ?? 1.0, 1.0));
    this.pitchBendConfig = noteConfig.pitchBend;
    this.baseFrequency = noteToFreq(noteConfig.note);
    this.bendTargetFrequency = this.pitchBendConfig
      ? noteToFreq(this.pitchBendConfig.target)
      : this.baseFrequency;

    for (const [nodeName, nodeConfig] of Object.entries(nodeConfigs)) {
      if (nodeConfig.type === "oscillator") {
        this.oscillators[nodeName] = new OscillatorNode(
          nodeConfig.waveform || "sine",
          nodeConfig.detune || 0.0,
          sampleRate,
        );
      } else if (nodeConfig.type === "noise") {
        this.noises[nodeName] = new NoiseNode(nodeConfig.noiseType || "white");
      } else if (nodeConfig.type === "biquad_filter") {
        this.filters[nodeName] = new BiquadFilter(
          nodeConfig.filterType || "lowpass",
          sampleRate,
        );
      } else if (nodeConfig.type === "envelope") {
        this.envelopes[nodeName] = new EnvelopeNode(
          nodeConfig.attack,
          nodeConfig.decay,
          nodeConfig.sustain,
          nodeConfig.release,
        );
      } else if (nodeConfig.type === "drum_synth") {
        const noteString = String(noteConfig.note).toLowerCase();
        const drumType =
          noteString === "kick"
            ? "kick"
            : noteString === "snare"
              ? "snare"
              : "hat";
        this.drumSynths[nodeName] = new DrumSynthNode(drumType, sampleRate);
      } else if (nodeConfig.type === "distortion") {
        this.distortions[nodeName] = new DistortionNode(
          nodeConfig.algorithm || "soft_clip",
          nodeConfig.drive || 4.0,
          nodeConfig.bitDepth || 8,
          nodeConfig.downsample || 1,
        );
      }
    }
  }

  computeCurrentFrequency(noteDurationSeconds: number): number {
    if (!this.pitchBendConfig) return this.baseFrequency;

    const bendStart =
      (this.pitchBendConfig.startTime ?? 0.0) * noteDurationSeconds;
    const bendEnd = (this.pitchBendConfig.endTime ?? 1.0) * noteDurationSeconds;
    const bendWindow = bendEnd - bendStart;

    if (bendWindow <= 0 || this.elapsedTime < bendStart) {
      return this.baseFrequency;
    }
    if (this.elapsedTime >= bendEnd) {
      return this.bendTargetFrequency;
    }

    const bendProgress = (this.elapsedTime - bendStart) / bendWindow;
    return (
      this.baseFrequency *
      Math.pow(this.bendTargetFrequency / this.baseFrequency, bendProgress)
    );
  }

  process(
    nodeChain: string[],
    noteDurationSeconds: number,
    nodeConfigs: Record<string, NodeConfig>,
  ): { left: number; right: number } {
    this.elapsedTime += 1.0 / this.sampleRate;

    const envelopeValues: Record<string, number> = {};
    for (const [nodeName, envelopeNode] of Object.entries(this.envelopes)) {
      envelopeValues[nodeName] = envelopeNode.getValue(
        this.elapsedTime,
        noteDurationSeconds,
      );
    }

    const currentFrequency = this.computeCurrentFrequency(noteDurationSeconds);

    let currentSignal = 0.0;
    let stereoLeft = 0.0;
    let stereoRight = 0.0;
    let isStereo = false;

    for (const nodeName of nodeChain) {
      if (nodeName === "destination") {
        break;
      }

      const nodeConfig = nodeConfigs[nodeName];
      if (!nodeConfig) continue;

      if (nodeConfig.type === "oscillator") {
        const oscillator = this.oscillators[nodeName];
        if (oscillator) {
          currentSignal = oscillator.process(currentFrequency);
        }
      } else if (nodeConfig.type === "noise") {
        const noise = this.noises[nodeName];
        if (noise) {
          currentSignal = noise.process();
        }
      } else if (nodeConfig.type === "drum_synth") {
        const drum = this.drumSynths[nodeName];
        if (drum) {
          currentSignal = drum.process(this.elapsedTime);
        }
      } else if (nodeConfig.type === "envelope") {
        const envelopeValue = envelopeValues[nodeName] ?? 0.0;
        currentSignal *= envelopeValue;
      } else if (nodeConfig.type === "biquad_filter") {
        const filter = this.filters[nodeName];
        if (filter) {
          let cutoff = nodeConfig.cutoff || 1000.0;
          if (nodeConfig.modulate?.cutoff) {
            const modalSource = nodeConfig.modulate.cutoff;
            const envelopeValue = envelopeValues[modalSource] ?? 0.0;
            cutoff = cutoff * (1.0 + envelopeValue * 8.0);
          }
          filter.updateCoefficients(cutoff, nodeConfig.Q || 1.0);
          currentSignal = filter.process(currentSignal);
        }
      } else if (nodeConfig.type === "gain") {
        let gainValue = nodeConfig.gain ?? 1.0;
        if (nodeConfig.modulate?.gain) {
          const modalSource = nodeConfig.modulate.gain;
          const envelopeValue = envelopeValues[modalSource] ?? 0.0;
          gainValue *= envelopeValue;
        }
        currentSignal *= gainValue;
      } else if (nodeConfig.type === "distortion") {
        const distortionNode = this.distortions[nodeName];
        if (distortionNode) {
          currentSignal = distortionNode.process(currentSignal);
        }
      } else if (nodeConfig.type === "stereo_panner") {
        const panValue = Math.min(Math.max(nodeConfig.pan ?? 0.0, -1.0), 1.0);
        const theta = ((panValue + 1.0) * Math.PI) / 4.0;
        stereoLeft = currentSignal * Math.cos(theta);
        stereoRight = currentSignal * Math.sin(theta);
        isStereo = true;
      }
    }

    if (!isStereo) {
      stereoLeft = currentSignal;
      stereoRight = currentSignal;
    }

    // Apply per-note velocity scaling
    stereoLeft *= this.velocity;
    stereoRight *= this.velocity;

    return { left: stereoLeft, right: stereoRight };
  }

  isFinished(noteDurationSeconds: number, releaseTimeSeconds: number): boolean {
    return this.elapsedTime >= noteDurationSeconds + releaseTimeSeconds;
  }
}

export function getVoiceReleaseTime(
  nodeConfigs: Record<string, NodeConfig>,
): number {
  let maxRelease = 0.0;
  for (const config of Object.values(nodeConfigs)) {
    if (config.type === "envelope" && config.release !== undefined) {
      maxRelease = Math.max(maxRelease, config.release);
    }
  }
  return maxRelease;
}

export function parseTimeMarker(
  marker: string | number,
  tempo = 120,
  beatsPerBar = 4,
): number {
  if (typeof marker === "number") {
    return marker;
  }
  if (!marker) return 0.0;

  const parts = String(marker).split(".");
  if (parts.length < 3) {
    const parsed = parseFloat(marker);
    return isNaN(parsed) ? 0.0 : parsed;
  }

  const bar = parseInt(parts[0], 10) || 1;
  const beat = parseInt(parts[1], 10) || 1;
  const sixteenth = parseInt(parts[2], 10) || 1;

  const beatDuration = 60.0 / tempo;
  const barDuration = beatDuration * beatsPerBar;
  const sixteenthDuration = beatDuration / 4.0;

  return (
    (bar - 1) * barDuration +
    (beat - 1) * beatDuration +
    (sixteenth - 1) * sixteenthDuration
  );
}

export function computeTimelineDuration(
  tracks: TrackConfig[],
  nodeConfigs: Record<string, NodeConfig>,
  tempo = 120,
  beatsPerBar = 4,
): number {
  let maxEnd = 0.0;
  for (const track of tracks) {
    const effectiveNotes = expandTrackRepeats(
      track.notes,
      track.repeat ?? 1,
      tempo,
      beatsPerBar,
    );
    for (const note of effectiveNotes) {
      const start = parseTimeMarker(note.time, tempo, beatsPerBar);
      const duration = parseTimeMarker(note.duration, tempo, beatsPerBar);
      const release = getVoiceReleaseTime(nodeConfigs);
      maxEnd = Math.max(maxEnd, start + duration + release);
    }
  }
  return maxEnd + 0.1;
}

export function applySwingOffset(
  sixteenthIndex: number,
  swingAmount: number,
  tempo: number,
): number {
  if (swingAmount <= 0) return 0.0;
  const sixteenthDuration = 60.0 / tempo / 4.0;
  const isOffBeat = sixteenthIndex % 2 === 1;
  return isOffBeat ? swingAmount * sixteenthDuration * 0.5 : 0.0;
}

export function applyHumanizeOffset(humanizeAmount: number): number {
  if (humanizeAmount <= 0) return 0.0;
  const maximumJitterSeconds = 0.02;
  return (Math.random() * 2.0 - 1.0) * humanizeAmount * maximumJitterSeconds;
}

export function computeSixteenthIndex(
  timeInSeconds: number,
  tempo: number,
): number {
  const sixteenthDuration = 60.0 / tempo / 4.0;
  return Math.round(timeInSeconds / sixteenthDuration);
}

export function renderModularGraph(config: SynthesizerConfig): Float32Array {
  const sampleRate = config.sampleRate || 44100;
  const tempo = config.tempo || 120;
  const nodes = config.nodes || {};
  const tracks = config.tracks || [];
  const swingAmount = Math.max(0.0, Math.min(config.swing ?? 0.0, 1.0));
  const humanizeAmount = Math.max(0.0, Math.min(config.humanize ?? 0.0, 1.0));
  const beatsPerBar = config.timeSignature?.[0] ?? 4;

  const nodeNames = Object.keys(nodes);

  if (tracks.length > 0 && nodeNames.length === 0) {
    throw new Error(
      "Modular mode requires a 'nodes' object defining DSP node configurations. " +
        "Each name in a track's nodeChain (e.g. 'osc', 'env', 'filter') must have " +
        "a corresponding entry in 'nodes' with its type and parameters. " +
        'Example: { "osc": { "type": "oscillator", "waveform": "sine" }, ' +
        '"env": { "type": "envelope", "attack": 0.01, "decay": 0.2, "sustain": 0.6, "release": 0.15 } }',
    );
  }

  if (tracks.length === 0) {
    throw new Error(
      "Modular mode requires at least one track with a nodeChain and notes array.",
    );
  }

  const unresolvedNodeNames: string[] = [];
  for (const track of tracks) {
    for (const chainNodeName of track.nodeChain) {
      if (chainNodeName === "destination") continue;
      if (!nodes[chainNodeName]) {
        unresolvedNodeNames.push(chainNodeName);
      }
    }
  }
  if (unresolvedNodeNames.length > 0) {
    const uniqueUnresolved = [...new Set(unresolvedNodeNames)];
    throw new Error(
      `Track nodeChain references undefined nodes: [${uniqueUnresolved.join(", ")}]. ` +
        `Each name must have a matching entry in the 'nodes' object. ` +
        `Defined nodes: [${nodeNames.length > 0 ? nodeNames.join(", ") : "(none)"}].`,
    );
  }

  const timelineDuration = computeTimelineDuration(tracks, nodes, tempo, beatsPerBar);
  let duration = config.duration
    ? Math.max(config.duration, timelineDuration)
    : timelineDuration;
  duration = Math.min(Math.max(duration, 0.1), 60.0);

  const numberSamples = Math.floor(duration * sampleRate);
  const masterBuffer = new Float32Array(numberSamples * 2);

  const trackDelayNodes: Record<number, DelayNode> = {};
  const trackReverbNodes: Record<number, SchroederReverb> = {};

  tracks.forEach((track, trackIndex) => {
    track.nodeChain.forEach((nodeName) => {
      const nodeConfig = nodes[nodeName];
      if (!nodeConfig) return;

      if (nodeConfig.type === "delay") {
        const rawDelayTime = nodeConfig.delayTime || 0.25;
        const resolvedDelayTime =
          typeof rawDelayTime === "string"
            ? parseBeatDuration(rawDelayTime, tempo)
            : rawDelayTime;
        const delaySamples = Math.floor(resolvedDelayTime * sampleRate);
        trackDelayNodes[trackIndex] = new DelayNode(
          delaySamples,
          nodeConfig.feedback || 0.4,
          nodeConfig.pingPong || false,
        );
      } else if (nodeConfig.type === "reverb") {
        trackReverbNodes[trackIndex] = new SchroederReverb(
          sampleRate,
          nodeConfig.wet || 0.35,
          nodeConfig.decay || 0.5,
        );
      }
    });
  });

  const activeVoicesMap: Record<
    number,
    { voice: ModularVoice; startTime: number; duration: number }[]
  > = {};
  // Pre-expand track repeats and chord notes before the sample loop
  const expandedTrackNotes: NoteConfig[][] = tracks.map((track) => {
    const repeatedNotes = expandTrackRepeats(
      track.notes,
      track.repeat ?? 1,
      tempo,
      beatsPerBar,
    );

    // Expand chord notation into individual simultaneous notes
    const chordExpandedNotes: NoteConfig[] = [];
    for (const note of repeatedNotes) {
      const noteString = String(note.note).trim();
      if (isChordNotation(noteString)) {
        const chordNotes = expandChordToNotes(noteString);
        for (const constituentNote of chordNotes) {
          chordExpandedNotes.push({ ...note, note: constituentNote });
        }
      } else {
        chordExpandedNotes.push(note);
      }
    }

    return chordExpandedNotes;
  });

  tracks.forEach((_, trackIndex) => {
    activeVoicesMap[trackIndex] = [];
  });

  const deltaTime = 1.0 / sampleRate;

  for (let currentSample = 0; currentSample < numberSamples; currentSample++) {
    const currentTime = currentSample * deltaTime;

    tracks.forEach((track, trackIndex) => {
      const notesForTrack = expandedTrackNotes[trackIndex];
      notesForTrack.forEach((note) => {
        let noteStartTime =
          typeof note.time === "number"
            ? note.time
            : parseTimeMarker(note.time, tempo, beatsPerBar);
        const noteDurationSeconds = parseTimeMarker(
          note.duration,
          tempo,
          beatsPerBar,
        );

        // Apply swing offset based on the note's position in the 16th-note grid
        const sixteenthIndex = computeSixteenthIndex(noteStartTime, tempo);
        noteStartTime += applySwingOffset(sixteenthIndex, swingAmount, tempo);
        noteStartTime += applyHumanizeOffset(humanizeAmount);
        noteStartTime = Math.max(0.0, noteStartTime);

        const frameOffset = Math.abs(currentTime - noteStartTime);
        if (frameOffset < deltaTime * 0.5) {
          const newVoice = new ModularVoice(note, nodes, sampleRate);
          activeVoicesMap[trackIndex].push({
            voice: newVoice,
            startTime: noteStartTime,
            duration: noteDurationSeconds,
          });
        }
      });
    });

    let masterLeft = 0.0;
    let masterRight = 0.0;

    tracks.forEach((track, trackIndex) => {
      let trackLeft = 0.0;
      let trackRight = 0.0;

      const activeVoices = activeVoicesMap[trackIndex];
      const remainingVoices: typeof activeVoices = [];
      const maxRelease = getVoiceReleaseTime(nodes);

      activeVoices.forEach((voiceState) => {
        const voiceOutput = voiceState.voice.process(
          track.nodeChain,
          voiceState.duration,
          nodes,
        );
        trackLeft += voiceOutput.left;
        trackRight += voiceOutput.right;

        if (!voiceState.voice.isFinished(voiceState.duration, maxRelease)) {
          remainingVoices.push(voiceState);
        }
      });

      activeVoicesMap[trackIndex] = remainingVoices;

      const delayNode = trackDelayNodes[trackIndex];
      if (delayNode) {
        const delayed = delayNode.process(trackLeft, trackRight);
        trackLeft = delayed.left;
        trackRight = delayed.right;
      }

      const reverbNode = trackReverbNodes[trackIndex];
      if (reverbNode) {
        const reverbed = reverbNode.process(trackLeft, trackRight);
        trackLeft = reverbed.left;
        trackRight = reverbed.right;
      }

      // Apply per-track volume
      const trackVolume = Math.max(0.0, Math.min(track.volume ?? 1.0, 2.0));
      masterLeft += trackLeft * trackVolume;
      masterRight += trackRight * trackVolume;
    });

    masterBuffer[currentSample * 2] = masterLeft;
    masterBuffer[currentSample * 2 + 1] = masterRight;
  }

  let maxPeak = 0.0;
  for (let i = 0; i < masterBuffer.length; i++) {
    const absValue = Math.abs(masterBuffer[i]);
    if (absValue > maxPeak) maxPeak = absValue;
  }

  if (maxPeak > 0.98) {
    const scaleFactor = 0.95 / maxPeak;
    for (let i = 0; i < masterBuffer.length; i++) {
      masterBuffer[i] *= scaleFactor;
    }
  }

  return masterBuffer;
}

/**
 * Parses note name (e.g. "C4", "A#3") or raw string frequency into a numeric frequency in Hz.
 */
export function noteToFreq(note: number | string): number {
  if (typeof note === "number") return note;
  if (!note) return 440;

  const trimmed = String(note).trim();

  // REST / SILENCE produces zero frequency (silent output)
  if (/^(rest|silence)$/i.test(trimmed)) return 0;

  // Handle flat notation (e.g. Bb4, Eb3)
  const flatMatch = trimmed.match(/^([A-G]b)(-?\d+)$/i);
  if (flatMatch) {
    const originalRootLetter = flatMatch[1].charAt(0).toUpperCase();
    const sharpEquivalent =
      FLAT_TO_SHARP[originalRootLetter + "b"];
    if (sharpEquivalent) {
      let octave = parseInt(flatMatch[2], 10);
      const semitone = NOTE_NAMES.indexOf(sharpEquivalent);
      const originalRootSemitone = NOTE_NAMES.indexOf(originalRootLetter);
      // Cb4 = B3, not B4: when the resolved semitone wraps below the
      // octave boundary (C=0), we must decrement the octave.
      if (semitone >= originalRootSemitone && originalRootSemitone === 0) {
        octave -= 1;
      }
      const a4Index = 4 * 12 + 9;
      const noteIndex = octave * 12 + semitone;
      return 440 * Math.pow(2, (noteIndex - a4Index) / 12);
    }
  }

  const match = trimmed.match(/^([A-G]#?)(-?\d+)$/i);
  if (!match) {
    const parsed = parseFloat(trimmed);
    return isNaN(parsed) ? 440 : parsed;
  }

  const name = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);
  const semitone = NOTE_NAMES.indexOf(name);

  const a4Index = 4 * 12 + 9; // Octave 4, A
  const noteIndex = octave * 12 + semitone;
  return 440 * Math.pow(2, (noteIndex - a4Index) / 12);
}

/**
 * Evaluates a standard ADSR envelope at time t.
 */
export function getEnvelopeValue(
  time: number,
  totalDuration: number,
  adsr: ADSREnvelope,
): number {
  let { attack, decay, release } = adsr;
  const { sustain } = adsr;
  const sum = attack + decay + release;

  // Proportional scale to fit within total duration if ADSR exceeds it
  if (sum > totalDuration) {
    const scale = totalDuration / sum;
    attack *= scale;
    decay *= scale;
    release *= scale;
  }

  const sustainDuration = Math.max(0, totalDuration - attack - decay - release);

  if (time < attack) {
    if (attack === 0) return 1;
    return time / attack; // Linear attack ramp up to 1.0
  } else if (time < attack + decay) {
    if (decay === 0) return sustain;
    const deltaTime = time - attack;
    return 1 - (1 - sustain) * (deltaTime / decay); // Linear decay down to sustain level
  } else if (time < attack + decay + sustainDuration) {
    return sustain; // Hold sustain level
  } else if (time < totalDuration) {
    if (release === 0) return 0;
    const deltaTime = time - (attack + decay + sustainDuration);
    return sustain * (1 - deltaTime / release); // Linear release ramp down to 0
  }
  return 0;
}

/**
 * Synthesizes a mono Float32Array from synth parameters.
 */
export function synthesizeSound(config: SynthesizerConfig): Float32Array {
  // Apply instrument preset defaults (user-specified params override)
  const instrumentPreset = config.instrument
    ? INSTRUMENT_PRESETS[
        config.instrument.toLowerCase().replace(/[\s-]+/g, "_")
      ]
    : undefined;

  const sampleRate = config.sampleRate || 44100;
  const duration = Math.min(Math.max(config.duration || 1.0, 0.1), 60.0);
  const numberSamples = Math.floor(duration * sampleRate);
  const samples = new Float32Array(numberSamples);

  const startFreq = noteToFreq(config.frequency ?? 440);
  const endFreq = config.endFrequency
    ? noteToFreq(config.endFrequency)
    : startFreq;
  const waveform = config.waveform || instrumentPreset?.waveform || "sine";
  const harmonics = config.harmonics || instrumentPreset?.harmonics || [1.0];

  const modalFreq =
    config.modulatorFrequency || instrumentPreset?.modulatorFrequency || 0;
  const modalIndex =
    config.modulationIndex || instrumentPreset?.modulationIndex || 0;

  const defaultEnvelope = instrumentPreset?.envelope || {
    attack: 0.05,
    decay: 0.1,
    sustain: 0.8,
    release: 0.15,
  };
  const userEnvelope = config.envelope;
  const envelope: ADSREnvelope = {
    attack: userEnvelope?.attack ?? defaultEnvelope.attack,
    decay: userEnvelope?.decay ?? defaultEnvelope.decay,
    sustain: userEnvelope?.sustain ?? defaultEnvelope.sustain,
    release: userEnvelope?.release ?? defaultEnvelope.release,
  };

  const lfo = config.lfo || instrumentPreset?.lfo;
  const deltaTime = 1 / sampleRate;

  let carrierPhase = 0;
  let modulatorPhase = 0;
  let lfoPhase = 0;

  for (let i = 0; i < numberSamples; i++) {
    const currentTime = i * deltaTime;

    // 1. LFO Pitch and Amplitude Modulation
    let lfoPitchOffset = 0;
    let lfoAmpMultiplier = 1.0;
    if (lfo) {
      lfoPhase += 2 * Math.PI * lfo.frequency * deltaTime;
      const lfoValue = Math.sin(lfoPhase);
      if (lfo.pitchDepth) {
        lfoPitchOffset = lfoValue * lfo.pitchDepth;
      }
      if (lfo.amplitudeDepth) {
        lfoAmpMultiplier =
          1.0 -
          Math.max(0, Math.min(1, lfo.amplitudeDepth)) * 0.5 * (1.0 - lfoValue);
      }
    }

    // 2. Frequency sweep calculation (exponential)
    let baseFreq = startFreq;
    if (startFreq !== endFreq) {
      baseFreq =
        startFreq * Math.pow(endFreq / startFreq, currentTime / duration);
    }
    baseFreq += lfoPitchOffset;

    // 3. FM Modulator phase step
    let modalValue = 0;
    if (modalFreq > 0 && modalIndex > 0) {
      modulatorPhase += 2 * Math.PI * modalFreq * deltaTime;
      modalValue = Math.sin(modulatorPhase);
    }

    // 4. FM Carrier phase step
    const freqOffset = modalValue * modalIndex;
    const finalFreq = Math.max(1, baseFreq + freqOffset);
    carrierPhase += 2 * Math.PI * finalFreq * deltaTime;

    // 5. Additive synthesis / waveform evaluation
    let sampleValue = 0;
    for (let harmonicIndex = 0; harmonicIndex < harmonics.length; harmonicIndex++) {
      const harmonicFreqMultiplier = harmonicIndex + 1;
      const phase = carrierPhase * harmonicFreqMultiplier;
      const amp = harmonics[harmonicIndex];
      if (amp <= 0) continue;

      let value = 0;
      switch (waveform) {
        case "sine":
          value = Math.sin(phase);
          break;
        case "triangle": {
          const normalized = (phase % (2 * Math.PI)) / (2 * Math.PI);
          value = 2 * Math.abs(2 * normalized - 1) - 1;
          break;
        }
        case "sawtooth": {
          const normalized = (phase % (2 * Math.PI)) / (2 * Math.PI);
          value = 2 * normalized - 1;
          break;
        }
        case "square":
          value = phase % (2 * Math.PI) >= Math.PI ? 1.0 : -1.0;
          break;
        case "noise":
          value = Math.random() * 2 - 1;
          break;
      }
      sampleValue += value * amp;
    }

    // Normalize additive samples to avoid clipping
    const totalHarmonicAmp = harmonics.reduce(
      (accumulator, harmonicAmplitude) => accumulator + harmonicAmplitude,
      0,
    );
    if (totalHarmonicAmp > 1.0) {
      sampleValue /= totalHarmonicAmp;
    }

    // 6. Amplitude envelope
    const envelopeValue = getEnvelopeValue(currentTime, duration, envelope);
    samples[i] = sampleValue * envelopeValue * lfoAmpMultiplier;
  }

  // 7. Apply delay line if configured
  if (config.delay && config.delay.delayTime > 0 && config.delay.feedback > 0) {
    const delaySamples = Math.floor(config.delay.delayTime * sampleRate);
    const feedback = Math.min(Math.max(config.delay.feedback, 0), 0.95);
    if (delaySamples > 0 && delaySamples < samples.length) {
      for (let i = delaySamples; i < samples.length; i++) {
        samples[i] += samples[i - delaySamples] * feedback;
      }
    }
  }

  return samples;
}

/**
 * Synthesizes a sequence of notes (melody/arpeggio).
 */
export function synthesizeSequence(
  steps: MelodyStep[],
  baseConfig: SynthesizerConfig,
): Float32Array {
  const sampleRate = baseConfig.sampleRate || 44100;
  // Expand chords and REST in melody steps
  const expandedSteps: {
    frequencies: number[];
    duration: number;
    velocity: number;
  }[] = [];
  const tempo = baseConfig.tempo ?? 120;
  for (const step of steps) {
    const noteString = String(step.note).trim();
    const stepVelocity = step.velocity ?? 1.0;
    const resolvedDuration = parseBeatDuration(step.duration, tempo);

    if (isChordNotation(noteString)) {
      const chordNotes = expandChordToNotes(noteString);
      expandedSteps.push({
        frequencies: chordNotes.map((chordNote) => noteToFreq(chordNote)),
        duration: Math.max(resolvedDuration, 0.02),
        velocity: stepVelocity,
      });
    } else {
      expandedSteps.push({
        frequencies: [noteToFreq(step.note)],
        duration: Math.max(resolvedDuration, 0.02),
        velocity: stepVelocity,
      });
    }
  }

  const totalDuration = expandedSteps.reduce(
    (accumulator, step) => accumulator + step.duration,
    0,
  );
  const cappedDuration = Math.min(totalDuration, 60.0);
  const numberSamples = Math.floor(cappedDuration * sampleRate);
  const samples = new Float32Array(numberSamples);

  // ── Tracker-style New Note Action: Cut (NNA: Cut) ──────────
  // In real music trackers (ProTracker, Impulse Tracker, Renoise),
  // each channel is monophonic. When a new note triggers, the
  // previous note is **hard-cut** (amplitude → 0 instantly) and the
  // new note re-triggers from its envelope's attack phase. There is
  // no release/fade on the old note — it simply stops dead.
  //
  // We replicate this by forcing `release: 0` on every note except
  // the last one in the sequence. The final note gets a natural
  // release tail so the melody doesn't end with an abrupt click.
  // Each call to `synthesizeSound` already resets the oscillator
  // phase to 0, equivalent to a tracker resetting sample playback
  // position on note trigger.

  // When no explicit envelope or instrument preset is provided, use
  // a more percussive "tracker-style" default envelope with a sharp
  // attack and pronounced decay, so individual notes are distinct
  // even on a bare sine wave.
  const trackerDefaultEnvelope: ADSREnvelope = {
    attack: 0.005,
    decay: 0.25,
    sustain: 0.3,
    release: 0.08,
  };

  let currentSampleOffset = 0;
  const deltaTime = 1 / sampleRate;

  for (let stepIndex = 0; stepIndex < expandedSteps.length; stepIndex++) {
    const step = expandedSteps[stepIndex];
    const isLastNote = stepIndex === expandedSteps.length - 1;
    const stepSamplesCount = Math.floor(step.duration * sampleRate);
    if (currentSampleOffset >= numberSamples) break;

    const actualCount = Math.min(
      stepSamplesCount,
      numberSamples - currentSampleOffset,
    );
    const stepDuration = actualCount * deltaTime;

    // Resolve the envelope for this note:
    // 1. User-provided envelope or instrument preset takes priority
    // 2. Otherwise use the tracker-style default
    // 3. NNA: Cut — force release to 0 on all notes except the last
    const userEnvelope = baseConfig.envelope;
    const instrumentPresetEnvelope = baseConfig.instrument
      ? INSTRUMENT_PRESETS[
          baseConfig.instrument.toLowerCase().replace(/[\s-]+/g, "_")
        ]?.envelope
      : undefined;

    const resolvedEnvelope: ADSREnvelope = {
      attack: userEnvelope?.attack ?? instrumentPresetEnvelope?.attack ?? trackerDefaultEnvelope.attack,
      decay: userEnvelope?.decay ?? instrumentPresetEnvelope?.decay ?? trackerDefaultEnvelope.decay,
      sustain: userEnvelope?.sustain ?? instrumentPresetEnvelope?.sustain ?? trackerDefaultEnvelope.sustain,
      release: userEnvelope?.release ?? instrumentPresetEnvelope?.release ?? trackerDefaultEnvelope.release,
    };

    if (!isLastNote) {
      // NNA: Cut — hard-cut the note at the boundary (no release phase)
      resolvedEnvelope.release = 0;
    }

    // Synthesize each constituent frequency (chords produce multiple)
    for (const frequency of step.frequencies) {
      if (frequency <= 0) continue; // REST note

      const stepConfig: SynthesizerConfig = {
        ...baseConfig,
        envelope: resolvedEnvelope,
        duration: stepDuration,
        frequency,
        endFrequency: undefined,
        sampleRate,
      };

      const stepSamples = synthesizeSound(stepConfig);
      const velocityGain = step.velocity * (1.0 / step.frequencies.length);
      for (let sampleIndex = 0; sampleIndex < actualCount; sampleIndex++) {
        samples[currentSampleOffset + sampleIndex] +=
          stepSamples[sampleIndex] * velocityGain;
      }
    }

    currentSampleOffset += actualCount;
  }

  // Apply delay line on the entire combined sequence
  if (
    baseConfig.delay &&
    baseConfig.delay.delayTime > 0 &&
    baseConfig.delay.feedback > 0
  ) {
    const delaySamples = Math.floor(baseConfig.delay.delayTime * sampleRate);
    const feedback = Math.min(Math.max(baseConfig.delay.feedback, 0), 0.95);
    if (delaySamples > 0 && delaySamples < samples.length) {
      for (let i = delaySamples; i < samples.length; i++) {
        samples[i] += samples[i - delaySamples] * feedback;
      }
    }
  }

  return samples;
}

/**
 * Predefined retro game preset sound effect synthesizers.
 */
export function synthesizePreset(
  preset: string,
  sampleRate: number,
): Float32Array {
  switch (preset) {
    case "laser":
      // High-pitched square wave sweeping downwards rapidly
      return synthesizeSound({
        duration: 0.25,
        waveform: "square",
        frequency: 880,
        endFrequency: 110,
        envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.08 },
        sampleRate,
      });

    case "coin":
      // A classic chiptune coin pickup (B5 for 0.08s followed by E6 for 0.3s)
      return synthesizeSequence(
        [
          { note: "B5", duration: 0.08 },
          { note: "E6", duration: 0.3 },
        ],
        {
          waveform: "triangle",
          envelope: { attack: 0.005, decay: 0.05, sustain: 0.8, release: 0.1 },
          sampleRate,
        },
      );

    case "powerup":
      // Arpeggiating upward major pentatonic scale quickly
      return synthesizeSequence(
        [
          { note: "C4", duration: 0.07 },
          { note: "E4", duration: 0.07 },
          { note: "G4", duration: 0.07 },
          { note: "C5", duration: 0.07 },
          { note: "E5", duration: 0.07 },
          { note: "G5", duration: 0.25 },
        ],
        {
          waveform: "triangle",
          envelope: { attack: 0.005, decay: 0.04, sustain: 0.7, release: 0.08 },
          sampleRate,
        },
      );

    case "jump":
      // Rapid upward triangle wave pitch sweep
      return synthesizeSound({
        duration: 0.2,
        waveform: "triangle",
        frequency: 150,
        endFrequency: 650,
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.08 },
        sampleRate,
      });

    case "explosion": {
      // White noise mixed with a deep rumbling sawtooth sweep down
      const dur = 0.8;
      const numberSamples = Math.floor(dur * sampleRate);
      const samples = new Float32Array(numberSamples);
      const deltaTime = 1 / sampleRate;

      // 1. Synthesize the rumble component
      const rumbleSamples = synthesizeSound({
        duration: dur,
        waveform: "sawtooth",
        frequency: 80,
        endFrequency: 20,
        envelope: { attack: 0.02, decay: 0.5, sustain: 0.1, release: 0.28 },
        sampleRate,
      });

      // 2. Synthesize and mix decaying white noise
      const noiseEnvelope = {
        attack: 0.005,
        decay: 0.45,
        sustain: 0.0,
        release: 0.34,
      };
      for (let i = 0; i < numberSamples; i++) {
        const currentTime = i * deltaTime;
        const noiseValue = Math.random() * 2 - 1;
        const noiseEnvelopeValue = getEnvelopeValue(
          currentTime,
          dur,
          noiseEnvelope,
        );
        samples[i] =
          rumbleSamples[i] * 0.4 + noiseValue * noiseEnvelopeValue * 0.6;
      }
      return samples;
    }

    case "synthwave_bass":
      // A low-end heavy detuned sawtooth bass note with delay
      return synthesizeSound({
        duration: 1.0,
        waveform: "sawtooth",
        frequency: "E1",
        harmonics: [1.0, 0.6, 0.3, 0.1],
        envelope: { attack: 0.02, decay: 0.25, sustain: 0.6, release: 0.2 },
        delay: { delayTime: 0.25, feedback: 0.4 },
        sampleRate,
      });

    case "ambient_pad":
      // A soft, swelling harmonic triangle pad with vibrato and feedback delay
      return synthesizeSound({
        duration: 3.5,
        waveform: "triangle",
        frequency: "F3",
        harmonics: [1.0, 0.4, 0.2],
        envelope: { attack: 0.8, decay: 0.5, sustain: 0.7, release: 1.0 },
        lfo: { frequency: 4.5, pitchDepth: 3.5 }, // slow vibrato
        delay: { delayTime: 0.4, feedback: 0.5 },
        sampleRate,
      });

    case "sci_fi_sweep":
      // Swirling FM sci-fi sweep
      return synthesizeSound({
        duration: 2.0,
        waveform: "sine",
        frequency: 220,
        endFrequency: 880,
        modulatorFrequency: 35,
        modulationIndex: 120,
        envelope: { attack: 0.2, decay: 0.3, sustain: 0.8, release: 0.5 },
        delay: { delayTime: 0.15, feedback: 0.35 },
        sampleRate,
      });

    default:
      // Fallback simple beep
      return synthesizeSound({
        duration: 0.5,
        waveform: "sine",
        frequency: 440,
        sampleRate,
      });
  }
}

/**
 * Creates a valid RIFF-WAV Buffer from raw audio samples (supporting mono/stereo).
 */
export function createWavBuffer(
  samples: Float32Array,
  sampleRate: number,
  numberChannels = 1,
): Buffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numberChannels * bitsPerSample) / 8;
  const blockAlign = (numberChannels * bitsPerSample) / 8;
  const subChunk2Size = samples.length * 2;
  const chunkSize = 36 + subChunk2Size;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Chunk Size
  header.writeUInt16LE(1, 20); // PCM Format
  header.writeUInt16LE(numberChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(subChunk2Size, 40);

  const data = Buffer.alloc(subChunk2Size);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    const sampleValue = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    data.writeInt16LE(Math.floor(sampleValue), i * 2);
  }

  return Buffer.concat([header, data]);
}

/**
 * Core entry method to generate and return a base64-encoded audio/wav string.
 */
export function generateAudioWav(config: SynthesizerConfig): {
  audioBase64: string;
  sampleCount: number;
} {
  const sampleRate = config.sampleRate || 44100;
  let samples: Float32Array;
  let numberChannels = 1;

  const start = Date.now();

  if (config.soundType === "modular" || config.tracks || config.nodes) {
    logger.info(`[SoundSynthesizerService] Synthesizing modular audio graph`);
    samples = renderModularGraph(config);
    numberChannels = 2; // modular rendering is dual-channel stereo
  } else if (config.presetEffect) {
    logger.info(
      `[SoundSynthesizerService] Synthesizing preset effect: ${config.presetEffect}`,
    );
    samples = synthesizePreset(
      presetEffectToName(config.presetEffect),
      sampleRate,
    );
  } else {
    logger.info(
      `[SoundSynthesizerService] Synthesizing custom waveform: ${config.waveform || "sine"} at ${config.frequency || 440} Hz`,
    );
    samples = synthesizeSound(config);
  }

  const wavBuffer = createWavBuffer(samples, sampleRate, numberChannels);
  const audioBase64 = wavBuffer.toString("base64");

  const audioFrameCount = samples.length / numberChannels;

  logger.info(
    `[SoundSynthesizerService] Synthesized ${audioFrameCount} frames (${numberChannels}ch) in ${Date.now() - start} ms`,
  );

  return {
    audioBase64,
    sampleCount: audioFrameCount,
  };
}

/**
 * Normalizes preset names
 */
function presetEffectToName(preset: string): string {
  return preset.toLowerCase().replace(/[^a-z0-9_]/g, "");
}
