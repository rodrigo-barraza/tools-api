// ─── VectorAnimationRenderService ────────────────────────────
// Server-side rendering for the vector animation tool: deterministic frame
// capture via the shared Playwright browser (the embed player exposes
// window.__vaRenderAt), filmstrip snapshots for agent self-inspection, and
// mp4/gif export via ffmpeg. The same player code that renders in the user's
// browser renders these frames, so what the agent inspects is exactly what
// the user sees.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import sharp from "sharp";
import { getSharedBrowser } from "./AgenticBrowserService.ts";
import CONFIG from "../config.ts";
import logger from "../logger.ts";

const executeFileAsynchronously = promisify(execFile);

const FRAME_RENDER_TIMEOUT_MS = 30_000;
const ENCODE_TIMEOUT_MS = 90_000;

/** Filmstrip geometry: fixed tile height, labels underneath. */
const TILE_HEIGHT = 240;
const TILE_GAP = 4;
const LABEL_BAR_HEIGHT = 26;

/**
 * Render the animation at the given times and return one PNG buffer per
 * time. `embedHtml` must be built with mode {headless: true} so the player
 * skips autoplay and exposes the __vaRenderAt/__vaReady hooks.
 */
export async function renderAnimationFrames(
  embedHtml: string,
  times: number[],
): Promise<Buffer[]> {
  const browser = await getSharedBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(FRAME_RENDER_TIMEOUT_MS);
    await page.setContent(embedHtml, { waitUntil: "load" });
    await page.evaluate(() => (window as unknown as { __vaReady: Promise<boolean> }).__vaReady);

    const frames: Buffer[] = [];
    for (const time of times) {
      const dataUrl = await page.evaluate(
        (frameTime) => (window as unknown as { __vaRenderAt: (t: number) => string }).__vaRenderAt(frameTime),
        time,
      );
      const base64 = String(dataUrl).replace(/^data:image\/png;base64,/, "");
      frames.push(Buffer.from(base64, "base64"));
    }
    return frames;
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Compose frames into a single horizontal filmstrip PNG with a timestamp
 * label under each tile — one image an agent can pass to describe_image to
 * inspect its animation across time.
 */
export async function buildFilmstripImage(
  frames: Buffer[],
  times: number[],
): Promise<Buffer> {
  if (frames.length === 0) throw new Error("No frames to compose");

  const firstMetadata = await sharp(frames[0]).metadata();
  const frameWidth = firstMetadata.width || 800;
  const frameHeight = firstMetadata.height || 600;
  const tileWidth = Math.max(1, Math.round((frameWidth * TILE_HEIGHT) / frameHeight));

  const stripWidth = frames.length * tileWidth + (frames.length - 1) * TILE_GAP;
  const stripHeight = TILE_HEIGHT + LABEL_BAR_HEIGHT;

  const tiles = await Promise.all(
    frames.map(async (frame, index) => ({
      input: await sharp(frame).resize({ width: tileWidth, height: TILE_HEIGHT, fit: "fill" }).png().toBuffer(),
      left: index * (tileWidth + TILE_GAP),
      top: 0,
    })),
  );

  const labelSvg = Buffer.from(
    `<svg width="${stripWidth}" height="${stripHeight}" xmlns="http://www.w3.org/2000/svg">` +
      times
        .map((time, index) => {
          const centerX = index * (tileWidth + TILE_GAP) + tileWidth / 2;
          return `<text x="${centerX}" y="${TILE_HEIGHT + 18}" text-anchor="middle" font-family="monospace" font-size="13" fill="#e2e8f0">t=${time.toFixed(2)}s</text>`;
        })
        .join("") +
      `</svg>`,
  );

  return sharp({
    create: {
      width: stripWidth,
      height: stripHeight,
      channels: 4,
      background: { r: 15, g: 23, b: 42, alpha: 1 },
    },
  })
    .composite([...tiles, { input: labelSvg, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

export interface EncodedAnimationVideo {
  buffer: Buffer;
  mimeType: string;
  format: "mp4" | "gif";
}

/**
 * Encode a PNG frame sequence into mp4 (H.264) or gif (two-pass palette).
 */
export async function encodeAnimationVideo(
  frames: Buffer[],
  fps: number,
  format: "mp4" | "gif",
): Promise<EncodedAnimationVideo> {
  if (frames.length === 0) throw new Error("No frames to encode");

  const ffmpegBinaryPath = CONFIG.FFMPEG_PATH || "ffmpeg";
  const workDirectory = await mkdtemp(join(tmpdir(), "va-export-"));
  try {
    await Promise.all(
      frames.map((frame, index) =>
        writeFile(join(workDirectory, `frame${String(index).padStart(5, "0")}.png`), frame),
      ),
    );
    const framePattern = join(workDirectory, "frame%05d.png");
    const boundedFps = Math.max(1, Math.min(60, Math.round(fps)));

    if (format === "gif") {
      const palettePath = join(workDirectory, "palette.png");
      const outputPath = join(workDirectory, "out.gif");
      await executeFileAsynchronously(
        ffmpegBinaryPath,
        ["-y", "-framerate", String(boundedFps), "-i", framePattern, "-vf", "palettegen=max_colors=256", palettePath],
        { timeout: ENCODE_TIMEOUT_MS },
      );
      await executeFileAsynchronously(
        ffmpegBinaryPath,
        [
          "-y",
          "-framerate",
          String(boundedFps),
          "-i",
          framePattern,
          "-i",
          palettePath,
          "-lavfi",
          "paletteuse=dither=sierra2_4a",
          outputPath,
        ],
        { timeout: ENCODE_TIMEOUT_MS },
      );
      return { buffer: await readFile(outputPath), mimeType: "image/gif", format: "gif" };
    }

    const outputPath = join(workDirectory, "out.mp4");
    await executeFileAsynchronously(
      ffmpegBinaryPath,
      [
        "-y",
        "-framerate",
        String(boundedFps),
        "-i",
        framePattern,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        // H.264 requires even dimensions; pad rather than scale to keep pixels exact.
        "-vf",
        "pad=ceil(iw/2)*2:ceil(ih/2)*2",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      { timeout: ENCODE_TIMEOUT_MS },
    );
    return { buffer: await readFile(outputPath), mimeType: "video/mp4", format: "mp4" };
  } catch (error) {
    logger.warn(`[VectorAnimationRender] ${format} encode failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    await rm(workDirectory, { recursive: true, force: true }).catch(() => {});
  }
}
