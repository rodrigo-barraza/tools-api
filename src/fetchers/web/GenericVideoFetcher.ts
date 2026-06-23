// ─── Generic Video Downloader ───────────────────────────────
// Unified video download tool powered by yt-dlp. Works with
// any URL from 1000+ supported sites (Twitter/X, TikTok,
// Twitch, Vimeo, Dailymotion, etc.). Returns temp file path
// + metadata for the route handler to deliver via MinIO or
// GIF conversion.

import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";
import { convertVideoToGif } from "../../services/VideoService.ts";

// ─── Constants ─────────────────────────────────────────────────────

const DOWNLOAD_TIMEOUT_MILLISECONDS = 180_000;
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const YTDLP_BINARY = "yt-dlp";

// ─── URL Validation ────────────────────────────────────────────────

function isValidMediaUrl(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim();
  try {
    const parsedUrl = new URL(trimmed);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── yt-dlp Download ───────────────────────────────────────────────

export type GenericDownloadFormat = "mp4" | "mp3" | "gif";

interface YtDlpDownloadResult {
  filePath: string;
  fileSize: number;
  format: string;
}

function runYtDlpDownload(
  videoUrl: string,
  outputDirectory: string,
  format: "mp4" | "mp3",
): Promise<YtDlpDownloadResult> {
  return new Promise((resolve, reject) => {
    const outputTemplate = path.join(outputDirectory, "%(id)s.%(ext)s");

    const processArguments: string[] =
      format === "mp3"
        ? [
            videoUrl,
            "--format", "bestaudio",
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "--embed-thumbnail",
            "--embed-metadata",
            "--output", outputTemplate,
            "--no-playlist",
            "--no-check-certificates",
            "--quiet",
            "--no-warnings",
            "--print", "after_move:filepath",
            "--max-filesize", `${MAX_FILE_SIZE_BYTES}`,
          ]
        : [
            videoUrl,
            "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
            "--merge-output-format", "mp4",
            "--embed-thumbnail",
            "--embed-metadata",
            "--output", outputTemplate,
            "--no-playlist",
            "--no-check-certificates",
            "--quiet",
            "--no-warnings",
            "--print", "after_move:filepath",
            "--max-filesize", `${MAX_FILE_SIZE_BYTES}`,
          ];

    const childProcess = spawn(YTDLP_BINARY, processArguments, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: DOWNLOAD_TIMEOUT_MILLISECONDS,
    });

    let standardOutput = "";
    let standardError = "";

    childProcess.stdout?.on("data", (chunk: Buffer) => {
      standardOutput += chunk.toString();
    });

    childProcess.stderr?.on("data", (chunk: Buffer) => {
      standardError += chunk.toString();
    });

    childProcess.on("close", async (exitCode) => {
      if (exitCode !== 0) {
        const errorDetail = standardError.trim() || `yt-dlp exited with code ${exitCode}`;
        return reject(new Error(`Video download failed: ${errorDetail}`));
      }

      const downloadedFilePath = standardOutput.trim();
      if (!downloadedFilePath) {
        return reject(new Error("yt-dlp produced no output file path"));
      }

      try {
        const fileStats = await stat(downloadedFilePath);
        resolve({
          filePath: downloadedFilePath,
          fileSize: fileStats.size,
          format: path.extname(downloadedFilePath).replace(".", ""),
        });
      } catch {
        reject(new Error(`Downloaded file not found at: ${downloadedFilePath}`));
      }
    });

    childProcess.on("error", (processError) => {
      reject(
        new Error(
          `Failed to spawn yt-dlp: ${processError.message}. ` +
            "Ensure yt-dlp is installed and available in PATH.",
        ),
      );
    });
  });
}

// ─── Metadata Extraction via yt-dlp ────────────────────────────────

interface GenericVideoMetadata {
  title: string;
  uploader: string;
  platform: string;
  durationSeconds: number | null;
  viewCount: number | null;
  uploadDate: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  originalUrl: string;
}

function extractMetadataViaYtDlp(videoUrl: string): Promise<GenericVideoMetadata> {
  return new Promise((resolve, reject) => {
    const processArguments = [
      videoUrl,
      "--no-download",
      "--no-playlist",
      "--no-check-certificates",
      "--quiet",
      "--no-warnings",
      "--print", "%(title)s\n%(uploader)s\n%(extractor)s\n%(duration)s\n%(view_count)s\n%(upload_date)s\n%(description).200s\n%(thumbnail)s",
    ];

    const childProcess = spawn(YTDLP_BINARY, processArguments, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });

    let standardOutput = "";
    let standardError = "";

    childProcess.stdout?.on("data", (chunk: Buffer) => {
      standardOutput += chunk.toString();
    });

    childProcess.stderr?.on("data", (chunk: Buffer) => {
      standardError += chunk.toString();
    });

    childProcess.on("close", (exitCode) => {
      if (exitCode !== 0) {
        const errorDetail = standardError.trim();
        if (errorDetail.includes("Unsupported URL") || errorDetail.includes("No video found")) {
          return reject(new Error(`Unsupported URL or no video found: ${errorDetail}`));
        }
        return resolve(buildFallbackMetadata(videoUrl));
      }

      const lines = standardOutput.trim().split("\n");
      const parseNumber = (value: string): number | null => {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) || value === "NA" ? null : parsed;
      };
      const cleanField = (value: string | undefined): string | null => {
        if (!value || value === "NA" || value === "None") return null;
        return value;
      };

      resolve({
        title: lines[0] && lines[0] !== "NA" ? lines[0] : "Video",
        uploader: lines[1] && lines[1] !== "NA" ? lines[1] : "Unknown",
        platform: lines[2] && lines[2] !== "NA" ? lines[2] : "Unknown",
        durationSeconds: parseNumber(lines[3] || ""),
        viewCount: parseNumber(lines[4] || ""),
        uploadDate: cleanField(lines[5]),
        description: cleanField(lines[6]),
        thumbnailUrl: cleanField(lines[7]),
        originalUrl: videoUrl,
      });
    });

    childProcess.on("error", () => {
      resolve(buildFallbackMetadata(videoUrl));
    });
  });
}

function buildFallbackMetadata(videoUrl: string): GenericVideoMetadata {
  return {
    title: "Video",
    uploader: "Unknown",
    platform: "Unknown",
    durationSeconds: null,
    viewCount: null,
    uploadDate: null,
    description: null,
    thumbnailUrl: null,
    originalUrl: videoUrl,
  };
}

// ─── Public API ────────────────────────────────────────────────────

export interface GenericVideoFileResult {
  metadata: GenericVideoMetadata;
  filePath: string;
  fileSize: number;
  format: string;
  mimeType: string;
  temporaryDirectory: string;
}

export interface GenericVideoGifResult {
  metadata: GenericVideoMetadata;
  gifBuffer: Buffer;
  mimeType: "image/gif";
}

export interface GenericVideoErrorResult {
  error: string;
}

export type GenericVideoDownloadResult =
  | GenericVideoFileResult
  | GenericVideoGifResult
  | GenericVideoErrorResult;

export function isGenericFileResult(result: GenericVideoDownloadResult): result is GenericVideoFileResult {
  return "filePath" in result;
}

export function isGenericGifResult(result: GenericVideoDownloadResult): result is GenericVideoGifResult {
  return "gifBuffer" in result;
}

export function isGenericErrorResult(result: GenericVideoDownloadResult): result is GenericVideoErrorResult {
  return "error" in result;
}

export async function downloadGenericVideo(
  input: string,
  format: GenericDownloadFormat = "mp4",
): Promise<GenericVideoDownloadResult> {
  let temporaryDirectory: string | null = null;

  try {
    if (!isValidMediaUrl(input)) {
      return { error: `Invalid URL: "${input}". Provide a valid HTTP/HTTPS URL.` };
    }

    logger.info(
      `[GenericVideoFetcher] Downloading ${format.toUpperCase()}: ${input}`,
    );

    // For GIF, we download as MP4 first, then convert
    const downloadFormat: "mp4" | "mp3" = format === "gif" ? "mp4" : format;

    // Metadata extraction and download directory creation in parallel
    const [metadata, downloadDirectory] = await Promise.all([
      extractMetadataViaYtDlp(input),
      mkdtemp(path.join(tmpdir(), "generic-video-")),
    ]);

    temporaryDirectory = downloadDirectory;

    logger.info(
      `[GenericVideoFetcher] [${metadata.platform}] "${metadata.title}" by ${metadata.uploader} ` +
        `(${metadata.durationSeconds ?? "?"}s)`,
    );

    const downloadResult = await runYtDlpDownload(
      input,
      temporaryDirectory,
      downloadFormat,
    );

    logger.info(
      `[GenericVideoFetcher] Download complete: ${(downloadResult.fileSize / 1024 / 1024).toFixed(1)} MB`,
    );

    // ── GIF Conversion Path ──────────────────────────────────
    if (format === "gif") {
      logger.info("[GenericVideoFetcher] Converting MP4 → GIF via ffmpeg...");

      const gifResult = await convertVideoToGif({
        input: downloadResult.filePath,
        quality: "high",
        width: 480,
        fps: 15,
      });

      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
      temporaryDirectory = null;

      logger.info(
        `[GenericVideoFetcher] GIF conversion complete: ${(gifResult.buffer.length / 1024 / 1024).toFixed(1)} MB`,
      );

      return {
        metadata,
        gifBuffer: gifResult.buffer,
        mimeType: "image/gif",
      };
    }

    // ── File Path Return (MP4/MP3) ───────────────────────────
    const actualFormat = downloadResult.format;
    const mimeType =
      actualFormat === "mp3"
        ? "audio/mpeg"
        : actualFormat === "mp4"
          ? "video/mp4"
          : actualFormat === "webm"
            ? "video/webm"
            : `video/${actualFormat}`;

    return {
      metadata,
      filePath: downloadResult.filePath,
      fileSize: downloadResult.fileSize,
      format: actualFormat,
      mimeType,
      temporaryDirectory,
    };
  } catch (error: unknown) {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
    }

    logger.error(
      `[GenericVideoFetcher] Download failed: ${errorMessage(error)}`,
    );
    return { error: `Video download failed: ${errorMessage(error)}` };
  }
}
