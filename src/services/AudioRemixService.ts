import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import logger from "../logger.ts";
import { resolveAudioInput } from "./AudioInputService.ts";

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_DURATION_SECONDS = 60;
const FFMPEG_TIMEOUT_MS = 30_000;

interface AudioRemixOperation {
  type: string;
  semitones?: number;
  factor?: number;
  delay?: number;
  decay?: number;
  delays?: number[];
  decays?: number[];
  frequency?: number;
  width?: number;
  gain?: number;
  color?: number;
  depth?: number;
  speed?: number;
  threshold?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  duration?: number;
  start?: number;
  end?: number;
  level?: number;
  pan?: number;
  bits?: number;
  sampleRate?: number;
  intensity?: number;
}

export interface AudioOverlayInput {
  source: string;
  /** Seconds into the base track where the overlay starts (default 0). */
  offset?: number;
  /** Overlay gain 0–4 (default 1.0). */
  volume?: number;
}

interface AudioRemixInput {
  input: string;
  operations?: AudioRemixOperation[];
  preset?: string;
  outputFormat?: string;
  sampleRate?: number;
  overlays?: AudioOverlayInput[];
  concatenate?: string[];
  /** 'first' (default): output length = base track. 'longest': extend to the longest overlay. */
  mixDuration?: "first" | "longest";
}

interface AudioRemixResult {
  buffer: Buffer;
  mimeType: string;
  durationSeconds: number;
  appliedOperations: string[];
}

const PRESET_DEFINITIONS: Record<string, AudioRemixOperation[]> = {
  chipmunk: [
    { type: "pitch_shift", semitones: 8 },
    { type: "tempo", factor: 1.15 },
  ],
  demon_voice: [
    { type: "pitch_shift", semitones: -10 },
    { type: "reverb", delay: 60, decay: 0.4 },
  ],
  nightcore: [
    { type: "pitch_shift", semitones: 5 },
    { type: "tempo", factor: 1.3 },
    { type: "bass_boost", gain: 4 },
  ],
  vaporwave: [
    { type: "pitch_shift", semitones: -3 },
    { type: "tempo", factor: 0.7 },
    { type: "reverb", delay: 80, decay: 0.5 },
    { type: "chorus", depth: 0.4, speed: 0.5 },
  ],
  slowed_reverb: [
    { type: "speed", factor: 0.85 },
    { type: "reverb", delay: 70, decay: 0.6 },
    { type: "lowpass", frequency: 12000 },
  ],
  underwater: [
    { type: "lowpass", frequency: 600 },
    { type: "reverb", delay: 100, decay: 0.7 },
    { type: "phaser", speed: 0.3, decay: 0.6 },
    { type: "tremolo", frequency: 3, depth: 0.4 },
  ],
  radio: [
    { type: "highpass", frequency: 300 },
    { type: "lowpass", frequency: 3400 },
    { type: "distortion", gain: 15, color: 30 },
    { type: "compressor" },
  ],
  telephone: [
    { type: "highpass", frequency: 400 },
    { type: "lowpass", frequency: 3000 },
    { type: "distortion", gain: 8, color: 20 },
    { type: "volume", level: 0.8 },
  ],
  robot: [
    { type: "flanger", delay: 5, depth: 0.9, speed: 0.5 },
    { type: "distortion", gain: 20, color: 40 },
    { type: "equalizer", frequency: 800, width: 200, gain: 6 },
  ],
  cave: [
    { type: "reverb", delay: 120, decay: 0.8 },
    { type: "echo", delays: [200, 400, 600], decays: [0.5, 0.3, 0.15] },
    { type: "lowpass", frequency: 8000 },
  ],
  vinyl: [
    { type: "highpass", frequency: 50 },
    { type: "lowpass", frequency: 14000 },
    { type: "distortion", gain: 5, color: 10 },
    { type: "tremolo", frequency: 0.5, depth: 0.05 },
  ],
  megaphone: [
    { type: "highpass", frequency: 500 },
    { type: "lowpass", frequency: 4000 },
    { type: "distortion", gain: 30, color: 50 },
    { type: "compressor", threshold: 0.3, ratio: 8 },
    { type: "volume", level: 1.5 },
  ],
};

export function getAvailablePresets(): string[] {
  return Object.keys(PRESET_DEFINITIONS);
}

function buildTempoFilterChain(factor: number): string[] {
  const filters: string[] = [];
  let remaining = factor;

  while (remaining < 0.5 || remaining > 100) {
    if (remaining < 0.5) {
      filters.push("atempo=0.5");
      remaining = remaining / 0.5;
    } else if (remaining > 100) {
      filters.push("atempo=100");
      remaining = remaining / 100;
    }
  }
  filters.push(`atempo=${remaining.toFixed(6)}`);
  return filters;
}

function consolidateTrimOperations(operations: AudioRemixOperation[]): AudioRemixOperation[] {
  const consolidated: AudioRemixOperation[] = [];
  let pendingTrimStart: number | undefined;
  let pendingTrimEnd: number | undefined;
  let hasPendingTrim = false;

  for (const operation of operations) {
    if (operation.type === "trim") {
      hasPendingTrim = true;
      if (operation.start !== undefined) {
        pendingTrimStart = operation.start;
      }
      if (operation.end !== undefined) {
        pendingTrimEnd = operation.end;
      }
    } else {
      if (hasPendingTrim) {
        const mergedTrim: AudioRemixOperation = { type: "trim" };
        if (pendingTrimStart !== undefined) mergedTrim.start = pendingTrimStart;
        if (pendingTrimEnd !== undefined) mergedTrim.end = pendingTrimEnd;
        consolidated.push(mergedTrim);
        pendingTrimStart = undefined;
        pendingTrimEnd = undefined;
        hasPendingTrim = false;
      }
      consolidated.push(operation);
    }
  }

  if (hasPendingTrim) {
    const mergedTrim: AudioRemixOperation = { type: "trim" };
    if (pendingTrimStart !== undefined) mergedTrim.start = pendingTrimStart;
    if (pendingTrimEnd !== undefined) mergedTrim.end = pendingTrimEnd;
    consolidated.push(mergedTrim);
  }

  return consolidated;
}

function compileFilterGraph(operations: AudioRemixOperation[], sourceSampleRate: number): string[] {
  const filters: string[] = [];
  const consolidatedOperations = consolidateTrimOperations(operations);

  for (const operation of consolidatedOperations) {
    switch (operation.type) {
      case "pitch_shift": {
        const semitones = operation.semitones ?? 0;
        const pitchRatio = Math.pow(2, semitones / 12);
        const targetRate = Math.round(sourceSampleRate * pitchRatio);
        filters.push(`asetrate=${targetRate}`);
        filters.push(`aresample=${sourceSampleRate}`);
        const tempoCompensation = 1 / pitchRatio;
        filters.push(...buildTempoFilterChain(tempoCompensation));
        break;
      }

      case "tempo": {
        const factor = operation.factor ?? 1.0;
        filters.push(...buildTempoFilterChain(factor));
        break;
      }

      case "speed": {
        const factor = operation.factor ?? 1.0;
        const targetRate = Math.round(sourceSampleRate * factor);
        filters.push(`asetrate=${targetRate}`);
        filters.push(`aresample=${sourceSampleRate}`);
        break;
      }

      case "reverb": {
        const reverbDelay = operation.delay ?? 60;
        const reverbDecay = operation.decay ?? 0.5;
        filters.push(
          `aecho=0.8:0.88:${reverbDelay}:${reverbDecay}`,
        );
        break;
      }

      case "echo": {
        const echoDelays = operation.delays ?? [200];
        const echoDecays = operation.decays ?? [0.4];
        const delayString = echoDelays.join("|");
        const decayString = echoDecays.join("|");
        filters.push(`aecho=0.8:0.88:${delayString}:${decayString}`);
        break;
      }

      case "lowpass":
        filters.push(`lowpass=f=${operation.frequency ?? 3000}`);
        break;

      case "highpass":
        filters.push(`highpass=f=${operation.frequency ?? 300}`);
        break;

      case "bandpass":
        filters.push(
          `bandpass=f=${operation.frequency ?? 1000}:width_type=h:w=${operation.width ?? 200}`,
        );
        break;

      case "equalizer":
        filters.push(
          `equalizer=f=${operation.frequency ?? 1000}:width_type=h:w=${operation.width ?? 200}:g=${operation.gain ?? 5}`,
        );
        break;

      case "bass_boost":
        filters.push(`bass=g=${operation.gain ?? 10}:f=100:w=0.5`);
        break;

      case "treble_boost":
        filters.push(`treble=g=${operation.gain ?? 8}:f=3000:w=0.5`);
        break;

      case "distortion": {
        const distortionGain = operation.gain ?? 20;
        const distortionColor = operation.color ?? 40;
        filters.push(
          `overdrive=gain=${distortionGain}:colour=${distortionColor}`,
        );
        break;
      }

      case "chorus": {
        const chorusDepth = operation.depth ?? 0.5;
        const chorusSpeed = operation.speed ?? 0.4;
        filters.push(
          `chorus=0.5:0.9:50:${chorusDepth}:${chorusSpeed}:2`,
        );
        break;
      }

      case "flanger": {
        const flangerDelay = operation.delay ?? 5;
        const flangerDepth = operation.depth ?? 0.7;
        const flangerSpeed = operation.speed ?? 0.5;
        filters.push(
          `flanger=delay=${flangerDelay}:depth=${flangerDepth}:speed=${flangerSpeed}`,
        );
        break;
      }

      case "phaser": {
        const phaserSpeed = operation.speed ?? 0.5;
        const phaserDecay = operation.decay ?? 0.4;
        filters.push(
          `aphaser=speed=${phaserSpeed}:decay=${phaserDecay}`,
        );
        break;
      }

      case "tremolo": {
        const tremoloFrequency = operation.frequency ?? 5;
        const tremoloDepth = operation.depth ?? 0.5;
        filters.push(
          `tremolo=f=${tremoloFrequency}:d=${tremoloDepth}`,
        );
        break;
      }

      case "vibrato": {
        const vibratoFrequency = operation.frequency ?? 5;
        const vibratoDepth = operation.depth ?? 0.5;
        filters.push(
          `vibrato=f=${vibratoFrequency}:d=${vibratoDepth}`,
        );
        break;
      }

      case "compressor": {
        const threshold = operation.threshold ?? 0.5;
        const ratio = operation.ratio ?? 4;
        const compressorAttack = operation.attack ?? 20;
        const compressorRelease = operation.release ?? 250;
        filters.push(
          `acompressor=threshold=${threshold}:ratio=${ratio}:attack=${compressorAttack}:release=${compressorRelease}`,
        );
        break;
      }

      case "normalize":
        filters.push("loudnorm");
        break;

      case "reverse":
        filters.push("areverse");
        break;

      case "fade_in": {
        const fadeInDuration = operation.duration ?? 1;
        filters.push(`afade=t=in:d=${fadeInDuration}`);
        break;
      }

      case "fade_out": {
        const fadeOutDuration = operation.duration ?? 1;
        filters.push(`afade=t=out:d=${fadeOutDuration}:curve=tri`);
        break;
      }

      case "trim": {
        const trimStart = operation.start ?? 0;
        const trimEnd = operation.end;
        if (trimEnd !== undefined) {
          filters.push(`atrim=start=${trimStart}:end=${trimEnd}`);
        } else {
          filters.push(`atrim=start=${trimStart}`);
        }
        filters.push("asetpts=PTS-STARTPTS");
        break;
      }

      case "volume": {
        const volumeLevel = operation.level ?? 1.0;
        filters.push(`volume=${volumeLevel}`);
        break;
      }

      case "stereo_pan": {
        const panValue = operation.pan ?? 0;
        filters.push(`pan=stereo|c0=c0*${1 - Math.max(0, panValue)}|c1=c1*${1 + Math.min(0, panValue)}`);
        break;
      }

      case "bitcrush": {
        const bits = operation.bits ?? 8;
        const crushSampleRate = operation.sampleRate ?? 8000;
        filters.push(
          `acrusher=bits=${bits}:mode=log:aa=1:samples=${Math.round(sourceSampleRate / crushSampleRate)}`,
        );
        break;
      }

      case "crystalizer":
        filters.push(`crystalizer=i=${operation.intensity ?? 2}`);
        break;

      default:
        logger.warn(`[AudioRemixService] Unknown operation type: ${operation.type}`);
    }
  }

  return filters;
}

async function probeAudio(
  inputPath: string,
): Promise<{ durationSeconds: number; sampleRate: number }> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        inputPath,
      ],
      { timeout: 10_000 },
    );

    const probeData = JSON.parse(stdout);
    const audioStream = probeData.streams?.find(
      (stream: { codec_type?: string }) => stream.codec_type === "audio",
    );

    const durationSeconds = parseFloat(probeData.format?.duration ?? audioStream?.duration ?? "0");
    const sampleRate = parseInt(audioStream?.sample_rate ?? "44100", 10);

    return { durationSeconds, sampleRate };
  } catch (error: unknown) {
    logger.warn(`[AudioRemixService] ffprobe failed, using defaults: ${error}`);
    return { durationSeconds: 0, sampleRate: 44100 };
  }
}

function getOutputCodecArguments(format: string): string[] {
  switch (format) {
    case "mp3":
      return ["-codec:a", "libmp3lame", "-q:a", "2"];
    case "ogg":
      return ["-codec:a", "libvorbis", "-q:a", "5"];
    case "opus":
      return ["-codec:a", "libopus", "-b:a", "128k"];
    case "wav":
    default:
      return ["-codec:a", "pcm_s16le"];
  }
}

function getOutputExtension(format: string): string {
  switch (format) {
    case "mp3":
      return ".mp3";
    case "ogg":
      return ".ogg";
    case "opus":
      return ".opus";
    case "wav":
    default:
      return ".wav";
  }
}

function getOutputMimeType(format: string): string {
  switch (format) {
    case "mp3":
      return "audio/mpeg";
    case "ogg":
      return "audio/ogg";
    case "opus":
      return "audio/opus";
    case "wav":
    default:
      return "audio/wav";
  }
}

export async function processAudio(
  remixInput: AudioRemixInput,
): Promise<AudioRemixResult> {
  const {
    input,
    operations = [],
    preset,
    outputFormat = "wav",
    sampleRate: outputSampleRate,
    overlays = [],
    concatenate = [],
    mixDuration = "first",
  } = remixInput;

  const inputBuffer = await resolveAudioInput(input);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "audio-remix-"));
  const inputPath = join(temporaryDirectory, "input.audio");
  const outputExtension = getOutputExtension(outputFormat);
  const outputPath = join(temporaryDirectory, `output${outputExtension}`);
  const extraInputPaths: string[] = [];

  try {
    await writeFile(inputPath, inputBuffer);

    // Resolve and stage secondary sources (overlays first, then concat
    // segments) so ffmpeg input indices line up: 0 = base, 1..N = overlays,
    // N+1.. = concat segments.
    for (let index = 0; index < overlays.length; index++) {
      const overlayBuffer = await resolveAudioInput(overlays[index].source);
      const overlayPath = join(temporaryDirectory, `overlay-${index}.audio`);
      await writeFile(overlayPath, overlayBuffer);
      extraInputPaths.push(overlayPath);
    }
    for (let index = 0; index < concatenate.length; index++) {
      const segmentBuffer = await resolveAudioInput(concatenate[index]);
      const segmentPath = join(temporaryDirectory, `concat-${index}.audio`);
      await writeFile(segmentPath, segmentBuffer);
      extraInputPaths.push(segmentPath);
    }

    const probeResult = await probeAudio(inputPath);
    const sourceSampleRate = probeResult.sampleRate;

    const allOperations: AudioRemixOperation[] = [];
    const appliedOperationLabels: string[] = [];

    if (preset && PRESET_DEFINITIONS[preset]) {
      const presetOperations = PRESET_DEFINITIONS[preset];
      allOperations.push(...presetOperations);
      appliedOperationLabels.push(`preset:${preset}`);
    }

    allOperations.push(...operations);
    for (const operation of operations) {
      appliedOperationLabels.push(operation.type);
    }

    if (overlays.length > 0) {
      appliedOperationLabels.push(`overlay×${overlays.length}`);
    }
    if (concatenate.length > 0) {
      appliedOperationLabels.push(`concat×${concatenate.length}`);
    }
    if (appliedOperationLabels.length === 0) {
      appliedOperationLabels.push("passthrough");
    }

    const filterGraph = compileFilterGraph(allOperations, sourceSampleRate);

    const ffmpegArguments: string[] = ["-y", "-i", inputPath];
    for (const extraPath of extraInputPaths) {
      ffmpegArguments.push("-i", extraPath);
    }

    if (extraInputPaths.length === 0) {
      // Single-input fast path — identical to the original behavior.
      if (filterGraph.length > 0) {
        ffmpegArguments.push("-af", filterGraph.join(","));
      }
    } else {
      // Multi-input graph: normalize every stream to a common rate/layout,
      // mix overlays over the (effects-processed) base, then append concat
      // segments end-to-end.
      const normalize = `aresample=${sourceSampleRate},aformat=channel_layouts=stereo`;
      const graphParts: string[] = [];

      const baseChain = [...filterGraph, normalize].join(",");
      graphParts.push(`[0:a]${baseChain}[base]`);

      const overlayLabels: string[] = [];
      overlays.forEach((overlay, index) => {
        const delayMilliseconds = Math.max(0, Math.round((overlay.offset ?? 0) * 1000));
        const overlayVolume = Math.min(Math.max(overlay.volume ?? 1.0, 0), 4);
        const label = `ov${index}`;
        graphParts.push(
          `[${1 + index}:a]${normalize},volume=${overlayVolume},` +
            `adelay=${delayMilliseconds}|${delayMilliseconds}[${label}]`,
        );
        overlayLabels.push(label);
      });

      let currentLabel = "base";
      if (overlayLabels.length > 0) {
        const mixInputs = ["[base]", ...overlayLabels.map((label) => `[${label}]`)].join("");
        graphParts.push(
          `${mixInputs}amix=inputs=${overlayLabels.length + 1}:` +
            `duration=${mixDuration === "longest" ? "longest" : "first"}:normalize=0[mixed]`,
        );
        currentLabel = "mixed";
      }

      if (concatenate.length > 0) {
        const segmentLabels: string[] = [];
        concatenate.forEach((_, index) => {
          const label = `cat${index}`;
          graphParts.push(`[${1 + overlays.length + index}:a]${normalize}[${label}]`);
          segmentLabels.push(label);
        });
        const concatInputs = [`[${currentLabel}]`, ...segmentLabels.map((label) => `[${label}]`)].join("");
        graphParts.push(
          `${concatInputs}concat=n=${concatenate.length + 1}:v=0:a=1[joined]`,
        );
        currentLabel = "joined";
      }

      ffmpegArguments.push("-filter_complex", graphParts.join(";"));
      ffmpegArguments.push("-map", `[${currentLabel}]`);
    }

    ffmpegArguments.push("-t", String(MAX_OUTPUT_DURATION_SECONDS));

    if (outputSampleRate) {
      ffmpegArguments.push("-ar", String(outputSampleRate));
    }

    ffmpegArguments.push(...getOutputCodecArguments(outputFormat));
    ffmpegArguments.push(outputPath);

    logger.info(
      `[AudioRemixService] Running FFmpeg — ${filterGraph.length} filters, ` +
        `${overlays.length} overlay(s), ${concatenate.length} concat segment(s)`,
    );

    await execFileAsync("ffmpeg", ffmpegArguments, {
      timeout: FFMPEG_TIMEOUT_MS,
    });

    const outputBuffer = await readFile(outputPath);

    const outputProbe = await probeAudio(outputPath);

    return {
      buffer: outputBuffer,
      mimeType: getOutputMimeType(outputFormat),
      durationSeconds: outputProbe.durationSeconds,
      appliedOperations: appliedOperationLabels,
    };
  } finally {
    try {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
      for (const extraPath of extraInputPaths) {
        await unlink(extraPath).catch(() => {});
      }
      const { rmdir } = await import("node:fs/promises");
      await rmdir(temporaryDirectory).catch(() => {});
    } catch {
      // Best-effort cleanup
    }
  }
}
