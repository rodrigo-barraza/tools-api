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
  kick: { file: "kick.wav", rootNote: "C4", kind: "drum" },
  snare: { file: "snare.wav", rootNote: "C4", kind: "drum" },
  hat: { file: "hat.wav", rootNote: "C4", kind: "drum" },
  hat_open: { file: "hat_open.wav", rootNote: "C4", kind: "drum" },
  clap: { file: "clap.wav", rootNote: "C4", kind: "drum" },
  tom: { file: "tom.wav", rootNote: "C4", kind: "drum" },
  rim: { file: "rim.wav", rootNote: "C4", kind: "drum" },
  crash: { file: "crash.wav", rootNote: "C4", kind: "drum" },
  guitar_pluck: { file: "guitar_pluck.wav", rootNote: "C3", kind: "melodic" },
  bass_pluck: { file: "bass_pluck.wav", rootNote: "C2", kind: "melodic" },
  epiano: { file: "epiano.wav", rootNote: "C4", kind: "melodic" },
  marimba: { file: "marimba.wav", rootNote: "C4", kind: "melodic" },
  bell: { file: "bell.wav", rootNote: "C5", kind: "melodic" },
};

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
        `Drums (play with KICK-style trigger rows or any note): kick, snare, hat, hat_open, ` +
        `clap, tom, rim, crash. Melodic (repitched by note rows): guitar_pluck, bass_pluck, ` +
        `epiano, marimba, bell.`,
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
