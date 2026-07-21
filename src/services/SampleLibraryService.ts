import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import logger from "../logger.ts";
import { decodeAudioToPcm } from "./AudioInputService.ts";
import type { TrackerChannelSample } from "./AudioTrackerSessionManager.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLES_DIRECTORY = join(__dirname, "data", "samples");

/**
 * Built-in natural-instrument one-shots for generate_audio sampler
 * channels, referenced as sampleSource: "preset:<name>". The WAVs are
 * physically-modeled renders committed by scripts/generate-sample-library.mjs
 * (Karplus-Strong strings, FM keys/bells, modal marimba, layered drum
 * transients) — the natural-sounding counterpart to the synthesized
 * `instrument` presets.
 *
 * `rootNote` is the pitch each melodic sample was rendered at, so tracker
 * repitching stays true; percussive one-shots use C4 = natural speed.
 */
interface SamplePresetDefinition {
  file: string;
  rootNote: string;
  kind: "drum" | "melodic";
}

export const SAMPLE_PRESETS: Record<string, SamplePresetDefinition> = {
  // Drum kit
  kick: { file: "kick.wav", rootNote: "C4", kind: "drum" },
  snare: { file: "snare.wav", rootNote: "C4", kind: "drum" },
  hat: { file: "hat.wav", rootNote: "C4", kind: "drum" },
  hat_open: { file: "hat_open.wav", rootNote: "C4", kind: "drum" },
  clap: { file: "clap.wav", rootNote: "C4", kind: "drum" },
  tom: { file: "tom.wav", rootNote: "C4", kind: "drum" },
  rim: { file: "rim.wav", rootNote: "C4", kind: "drum" },
  crash: { file: "crash.wav", rootNote: "C4", kind: "drum" },
  ride: { file: "ride.wav", rootNote: "C4", kind: "drum" },
  // Auxiliary percussion
  tambourine: { file: "tambourine.wav", rootNote: "C4", kind: "drum" },
  shaker: { file: "shaker.wav", rootNote: "C4", kind: "drum" },
  cowbell: { file: "cowbell.wav", rootNote: "C4", kind: "drum" },
  woodblock: { file: "woodblock.wav", rootNote: "C4", kind: "drum" },
  triangle: { file: "triangle.wav", rootNote: "C4", kind: "drum" },
  conga: { file: "conga.wav", rootNote: "C4", kind: "drum" },
  bongo: { file: "bongo.wav", rootNote: "C4", kind: "drum" },
  claves: { file: "claves.wav", rootNote: "C4", kind: "drum" },
  // Plucked & struck strings
  guitar_pluck: { file: "guitar_pluck.wav", rootNote: "C3", kind: "melodic" },
  nylon_guitar: { file: "nylon_guitar.wav", rootNote: "C3", kind: "melodic" },
  bass_pluck: { file: "bass_pluck.wav", rootNote: "C2", kind: "melodic" },
  harp: { file: "harp.wav", rootNote: "C4", kind: "melodic" },
  banjo: { file: "banjo.wav", rootNote: "C3", kind: "melodic" },
  mandolin: { file: "mandolin.wav", rootNote: "C4", kind: "melodic" },
  harpsichord: { file: "harpsichord.wav", rootNote: "C4", kind: "melodic" },
  piano: { file: "piano.wav", rootNote: "C4", kind: "melodic" },
  epiano: { file: "epiano.wav", rootNote: "C4", kind: "melodic" },
  // Mallets, bells & tuned percussion
  marimba: { file: "marimba.wav", rootNote: "C4", kind: "melodic" },
  vibraphone: { file: "vibraphone.wav", rootNote: "C4", kind: "melodic" },
  xylophone: { file: "xylophone.wav", rootNote: "C5", kind: "melodic" },
  glockenspiel: { file: "glockenspiel.wav", rootNote: "C6", kind: "melodic" },
  kalimba: { file: "kalimba.wav", rootNote: "C4", kind: "melodic" },
  bell: { file: "bell.wav", rootNote: "C5", kind: "melodic" },
  tubular_bell: { file: "tubular_bell.wav", rootNote: "C5", kind: "melodic" },
  music_box: { file: "music_box.wav", rootNote: "C6", kind: "melodic" },
  steel_drum: { file: "steel_drum.wav", rootNote: "C4", kind: "melodic" },
  timpani: { file: "timpani.wav", rootNote: "C2", kind: "melodic" },
  // Bowed strings & voices
  violin: { file: "violin.wav", rootNote: "C5", kind: "melodic" },
  cello: { file: "cello.wav", rootNote: "C3", kind: "melodic" },
  strings: { file: "strings.wav", rootNote: "C4", kind: "melodic" },
  choir: { file: "choir.wav", rootNote: "C4", kind: "melodic" },
  // Winds & brass
  flute: { file: "flute.wav", rootNote: "C5", kind: "melodic" },
  clarinet: { file: "clarinet.wav", rootNote: "C4", kind: "melodic" },
  trumpet: { file: "trumpet.wav", rootNote: "C4", kind: "melodic" },
  brass: { file: "brass.wav", rootNote: "C3", kind: "melodic" },
  // Organs & reeds
  organ: { file: "organ.wav", rootNote: "C4", kind: "melodic" },
  church_organ: { file: "church_organ.wav", rootNote: "C3", kind: "melodic" },
  accordion: { file: "accordion.wav", rootNote: "C4", kind: "melodic" },
};

/** Preset names grouped by kind — for docs and error messages. */
export function samplePresetSummary(): string {
  const drums = Object.keys(SAMPLE_PRESETS).filter((name) => SAMPLE_PRESETS[name].kind === "drum");
  const melodic = Object.keys(SAMPLE_PRESETS).filter((name) => SAMPLE_PRESETS[name].kind === "melodic");
  return (
    `Drums/percussion (play with KICK-style trigger rows or any note): ${drums.join(", ")}. ` +
    `Melodic (repitched by note rows): ${melodic.join(", ")}.`
  );
}

export function listSamplePresets(): string[] {
  return Object.keys(SAMPLE_PRESETS);
}

export function isSamplePresetRef(source: string): boolean {
  return source.trim().toLowerCase().startsWith("preset:");
}

// Decoded PCM cache — the library is ~1.2MB of short one-shots, so caching
// per (preset, sampleRate) costs a few MB at most and makes repeat
// add_channel calls instant.
const decodedCache = new Map<string, TrackerChannelSample>();

/**
 * Resolve a "preset:<name>" sampleSource into a decoded tracker sample at
 * the session sample rate. Throws with the valid preset list on unknown
 * names.
 */
export async function resolveSamplePreset(
  source: string,
  sampleRate: number,
): Promise<TrackerChannelSample> {
  const presetName = source.trim().toLowerCase().replace(/^preset:/, "").trim();
  const definition = SAMPLE_PRESETS[presetName];
  if (!definition) {
    throw new Error(
      `Unknown sample preset '${presetName}'. Valid presets: ${listSamplePresets().join(", ")}. ` +
        samplePresetSummary(),
    );
  }

  const cacheKey = `${presetName}@${sampleRate}`;
  const cached = decodedCache.get(cacheKey);
  if (cached) return cached;

  const wavBuffer = await readFile(join(SAMPLES_DIRECTORY, definition.file));
  const decoded = await decodeAudioToPcm(wavBuffer, {
    sampleRate,
    maxDurationSeconds: 15,
  });

  const sample: TrackerChannelSample = {
    pcm: decoded.pcm,
    sourceSampleRate: decoded.sampleRate,
    rootNote: definition.rootNote,
    loop: false,
    durationSeconds: decoded.durationSeconds,
    sourceLabel: `preset:${presetName}`,
  };
  decodedCache.set(cacheKey, sample);
  logger.info(
    `[SampleLibraryService] Decoded preset '${presetName}' @ ${sampleRate}Hz ` +
      `(${decoded.durationSeconds.toFixed(2)}s, root ${definition.rootNote})`,
  );
  return sample;
}
