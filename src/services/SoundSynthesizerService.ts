import logger from "../logger.ts";

export type WaveformType = "sine" | "triangle" | "sawtooth" | "square" | "noise";

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

export interface SynthesizerConfig {
  soundType?: "synthesizer" | "arpeggio" | "melody" | "sound_effect";
  presetEffect?: "laser" | "coin" | "powerup" | "jump" | "explosion" | "synthwave_bass" | "ambient_pad" | "sci_fi_sweep";
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
}

/**
 * Parses note name (e.g. "C4", "A#3") or raw string frequency into a numeric frequency in Hz.
 */
export function noteToFreq(note: number | string): number {
  if (typeof note === "number") return note;
  if (!note) return 440;

  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
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
export function getEnvelopeValue(t: number, totalDuration: number, adsr: ADSREnvelope): number {
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

  if (t < attack) {
    if (attack === 0) return 1;
    return t / attack; // Linear attack ramp up to 1.0
  } else if (t < attack + decay) {
    if (decay === 0) return sustain;
    const dt = t - attack;
    return 1 - (1 - sustain) * (dt / decay); // Linear decay down to sustain level
  } else if (t < attack + decay + sustainDuration) {
    return sustain; // Hold sustain level
  } else if (t < totalDuration) {
    if (release === 0) return 0;
    const dt = t - (attack + decay + sustainDuration);
    return sustain * (1 - dt / release); // Linear release ramp down to 0
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
  const endFreq = config.endFrequency ? noteToFreq(config.endFrequency) : startFreq;
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
  const dt = 1 / sampleRate;

  let carrierPhase = 0;
  let modulatorPhase = 0;
  let lfoPhase = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i * dt;

    // 1. LFO Pitch and Amplitude Modulation
    let lfoPitchOffset = 0;
    let lfoAmpMultiplier = 1.0;
    if (lfo) {
      lfoPhase += 2 * Math.PI * lfo.frequency * dt;
      const lfoVal = Math.sin(lfoPhase);
      if (lfo.pitchDepth) {
        lfoPitchOffset = lfoVal * lfo.pitchDepth;
      }
      if (lfo.amplitudeDepth) {
        lfoAmpMultiplier = 1.0 - Math.max(0, Math.min(1, lfo.amplitudeDepth)) * 0.5 * (1.0 - lfoVal);
      }
    }

    // 2. Frequency sweep calculation (exponential)
    let baseFreq = startFreq;
    if (startFreq !== endFreq) {
      baseFreq = startFreq * Math.pow(endFreq / startFreq, t / duration);
    }
    baseFreq += lfoPitchOffset;

    // 3. FM Modulator phase step
    let modVal = 0;
    if (modFreq > 0 && modIndex > 0) {
      modulatorPhase += 2 * Math.PI * modFreq * dt;
      modVal = Math.sin(modulatorPhase);
    }

    // 4. FM Carrier phase step
    const freqOffset = modVal * modIndex;
    const finalFreq = Math.max(1, baseFreq + freqOffset);
    carrierPhase += 2 * Math.PI * finalFreq * dt;

    // 5. Additive synthesis / waveform evaluation
    let sampleVal = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const harmonicFreqMultiplier = h + 1;
      const phase = carrierPhase * harmonicFreqMultiplier;
      const amp = harmonics[h];
      if (amp <= 0) continue;

      let val = 0;
      switch (waveform) {
        case "sine":
          val = Math.sin(phase);
          break;
        case "triangle": {
          const normalized = (phase % (2 * Math.PI)) / (2 * Math.PI);
          val = 2 * Math.abs(2 * normalized - 1) - 1;
          break;
        }
        case "sawtooth": {
          const normalized = (phase % (2 * Math.PI)) / (2 * Math.PI);
          val = 2 * normalized - 1;
          break;
        }
        case "square":
          val = (phase % (2 * Math.PI)) >= Math.PI ? 1.0 : -1.0;
          break;
        case "noise":
          val = Math.random() * 2 - 1;
          break;
      }
      sampleVal += val * amp;
    }

    // Normalize additive samples to avoid clipping
    const totalHarmonicAmp = harmonics.reduce((a, b) => a + b, 0);
    if (totalHarmonicAmp > 1.0) {
      sampleVal /= totalHarmonicAmp;
    }

    // 6. Amplitude envelope
    const env = getEnvelopeValue(t, duration, envelope);
    samples[i] = sampleVal * env * lfoAmpMultiplier;
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
export function synthesizeSequence(steps: MelodyStep[], baseConfig: SynthesizerConfig): Float32Array {
  const sampleRate = baseConfig.sampleRate || 44100;
  const parsedSteps = steps.map((step) => ({
    freq: noteToFreq(step.note),
    duration: Math.max(step.duration, 0.02),
  }));

  const totalDuration = parsedSteps.reduce((acc, step) => acc + step.duration, 0);
  const cappedDuration = Math.min(totalDuration, 10.0);
  const numSamples = Math.floor(cappedDuration * sampleRate);
  const samples = new Float32Array(numSamples);

  let currentSampleOffset = 0;
  const dt = 1 / sampleRate;

  for (const step of parsedSteps) {
    const stepSamplesCount = Math.floor(step.duration * sampleRate);
    if (currentSampleOffset >= numSamples) break;

    const actualCount = Math.min(stepSamplesCount, numSamples - currentSampleOffset);
    const stepDuration = actualCount * dt;

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
  if (baseConfig.delay && baseConfig.delay.delayTime > 0 && baseConfig.delay.feedback > 0) {
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
export function synthesizePreset(preset: string, sampleRate: number): Float32Array {
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
        }
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
        }
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
      const dt = 1 / sampleRate;

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
      const noiseEnvelope = { attack: 0.005, decay: 0.45, sustain: 0.0, release: 0.34 };
      for (let i = 0; i < numSamples; i++) {
        const t = i * dt;
        const noiseVal = Math.random() * 2 - 1;
        const noiseEnv = getEnvelopeValue(t, dur, noiseEnvelope);
        samples[i] = rumbleSamples[i] * 0.4 + noiseVal * noiseEnv * 0.6;
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
 * Creates a valid RIFF-WAV Buffer from raw audio samples.
 */
export function createWavBuffer(samples: Float32Array, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const subChunk2Size = samples.length * blockAlign;
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
    const val = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    data.writeInt16LE(Math.floor(val), i * 2);
  }

  return Buffer.concat([header, data]);
}

/**
 * Core entry method to generate and return a base64-encoded audio/wav string.
 */
export function generateAudioWav(config: SynthesizerConfig): { audioBase64: string; sampleCount: number } {
  const sampleRate = config.sampleRate || 44100;
  let samples: Float32Array;

  const start = Date.now();

  if (config.presetEffect) {
    logger.info(`[SoundSynthesizerService] Synthesizing preset effect: ${config.presetEffect}`);
    samples = synthesizePreset(presetEffectToName(config.presetEffect), sampleRate);
  } else if (config.soundType === "melody" && config.melody && config.melody.length > 0) {
    logger.info(`[SoundSynthesizerService] Synthesizing custom melody sequence with ${config.melody.length} steps`);
    samples = synthesizeSequence(config.melody, config);
  } else if (config.soundType === "arpeggio" && config.melody && config.melody.length > 0) {
    logger.info(`[SoundSynthesizerService] Synthesizing custom arpeggio with ${config.melody.length} steps`);
    samples = synthesizeSequence(config.melody, config);
  } else {
    logger.info(`[SoundSynthesizerService] Synthesizing custom waveform: ${config.waveform || "sine"} at ${config.frequency || 440} Hz`);
    samples = synthesizeSound(config);
  }

  const wavBuffer = createWavBuffer(samples, sampleRate);
  const audioBase64 = wavBuffer.toString("base64");

  logger.info(`[SoundSynthesizerService] Synthesized ${samples.length} samples in ${Date.now() - start} ms`);

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
