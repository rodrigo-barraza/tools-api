// ─── Hybrid Sharp + ImageMagick Engine ──────────────────────

import sharp from "sharp";
import { getErrorMessage } from "@rodrigo-barraza/utilities-library";
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

export type TransformedImageMetadata = Omit<sharp.Metadata, "icc" | "iptc" | "xmp" | "exif" | "tifftagPhotoshop">;

export interface TransformedImageResult {
  buffer: Buffer | null;
  mimeType: string | null;
  metadata?: TransformedImageMetadata;
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
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
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
        throw new Error(`Failed to read local image file: ${getErrorMessage(error)}`);
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
): Promise<TransformedImageResult> {
  let pipeline = sharp(inputBuffer, {
    failOn: "none",
    limitInputPixels: MAX_DIMENSION * MAX_DIMENSION,
  });
  let metadataResult: TransformedImageMetadata | null = null;

  for (const operation of operations) {
    switch (operation.type) {
      case "resize": {
        const options: sharp.ResizeOptions = {};
        if (operation.width) options.width = Math.min(operation.width, MAX_DIMENSION);
        if (operation.height) options.height = Math.min(operation.height, MAX_DIMENSION);
        if (operation.fit) {
          options.fit = operation.fit as keyof sharp.FitEnum;
        }
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
        const extendOptions: sharp.ExtendOptions = {
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
        const compositeOpts: sharp.OverlayOptions = { input: overlayBuf };
        if (operation.gravity) {
          compositeOpts.gravity = operation.gravity;
        }
        if (operation.blend) {
          compositeOpts.blend = operation.blend as sharp.Blend;
        }
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
  const formatOpts: sharp.OutputOptions & { quality?: number } = {};
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
): Promise<TransformedImageResult> {
  const magickProcessId = crypto.randomUUID().slice(0, 12);
  const inputPath = join(tmpdir(), `img-in-${magickProcessId}`);
  const outputPath = join(tmpdir(), `img-out-${magickProcessId}.${outputFormat || "png"}`);

  try {
    await writeFile(inputPath, inputBuffer);

    const commandArguments = [inputPath];

    for (const operation of operations) {
      switch (operation.type) {
        case "text": {
          if (!operation.content) throw new Error("text requires 'content'");
          const textArguments: string[] = [];
          textArguments.push("-gravity", operation.gravity || "south");
          textArguments.push("-font", operation.font || "Liberation-Sans");
          textArguments.push("-pointsize", String(operation.fontSize || 32));
          textArguments.push("-fill", operation.color || "white");
          if (operation.strokeColor) {
            textArguments.push("-stroke", operation.strokeColor);
            textArguments.push("-strokewidth", String(operation.strokeWidth || 2));
          }
          if (operation.x !== undefined || operation.y !== undefined) {
            textArguments.push(
              "-annotate",
              `+${operation.x || 0}+${operation.y || 0}`,
              operation.content as string,
            );
          } else {
            textArguments.push("-annotate", "+0+20", operation.content as string);
          }
          commandArguments.push(...textArguments);
          break;
        }

        case "distort": {
          if (!operation.effect) throw new Error("distort requires 'effect'");
          switch (operation.effect) {
            case "swirl":
              commandArguments.push("-swirl", String(operation.degrees || 90));
              break;
            case "wave":
              commandArguments.push(
                "-wave",
                `${operation.amplitude || 10}x${operation.wavelength || 100}`,
              );
              break;
            case "implode":
              commandArguments.push("-implode", String(operation.factor || 0.5));
              break;
            case "barrel":
              commandArguments.push("-distort", "Barrel", operation.params || "0.0 0.0 -0.3 1.3");
              break;
            default:
              throw new Error(
                `Unknown distort effect: ${operation.effect}. Use: swirl, wave, implode, barrel`,
              );
          }
          break;
        }

        case "border":
          commandArguments.push("-bordercolor", operation.color || "#000000");
          commandArguments.push("-border", `${operation.width || 5}`);
          break;

        case "resize":
          commandArguments.push("-resize", `${operation.width || ""}x${operation.height || ""}`);
          break;

        default:
          break;
      }
    }

    if (outputQuality && ["jpeg", "jpg", "webp"].includes(outputFormat)) {
      commandArguments.push("-quality", String(outputQuality));
    }

    commandArguments.push(outputPath);

    await execFileAsync("convert", commandArguments, {
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
  for (const operationItem of operations) {
    if (!operationItem.type) throw new Error("Each operation must have a 'type' field");
    if (!VALID_OPS.has(operationItem.type)) {
      throw new Error(
        `Unknown operation type: '${operationItem.type}'. Valid: ${[...VALID_OPS].join(", ")}`,
      );
    }
  }

  const VALID_OUTPUT_FORMATS = new Set([
    "png", "jpeg", "jpg", "webp", "avif", "tiff", "gif", "ico",
  ]);
  if (outputFormat && !VALID_OUTPUT_FORMATS.has(outputFormat)) {
    throw new Error(
      `Invalid outputFormat '${outputFormat}'. Valid: ${[...VALID_OUTPUT_FORMATS].join(", ")}`,
    );
  }
  if (outputQuality !== undefined && outputQuality !== null) {
    const qualityValue = Number(outputQuality);
    if (isNaN(qualityValue) || qualityValue < 1 || qualityValue > 100) {
      throw new Error(
        `Invalid outputQuality ${outputQuality}. Must be a number between 1 and 100`,
      );
    }
  }

  // Resolve input to buffer
  const inputBuffer = await resolveInput(input, store);

  // Determine which engine to use
  const needsMagick = operations.some((operation) => MAGICK_OPERATIONS.has(operation.type));

  // If we have a mix of Sharp and Magick operations, run Sharp first then Magick
  if (needsMagick) {
    const sharpOperations = operations.filter((operation) => !MAGICK_OPERATIONS.has(operation.type));
    const magickOperations = operations.filter((operation) => MAGICK_OPERATIONS.has(operation.type));

    let buffer = inputBuffer;

    // Run Sharp operations first if any
    if (sharpOperations.length > 0) {
      const sharpResult = await processWithSharp(buffer, sharpOperations, "png", 100);
      if (sharpResult.buffer) buffer = sharpResult.buffer;
    }

    // Then run Magick operations
    const result = await processWithMagick(
      buffer,
      magickOperations,
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

// ─── Chromakey Background Removal ──────────────────────────────
// Image models (Gemini/Nano Banana) can't output an alpha channel.
// Cut-outs are recovered by generating on a pure #00FF00 background
// and keying it out in HSV space. Technique per philschmid.de/generate-stickers.

export interface ChromakeyResult {
  buffer: Buffer;
  /** True when enough background was detected for the cut-out to be trustworthy */
  keyed: boolean;
  /** Fraction of pixels removed as background (0..1) */
  backgroundFraction: number;
}

/** HSV green window: hue 90-150° at meaningful saturation/brightness */
function isChromaGreen(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max !== g) return false;
  const value = max / 255;
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < 0.55 || value < 0.45) return false;
  const hue = 60 * (2 + (b - r) / (max - min));
  return hue >= 90 && hue <= 150;
}

/** Grow a binary mask by one pixel (8-neighborhood) per iteration */
function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  iterations: number,
) {
  let current = mask;
  for (let iteration = 0; iteration < iterations; iteration++) {
    const next = new Uint8Array(current);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (current[index]) continue;
        neighborScan: for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
            if (current[ny * width + nx]) {
              next[index] = 1;
              break neighborScan;
            }
          }
        }
      }
    }
    current = next;
  }
  return current;
}

/** Minimum share of keyed pixels for the result to count as a real cut-out */
const CHROMAKEY_MIN_BACKGROUND_FRACTION = 0.03;

/**
 * Remove a chromakey-green background, producing a PNG with real alpha.
 * The green mask is dilated one pixel to swallow anti-aliased fringe, and
 * a despill pass strips the green halo from edge pixels next to the cut.
 */
export async function removeChromakeyBackground(
  input: Buffer,
): Promise<ChromakeyResult> {
  const { data, info } = await sharp(input, {
    failOn: "none",
    limitInputPixels: MAX_DIMENSION * MAX_DIMENSION,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pixelCount = width * height;

  const rawMask = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index++) {
    const offset = index * 4;
    if (isChromaGreen(data[offset], data[offset + 1], data[offset + 2])) {
      rawMask[index] = 1;
    }
  }

  const mask = dilateMask(rawMask, width, height, 1);

  // Despill: edge pixels just outside the cut keep their alpha but lose
  // the green cast blended in by anti-aliasing
  const despillZone = dilateMask(mask, width, height, 2);
  let removedCount = 0;
  for (let index = 0; index < pixelCount; index++) {
    const offset = index * 4;
    if (mask[index]) {
      data[offset + 3] = 0;
      removedCount++;
    } else if (despillZone[index]) {
      const spillCeiling = Math.max(data[offset], data[offset + 2]);
      if (data[offset + 1] > spillCeiling) data[offset + 1] = spillCeiling;
    }
  }

  const backgroundFraction = removedCount / pixelCount;
  const buffer = await sharp(data, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();

  return {
    buffer,
    keyed: backgroundFraction >= CHROMAKEY_MIN_BACKGROUND_FRACTION,
    backgroundFraction,
  };
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
  character: string;
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
  chars: customCharacterSet,
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

  if (width !== undefined && (typeof width !== "number" || width < 10 || width > 250)) {
    throw new Error(`Invalid width ${width}. Must be a number between 10 and 250`);
  }

  if (contrast !== undefined && (typeof contrast !== "number" || contrast < 0.1 || contrast > 10.0)) {
    throw new Error(`Invalid contrast ${contrast}. Must be a number between 0.1 and 10.0`);
  }

  // Width safety checks (min: 10, max: 250 to keep it printable and clean)
  const characterWidth = width;

  // Monospace font character aspect ratio is ~0.55 (height > width)
  const fontAspectRatio = 0.55;
  const aspectRatio = metadata.width / metadata.height;
  const characterHeight = Math.round(characterWidth / (aspectRatio * fontAspectRatio));

  // Resize and extract raw RGB pixels
  const { data, info } = await image
    .resize(characterWidth, characterHeight, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const characterSet =
    customCharacterSet ||
    "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ";
  const characterSetLength = characterSet.length;

  let asciiString = "";
  let ansiString = "";
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
      let characterIndex = Math.floor((brightness / 255) * (characterSetLength - 1));
      if (reverse) {
        characterIndex = characterSetLength - 1 - characterIndex;
      }
      const character = characterSet[characterIndex];

      asciiString += character;
      ansiString += `\x1b[38;2;${r};${g};${b}m${character}`;

      const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      row.push({ character, hex, brightness });
    }
    asciiString += "\n";
    ansiString += "\x1b[0m\n";
    pixels.push(row);
  }

  return {
    ascii: asciiString,
    ansi: ansiString,
    width: info.width,
    height: info.height,
    pixels,
  };
}

// ─── Barcode / QR Decoding ─────────────────────────────────────
// zxing-wasm (ZXing-C++ compiled to WASM, https://github.com/Sec-ant/zxing-wasm)
// decodes QR / Aztec / DataMatrix / PDF417 and 1D EAN/UPC/Code128/39 codes
// from encoded image bytes — fully local, no external service. The inverse
// of generate_qr_code.

export interface DecodedBarcode {
  text: string;
  format: string;
  isValid: boolean;
}

export interface ScanBarcodesInput {
  input: string;
  store?: ImageStore;
}

const MAX_BARCODE_SYMBOLS = 8;

// Node can't fetch() the module's wasm from disk, so hand the binary over
// once via prepareZXingModule and reuse the initialized module thereafter.
let zxingReaderPromise: Promise<typeof import("zxing-wasm/reader")> | null = null;

function getZXingReader() {
  if (!zxingReaderPromise) {
    zxingReaderPromise = (async () => {
      const reader = await import("zxing-wasm/reader");
      const { createRequire } = await import("node:module");
      const { dirname, basename } = await import("node:path");
      const require = createRequire(import.meta.url);
      // The package's exports map blocks './package.json', so walk up from
      // the resolvable reader module to the package root.
      let packageRoot = dirname(require.resolve("zxing-wasm/reader"));
      while (packageRoot !== "/" && basename(packageRoot) !== "zxing-wasm") {
        packageRoot = dirname(packageRoot);
      }
      const wasmBinary = await readFile(
        join(packageRoot, "dist", "reader", "zxing_reader.wasm"),
      );
      reader.prepareZXingModule({
        overrides: { wasmBinary: wasmBinary.buffer as ArrayBuffer },
        fireImmediately: true,
      });
      return reader;
    })();
    // Allow a retry on failure instead of caching a rejected promise forever
    zxingReaderPromise.catch(() => {
      zxingReaderPromise = null;
    });
  }
  return zxingReaderPromise;
}

/**
 * Decode all barcodes/QR codes in an image (URL, data URI, imageId, or
 * local workspace path). Returns decoded symbols in reading order.
 */
export async function scanImageBarcodes({
  input,
  store,
}: ScanBarcodesInput): Promise<{ barcodes: DecodedBarcode[] }> {
  const buffer = await resolveInput(input, store);
  const reader = await getZXingReader();

  // Copy into a standalone ArrayBuffer — a Buffer's backing store may be a
  // shared pool slab with a nonzero offset, which zxing would misread.
  const bytes = new Uint8Array(buffer);
  const results = await reader.readBarcodes(bytes.buffer as ArrayBuffer, {
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    maxNumberOfSymbols: MAX_BARCODE_SYMBOLS,
  });

  const decoded = results.map((result) => ({
    text: result.text,
    format: String(result.format),
    isValid: result.isValid,
  }));

  // Prefer clean reads; only surface invalid/partial symbols when nothing
  // decoded cleanly (they can still hint at a damaged code's presence).
  const valid = decoded.filter((barcode) => barcode.isValid);
  return { barcodes: valid.length > 0 ? valid : decoded };
}
