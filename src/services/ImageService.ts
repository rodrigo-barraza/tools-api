// ─── Hybrid Sharp + ImageMagick Engine ──────────────────────

import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import crypto from "node:crypto";
import type { ImageOperation } from "../types/image.ts";
import { validatePath } from "./AgenticFileService.ts";

const execFileAsync = promisify(execFile);

export interface ImageStoreEntry {
  buffer: Buffer;
  mimeType?: string;
}

export interface ImageStore {
  get(id: string): ImageStoreEntry | null | undefined;
}

interface ProcessImageInput {
  input: string;
  operations: ImageOperation[];
  outputFormat?: string;
  outputQuality?: number;
  store?: ImageStore;
}

// ─── Constants ─────────────────────────────────────────────────

const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_DIMENSION = 8192;
const MAGICK_TIMEOUT_MS = 30_000;

/** Operations routed to ImageMagick instead of Sharp */
const MAGICK_OPERATIONS = new Set(["text", "distort", "border", "ico"]);

// ─── Input Resolution ──────────────────────────────────────────

/**
 * Resolve an input source to a Sharp-compatible buffer.
 * Supports: URL, base64 data URI, previous imageId, or local workspace paths.
 */
async function resolveInput(input: string, store?: ImageStore) {
  if (!input || typeof input !== "string") {
    throw new Error(
      "'input' is required (URL, base64 data URI, local path, or previous imageId)",
    );
  }

  // ── Data URI ──────────────────────────────────────────────
  if (input.startsWith("data:")) {
    const match = input.match(/^data:[^;]+;base64,(.+)$/s);
    if (!match)
      throw new Error(
        "Invalid data URI format. Expected: data:<mime>;base64,<data>",
      );
    const imageBuffer = Buffer.from(match[1], "base64");
    if (imageBuffer.length > MAX_INPUT_BYTES) {
      throw new Error(
        `Input image exceeds ${MAX_INPUT_BYTES / 1024 / 1024} MB limit`,
      );
    }
    return imageBuffer;
  }

  // ── URL ───────────────────────────────────────────────────
  if (input.startsWith("http://") || input.startsWith("https://")) {
    const response = await fetch(input, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch image from URL: HTTP ${response.status}`,
      );
    }
    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
    );
    if (contentLength > MAX_INPUT_BYTES) {
      throw new Error(
        `Remote image exceeds ${MAX_INPUT_BYTES / 1024 / 1024} MB limit`,
      );
    }
    const arrayBuf = await response.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  // ── Ephemeral Store ID ────────────────────────────────────
  if (store) {
    const entry = store.get(input);
    if (entry?.buffer) return entry.buffer;
  }

  // ── Local File Path (absolute path or file:// URL) ──────────
  let diskPath = input;
  if (input.startsWith("file://")) {
    diskPath = decodeURIComponent(input.replace(/^file:\/\/\/?/, "/"));
  }

  if (diskPath.startsWith("/") || !/^[A-Za-z]+:\/\//.test(input)) {
    const validation = validatePath(diskPath);
    if (validation.safe && validation.resolved) {
      try {
        const buffer = await readFile(validation.resolved);
        return buffer;
      } catch (error: unknown) {
        throw new Error(`Failed to read local image file: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      throw new Error(`Local path validation failed: ${validation.error}`);
    }
  }

  throw new Error(
    "Invalid input: must be a URL (http/https), base64 data URI (data:image/...;base64,...), " +
      "local workspace path, or a previous imageId from a prior manipulate_image call.",
  );
}

// ─── Sharp Engine ──────────────────────────────────────────────

/**
 * Apply a pipeline of Sharp-based operations to an image buffer.


 */
async function processWithSharp(
  inputBuffer: Buffer,
  operations: ImageOperation[],
  outputFormat: string,
  outputQuality: number,
) {
  let pipeline = sharp(inputBuffer, {
    failOn: "none",
    limitInputPixels: MAX_DIMENSION * MAX_DIMENSION,
  });
  let metadataResult: Record<string, unknown> | null = null;

  for (const operation of operations) {
    switch (operation.type) {
      case "resize": {
        const options: Record<string, unknown> = {};
        if (operation.width) options.width = Math.min(operation.width, MAX_DIMENSION);
        if (operation.height) options.height = Math.min(operation.height, MAX_DIMENSION);
        if (operation.fit) options.fit = operation.fit;
        if (operation.background) options.background = operation.background;
        if (operation.withoutEnlargement !== undefined)
          options.withoutEnlargement = operation.withoutEnlargement;
        pipeline = pipeline.resize(options);
        break;
      }

      case "crop": {
        if (!operation.width || !operation.height)
          throw new Error("crop requires 'width' and 'height'");
        pipeline = pipeline.extract({
          left: operation.left || 0,
          top: operation.top || 0,
          width: Math.min(operation.width, MAX_DIMENSION),
          height: Math.min(operation.height, MAX_DIMENSION),
        });
        break;
      }

      case "rotate":
        pipeline = pipeline.rotate(operation.angle || 0, {
          background: operation.background || { r: 0, g: 0, b: 0, alpha: 0 },
        });
        break;

      case "flip":
        if (operation.direction === "horizontal") {
          pipeline = pipeline.flop();
        } else {
          pipeline = pipeline.flip();
        }
        break;

      case "blur":
        pipeline = pipeline.blur(Math.min(Math.max(operation.sigma || 3, 0.3), 100));
        break;

      case "sharpen":
        pipeline = pipeline.sharpen({
          sigma: operation.sigma || 1,
          ...(operation.flat !== undefined && { flat: operation.flat }),
          ...(operation.jagged !== undefined && { jagged: operation.jagged }),
        });
        break;

      case "grayscale":
        pipeline = pipeline.grayscale();
        break;

      case "negate":
        pipeline = pipeline.negate();
        break;

      case "tint":
        if (operation.color) pipeline = pipeline.tint(operation.color);
        break;

      case "adjust":
        pipeline = pipeline.modulate({
          ...(operation.brightness !== undefined && { brightness: operation.brightness }),
          ...(operation.saturation !== undefined && { saturation: operation.saturation }),
          ...(operation.hue !== undefined && { hue: operation.hue }),
          ...(operation.lightness !== undefined && { lightness: operation.lightness }),
        });
        break;

      case "gamma":
        pipeline = pipeline.gamma(operation.value || 2.2);
        break;

      case "trim":
        pipeline = pipeline.trim({ threshold: operation.threshold || 10 });
        break;

      case "extend": {
        const extendOptions: Record<string, unknown> = {
          top: operation.top || 0,
          right: operation.right || 0,
          bottom: operation.bottom || 0,
          left: operation.left || 0,
        };
        if (operation.background) extendOptions.background = operation.background;
        pipeline = pipeline.extend(extendOptions);
        break;
      }

      case "composite": {
        if (!operation.overlayUrl) throw new Error("composite requires 'overlayUrl'");
        const overlayBuf = await resolveInput(operation.overlayUrl, undefined);
        const compositeOpts: Record<string, unknown> = { input: overlayBuf };
        if (operation.gravity) compositeOpts.gravity = operation.gravity;
        if (operation.blend) compositeOpts.blend = operation.blend;
        if (operation.left !== undefined && operation.top !== undefined) {
          compositeOpts.left = operation.left;
          compositeOpts.top = operation.top;
        }
        pipeline = pipeline.composite([compositeOpts]);
        break;
      }

      case "metadata": {
        const metadata = await sharp(inputBuffer).metadata();
        // Strip buffer-based properties and convert to plain object
        const {
          icc: _icc,
          iptc: _iptc,
          xmp: _xmp,
          exif: _exif,
          tifftagPhotoshop: _tiffPs,
          ...cleanMetadata
        } = metadata;
        metadataResult = cleanMetadata;
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
  const formatOpts: Record<string, unknown> = {};
  if (outputQuality && ["jpeg", "webp", "avif", "tiff"].includes(format)) {
    formatOpts.quality = Math.min(Math.max(outputQuality, 1), 100);
  }

  pipeline = pipeline.toFormat(format as keyof sharp.FormatEnum, formatOpts);
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
    mimeType: MIME_MAP[format as keyof typeof MIME_MAP] || "image/png",
    ...(metadataResult && { metadata: metadataResult }),
  };
}

// ─── ImageMagick Engine ────────────────────────────────────────

/**
 * Apply ImageMagick-based operations via the `convert` CLI.
 * Used for operations Sharp can't handle natively.
 */
async function processWithMagick(
  inputBuffer: Buffer,
  operations: ImageOperation[],
  outputFormat: string,
  outputQuality: number,
) {
  const magickProcessId = crypto.randomUUID().slice(0, 12);
  const inputPath = join(tmpdir(), `img-in-${magickProcessId}`);
  const outputPath = join(tmpdir(), `img-out-${magickProcessId}.${outputFormat || "png"}`);

  try {
    await writeFile(inputPath, inputBuffer);

    const args = [inputPath];

    for (const operation of operations) {
      switch (operation.type) {
        case "text": {
          if (!operation.content) throw new Error("text requires 'content'");
          const textArgs: string[] = [];
          textArgs.push("-gravity", operation.gravity || "south");
          textArgs.push("-font", operation.font || "Liberation-Sans");
          textArgs.push("-pointsize", String(operation.fontSize || 32));
          textArgs.push("-fill", operation.color || "white");
          if (operation.strokeColor) {
            textArgs.push("-stroke", operation.strokeColor);
            textArgs.push("-strokewidth", String(operation.strokeWidth || 2));
          }
          if (operation.x !== undefined || operation.y !== undefined) {
            textArgs.push(
              "-annotate",
              `+${operation.x || 0}+${operation.y || 0}`,
              operation.content as string,
            );
          } else {
            textArgs.push("-annotate", "+0+20", operation.content as string);
          }
          args.push(...textArgs);
          break;
        }

        case "distort": {
          if (!operation.effect) throw new Error("distort requires 'effect'");
          switch (operation.effect) {
            case "swirl":
              args.push("-swirl", String(operation.degrees || 90));
              break;
            case "wave":
              args.push(
                "-wave",
                `${operation.amplitude || 10}x${operation.wavelength || 100}`,
              );
              break;
            case "implode":
              args.push("-implode", String(operation.factor || 0.5));
              break;
            case "barrel":
              args.push("-distort", "Barrel", operation.params || "0.0 0.0 -0.3 1.3");
              break;
            default:
              throw new Error(
                `Unknown distort effect: ${operation.effect}. Use: swirl, wave, implode, barrel`,
              );
          }
          break;
        }

        case "border":
          args.push("-bordercolor", operation.color || "#000000");
          args.push("-border", `${operation.width || 5}`);
          break;

        case "resize":
          args.push("-resize", `${operation.width || ""}x${operation.height || ""}`);
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
      mimeType: MIME_MAP[outputFormat as keyof typeof MIME_MAP] || "image/png",
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
 */
export async function processImage({
  input,
  operations,
  outputFormat = "png",
  outputQuality = 80,
  store,
}: ProcessImageInput) {
  if (!operations || !Array.isArray(operations) || operations.length === 0) {
    throw new Error(
      "'operations' must be a non-empty array of operation objects",
    );
  }

  // Validate all operation types
  const VALID_OPS = new Set([
    "resize",
    "crop",
    "rotate",
    "flip",
    "blur",
    "sharpen",
    "grayscale",
    "negate",
    "tint",
    "adjust",
    "gamma",
    "trim",
    "extend",
    "composite",
    "metadata",
    "text",
    "distort",
    "border",
    "ico",
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
    const result = await processWithMagick(
      buffer,
      magickOps,
      outputFormat,
      outputQuality,
    );
    return result;
  }

  // Pure Sharp pipeline
  return processWithSharp(inputBuffer, operations, outputFormat, outputQuality);
}

/**
 * Check if ImageMagick is available on the system.
 */
export async function checkMagickAvailability() {
  try {
    const { stdout } = await execFileAsync("convert", ["--version"], {
      timeout: 5_000,
    });
    const versionMatch = stdout.match(/ImageMagick\s+([\d.]+)/);
    return { available: true, version: versionMatch?.[1] || "unknown" };
  } catch {
    return { available: false };
  }
}

export interface ConvertToAsciiInput {
  input: string;
  width?: number;
  chars?: string;
  contrast?: number;
  reverse?: boolean;
  colorMode?: "plain" | "ansi" | "html";
  store?: ImageStore;
}

export interface AsciiPixel {
  char: string;
  hex: string;
  brightness: number;
}

export interface ConvertToAsciiResult {
  ascii: string;
  ansi: string;
  width: number;
  height: number;
  pixels: AsciiPixel[][];
}

/**
 * Convert an image (URL, base64, or imageId) to ASCII art using high-fidelity luminance mapping.
 * Supports custom character gradients, color modes, contrast, and inversion.
 */
export async function convertToAscii({
  input,
  width = 100,
  chars,
  contrast = 1.0,
  reverse = false,
  store,
}: ConvertToAsciiInput): Promise<ConvertToAsciiResult> {
  const inputBuffer = await resolveInput(input, store);
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Invalid or unsupported image dimensions");
  }

  // Width safety checks (min: 10, max: 250 to keep it printable and clean)
  const charWidth = Math.min(Math.max(width, 10), 250);

  // Monospace font character aspect ratio is ~0.55 (height > width)
  const fontAspectRatio = 0.55;
  const aspectRatio = metadata.width / metadata.height;
  const charHeight = Math.round(charWidth / (aspectRatio * fontAspectRatio));

  // Resize and extract raw RGB pixels
  const { data, info } = await image
    .resize(charWidth, charHeight, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const charSet =
    chars ||
    "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ";
  const charSetLength = charSet.length;

  let asciiStr = "";
  let ansiStr = "";
  const pixels: AsciiPixel[][] = [];

  for (let y = 0; y < info.height; y++) {
    const row: AsciiPixel[] = [];
    for (let x = 0; x < info.width; x++) {
      const pixelIndex = (y * info.width + x) * channels;
      const r = data[pixelIndex];
      const g = data[pixelIndex + 1];
      const b = data[pixelIndex + 2];

      // Relative luminance formula
      let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      if (contrast !== 1.0) {
        brightness = 128 + (brightness - 128) * contrast;
        brightness = Math.min(Math.max(brightness, 0), 255);
      }

      // Map to character index (inverted standard mapping: 0 -> dark, 255 -> light)
      let characterIndex = Math.floor((brightness / 255) * (charSetLength - 1));
      if (reverse) {
        characterIndex = charSetLength - 1 - characterIndex;
      }
      const char = charSet[characterIndex];

      asciiStr += char;
      ansiStr += `\x1b[38;2;${r};${g};${b}m${char}`;

      const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      row.push({ char, hex, brightness });
    }
    asciiStr += "\n";
    ansiStr += "\x1b[0m\n";
    pixels.push(row);
  }

  return {
    ascii: asciiStr,
    ansi: ansiStr,
    width: info.width,
    height: info.height,
    pixels,
  };
}
