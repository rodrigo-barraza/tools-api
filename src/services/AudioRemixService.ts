import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import logger from "../logger.ts";

const execFileAsync = promisify(execFile);

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
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

interface AudioRemixInput {
  input: string;
  operations?: AudioRemixOperation[];
  preset?: string;
  outputFormat?: string;
  sampleRate?: number;
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

async function resolveAudioInput(input: string): Promise<Buffer> {
  if (input.startsWith("data:")) {
    const commaIndex = input.indexOf(",");
    if (commaIndex === -1) {
      throw new Error("Invalid data URI: missing comma separator");
    }
    const base64Data = input.slice(commaIndex + 1);
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > MAX_INPUT_BYTES) {
      throw new Error(`Input audio exceeds maximum size of ${MAX_INPUT_BYTES / (1024 * 1024)}MB`);
    }
    return buffer;
  }

  if (input.startsWith("http://") || input.startsWith("https://")) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio from URL: HTTP ${response.status}`);
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_INPUT_BYTES) {
      throw new Error(`Remote audio exceeds maximum size of ${MAX_INPUT_BYTES / (1024 * 1024)}MB`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_INPUT_BYTES) {
      throw new Error(`Downloaded audio exceeds maximum size of ${MAX_INPUT_BYTES / (1024 * 1024)}MB`);
    }
    return buffer;
  }

  if (input.startsWith("/")) {
    const buffer = await readFile(input);
    if (buffer.length > MAX_INPUT_BYTES) {
      throw new Error(`Local audio file exceeds maximum size of ${MAX_INPUT_BYTES / (1024 * 1024)}MB`);
    }
    return buffer;
  }

  throw new Error(
    "Invalid input: must be a URL (http/https), base64 data URI (data:audio/...), or absolute file path",
  );
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

function compileFilterGraph(operations: AudioRemixOperation[], sourceSampleRate: number): string[] {
  const filters: string[] = [];

  for (const operation of operations) {
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
  } = remixInput;

  const inputBuffer = await resolveAudioInput(input);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "audio-remix-"));
  const inputPath = join(temporaryDirectory, "input.audio");
  const outputExtension = getOutputExtension(outputFormat);
  const outputPath = join(temporaryDirectory, `output${outputExtension}`);

  try {
    await writeFile(inputPath, inputBuffer);

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

    if (allOperations.length === 0) {
      appliedOperationLabels.push("passthrough");
    }

    const filterGraph = compileFilterGraph(allOperations, sourceSampleRate);

    const ffmpegArguments: string[] = ["-y", "-i", inputPath];

    if (filterGraph.length > 0) {
      ffmpegArguments.push("-af", filterGraph.join(","));
    }

    ffmpegArguments.push("-t", String(MAX_OUTPUT_DURATION_SECONDS));

    if (outputSampleRate) {
      ffmpegArguments.push("-ar", String(outputSampleRate));
    }

    ffmpegArguments.push(...getOutputCodecArguments(outputFormat));
    ffmpegArguments.push(outputPath);

    logger.info(
      `[AudioRemixService] Running FFmpeg with ${filterGraph.length} filters: ${filterGraph.join(", ").slice(0, 200)}`,
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
      const { rmdir } = await import("node:fs/promises");
      await rmdir(temporaryDirectory).catch(() => {});
    } catch {
      // Best-effort cleanup
    }
  }
}
