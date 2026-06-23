// ─── YouTube Video Downloader ───────────────────────────────
// Downloads a YouTube video as MP4 or extracts audio as MP3
// using yt-dlp. Mirrors the RedditVideoFetcher pattern —
// temp directory, subprocess, base64 delivery, cleanup.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";
import { extractVideoId } from "../knowledge/YouTubeFetcher.ts";

// ─── Constants ─────────────────────────────────────────────────────

const DOWNLOAD_TIMEOUT_MILLISECONDS = 180_000;
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB safety cap
const YTDLP_BINARY = "yt-dlp";

// ─── URL Validation ────────────────────────────────────────────────

const YOUTUBE_URL_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}/;

const YOUTUBE_PLAYLIST_REGEX =
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/.*[?&]list=[a-zA-Z0-9_-]+/;

function normalizeYouTubeUrl(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // Accept raw 11-char video IDs
  const videoId = extractVideoId(trimmed);
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  // Accept playlist URLs
  if (YOUTUBE_PLAYLIST_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Accept standard YouTube video URLs
  if (YOUTUBE_URL_REGEX.test(trimmed)) {
    return trimmed;
  }

  return null;
}

// ─── yt-dlp Download ───────────────────────────────────────────────

type YouTubeDownloadFormat = "mp4" | "mp3";

interface YtDlpDownloadResult {
  filePath: string;
  fileSize: number;
  format: string;
}

function runYtDlpDownload(
  videoUrl: string,
  outputDirectory: string,
  format: YouTubeDownloadFormat,
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

export interface YouTubeVideoDownloadResult {
  title: string;
  channel: string;
  durationSeconds: number | null;
  viewCount: number | null;
  uploadDate: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  fileSize: number;
  format: string;
  videoBase64: string;
  mimeType: string;
}

export interface YouTubeVideoErrorResult {
  error: string;
}

export async function downloadYouTubeVideo(
  input: string,
  format: YouTubeDownloadFormat = "mp4",
): Promise<YouTubeVideoDownloadResult | YouTubeVideoErrorResult> {
  let temporaryDirectory: string | null = null;

  try {
    const normalizedUrl = normalizeYouTubeUrl(input);
    if (!normalizedUrl) {
      return { error: `Invalid YouTube URL or video ID: "${input}"` };
    }

    logger.info(
      `[YouTubeVideoFetcher] Downloading ${format.toUpperCase()}: ${normalizedUrl}`,
    );

    // Fetch metadata concurrently with download
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
      format,
    );

    logger.info(
      `[YouTubeVideoFetcher] Download complete: ${(downloadResult.fileSize / 1024 / 1024).toFixed(1)} MB`,
    );

    const fileBuffer = await readFile(downloadResult.filePath);
    const videoBase64 = fileBuffer.toString("base64");

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
      title: metadata.title,
      channel: metadata.channel,
      durationSeconds: metadata.durationSeconds,
      viewCount: metadata.viewCount,
      uploadDate: metadata.uploadDate,
      description: metadata.description,
      thumbnailUrl: metadata.thumbnailUrl,
      fileSize: downloadResult.fileSize,
      format: actualFormat,
      videoBase64,
      mimeType,
    };
  } catch (error: unknown) {
    logger.error(
      `[YouTubeVideoFetcher] Download failed: ${errorMessage(error)}`,
    );
    return { error: `YouTube video download failed: ${errorMessage(error)}` };
  } finally {
    if (temporaryDirectory) {
      rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }
}
