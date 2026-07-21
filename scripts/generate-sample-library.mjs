// Renders the built-in natural-instrument sample library for generate_audio
// sampler channels (sampleSource: "preset:<name>").
//
// Every one-shot is synthesized offline here with physical-modeling and FM
// techniques the realtime engine can't afford (Karplus-Strong string delay
// lines, modal bar/bell/membrane synthesis, inharmonic additive piano,
// formant-filtered voices, body-resonated bowed strings, multi-operator FM,
// layered drum transients), then committed as 16-bit mono WAVs under
// src/services/data/samples/.
// License-clean by construction — nothing is recorded or downloaded.
//
// Usage: node scripts/generate-sample-library.mjs
// Idempotent: same input → same output (a fixed-seed PRNG replaces Math.random).

import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const SAMPLE_RATE = 44100;
const OUTPUT_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "src", "services", "data", "samples",
);

// ─── Deterministic PRNG (mulberry32) so renders are reproducible ───
let randomState = 0x9e3779b9;
function random() {
  randomState |= 0;
  randomState = (randomState + 0x6d2b79f5) | 0;
  let t = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const noise = () => random() * 2 - 1;

// ─── Tiny DSP helpers ──────────────────────────────────────────────
function onePoleLowpass(cutoffHz) {
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / SAMPLE_RATE);
  let state = 0;
  return (x) => (state += alpha * (x - state));
}
function onePoleHighpass(cutoffHz) {
  const lowpass = onePoleLowpass(cutoffHz);
  return (x) => x - lowpass(x);
}
function cascade(...filters) {
  return (x) => filters.reduce((signal, filter) => filter(signal), x);
}
const expDecay = (t, tau) => Math.exp(-t / tau);

function softClip(x, drive = 1.4) {
  return Math.tanh(x * drive) / Math.tanh(drive);
}

function finalize(samples) {
  // Peak-normalize to 0.89 and micro-fade both ends to kill clicks.
  let peak = 0;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const gain = peak > 0 ? 0.89 / peak : 1;
  const fadeSamples = Math.floor(0.004 * SAMPLE_RATE);
  for (let i = 0; i < samples.length; i++) {
    let value = samples[i] * gain;
    if (i < fadeSamples) value *= i / fadeSamples;
    const fromEnd = samples.length - 1 - i;
    if (fromEnd < fadeSamples) value *= fromEnd / fadeSamples;
    samples[i] = value;
  }
  return samples;
}

function render(seconds, generator) {
  const total = Math.floor(seconds * SAMPLE_RATE);
  const samples = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    samples[i] = generator(i / SAMPLE_RATE, i);
  }
  return finalize(samples);
}

function writeWav(name, samples) {
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUTPUT_DIRECTORY, `${name}.wav`), buffer);
  console.log(`rendered ${name}.wav — ${(samples.length / SAMPLE_RATE).toFixed(2)}s, ${(buffer.length / 1024).toFixed(0)}KB`);
}

// ─── Karplus-Strong plucked string ─────────────────────────────────
function karplusStrong(
  frequency,
  seconds,
  { excitationCutoff = 5000, sustain = 0.996, bodyCutoff = null } = {},
) {
  const total = Math.floor(seconds * SAMPLE_RATE);
  const period = Math.round(SAMPLE_RATE / frequency);
  const delayLine = new Float32Array(period);
  // Pick excitation: lowpassed noise burst — cutoff sets pick brightness
  const excitationFilter = onePoleLowpass(excitationCutoff);
  for (let i = 0; i < period; i++) delayLine[i] = excitationFilter(noise());
  const bodyFilter = bodyCutoff ? onePoleLowpass(bodyCutoff) : null;
  const samples = new Float32Array(total);
  let index = 0;
  for (let i = 0; i < total; i++) {
    const current = delayLine[index];
    const next = delayLine[(index + 1) % period];
    samples[i] = bodyFilter ? bodyFilter(current) : current;
    // Averaging = string damping; sustain scales overall decay time
    delayLine[index] = (current + next) * 0.5 * sustain;
    index = (index + 1) % period;
  }
  return finalize(samples);
}

// ─── Drum kit ──────────────────────────────────────────────────────
function renderKick() {
  const clickFilter = onePoleHighpass(1200);
  return render(0.45, (t) => {
    const sweep = 42 + 118 * Math.exp(-t / 0.035);
    // Integrated phase for a clean pitch sweep
    const phase = 2 * Math.PI * (42 * t + 118 * 0.035 * (1 - Math.exp(-t / 0.035)));
    const body = Math.sin(phase + 0.3 * Math.sin(phase * 0.5)) * expDecay(t, 0.13);
    const click = t < 0.004 ? clickFilter(noise()) * 0.6 * (1 - t / 0.004) : 0;
    void sweep;
    return softClip(body * 1.1 + click, 1.6);
  });
}

function renderSnare() {
  const noiseBand = cascade(onePoleHighpass(1400), onePoleLowpass(9000));
  return render(0.28, (t) => {
    const body =
      (Math.sin(2 * Math.PI * 186 * t) * 0.7 + Math.sin(2 * Math.PI * 332 * t) * 0.3) *
      expDecay(t, 0.045);
    const rattle = noiseBand(noise()) * expDecay(t, 0.085);
    return body * 0.55 + rattle * 0.8;
  });
}

function metallicStack(baseFrequency, partialRatios) {
  return (t) =>
    partialRatios.reduce(
      (sum, ratio) => sum + Math.sign(Math.sin(2 * Math.PI * baseFrequency * ratio * t)),
      0,
    ) / partialRatios.length;
}

const HAT_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];

function renderHat(open) {
  const stack = metallicStack(40, HAT_RATIOS);
  const brighten = cascade(onePoleHighpass(7000), onePoleHighpass(7000));
  return render(open ? 0.5 : 0.09, (t) =>
    brighten(stack(t) + noise() * 0.3) * expDecay(t, open ? 0.14 : 0.022),
  );
}

function renderClap() {
  const band = cascade(onePoleHighpass(900), onePoleLowpass(4200));
  const burstTimes = [0, 0.012, 0.024];
  return render(0.35, (t) => {
    let envelope = 0;
    for (const burstStart of burstTimes) {
      if (t >= burstStart) envelope = Math.max(envelope, expDecay(t - burstStart, 0.009));
    }
    if (t >= 0.03) envelope = Math.max(envelope, expDecay(t - 0.03, 0.09) * 0.7);
    return band(noise()) * envelope;
  });
}

function renderTom() {
  return render(0.4, (t) => {
    const phase = 2 * Math.PI * (92 * t + 88 * 0.05 * (1 - Math.exp(-t / 0.05)));
    return softClip(Math.sin(phase) * expDecay(t, 0.13), 1.3);
  });
}

function renderRim() {
  const ring = onePoleHighpass(600);
  return render(0.09, (t) => {
    const resonance =
      Math.sin(2 * Math.PI * 1720 * t) * expDecay(t, 0.007) +
      Math.sin(2 * Math.PI * 460 * t) * expDecay(t, 0.005) * 0.6;
    const click = t < 0.002 ? noise() * 0.8 : 0;
    return ring(resonance + click);
  });
}

function renderCrash() {
  const stack = metallicStack(55, [2, 2.83, 3.97, 5.21, 6.6, 8.11, 9.9, 11.7, 13.4]);
  const brighten = onePoleHighpass(3500);
  return render(1.6, (t) =>
    brighten(stack(t) * 0.6 + noise() * 0.5) *
    (expDecay(t, 0.42) * 0.85 + expDecay(t, 0.06) * 0.4),
  );
}

// ─── Melodic instruments ───────────────────────────────────────────
function renderEpiano() {
  const f = 261.63; // C4
  return render(2.2, (t) => {
    const modulationIndex = 1.25 * expDecay(t, 0.55);
    const body = Math.sin(
      2 * Math.PI * f * t + modulationIndex * Math.sin(2 * Math.PI * f * t),
    );
    const tine = Math.sin(2 * Math.PI * f * 14 * t) * expDecay(t, 0.035) * 0.28;
    const overtone = Math.sin(2 * Math.PI * f * 4 * t) * expDecay(t, 0.25) * 0.12;
    return (body + tine + overtone) * expDecay(t, 0.85);
  });
}

function renderMarimba() {
  const f = 261.63; // C4
  const strikeFilter = onePoleLowpass(4000);
  const partials = [
    { ratio: 1, amplitude: 1.0, tau: 0.3 },
    { ratio: 3.93, amplitude: 0.45, tau: 0.08 },
    { ratio: 9.03, amplitude: 0.18, tau: 0.04 },
  ];
  return render(1.1, (t) => {
    let value = 0;
    for (const partial of partials) {
      value +=
        Math.sin(2 * Math.PI * f * partial.ratio * t) *
        partial.amplitude *
        expDecay(t, partial.tau);
    }
    const strike = t < 0.005 ? strikeFilter(noise()) * 0.5 * (1 - t / 0.005) : 0;
    return value + strike;
  });
}

function renderBell() {
  const f = 523.25; // C5
  return render(2.8, (t) => {
    const modulationIndex = 5 * expDecay(t, 0.8);
    const primary = Math.sin(
      2 * Math.PI * f * t + modulationIndex * Math.sin(2 * Math.PI * f * 3.5307 * t),
    );
    const shimmer = Math.sin(
      2 * Math.PI * f * 1.004 * t + modulationIndex * 0.8 * Math.sin(2 * Math.PI * f * 3.5307 * 1.002 * t),
    );
    return (primary * 0.7 + shimmer * 0.3) * expDecay(t, 1.0);
  });
}

// ═══ Expanded library helpers ══════════════════════════════════════

// RBJ biquad bandpass (constant 0 dB peak gain) — resonators for
// instrument bodies, vocal formants, and tuned percussion.
function biquadBandpass(centerHz, q) {
  const w0 = (2 * Math.PI * centerHz) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = alpha;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

const smooth = (x) => x * x * (3 - 2 * x);

// Smooth attack + built-in release fade for sustained one-shots.
function sustainEnvelope(t, total, attack, release) {
  const rise = t < attack ? smooth(t / attack) : 1;
  const fromEnd = total - t;
  const fall = fromEnd < release ? smooth(Math.max(0, fromEnd) / release) : 1;
  return rise * fall;
}

// Delayed-onset pitch vibrato; returns a frequency multiplier.
function makeVibrato({ rate = 5.5, depth = 0.008, delay = 0.25, ramp = 0.4, phase = 0 } = {}) {
  return (t) => {
    const amount = t <= delay ? 0 : Math.min(1, (t - delay) / ramp);
    return 1 + depth * amount * Math.sin(2 * Math.PI * rate * t + phase);
  };
}

// Phase accumulator so vibrato bends stay click-free and partials stay
// phase-locked to the fundamental.
function makePhase(frequency) {
  let phase = 0;
  return (multiplier = 1) => (phase += (frequency * multiplier) / SAMPLE_RATE);
}

// Sum of exponentially decaying sinusoids — struck bars, bells, drums.
// modes: {ratio, amp, tau}; strike: {cutoff, amp, duration, highpass?}
function renderModal(frequency, seconds, modes, { strike = null, glide = 0, glideTau = 0.05, shape = null } = {}) {
  const strikeFilter = strike
    ? (strike.highpass ? onePoleHighpass(strike.cutoff) : onePoleLowpass(strike.cutoff))
    : null;
  const phases = modes.map(() => 0);
  return render(seconds, (t) => {
    const bend = 1 + glide * Math.exp(-t / glideTau);
    let value = 0;
    for (let m = 0; m < modes.length; m++) {
      const mode = modes[m];
      phases[m] += (frequency * mode.ratio * bend) / SAMPLE_RATE;
      value += Math.sin(2 * Math.PI * phases[m]) * mode.amp * expDecay(t, mode.tau);
    }
    if (strike && t < strike.duration) {
      value += strikeFilter(noise()) * strike.amp * (1 - t / strike.duration);
    }
    return shape ? shape(value, t) : value;
  });
}

// Mix pre-rendered layers (e.g. detuned Karplus-Strong courses) and
// re-normalize.
function mixSamples(layers) {
  const total = Math.max(...layers.map(({ samples, offset = 0 }) => samples.length + Math.floor((offset || 0) * SAMPLE_RATE)));
  const mixed = new Float32Array(total);
  for (const { samples, gain = 1, offset = 0 } of layers) {
    const start = Math.floor(offset * SAMPLE_RATE);
    for (let i = 0; i < samples.length; i++) mixed[start + i] += samples[i] * gain;
  }
  return finalize(mixed);
}

function postFilter(samples, filter) {
  for (let i = 0; i < samples.length; i++) samples[i] = filter(samples[i]);
  return finalize(samples);
}

// ═══ Plucked & struck strings ══════════════════════════════════════

function renderNylonGuitar() {
  // Softer pick, warm cedar-top body
  return karplusStrong(130.81, 2.2, { excitationCutoff: 2200, sustain: 0.9968, bodyCutoff: 3200 }); // C3
}

function renderHarp() {
  return karplusStrong(261.63, 2.6, { excitationCutoff: 3600, sustain: 0.998 }); // C4
}

function renderBanjo() {
  // Very bright attack, fast decay, resonator-head twang
  const plucked = karplusStrong(130.81, 1.1, { excitationCutoff: 9500, sustain: 0.9915 }); // C3
  return postFilter(plucked, onePoleHighpass(400));
}

function renderMandolin() {
  // Double course: two strings a few cents apart chorus against each other
  return mixSamples([
    { samples: karplusStrong(SAMPLE_RATE / 169, 1.8, { excitationCutoff: 6500, sustain: 0.995 }) }, // ≈C4
    { samples: karplusStrong(SAMPLE_RATE / 168, 1.8, { excitationCutoff: 6500, sustain: 0.995 }), gain: 0.9, offset: 0.004 },
  ]);
}

function renderHarpsichord() {
  const plucked = karplusStrong(261.63, 1.8, { excitationCutoff: 12000, sustain: 0.994 }); // C4
  return postFilter(plucked, onePoleHighpass(150));
}

function renderPiano() {
  // Additive inharmonic model: stiff-string partials f·k·√(1+Bk²) with
  // strike-point comb filtering, double-decay envelopes, and two stacks
  // detuned ±1.3 cents for the unison-string beat.
  const f = 261.63; // C4
  const B = 0.00038;
  const partials = [];
  for (let k = 1; k <= 26; k++) {
    partials.push({
      ratio: k * Math.sqrt(1 + B * k * k),
      amp: (1 / Math.pow(k, 1.05)) * Math.max(0.15, Math.abs(Math.sin((Math.PI * k) / 7.3))),
      tau: 1.15 / (1 + 0.28 * (k - 1)),
    });
  }
  const detunes = [1.00075, 0.99925];
  const hammerFilter = onePoleLowpass(3400);
  const soundboard = onePoleLowpass(5200);
  return render(3.2, (t) => {
    let value = 0;
    for (const d of detunes) {
      for (const p of partials) {
        const envelope = 0.88 * expDecay(t, p.tau) + 0.12 * expDecay(t, p.tau * 2.8);
        value += Math.sin(2 * Math.PI * f * d * p.ratio * t) * p.amp * envelope;
      }
    }
    value = soundboard(value) * expDecay(t, 2.6);
    const hammer = t < 0.007 ? hammerFilter(noise()) * 0.5 * (1 - t / 0.007) : 0;
    return value + hammer;
  });
}

// ═══ Mallets, bells & tuned percussion ═════════════════════════════

function renderVibraphone() {
  const bar = renderModal(261.63, 3.0, [ // C4, tuned 1:4:10 aluminum bar
    { ratio: 1, amp: 1, tau: 1.9 },
    { ratio: 4.0, amp: 0.35, tau: 0.45 },
    { ratio: 10.0, amp: 0.12, tau: 0.12 },
  ], { strike: { cutoff: 2500, amp: 0.25, duration: 0.003 } });
  // Rotating-fan tremolo
  for (let i = 0; i < bar.length; i++) {
    const t = i / SAMPLE_RATE;
    bar[i] *= 1 - 0.35 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 4.2 * t));
  }
  return finalize(bar);
}

function renderXylophone() {
  return renderModal(523.25, 0.9, [ // C5, rosewood 1:3:9.2
    { ratio: 1, amp: 1, tau: 0.28 },
    { ratio: 3.0, amp: 0.45, tau: 0.08 },
    { ratio: 9.2, amp: 0.14, tau: 0.03 },
  ], { strike: { cutoff: 6000, amp: 0.5, duration: 0.0025 } });
}

function renderGlockenspiel() {
  return renderModal(1046.5, 2.2, [ // C6 steel bar
    { ratio: 1, amp: 1, tau: 1.3 },
    { ratio: 2.76, amp: 0.35, tau: 0.5 },
    { ratio: 5.4, amp: 0.12, tau: 0.18 },
  ], { strike: { cutoff: 8000, amp: 0.3, duration: 0.0015 } });
}

function renderKalimba() {
  return renderModal(261.63, 1.2, [ // C4 plucked tine
    { ratio: 1, amp: 1, tau: 0.55 },
    { ratio: 6.4, amp: 0.18, tau: 0.04 },
  ], { strike: { cutoff: 1800, amp: 0.5, duration: 0.004 } });
}

function renderTubularBell() {
  return renderModal(523.25, 3.5, [ // C5 chime: transverse-bar mode series
    { ratio: 1, amp: 0.6, tau: 2.8 },
    { ratio: 2.76, amp: 1, tau: 2.0 },
    { ratio: 5.4, amp: 0.55, tau: 1.0 },
    { ratio: 8.93, amp: 0.25, tau: 0.45 },
  ], { strike: { cutoff: 2000, amp: 0.3, duration: 0.002, highpass: true } });
}

function renderMusicBox() {
  return renderModal(1046.5, 1.5, [ // C6 comb tine
    { ratio: 1, amp: 1, tau: 0.9 },
    { ratio: 4.2, amp: 0.2, tau: 0.15 },
  ], { strike: { cutoff: 3000, amp: 0.3, duration: 0.0015, highpass: true } });
}

function renderSteelDrum() {
  // Harmonically tuned pan notes; amplitude-dependent brightness bloom
  return renderModal(261.63, 1.8, [ // C4
    { ratio: 1, amp: 1, tau: 0.9 },
    { ratio: 2.0, amp: 0.75, tau: 0.55 },
    { ratio: 3.01, amp: 0.4, tau: 0.3 },
    { ratio: 4.06, amp: 0.2, tau: 0.2 },
  ], {
    strike: { cutoff: 4000, amp: 0.3, duration: 0.002 },
    shape: (value, t) => softClip(value * (1 + 1.5 * Math.exp(-t / 0.08)), 1.5),
  });
}

function renderTimpani() {
  // Kettle drum preferred-mode series over the principal tone, with the
  // strike's slight downward pitch settle and a felt-mallet thump.
  return renderModal(65.41, 2.2, [ // C2
    { ratio: 1, amp: 1, tau: 1.0 },
    { ratio: 1.504, amp: 0.55, tau: 0.55 },
    { ratio: 1.742, amp: 0.3, tau: 0.4 },
    { ratio: 2.0, amp: 0.35, tau: 0.35 },
    { ratio: 2.245, amp: 0.2, tau: 0.3 },
    { ratio: 2.494, amp: 0.15, tau: 0.25 },
  ], {
    glide: 0.025, glideTau: 0.06,
    strike: { cutoff: 250, amp: 0.8, duration: 0.025 },
  });
}

// ═══ Sustained: strings, winds, brass, voices ══════════════════════

function renderBowedString(frequency, seconds, {
  bodyResonances, vibratoRate, rolloff = 1.0, noiseAmount = 0.12, attack = 0.09, release = 0.35,
}) {
  const phase = makePhase(frequency);
  const vibrato = makeVibrato({ rate: vibratoRate, depth: 0.009, delay: 0.3, ramp: 0.5 });
  const partialCount = Math.min(36, Math.floor(16000 / frequency));
  const bowNoise = cascade(onePoleHighpass(2000), onePoleLowpass(9000));
  const body = bodyResonances.map(({ freq, q, gain }) => ({ filter: biquadBandpass(freq, q), gain }));
  return render(seconds, (t) => {
    const p = phase(vibrato(t));
    let saw = 0;
    for (let k = 1; k <= partialCount; k++) {
      saw += Math.sin(2 * Math.PI * k * p) / Math.pow(k, rolloff);
    }
    const excitation = saw + bowNoise(noise()) * noiseAmount;
    let out = excitation * 0.22;
    for (const resonance of body) out += resonance.filter(excitation) * resonance.gain;
    return out * sustainEnvelope(t, seconds, attack, release);
  });
}

function renderViolin() {
  return renderBowedString(523.25, 2.6, { // C5
    bodyResonances: [
      { freq: 280, q: 3, gain: 0.9 },
      { freq: 460, q: 3.5, gain: 0.7 },
      { freq: 2600, q: 2, gain: 0.45 },
    ],
    vibratoRate: 5.7,
  });
}

function renderCello() {
  return renderBowedString(130.81, 2.8, { // C3
    bodyResonances: [
      { freq: 105, q: 3, gain: 1.0 },
      { freq: 230, q: 3.5, gain: 0.7 },
      { freq: 1800, q: 2, gain: 0.35 },
    ],
    vibratoRate: 4.8, rolloff: 1.05, attack: 0.12,
  });
}

function renderStringEnsemble() {
  const f = 261.63; // C4
  const voices = [];
  for (let v = 0; v < 6; v++) {
    const detune = 1 + (v - 2.5) * 0.0022 + (random() - 0.5) * 0.0008;
    voices.push({
      phase: makePhase(f * detune),
      vibrato: makeVibrato({ rate: 4.6 + random(), depth: 0.006, delay: 0.15 + random() * 0.3, phase: random() * Math.PI * 2 }),
    });
  }
  const blend = onePoleLowpass(5000);
  const partialCount = 24;
  return render(3.0, (t) => {
    let sum = 0;
    for (const voice of voices) {
      const p = voice.phase(voice.vibrato(t));
      for (let k = 1; k <= partialCount; k++) {
        sum += Math.sin(2 * Math.PI * k * p) / Math.pow(k, 1.3);
      }
    }
    return blend(sum) * sustainEnvelope(t, 3.0, 0.5, 0.7);
  });
}

function renderChoir() {
  // Formant-filtered "aah": detuned glottal-ish sources through vowel
  // resonances (F1/F2/F3 of an open back vowel).
  const f = 261.63; // C4
  const voices = [];
  for (let v = 0; v < 5; v++) {
    voices.push({
      phase: makePhase(f * (1 + (v - 2) * 0.0016 + (random() - 0.5) * 0.0006)),
      vibrato: makeVibrato({ rate: 4.8 + random() * 0.8, depth: 0.007, delay: 0.5, ramp: 0.6, phase: random() * Math.PI * 2 }),
    });
  }
  const formants = [
    { filter: biquadBandpass(620, 8), gain: 1.0 },
    { filter: biquadBandpass(1100, 10), gain: 0.5 },
    { filter: biquadBandpass(2400, 10), gain: 0.25 },
  ];
  const partialCount = 16;
  return render(3.0, (t) => {
    let source = 0;
    for (const voice of voices) {
      const p = voice.phase(voice.vibrato(t));
      for (let k = 1; k <= partialCount; k++) {
        source += Math.sin(2 * Math.PI * k * p) / Math.pow(k, 1.1);
      }
    }
    let out = source * 0.06;
    for (const formant of formants) out += formant.filter(source) * formant.gain;
    return out * sustainEnvelope(t, 3.0, 0.45, 0.6);
  });
}

function renderFlute() {
  const f = 523.25; // C5
  const phase = makePhase(f);
  const vibrato = makeVibrato({ rate: 5.2, depth: 0.006, delay: 0.5, ramp: 0.4 });
  const breath = cascade(onePoleHighpass(1500), onePoleLowpass(6000));
  const chiff = biquadBandpass(f, 6);
  return render(2.2, (t) => {
    const p = phase(vibrato(t));
    const tone =
      Math.sin(2 * Math.PI * p) +
      Math.sin(2 * Math.PI * 2 * p) * 0.32 +
      Math.sin(2 * Math.PI * 3 * p) * 0.12 +
      Math.sin(2 * Math.PI * 4 * p) * 0.05;
    const air = breath(noise()) * 0.06;
    const attackChiff = t < 0.08 ? chiff(noise()) * 0.25 * (1 - t / 0.08) : 0;
    return (tone + air + attackChiff) * sustainEnvelope(t, 2.2, 0.07, 0.3);
  });
}

function renderClarinet() {
  const f = 261.63; // C4
  const phase = makePhase(f);
  const vibrato = makeVibrato({ rate: 5, depth: 0.002, delay: 0.6 });
  // Odd harmonics dominate below the break; evens creep in above
  const harmonics = [
    { k: 1, amp: 1 }, { k: 2, amp: 0.03 }, { k: 3, amp: 0.55 }, { k: 4, amp: 0.04 },
    { k: 5, amp: 0.32 }, { k: 6, amp: 0.05 }, { k: 7, amp: 0.12 }, { k: 8, amp: 0.06 },
    { k: 9, amp: 0.16 }, { k: 11, amp: 0.07 },
  ];
  return render(2.2, (t) => {
    const p = phase(vibrato(t));
    let tone = 0;
    for (const h of harmonics) tone += Math.sin(2 * Math.PI * h.k * p) * h.amp;
    return (tone + noise() * 0.015) * sustainEnvelope(t, 2.2, 0.08, 0.3);
  });
}

function renderTrumpet() {
  const f = 261.63; // C4
  const phase = makePhase(f);
  const vibrato = makeVibrato({ rate: 5.5, depth: 0.004, delay: 0.8, ramp: 0.5 });
  const partialCount = 24;
  return render(2.0, (t) => {
    // Brass scoop: attack settles up into pitch
    const scoop = 1 - 0.02 * Math.exp(-t / 0.045);
    const p = phase(vibrato(t) * scoop);
    let tone = 0;
    for (let k = 1; k <= partialCount; k++) {
      // Higher harmonics blossom later — the brassy "swell"
      const onset = smooth(Math.min(1, Math.max(0, t - 0.004 * k) / (0.03 + 0.012 * k)));
      tone += (Math.sin(2 * Math.PI * k * p) / Math.pow(k, 0.85)) * onset;
    }
    return softClip(tone * 0.5, 1.2) * sustainEnvelope(t, 2.0, 0.03, 0.25);
  });
}

function renderBrassSection() {
  const f = 130.81; // C3
  const voices = [];
  for (const cents of [-9, -3, 4, 10]) {
    voices.push({
      phase: makePhase(f * Math.pow(2, cents / 1200)),
      vibrato: makeVibrato({ rate: 4.5 + random(), depth: 0.003, delay: 0.7, phase: random() * Math.PI * 2 }),
    });
  }
  const partialCount = 30;
  return render(2.4, (t) => {
    let sum = 0;
    for (const voice of voices) {
      const p = voice.phase(voice.vibrato(t));
      for (let k = 1; k <= partialCount; k++) {
        const onset = smooth(Math.min(1, Math.max(0, t) / (0.05 + 0.015 * k)));
        sum += (Math.sin(2 * Math.PI * k * p) / Math.pow(k, 1.15)) * onset;
      }
    }
    return softClip(sum * 0.25, 1.15) * sustainEnvelope(t, 2.4, 0.1, 0.35);
  });
}

// ═══ Organs, reeds ═════════════════════════════════════════════════

function renderOrgan() {
  const f = 261.63; // C4 — drawbar tonewheel voicing with scanner vibrato
  const drawbars = [
    { ratio: 0.5, amp: 0.5 }, { ratio: 1, amp: 1 }, { ratio: 1.5, amp: 0.4 },
    { ratio: 2, amp: 0.55 }, { ratio: 3, amp: 0.25 }, { ratio: 4, amp: 0.3 },
    { ratio: 6, amp: 0.12 }, { ratio: 8, amp: 0.1 },
  ];
  const phase = makePhase(f);
  const vibrato = makeVibrato({ rate: 6.9, depth: 0.004, delay: 0, ramp: 0.01 });
  const clickFilter = onePoleHighpass(1200);
  return render(2.4, (t) => {
    const p = phase(vibrato(t));
    let tone = 0;
    for (const bar of drawbars) tone += Math.sin(2 * Math.PI * bar.ratio * p) * bar.amp;
    const keyClick = t < 0.006 ? clickFilter(noise()) * 0.35 * (1 - t / 0.006) : 0;
    return (tone * 0.4 + keyClick) * sustainEnvelope(t, 2.4, 0.008, 0.12);
  });
}

function renderChurchOrgan() {
  const f = 130.81; // C3 — principal chorus, two ranks a few cents apart
  const ranks = [Math.pow(2, 3 / 1200), Math.pow(2, -3 / 1200)].map((detune) => makePhase(f * detune));
  const partials = [
    { ratio: 1, amp: 1 }, { ratio: 2, amp: 0.62 }, { ratio: 3, amp: 0.28 },
    { ratio: 4, amp: 0.34 }, { ratio: 5, amp: 0.1 }, { ratio: 6, amp: 0.08 }, { ratio: 8, amp: 0.06 },
  ];
  const wind = onePoleLowpass(300);
  return render(3.0, (t) => {
    let tone = 0;
    for (const rank of ranks) {
      const p = rank(1);
      for (const partial of partials) {
        // Upper pipes speak slightly later
        const speech = smooth(Math.min(1, t / (0.05 + 0.05 * partial.ratio)));
        tone += Math.sin(2 * Math.PI * partial.ratio * p) * partial.amp * speech;
      }
    }
    return (tone * 0.3 + wind(noise()) * 0.015) * sustainEnvelope(t, 3.0, 0.12, 0.4);
  });
}

function renderAccordion() {
  const f = 261.63; // C4 — two reed ranks in wet musette-lite tuning
  const ranks = [Math.pow(2, 11 / 1200), Math.pow(2, -11 / 1200)].map((detune) => makePhase(f * detune));
  const partialCount = 20;
  const bellows = onePoleLowpass(500);
  return render(2.4, (t) => {
    let tone = 0;
    for (const rank of ranks) {
      const p = rank(1);
      for (let k = 1; k <= partialCount; k++) {
        tone += Math.sin(2 * Math.PI * k * p) / Math.pow(k, 0.9);
      }
    }
    return (tone * 0.22 + bellows(noise()) * 0.02) * sustainEnvelope(t, 2.4, 0.06, 0.15);
  });
}

// ═══ Auxiliary percussion ══════════════════════════════════════════

function renderRide() {
  const stack = metallicStack(52, [2, 2.9, 4.1, 5.3, 6.7, 8.3, 10.1, 12.2, 14.6]);
  const brighten = onePoleHighpass(4500);
  return render(2.2, (t) => {
    const wash = brighten(stack(t) * 0.4 + noise() * 0.25) *
      (expDecay(t, 0.8) * 0.7 + expDecay(t, 0.12) * 0.5);
    const ping =
      Math.sin(2 * Math.PI * 1850 * t) * expDecay(t, 0.6) * 0.35 +
      Math.sin(2 * Math.PI * 3700 * t) * expDecay(t, 0.3) * 0.15;
    return wash + ping;
  });
}

function renderTambourine() {
  const jingles = metallicStack(190, [6.9, 8.3, 9.7, 11.4, 13.2, 15.8]);
  const brighten = onePoleHighpass(5500);
  const hitTimes = [0, 0.045];
  return render(0.55, (t) => {
    let envelope = 0;
    for (const hit of hitTimes) {
      if (t >= hit) envelope = Math.max(envelope, expDecay(t - hit, 0.05) + expDecay(t - hit, 0.15) * 0.4);
    }
    return brighten(jingles(t) * 0.6 + noise() * 0.4) * envelope;
  });
}

function renderShaker() {
  const band = cascade(onePoleHighpass(3800), onePoleLowpass(9500));
  return render(0.22, (t) => {
    const stroke = smooth(Math.min(1, t / 0.02)) * expDecay(Math.max(0, t - 0.02), 0.045);
    const ghost = t >= 0.1 ? expDecay(t - 0.1, 0.03) * 0.35 : 0;
    return band(noise()) * (stroke + ghost);
  });
}

function renderCowbell() {
  const band = onePoleHighpass(350);
  return render(0.5, (t) => {
    const clang =
      Math.sign(Math.sin(2 * Math.PI * 562 * t)) * 0.6 +
      Math.sign(Math.sin(2 * Math.PI * 845 * t)) * 0.4;
    const attack = Math.sin(2 * Math.PI * 1600 * t) * expDecay(t, 0.02) * 0.5;
    return softClip(band(clang * expDecay(t, 0.18) + attack), 1.3);
  });
}

function renderWoodblock() {
  const knock = biquadBandpass(1200, 4);
  return render(0.16, (t) => {
    const resonance =
      Math.sin(2 * Math.PI * 880 * t) * expDecay(t, 0.045) +
      Math.sin(2 * Math.PI * 1740 * t) * expDecay(t, 0.025) * 0.5;
    const click = t < 0.0015 ? knock(noise()) * 0.6 : 0;
    return resonance + click;
  });
}

function renderTriangle() {
  // Dense inharmonic shimmer with slow-beating partial pairs
  const partialSets = [
    { freq: 4050, amp: 1, tau: 1.1 },
    { freq: 6420, amp: 0.8, tau: 0.9 },
    { freq: 8930, amp: 0.6, tau: 0.7 },
    { freq: 11780, amp: 0.4, tau: 0.5 },
    { freq: 14200, amp: 0.25, tau: 0.4 },
  ];
  const brighten = onePoleHighpass(3000);
  return render(2.4, (t) => {
    let value = 0;
    for (const partial of partialSets) {
      value += Math.sin(2 * Math.PI * partial.freq * t) * partial.amp * expDecay(t, partial.tau);
      value += Math.sin(2 * Math.PI * partial.freq * 1.004 * t) * partial.amp * 0.6 * expDecay(t, partial.tau);
    }
    return brighten(value);
  });
}

function renderConga() {
  return renderModal(195, 0.5, [ // open tone
    { ratio: 1, amp: 1, tau: 0.22 },
    { ratio: 1.62, amp: 0.4, tau: 0.09 },
    { ratio: 2.28, amp: 0.18, tau: 0.05 },
  ], {
    glide: 0.06, glideTau: 0.035,
    strike: { cutoff: 900, amp: 0.5, duration: 0.003 },
  });
}

function renderBongo() {
  return renderModal(430, 0.3, [
    { ratio: 1, amp: 1, tau: 0.12 },
    { ratio: 1.7, amp: 0.4, tau: 0.05 },
  ], {
    glide: 0.04, glideTau: 0.025,
    strike: { cutoff: 1400, amp: 0.5, duration: 0.002 },
  });
}

function renderClaves() {
  const click = onePoleHighpass(2000);
  return render(0.12, (t) => {
    const tone =
      Math.sin(2 * Math.PI * 2560 * t) * expDecay(t, 0.028) +
      Math.sin(2 * Math.PI * 3950 * t) * expDecay(t, 0.015) * 0.25;
    const attack = t < 0.001 ? click(noise()) * 0.4 : 0;
    return tone + attack;
  });
}

// ─── Render the library ────────────────────────────────────────────
mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

writeWav("kick", renderKick());
writeWav("snare", renderSnare());
writeWav("hat", renderHat(false));
writeWav("hat_open", renderHat(true));
writeWav("clap", renderClap());
writeWav("tom", renderTom());
writeWav("rim", renderRim());
writeWav("crash", renderCrash());
writeWav("guitar_pluck", karplusStrong(130.81, 2.0, { excitationCutoff: 7500, sustain: 0.9965 })); // C3
writeWav("bass_pluck", karplusStrong(65.41, 1.6, { excitationCutoff: 700, sustain: 0.998, bodyCutoff: 900 })); // C2
writeWav("epiano", renderEpiano());
writeWav("marimba", renderMarimba());
writeWav("bell", renderBell());

// Expanded library — plucked/struck strings
writeWav("piano", renderPiano());
writeWav("nylon_guitar", renderNylonGuitar());
writeWav("harp", renderHarp());
writeWav("banjo", renderBanjo());
writeWav("mandolin", renderMandolin());
writeWav("harpsichord", renderHarpsichord());

// Mallets, bells & tuned percussion
writeWav("vibraphone", renderVibraphone());
writeWav("xylophone", renderXylophone());
writeWav("glockenspiel", renderGlockenspiel());
writeWav("kalimba", renderKalimba());
writeWav("tubular_bell", renderTubularBell());
writeWav("music_box", renderMusicBox());
writeWav("steel_drum", renderSteelDrum());
writeWav("timpani", renderTimpani());

// Sustained strings, winds, brass, voices
writeWav("violin", renderViolin());
writeWav("cello", renderCello());
writeWav("strings", renderStringEnsemble());
writeWav("choir", renderChoir());
writeWav("flute", renderFlute());
writeWav("clarinet", renderClarinet());
writeWav("trumpet", renderTrumpet());
writeWav("brass", renderBrassSection());
writeWav("organ", renderOrgan());
writeWav("church_organ", renderChurchOrgan());
writeWav("accordion", renderAccordion());

// Auxiliary percussion
writeWav("ride", renderRide());
writeWav("tambourine", renderTambourine());
writeWav("shaker", renderShaker());
writeWav("cowbell", renderCowbell());
writeWav("woodblock", renderWoodblock());
writeWav("triangle", renderTriangle());
writeWav("conga", renderConga());
writeWav("bongo", renderBongo());
writeWav("claves", renderClaves());

console.log("sample library rendered to", OUTPUT_DIRECTORY);
