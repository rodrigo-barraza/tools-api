// ─── OCR: image → verbatim text ──────────────────────────────
// tesseract.js (https://github.com/naptha/tesseract.js) — Tesseract compiled
// to WASM, CPU-only, 100+ languages with word-level bounding boxes. This is
// the free local tier; hard cases (dense tables, handwriting, math) can
// later route to olmOCR (https://github.com/allenai/olmocr) on the vLLM box.
// Complements describe_image (semantic, paid VLM) with verbatim extraction.

import { createWorker } from "tesseract.js";
import sharp from "sharp";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveInput, type ImageStore } from "./ImageService.ts";

const MAX_TEXT_CHARS = 20_000;
// Language packs (~11 MB each) download on first use and persist here.
const TRAINEDDATA_CACHE = join(tmpdir(), "prism-tesseract-cache");
// Guards against junk language codes reaching the traineddata downloader.
const LANG_CODE_PATTERN = /^[a-z_]{3,15}(\+[a-z_]{3,15})*$/;

export interface ReadImageTextInput {
  input: string;
  lang?: string;
  annotate?: boolean;
  store?: ImageStore;
}

export interface OcrWordBox {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface ReadImageTextResult {
  text: string;
  confidence: number;
  wordCount: number;
  truncated?: boolean;
  /** Source image with word boxes drawn on — only when annotate=true. */
  annotatedImage?: Buffer;
}

/**
 * Extract verbatim text from an image. Returns overall confidence (0-100)
 * so callers can judge whether a retry with a sharper crop is warranted.
 */
export async function readImageText({
  input,
  lang = "eng",
  annotate = false,
  store,
}: ReadImageTextInput): Promise<ReadImageTextResult> {
  const languages = String(lang).toLowerCase().trim();
  if (!LANG_CODE_PATTERN.test(languages)) {
    throw new Error(
      "'lang' must be Tesseract language code(s) like 'eng', 'fra', 'deu', 'jpn', or 'eng+fra'",
    );
  }

  const imageBuffer = await resolveInput(input, store);

  const worker = await createWorker(languages.split("+"), 1, {
    cachePath: TRAINEDDATA_CACHE,
  });
  try {
    const { data } = await worker.recognize(
      imageBuffer,
      {},
      { blocks: annotate },
    );

    let text = (data.text ?? "").trim();
    const truncated = text.length > MAX_TEXT_CHARS;
    if (truncated) text = text.slice(0, MAX_TEXT_CHARS);

    // Word boxes come nested under blocks → paragraphs → lines → words
    const words: OcrWordBox[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) {
            words.push({
              text: word.text,
              confidence: word.confidence,
              bbox: word.bbox,
            });
          }
        }
      }
    }

    let annotatedImage: Buffer | undefined;
    if (annotate && words.length > 0) {
      annotatedImage = await drawWordBoxes(imageBuffer, words);
    }

    return {
      text,
      confidence: Math.round(data.confidence ?? 0),
      wordCount: text.length === 0 ? 0 : text.split(/\s+/).length,
      ...(truncated && { truncated: true }),
      ...(annotatedImage && { annotatedImage }),
    };
  } finally {
    await worker.terminate().catch(() => {});
  }
}

/** Overlay word bounding boxes on the source image (visual verification). */
async function drawWordBoxes(
  imageBuffer: Buffer,
  words: OcrWordBox[],
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error("Could not read image dimensions");

  const rects = words
    .map((word) => {
      const { x0, y0, x1, y1 } = word.bbox;
      const stroke = word.confidence >= 70 ? "#22c55e" : "#f59e0b";
      return `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="${stroke}" stroke-width="2"/>`;
    })
    .join("");
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${rects}</svg>`,
  );

  return sharp(imageBuffer)
    .composite([{ input: overlay }])
    .png()
    .toBuffer();
}
