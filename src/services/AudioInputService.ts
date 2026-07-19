import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export const MAX_AUDIO_INPUT_BYTES = 25 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 30_000;

/**
 * Resolves an audio source string (URL, base64 data URI, or absolute file
 * path) into a raw encoded-audio Buffer. Shared by every audio-consuming
 * tool (remix_audio, generate_audio sampler channels).
 */
export async function resolveAudioInput(input: string): Promise<Buffer> {
  // The 'attached' sentinel is normally substituted by the agent harness
  // with the conversation's attached audio before the request reaches us.
  // Seeing it here means no attached audio could be resolved.
  if (input.trim().toLowerCase() === "attached") {
    throw new Error(
      "No attached audio was found in the conversation to substitute for 'attached'. " +
        "Ask the user to (re-)upload the audio, or pass an explicit URL or data URI.",
    );
  }

  if (input.startsWith("data:")) {
    const commaIndex = input.indexOf(",");
    if (commaIndex === -1) {
      throw new Error("Invalid data URI: missing comma separator");
    }
    const base64Data = input.slice(commaIndex + 1);
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length > MAX_AUDIO_INPUT_BYTES) {
      throw new Error(`Input audio exceeds maximum size of ${MAX_AUDIO_INPUT_BYTES / (1024 * 1024)}MB`);
    }
    return buffer;
  }

  if (input.startsWith("http://") || input.startsWith("https://")) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio from URL: HTTP ${response.status}`);
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_AUDIO_INPUT_BYTES) {
      throw new Error(`Remote audio exceeds maximum size of ${MAX_AUDIO_INPUT_BYTES / (1024 * 1024)}MB`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_AUDIO_INPUT_BYTES) {
      throw new Error(`Downloaded audio exceeds maximum size of ${MAX_AUDIO_INPUT_BYTES / (1024 * 1024)}MB`);
    }
    return buffer;
  }

  if (input.startsWith("/")) {
    const buffer = await readFile(input);
    if (buffer.length > MAX_AUDIO_INPUT_BYTES) {
      throw new Error(`Local audio file exceeds maximum size of ${MAX_AUDIO_INPUT_BYTES / (1024 * 1024)}MB`);
    }
    return buffer;
  }

  throw new Error(
    "Invalid input: must be a URL (http/https), base64 data URI (data:audio/...), or absolute file path",
  );
}

export interface DecodedPcm {
  pcm: Float32Array;
  sampleRate: number;
  durationSeconds: number;
  truncated: boolean;
}

/**
 * Decodes any ffmpeg-readable audio into mono float PCM at the requested
 * sample rate. Decoding is capped at `maxDurationSeconds` — sampler
 * buffers live in tracker session memory, so unbounded decodes would let
 * a single long upload pin tens of MB per channel.
 */
export async function decodeAudioToPcm(
  encodedAudio: Buffer,
  options: { sampleRate: number; maxDurationSeconds: number },
): Promise<DecodedPcm> {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "audio-decode-"));
  const inputPath = join(temporaryDirectory, "input");
  const outputPath = join(temporaryDirectory, "output.f32");

  try {
    await writeFile(inputPath, encodedAudio);

    // Decode slightly past the cap so we can distinguish "fit exactly"
    // from "was truncated" without probing the source duration first.
    const decodeWindow = options.maxDurationSeconds + 0.05;
    await execFileAsync(
      "ffmpeg",
      [
        "-y",
        "-i", inputPath,
        "-t", String(decodeWindow),
        "-ac", "1",
        "-ar", String(options.sampleRate),
        "-f", "f32le",
        "-acodec", "pcm_f32le",
        outputPath,
      ],
      { timeout: FFMPEG_TIMEOUT_MS },
    );

    const rawPcm = await readFile(outputPath);
    const totalSamples = Math.floor(rawPcm.length / 4);
    if (totalSamples === 0) {
      throw new Error("Decoded audio contains no samples — is the input a valid audio file?");
    }

    const maxSamples = Math.floor(options.maxDurationSeconds * options.sampleRate);
    const truncated = totalSamples > maxSamples;
    const keptSamples = truncated ? maxSamples : totalSamples;

    const pcm = new Float32Array(keptSamples);
    for (let i = 0; i < keptSamples; i++) {
      pcm[i] = rawPcm.readFloatLE(i * 4);
    }

    return {
      pcm,
      sampleRate: options.sampleRate,
      durationSeconds: keptSamples / options.sampleRate,
      truncated,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Invalid data") || message.includes("could not find codec")) {
      throw new Error(`Could not decode audio input: ${message}`);
    }
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
