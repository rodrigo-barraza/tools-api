import logger from "../logger.ts";

export type WaveformType =
  | "sine"
  | "triangle"
  | "sawtooth"
  | "square"
  | "noise";

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
  duration: number;
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
    | "drum_synth";
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
}

export interface NoteConfig {
  time: string | number; // e.g. "1.1.1" or numeric seconds
  duration: string | number; // e.g. "0.2.0" or numeric seconds
  note: string | number; // e.g. "C4", frequency, or drum name e.g. "KICK"
}

export interface TrackConfig {
  nodeChain: string[];
  notes: NoteConfig[];
}

export interface SynthesizerConfig {
  soundType?:
    | "synthesizer"
    | "arpeggio"
    | "melody"
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
  melody?: MelodyStep[];
  delay?: DelayConfig;
  sampleRate?: number;

  // Advanced Modular Synthesizer additions
  tempo?: number;
  nodes?: Record<string, NodeConfig>;
  tracks?: TrackConfig[];
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

  updateCoefficients(cutoff: number, Q: number): void {
    const cappedCutoff = Math.min(
      Math.max(cutoff, 10.0),
      this.sampleRate / 2.0 - 50.0,
    );
    const cappedQ = Math.max(Q, 0.1);

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
    const w = x + this.g * delayed;
    const y = -this.g * w + delayed;
    this.delayLine.write(w);
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

    const feedbackVal = Math.min(Math.max(decay * 0.85, 0.1), 0.95);

    for (const time of delayTimesLeft) {
      this.combsLeft.push(
        new CombFilter(Math.floor(time * sampleRate), feedbackVal),
      );
    }
    for (const time of delayTimesRight) {
      this.combsRight.push(
        new CombFilter(Math.floor(time * sampleRate), feedbackVal),
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

  oscillators: Record<string, OscillatorNode> = {};
  noises: Record<string, NoiseNode> = {};
  filters: Record<string, BiquadFilter> = {};
  envelopes: Record<string, EnvelopeNode> = {};
  drumSynths: Record<string, DrumSynthNode> = {};

  constructor(
    noteConfig: NoteConfig,
    nodeConfigs: Record<string, NodeConfig>,
    sampleRate: number,
  ) {
    this.noteConfig = noteConfig;
    this.sampleRate = sampleRate;

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
        const noteStr = String(noteConfig.note).toLowerCase();
        const drumType =
          noteStr === "kick" ? "kick" : noteStr === "snare" ? "snare" : "hat";
        this.drumSynths[nodeName] = new DrumSynthNode(drumType, sampleRate);
      }
    }
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

    const baseFrequency = noteToFreq(this.noteConfig.note);

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
        const osc = this.oscillators[nodeName];
        if (osc) {
          currentSignal = osc.process(baseFrequency);
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
        const envelopeVal = envelopeValues[nodeName] ?? 0.0;
        currentSignal *= envelopeVal;
      } else if (nodeConfig.type === "biquad_filter") {
        const filter = this.filters[nodeName];
        if (filter) {
          let cutoff = nodeConfig.cutoff || 1000.0;
          if (nodeConfig.modulate?.cutoff) {
            const modSource = nodeConfig.modulate.cutoff;
            const envelopeVal = envelopeValues[modSource] ?? 0.0;
            cutoff = cutoff * (1.0 + envelopeVal * 8.0);
          }
          filter.updateCoefficients(cutoff, nodeConfig.Q || 1.0);
          currentSignal = filter.process(currentSignal);
        }
      } else if (nodeConfig.type === "gain") {
        let gainVal = nodeConfig.gain ?? 1.0;
        if (nodeConfig.modulate?.gain) {
          const modSource = nodeConfig.modulate.gain;
          const envelopeVal = envelopeValues[modSource] ?? 0.0;
          gainVal *= envelopeVal;
        }
        currentSignal *= gainVal;
      } else if (nodeConfig.type === "stereo_panner") {
        const panVal = Math.min(Math.max(nodeConfig.pan ?? 0.0, -1.0), 1.0);
        const theta = ((panVal + 1.0) * Math.PI) / 4.0;
        stereoLeft = currentSignal * Math.cos(theta);
        stereoRight = currentSignal * Math.sin(theta);
        isStereo = true;
      }
    }

    if (!isStereo) {
      stereoLeft = currentSignal;
      stereoRight = currentSignal;
    }

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

export function parseTimeMarker(marker: string | number, tempo = 120): number {
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
  const barDuration = beatDuration * 4.0;
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
): number {
  let maxEnd = 0.0;
  for (const track of tracks) {
    for (const note of track.notes) {
      const start = parseTimeMarker(note.time, tempo);
      const duration = parseTimeMarker(note.duration, tempo);
      const release = getVoiceReleaseTime(nodeConfigs);
      maxEnd = Math.max(maxEnd, start + duration + release);
    }
  }
  return maxEnd + 0.1;
}

export function renderModularGraph(config: SynthesizerConfig): Float32Array {
  const sampleRate = config.sampleRate || 44100;
  const tempo = config.tempo || 120;
  const nodes = config.nodes || {};
  const tracks = config.tracks || [];

  let duration =
    config.duration || computeTimelineDuration(tracks, nodes, tempo);
  duration = Math.min(Math.max(duration, 0.1), 10.0);

  const numSamples = Math.floor(duration * sampleRate);
  const masterBuffer = new Float32Array(numSamples * 2);

  const trackDelayNodes: Record<number, DelayNode> = {};
  const trackReverbNodes: Record<number, SchroederReverb> = {};

  tracks.forEach((track, trackIndex) => {
    track.nodeChain.forEach((nodeName) => {
      const nodeConfig = nodes[nodeName];
      if (!nodeConfig) return;

      if (nodeConfig.type === "delay") {
        const delaySamples = Math.floor(
          (nodeConfig.delayTime || 0.25) * sampleRate,
        );
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
  tracks.forEach((_, trackIndex) => {
    activeVoicesMap[trackIndex] = [];
  });

  const deltaTime = 1.0 / sampleRate;

  for (let currentSample = 0; currentSample < numSamples; currentSample++) {
    const currentTime = currentSample * deltaTime;

    tracks.forEach((track, trackIndex) => {
      track.notes.forEach((note) => {
        const noteStartTime = parseTimeMarker(note.time, tempo);
        const noteDurationSeconds = parseTimeMarker(note.duration, tempo);

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

      masterLeft += trackLeft;
      masterRight += trackRight;
    });

    masterBuffer[currentSample * 2] = masterLeft;
    masterBuffer[currentSample * 2 + 1] = masterRight;
  }

  let maxPeak = 0.0;
  for (let i = 0; i < masterBuffer.length; i++) {
    const absVal = Math.abs(masterBuffer[i]);
    if (absVal > maxPeak) maxPeak = absVal;
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

  const notes = [
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
  const match = note.trim().match(/^([A-G]#?)(-?\d+)$/i);
  if (!match) {
    const parsed = parseFloat(note);
    return isNaN(parsed) ? 440 : parsed;
  }

  const name = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);
  const semitone = notes.indexOf(name);

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
  const sampleRate = config.sampleRate || 44100;
  const duration = Math.min(Math.max(config.duration || 1.0, 0.1), 10.0);
  const numSamples = Math.floor(duration * sampleRate);
  const samples = new Float32Array(numSamples);

  const startFreq = noteToFreq(config.frequency ?? 440);
  const endFreq = config.endFrequency
    ? noteToFreq(config.endFrequency)
    : startFreq;
  const waveform = config.waveform || "sine";
  const harmonics = config.harmonics || [1.0];

  const modFreq = config.modulatorFrequency || 0;
  const modIndex = config.modulationIndex || 0;

  const envelope: ADSREnvelope = config.envelope || {
    attack: 0.05,
    decay: 0.1,
    sustain: 0.8,
    release: 0.15,
  };

  const lfo = config.lfo;
  const deltaTime = 1 / sampleRate;

  let carrierPhase = 0;
  let modulatorPhase = 0;
  let lfoPhase = 0;

  for (let i = 0; i < numSamples; i++) {
    const currentTime = i * deltaTime;

    // 1. LFO Pitch and Amplitude Modulation
    let lfoPitchOffset = 0;
    let lfoAmpMultiplier = 1.0;
    if (lfo) {
      lfoPhase += 2 * Math.PI * lfo.frequency * deltaTime;
      const lfoVal = Math.sin(lfoPhase);
      if (lfo.pitchDepth) {
        lfoPitchOffset = lfoVal * lfo.pitchDepth;
      }
      if (lfo.amplitudeDepth) {
        lfoAmpMultiplier =
          1.0 -
          Math.max(0, Math.min(1, lfo.amplitudeDepth)) * 0.5 * (1.0 - lfoVal);
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
    let modVal = 0;
    if (modFreq > 0 && modIndex > 0) {
      modulatorPhase += 2 * Math.PI * modFreq * deltaTime;
      modVal = Math.sin(modulatorPhase);
    }

    // 4. FM Carrier phase step
    const freqOffset = modVal * modIndex;
    const finalFreq = Math.max(1, baseFreq + freqOffset);
    carrierPhase += 2 * Math.PI * finalFreq * deltaTime;

    // 5. Additive synthesis / waveform evaluation
    let sampleVal = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const harmonicFreqMultiplier = h + 1;
      const phase = carrierPhase * harmonicFreqMultiplier;
      const amp = harmonics[h];
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
      sampleVal += value * amp;
    }

    // Normalize additive samples to avoid clipping
    const totalHarmonicAmp = harmonics.reduce(
      (accumulator, b) => accumulator + b,
      0,
    );
    if (totalHarmonicAmp > 1.0) {
      sampleVal /= totalHarmonicAmp;
    }

    // 6. Amplitude envelope
    const envelopeValue = getEnvelopeValue(currentTime, duration, envelope);
    samples[i] = sampleVal * envelopeValue * lfoAmpMultiplier;
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
  const parsedSteps = steps.map((step) => ({
    freq: noteToFreq(step.note),
    duration: Math.max(step.duration, 0.02),
  }));

  const totalDuration = parsedSteps.reduce(
    (acc, step) => acc + step.duration,
    0,
  );
  const cappedDuration = Math.min(totalDuration, 10.0);
  const numSamples = Math.floor(cappedDuration * sampleRate);
  const samples = new Float32Array(numSamples);

  let currentSampleOffset = 0;
  const deltaTime = 1 / sampleRate;

  for (const step of parsedSteps) {
    const stepSamplesCount = Math.floor(step.duration * sampleRate);
    if (currentSampleOffset >= numSamples) break;

    const actualCount = Math.min(
      stepSamplesCount,
      numSamples - currentSampleOffset,
    );
    const stepDuration = actualCount * deltaTime;

    // Build config for this individual note step
    const stepConfig: SynthesizerConfig = {
      ...baseConfig,
      duration: stepDuration,
      frequency: step.freq,
      endFrequency: undefined, // no sweep across step
      sampleRate,
    };

    const stepSamples = synthesizeSound(stepConfig);
    samples.set(stepSamples.subarray(0, actualCount), currentSampleOffset);
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
      const numSamples = Math.floor(dur * sampleRate);
      const samples = new Float32Array(numSamples);
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
      for (let i = 0; i < numSamples; i++) {
        const currentTime = i * deltaTime;
        const noiseVal = Math.random() * 2 - 1;
        const noiseEnvelopeValue = getEnvelopeValue(
          currentTime,
          dur,
          noiseEnvelope,
        );
        samples[i] =
          rumbleSamples[i] * 0.4 + noiseVal * noiseEnvelopeValue * 0.6;
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
  numChannels = 1,
): Buffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const subChunk2Size = samples.length * 2;
  const chunkSize = 36 + subChunk2Size;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Chunk Size
  header.writeUInt16LE(1, 20); // PCM Format
  header.writeUInt16LE(numChannels, 22);
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
  let numChannels = 1;

  const start = Date.now();

  if (config.soundType === "modular" || config.tracks || config.nodes) {
    logger.info(`[SoundSynthesizerService] Synthesizing modular audio graph`);
    samples = renderModularGraph(config);
    numChannels = 2; // modular rendering is dual-channel stereo
  } else if (config.presetEffect) {
    logger.info(
      `[SoundSynthesizerService] Synthesizing preset effect: ${config.presetEffect}`,
    );
    samples = synthesizePreset(
      presetEffectToName(config.presetEffect),
      sampleRate,
    );
  } else if (
    config.soundType === "melody" &&
    config.melody &&
    config.melody.length > 0
  ) {
    logger.info(
      `[SoundSynthesizerService] Synthesizing custom melody sequence with ${config.melody.length} steps`,
    );
    samples = synthesizeSequence(config.melody, config);
  } else if (
    config.soundType === "arpeggio" &&
    config.melody &&
    config.melody.length > 0
  ) {
    logger.info(
      `[SoundSynthesizerService] Synthesizing custom arpeggio with ${config.melody.length} steps`,
    );
    samples = synthesizeSequence(config.melody, config);
  } else {
    logger.info(
      `[SoundSynthesizerService] Synthesizing custom waveform: ${config.waveform || "sine"} at ${config.frequency || 440} Hz`,
    );
    samples = synthesizeSound(config);
  }

  const wavBuffer = createWavBuffer(samples, sampleRate, numChannels);
  const audioBase64 = wavBuffer.toString("base64");

  logger.info(
    `[SoundSynthesizerService] Synthesized ${samples.length} samples in ${Date.now() - start} ms`,
  );

  return {
    audioBase64,
    sampleCount: samples.length,
  };
}

/**
 * Normalizes preset names
 */
function presetEffectToName(preset: string): string {
  return preset.toLowerCase().replace(/[^a-z0-9_]/g, "");
}
