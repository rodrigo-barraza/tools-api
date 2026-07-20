// Renders the built-in natural-instrument sample library for generate_audio
// sampler channels (sampleSource: "preset:<name>").
//
// Every one-shot is synthesized offline here with physical-modeling and FM
// techniques the realtime engine can't afford (Karplus-Strong string delay
// lines, modal bar synthesis, multi-operator FM, layered drum transients),
// then committed as 16-bit mono WAVs under src/services/data/samples/.
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

console.log("sample library rendered to", OUTPUT_DIRECTORY);
