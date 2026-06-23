// ─── YouTube Video Downloader ───────────────────────────────
// Downloads a YouTube video as MP4/MP3/GIF using yt-dlp.
// Returns the temp file path + metadata for the route handler
// to decide delivery method (MinIO upload or GIF render).

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";
import { extractVideoId } from "../knowledge/YouTubeFetcher.ts";
import { convertVideoToGif } from "../../services/VideoService.ts";

// ─── Constants ─────────────────────────────────────────────────────

const DOWNLOAD_TIMEOUT_MILLISECONDS = 180_000;
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB safety cap
const YTDLP_BINARY = "yt-dlp";

// ─── URL Validation ────────────────────────────────────────────────

const YOUTUBE_PLAYLIST_REGEX =
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/.*[?&]list=[a-zA-Z0-9_-]+/;

const YOUTUBE_URL_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}/;

function normalizeYouTubeUrl(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  const videoId = extractVideoId(trimmed);
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  if (YOUTUBE_PLAYLIST_REGEX.test(trimmed)) {
    return trimmed;
  }

  if (YOUTUBE_URL_REGEX.test(trimmed)) {
    return trimmed;
  }

  return null;
}

// ─── yt-dlp Download ───────────────────────────────────────────────

export type YouTubeDownloadFormat = "mp4" | "mp3" | "gif";

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
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
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
            "--embed-subs",
            "--sub-langs", "en",
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
        return reject(new Error(`YouTube download failed: ${errorDetail}`));
      }

      const downloadedFilePath = standardOutput.trim();
      if (!downloadedFilePath) {
        return reject(new Error("yt-dlp produced no output file path"));
      }

      try {
        const { stat } = await import("node:fs/promises");
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

    childProcess.on("error", (error) => {
      reject(
        new Error(
          `Failed to spawn yt-dlp: ${error.message}. ` +
            "Ensure yt-dlp is installed and available in PATH.",
        ),
      );
    });
  });
}

// ─── Metadata Extraction via yt-dlp ────────────────────────────────

interface YouTubeVideoMetadata {
  title: string;
  channel: string;
  durationSeconds: number | null;
  viewCount: number | null;
  uploadDate: string | null;
  description: string | null;
  thumbnailUrl: string | null;
}

function extractMetadataViaYtDlp(videoUrl: string): Promise<YouTubeVideoMetadata> {
  return new Promise((resolve, reject) => {
    const processArguments = [
      videoUrl,
      "--no-download",
      "--no-playlist",
      "--no-check-certificates",
      "--quiet",
      "--no-warnings",
      "--print", "%(title)s\n%(channel)s\n%(duration)s\n%(view_count)s\n%(upload_date)s\n%(description).200s\n%(thumbnail)s",
    ];

    const childProcess = spawn(YTDLP_BINARY, processArguments, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });

    let standardOutput = "";

    childProcess.stdout?.on("data", (chunk: Buffer) => {
      standardOutput += chunk.toString();
    });

    childProcess.on("close", (exitCode) => {
      if (exitCode !== 0) {
        return resolve({
          title: "YouTube Video",
          channel: "Unknown",
          durationSeconds: null,
          viewCount: null,
          uploadDate: null,
          description: null,
          thumbnailUrl: null,
        });
      }

      const lines = standardOutput.trim().split("\n");
      const parseDuration = (value: string): number | null => {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) || value === "NA" ? null : parsed;
      };
      const parseCount = (value: string): number | null => {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) || value === "NA" ? null : parsed;
      };
      const cleanField = (value: string | undefined): string | null => {
        if (!value || value === "NA" || value === "None") return null;
        return value;
      };

      resolve({
        title: lines[0] || "YouTube Video",
        channel: lines[1] || "Unknown",
        durationSeconds: parseDuration(lines[2] || ""),
        viewCount: parseCount(lines[3] || ""),
        uploadDate: cleanField(lines[4]),
        description: cleanField(lines[5]),
        thumbnailUrl: cleanField(lines[6]),
      });
    });

    childProcess.on("error", () => {
      resolve({
        title: "YouTube Video",
        channel: "Unknown",
        durationSeconds: null,
        viewCount: null,
        uploadDate: null,
        description: null,
        thumbnailUrl: null,
      });
    });
  });
}

// ─── Public API ────────────────────────────────────────────────────

export interface YouTubeDownloadFileResult {
  metadata: YouTubeVideoMetadata;
  filePath: string;
  fileSize: number;
  format: string;
  mimeType: string;
  temporaryDirectory: string;
}

export interface YouTubeDownloadGifResult {
  metadata: YouTubeVideoMetadata;
  gifBuffer: Buffer;
  mimeType: "image/gif";
}

export interface YouTubeDownloadErrorResult {
  error: string;
}

export type YouTubeDownloadResult =
  | YouTubeDownloadFileResult
  | YouTubeDownloadGifResult
  | YouTubeDownloadErrorResult;

export function isFileResult(result: YouTubeDownloadResult): result is YouTubeDownloadFileResult {
  return "filePath" in result;
}

export function isGifResult(result: YouTubeDownloadResult): result is YouTubeDownloadGifResult {
  return "gifBuffer" in result;
}

export function isErrorResult(result: YouTubeDownloadResult): result is YouTubeDownloadErrorResult {
  return "error" in result;
}

export async function downloadYouTubeVideo(
  input: string,
  format: YouTubeDownloadFormat = "mp4",
): Promise<YouTubeDownloadResult> {
  let temporaryDirectory: string | null = null;

  try {
    const normalizedUrl = normalizeYouTubeUrl(input);
    if (!normalizedUrl) {
      return { error: `Invalid YouTube URL or video ID: "${input}"` };
    }

    logger.info(
      `[YouTubeVideoFetcher] Downloading ${format.toUpperCase()}: ${normalizedUrl}`,
    );

    // For GIF, we download as MP4 first, then convert
    const downloadFormat: "mp4" | "mp3" = format === "gif" ? "mp4" : format;

    const [metadata, downloadDirectory] = await Promise.all([
      extractMetadataViaYtDlp(normalizedUrl),
      mkdtemp(path.join(tmpdir(), "youtube-video-")),
    ]);

    temporaryDirectory = downloadDirectory;

    logger.info(
      `[YouTubeVideoFetcher] Video: "${metadata.title}" by ${metadata.channel} ` +
        `(${metadata.durationSeconds ?? "?"}s)`,
    );

    const downloadResult = await runYtDlpDownload(
      normalizedUrl,
      temporaryDirectory,
      downloadFormat,
    );

    logger.info(
      `[YouTubeVideoFetcher] Download complete: ${(downloadResult.fileSize / 1024 / 1024).toFixed(1)} MB`,
    );

    // ── GIF Conversion Path ──────────────────────────────────
    if (format === "gif") {
      logger.info("[YouTubeVideoFetcher] Converting MP4 → GIF via ffmpeg...");

      const gifResult = await convertVideoToGif({
        input: downloadResult.filePath,
        quality: "high",
        width: 480,
        fps: 15,
      });

      // Clean up temp directory immediately since we have the GIF buffer
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
      temporaryDirectory = null;

      logger.info(
        `[YouTubeVideoFetcher] GIF conversion complete: ${(gifResult.buffer.length / 1024 / 1024).toFixed(1)} MB`,
      );

      return {
        metadata,
        gifBuffer: gifResult.buffer,
        mimeType: "image/gif",
      };
    }

    // ── File Path Return (MP4/MP3) ───────────────────────────
    // Caller is responsible for cleanup via temporaryDirectory
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
    // Clean up on error
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
    }

    logger.error(
      `[YouTubeVideoFetcher] Download failed: ${errorMessage(error)}`,
    );
    return { error: `YouTube video download failed: ${errorMessage(error)}` };
  }
}
