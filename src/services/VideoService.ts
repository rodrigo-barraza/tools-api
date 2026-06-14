import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import crypto from "node:crypto";
import { validatePath } from "./AgenticFileService.ts";

const executeFileAsynchronously = promisify(execFile);

export interface ConvertVideoToGifInput {
  input: string;
  quality?: "high" | "low";
  width?: number;
  fps?: number;
}

export interface ConvertVideoToGifResult {
  buffer: Buffer;
  mimeType: string;
}

const MAXIMUM_INPUT_BYTES = 50 * 1024 * 1024; // 50 MB limit
const FFMPEG_TIMEOUT_MILLISECONDS = 45_000;

export async function convertVideoToGif({
  input,
  quality = "high",
  width = 480,
  fps = 15,
}: ConvertVideoToGifInput): Promise<ConvertVideoToGifResult> {
  if (!input || typeof input !== "string") {
    throw new Error("'input' is required (URL or local workspace path)");
  }

  const VALID_QUALITY_VALUES = new Set(["high", "low"]);
  if (quality && !VALID_QUALITY_VALUES.has(quality)) {
    throw new Error(
      `Invalid quality '${quality}'. Valid: ${[...VALID_QUALITY_VALUES].join(", ")}`,
    );
  }

  if (fps !== undefined && (typeof fps !== "number" || fps < 1 || fps > 30)) {
    throw new Error(
      `Invalid fps ${fps}. Must be a number between 1 and 30`,
    );
  }

  if (width !== undefined && (typeof width !== "number" || width < 64 || width > 1280)) {
    throw new Error(
      `Invalid width ${width}. Must be a number between 64 and 1280`,
    );
  }

  // Enforce parameter boundaries
  const boundedFps = fps;
  const boundedWidth = width;

  const ffmpegBinaryPath = process.env.FFMPEG_PATH || "ffmpeg";

  let resolvedInputPath = "";
  let isInputTemporaryFile = false;

  const paletteTemporaryPath = join(
    tmpdir(),
    `palette-${crypto.randomUUID()}.png`,
  );
  const outputGifTemporaryPath = join(
    tmpdir(),
    `vid-out-${crypto.randomUUID()}.gif`,
  );

  try {
    // ── Resolve Input Source ─────────────────────────────────
    if (input.startsWith("http://") || input.startsWith("https://")) {
      const uniqueInputId = crypto.randomUUID();
      resolvedInputPath = join(tmpdir(), `vid-in-${uniqueInputId}`);
      isInputTemporaryFile = true;

      const networkResponse = await fetch(input, {
        signal: AbortSignal.timeout(30_000),
      });

      if (!networkResponse.ok) {
        throw new Error(
          `Failed to fetch video from URL: HTTP ${networkResponse.status}`,
        );
      }

      const contentLengthHeader = networkResponse.headers.get("content-length");
      const contentLengthBytes = parseInt(contentLengthHeader || "0", 10);
      if (contentLengthBytes > MAXIMUM_INPUT_BYTES) {
        throw new Error(
          `Remote video exceeds ${MAXIMUM_INPUT_BYTES / 1024 / 1024} MB limit`,
        );
      }

      const networkArrayBuffer = await networkResponse.arrayBuffer();
      const networkBuffer = Buffer.from(networkArrayBuffer);

      if (networkBuffer.length > MAXIMUM_INPUT_BYTES) {
        throw new Error(
          `Downloaded video exceeds ${MAXIMUM_INPUT_BYTES / 1024 / 1024} MB limit`,
        );
      }

      await writeFile(resolvedInputPath, networkBuffer);
    } else {
      // Local workspace file path
      let diskPath = input;
      if (input.startsWith("file://")) {
        diskPath = decodeURIComponent(input.replace(/^file:\/\/\/?/, "/"));
      }

      const pathValidation = validatePath(diskPath);
      if (pathValidation.safe && pathValidation.resolved) {
        resolvedInputPath = pathValidation.resolved;
      } else {
        throw new Error(
          `Local path validation failed: ${pathValidation.error}`,
        );
      }
    }

    // ── Pass 1: Generate Palette ─────────────────────────────
    // For high-quality, we use a full 256-color palette.
    // For low-quality, we can restrict colors to 128 to save file size.
    const maximumColors = quality === "low" ? 128 : 256;
    const paletteArguments = [
      "-y",
      "-i",
      resolvedInputPath,
      "-vf",
      `fps=${boundedFps},scale=${boundedWidth}:-1:flags=lanczos,palettegen=max_colors=${maximumColors}`,
      paletteTemporaryPath,
    ];

    await executeFileAsynchronously(ffmpegBinaryPath, paletteArguments, {
      timeout: FFMPEG_TIMEOUT_MILLISECONDS,
    });

    // ── Pass 2: Generate GIF ─────────────────────────────────
    // Dithering option sierra2_4a provides high spatial and color fidelity.
    // Dithering = none produces flat blocks and yields a much smaller file size.
    const ditheringStrategy = quality === "low" ? "none" : "sierra2_4a";
    const gifArguments = [
      "-y",
      "-i",
      resolvedInputPath,
      "-i",
      paletteTemporaryPath,
      "-filter_complex",
      `fps=${boundedFps},scale=${boundedWidth}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=${ditheringStrategy}`,
      outputGifTemporaryPath,
    ];

    await executeFileAsynchronously(ffmpegBinaryPath, gifArguments, {
      timeout: FFMPEG_TIMEOUT_MILLISECONDS,
    });

    const outputBuffer = await readFile(outputGifTemporaryPath);
    return {
      buffer: outputBuffer,
      mimeType: "image/gif",
    };
  } finally {
    // ── Clean up Temporary Files ─────────────────────────────
    if (isInputTemporaryFile && resolvedInputPath) {
      await unlink(resolvedInputPath).catch(() => {});
    }
    await unlink(paletteTemporaryPath).catch(() => {});
    await unlink(outputGifTemporaryPath).catch(() => {});
  }
}

/**
 * Check if ffmpeg is available on the system.
 */
export async function checkFfmpegAvailability(): Promise<{
  available: boolean;
  version?: string;
}> {
  const ffmpegBinaryPath = process.env.FFMPEG_PATH || "ffmpeg";
  try {
    const { stdout } = await executeFileAsynchronously(
      ffmpegBinaryPath,
      ["-version"],
      { timeout: 5_000 },
    );
    const versionMatch = stdout.match(/ffmpeg\s+version\s+([\d.\w-]+)/i);
    return {
      available: true,
      version: versionMatch?.[1] || "unknown",
    };
  } catch {
    return { available: false };
  }
}
