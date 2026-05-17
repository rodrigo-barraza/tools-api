// ─── Hybrid Sharp + ImageMagick Engine ──────────────────────

import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import crypto from "node:crypto";

const execFileAsync = promisify(execFile);

// ─── Constants ─────────────────────────────────────────────────

const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_DIMENSION = 8192;
const MAGICK_TIMEOUT_MS = 30_000;

/** Operations routed to ImageMagick instead of Sharp */
const MAGICK_OPERATIONS = new Set(["text", "distort", "border", "ico"]);

// ─── Input Resolution ──────────────────────────────────────────

/**
 * Resolve an input source to a Sharp-compatible buffer.
 * Supports: URL, base64 data URI, or EphemeralStore ID.
 *


 */
async function resolveInput(input, store) {
  if (!input || typeof input !== "string") {
    throw new Error("'input' is required (URL, base64 data URI, or previous imageId)");
  }

  // ── Data URI ──────────────────────────────────────────────
  if (input.startsWith("data:")) {
    const match = input.match(/^data:[^;]+;base64,(.+)$/s);
    if (!match) throw new Error("Invalid data URI format. Expected: data:<mime>;base64,<data>");
    const buf = Buffer.from(match[1], "base64");
    if (buf.length > MAX_INPUT_BYTES) {
      throw new Error(`Input image exceeds ${MAX_INPUT_BYTES / 1024 / 1024} MB limit`);
    }
    return buf;
  }

  // ── URL ───────────────────────────────────────────────────
  if (input.startsWith("http://") || input.startsWith("https://")) {
    const response = await fetch(input, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      throw new Error(`Failed to fetch image from URL: HTTP ${response.status}`);
    }
    const contentLength = parseInt(response.headers.get("content-length") || "0");
    if (contentLength > MAX_INPUT_BYTES) {
      throw new Error(`Remote image exceeds ${MAX_INPUT_BYTES / 1024 / 1024} MB limit`);
    }
    const arrayBuf = await response.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  // ── Ephemeral Store ID ────────────────────────────────────
  if (store) {
    const entry = store.get(input);
    if (entry?.buffer) return entry.buffer;
  }
  throw new Error(
    "Invalid input: must be a URL (http/https), base64 data URI (data:image/...;base64,...), " +
    "or a previous imageId from a prior manipulate_image call.",
  );
}

// ─── Sharp Engine ──────────────────────────────────────────────

/**
 * Apply a pipeline of Sharp-based operations to an image buffer.


 * @returns {Promise<{buffer: Buffer, metadata?: object, mimeType: string}>}
 */
async function processWithSharp(inputBuffer, operations, outputFormat, outputQuality) {
  let pipeline = sharp(inputBuffer, { failOn: "none", limitInputPixels: MAX_DIMENSION * MAX_DIMENSION });
  let metadataResult = null;

  for (const op of operations) {
    switch (op.type) {
      case "resize": {
        const opts: Record<string, any> = {};
        if (op.width) opts.width = Math.min(op.width, MAX_DIMENSION);
        if (op.height) opts.height = Math.min(op.height, MAX_DIMENSION);
        if (op.fit) opts.fit = op.fit;
        if (op.background) opts.background = op.background;
        if (op.withoutEnlargement !== undefined) opts.withoutEnlargement = op.withoutEnlargement;
        pipeline = pipeline.resize(opts);
        break;
      }

      case "crop": {
        if (!op.width || !op.height) throw new Error("crop requires 'width' and 'height'");
        pipeline = pipeline.extract({
          left: op.left || 0,
          top: op.top || 0,
          width: Math.min(op.width, MAX_DIMENSION),
          height: Math.min(op.height, MAX_DIMENSION),
        });
        break;
      }

      case "rotate":
        pipeline = pipeline.rotate(op.angle || 0, {
          background: op.background || { r: 0, g: 0, b: 0, alpha: 0 },
        });
        break;

      case "flip":
        if (op.direction === "horizontal") {
          pipeline = pipeline.flop();
        } else {
          pipeline = pipeline.flip();
        }
        break;

      case "blur":
        pipeline = pipeline.blur(
          Math.min(Math.max(op.sigma || 3, 0.3), 100),
        );
        break;

      case "sharpen":
        pipeline = pipeline.sharpen({
          sigma: op.sigma || 1,
          ...(op.flat !== undefined && { flat: op.flat }),
          ...(op.jagged !== undefined && { jagged: op.jagged }),
        });
        break;

      case "grayscale":
        pipeline = pipeline.grayscale();
        break;

      case "negate":
        pipeline = pipeline.negate();
        break;

      case "tint":
        if (op.color) pipeline = pipeline.tint(op.color);
        break;

      case "adjust":
        pipeline = pipeline.modulate({
          ...(op.brightness !== undefined && { brightness: op.brightness }),
          ...(op.saturation !== undefined && { saturation: op.saturation }),
          ...(op.hue !== undefined && { hue: op.hue }),
          ...(op.lightness !== undefined && { lightness: op.lightness }),
        });
        break;

      case "gamma":
        pipeline = pipeline.gamma(op.value || 2.2);
        break;

      case "trim":
        pipeline = pipeline.trim({ threshold: op.threshold || 10 });
        break;

      case "extend": {
        const ext: Record<string, any> = {
          top: op.top || 0,
          right: op.right || 0,
          bottom: op.bottom || 0,
          left: op.left || 0,
        };
        if (op.background) ext.background = op.background;
        pipeline = pipeline.extend(ext);
        break;
      }

      case "composite": {
        if (!op.overlayUrl) throw new Error("composite requires 'overlayUrl'");
        const overlayBuf = await resolveInput(op.overlayUrl, null);
        const compositeOpts: Record<string, any> = { input: overlayBuf };
        if (op.gravity) compositeOpts.gravity = op.gravity;
        if (op.blend) compositeOpts.blend = op.blend;
        if (op.left !== undefined && op.top !== undefined) {
          compositeOpts.left = op.left;
          compositeOpts.top = op.top;
        }
        pipeline = pipeline.composite([compositeOpts]);
        break;
      }

      case "metadata": {
        metadataResult = await sharp(inputBuffer).metadata();
        // Strip buffer-based properties
        delete metadataResult.icc;
        delete metadataResult.iptc;
        delete metadataResult.xmp;
        delete metadataResult.exif;
        delete metadataResult.tifftagPhotoshop;
        break;
      }

      default:
        // Skip unknown Sharp operations — they might be Magick ops in a mixed pipeline
        break;
    }
  }

  // If only metadata was requested, return it without an image
  if (metadataResult && operations.length === 1) {
    return { metadata: metadataResult, buffer: null, mimeType: null };
  }

  // Apply output format
  const format = outputFormat || "png";
  const formatOpts: Record<string, any> = {};
  if (outputQuality && ["jpeg", "webp", "avif", "tiff"].includes(format)) {
    formatOpts.quality = Math.min(Math.max(outputQuality, 1), 100);
  }

  pipeline = pipeline.toFormat(format, formatOpts);
  const buffer = await pipeline.toBuffer();

  const MIME_MAP = {
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    tiff: "image/tiff",
    gif: "image/gif",
  };

  return {
    buffer,
    mimeType: MIME_MAP[format] || "image/png",
    ...(metadataResult && { metadata: metadataResult }),
  };
}

// ─── ImageMagick Engine ────────────────────────────────────────

/**
 * Apply ImageMagick-based operations via the `convert` CLI.
 * Used for operations Sharp can't handle natively.
 *


 * @returns {Promise<{buffer: Buffer, mimeType: string}>}
 */
async function processWithMagick(inputBuffer, operations, outputFormat, outputQuality) {
  const id = crypto.randomUUID().slice(0, 12);
  const inputPath = join(tmpdir(), `img-in-${id}`);
  const outputPath = join(tmpdir(), `img-out-${id}.${outputFormat || "png"}`);

  try {
    await writeFile(inputPath, inputBuffer);

    const args = [inputPath];

    for (const op of operations) {
      switch (op.type) {
        case "text": {
          if (!op.content) throw new Error("text requires 'content'");
          const textArgs = [];
          textArgs.push("-gravity", op.gravity || "south");
          textArgs.push("-font", op.font || "Liberation-Sans");
          textArgs.push("-pointsize", String(op.fontSize || 32));
          textArgs.push("-fill", op.color || "white");
          if (op.strokeColor) {
            textArgs.push("-stroke", op.strokeColor);
            textArgs.push("-strokewidth", String(op.strokeWidth || 2));
          }
          if (op.x !== undefined || op.y !== undefined) {
            textArgs.push("-annotate", `+${op.x || 0}+${op.y || 0}`, op.content);
          } else {
            textArgs.push("-annotate", "+0+20", op.content);
          }
          args.push(...textArgs);
          break;
        }

        case "distort": {
          if (!op.effect) throw new Error("distort requires 'effect'");
          switch (op.effect) {
            case "swirl":
              args.push("-swirl", String(op.degrees || 90));
              break;
            case "wave":
              args.push("-wave", `${op.amplitude || 10}x${op.wavelength || 100}`);
              break;
            case "implode":
              args.push("-implode", String(op.factor || 0.5));
              break;
            case "barrel":
              args.push("-distort", "Barrel", op.params || "0.0 0.0 -0.3 1.3");
              break;
            default:
              throw new Error(`Unknown distort effect: ${op.effect}. Use: swirl, wave, implode, barrel`);
          }
          break;
        }

        case "border":
          args.push("-bordercolor", op.color || "#000000");
          args.push("-border", `${op.width || 5}`);
          break;

        case "resize":
          args.push("-resize", `${op.width || ""}x${op.height || ""}`);
          break;

        default:
          break;
      }
    }

    if (outputQuality && ["jpeg", "jpg", "webp"].includes(outputFormat)) {
      args.push("-quality", String(outputQuality));
    }

    args.push(outputPath);

    await execFileAsync("convert", args, {
      timeout: MAGICK_TIMEOUT_MS,
      maxBuffer: 50 * 1024 * 1024,
    });

    const buffer = await readFile(outputPath);

    const MIME_MAP = {
      jpeg: "image/jpeg",
      jpg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      ico: "image/x-icon",
      tiff: "image/tiff",
      bmp: "image/bmp",
    };

    return {
      buffer,
      mimeType: MIME_MAP[outputFormat] || "image/png",
    };
  } finally {
    // Clean up temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Process an image through a pipeline of operations.
 * Automatically routes to Sharp or ImageMagick based on the
 * operation types requested.
 *

 * @param {string} params.input - URL, base64 data URI, or ephemeral store ID
 * @param {Array<object>} params.operations - Array of operations to apply


 * @param {import("../utilities.js").EphemeralStore} params.store - Ephemeral store for ID lookups
 * @returns {Promise<{buffer: Buffer|null, mimeType: string|null, metadata?: object}>}
 */
export async function processImage({ input, operations, outputFormat = "png", outputQuality = 80, store }) {
  if (!operations || !Array.isArray(operations) || operations.length === 0) {
    throw new Error("'operations' must be a non-empty array of operation objects");
  }

  // Validate all operation types
  const VALID_OPS = new Set([
    "resize", "crop", "rotate", "flip", "blur", "sharpen",
    "grayscale", "negate", "tint", "adjust", "gamma", "trim",
    "extend", "composite", "metadata",
    "text", "distort", "border", "ico",
  ]);
  for (const op of operations) {
    if (!op.type) throw new Error("Each operation must have a 'type' field");
    if (!VALID_OPS.has(op.type)) {
      throw new Error(
        `Unknown operation type: '${op.type}'. Valid: ${[...VALID_OPS].join(", ")}`,
      );
    }
  }

  // Resolve input to buffer
  const inputBuffer = await resolveInput(input, store);

  // Determine which engine to use
  const needsMagick = operations.some((op) => MAGICK_OPERATIONS.has(op.type));

  // If we have a mix of Sharp and Magick operations, run Sharp first then Magick
  if (needsMagick) {
    const sharpOps = operations.filter((op) => !MAGICK_OPERATIONS.has(op.type));
    const magickOps = operations.filter((op) => MAGICK_OPERATIONS.has(op.type));

    let buffer = inputBuffer;

    // Run Sharp operations first if any
    if (sharpOps.length > 0) {
      const sharpResult = await processWithSharp(buffer, sharpOps, "png", 100);
      if (sharpResult.buffer) buffer = sharpResult.buffer;
    }

    // Then run Magick operations
    const result = await processWithMagick(buffer, magickOps, outputFormat, outputQuality);
    return result;
  }

  // Pure Sharp pipeline
  return processWithSharp(inputBuffer, operations, outputFormat, outputQuality);
}

/**
 * Check if ImageMagick is available on the system.
 * @returns {Promise<{available: boolean, version?: string}>}
 */
export async function checkMagickAvailability() {
  try {
    const { stdout } = await execFileAsync("convert", ["--version"], { timeout: 5_000 });
    const versionMatch = stdout.match(/ImageMagick\s+([\d.]+)/);
    return { available: true, version: versionMatch?.[1] || "unknown" };
  } catch {
    return { available: false };
  }
}
