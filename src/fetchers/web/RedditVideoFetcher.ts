// ─── Reddit Video Downloader ────────────────────────────────
// Reddit hosts videos as split DASH streams (video + audio separate).
// This fetcher resolves the actual video URL from a Reddit post,
// then uses yt-dlp to mux the streams into a single MP4 file.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { USER_AGENT } from "../../constants.ts";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

// ─── Constants ─────────────────────────────────────────────────────

const DOWNLOAD_TIMEOUT_MILLISECONDS = 120_000;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB safety cap
const YTDLP_BINARY = "yt-dlp";

// ─── URL Normalization ─────────────────────────────────────────────

const REDDIT_POST_REGEX =
  /(?:https?:\/\/)?(?:(?:www|old|new)\.)?reddit\.com\/(r\/[^/]+\/comments\/[a-z0-9]+[^?\s]*)/i;

const REDDIT_SHORT_REGEX = /(?:https?:\/\/)?redd\.it\/([a-z0-9]+)/i;

const REDDIT_VIDEO_REGEX =
  /(?:https?:\/\/)?v\.redd\.it\/([a-z0-9]+)/i;

function normalizeRedditUrl(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  const fullMatch = trimmed.match(REDDIT_POST_REGEX);
  if (fullMatch) {
    return `https://www.reddit.com/${fullMatch[1].replace(/\/$/, "")}`;
  }

  const shortMatch = trimmed.match(REDDIT_SHORT_REGEX);
  if (shortMatch) {
    return `https://www.reddit.com/comments/${shortMatch[1]}`;
  }

  const videoMatch = trimmed.match(REDDIT_VIDEO_REGEX);
  if (videoMatch) {
    return `https://v.redd.it/${videoMatch[1]}`;
  }

  return null;
}

// ─── Post Metadata Extraction ──────────────────────────────────────

interface RedditVideoMetadata {
  title: string;
  author: string;
  subreddit: string;
  permalink: string;
  videoUrl: string;
  isNsfw: boolean;
  durationSeconds: number | null;
  widthPixels: number | null;
  heightPixels: number | null;
}

async function extractVideoMetadata(
  redditUrl: string,
): Promise<RedditVideoMetadata> {
  const jsonUrl = `${redditUrl.replace(/\/$/, "")}.json`;

  const response = await fetch(jsonUrl, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Reddit API returned ${response.status}`);
  }

  const data = await response.json();
  const post = data[0]?.data?.children?.[0]?.data;

  if (!post) {
    throw new Error("Could not parse Reddit post data");
  }

  const redditVideo = post.media?.reddit_video || post.secure_media?.reddit_video;

  if (!redditVideo) {
    // Check for crosspost origin
    const crosspostVideo =
      post.crosspost_parent_list?.[0]?.media?.reddit_video ||
      post.crosspost_parent_list?.[0]?.secure_media?.reddit_video;

    if (!crosspostVideo) {
      throw new Error(
        "No Reddit-hosted video found on this post. " +
          "The post may be an image, text post, or link to an external video host.",
      );
    }

    return {
      title: post.title,
      author: post.author,
      subreddit: post.subreddit_name_prefixed,
      permalink: `https://www.reddit.com${post.permalink}`,
      videoUrl: crosspostVideo.fallback_url || crosspostVideo.dash_url,
      isNsfw: post.over_18 || false,
      durationSeconds: crosspostVideo.duration || null,
      widthPixels: crosspostVideo.width || null,
      heightPixels: crosspostVideo.height || null,
    };
  }

  return {
    title: post.title,
    author: post.author,
    subreddit: post.subreddit_name_prefixed,
    permalink: `https://www.reddit.com${post.permalink}`,
    videoUrl: redditVideo.fallback_url || redditVideo.dash_url,
    isNsfw: post.over_18 || false,
    durationSeconds: redditVideo.duration || null,
    widthPixels: redditVideo.width || null,
    heightPixels: redditVideo.height || null,
  };
}

// ─── yt-dlp Download ───────────────────────────────────────────────

interface YtDlpResult {
  filePath: string;
  fileSize: number;
  format: string;
}

function runYtDlp(
  videoUrl: string,
  outputDirectory: string,
): Promise<YtDlpResult> {
  return new Promise((resolve, reject) => {
    const outputTemplate = path.join(outputDirectory, "%(id)s.%(ext)s");

    const processArguments = [
      videoUrl,
      "--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
      "--merge-output-format", "mp4",
      "--output", outputTemplate,
      "--no-playlist",
      "--no-check-certificates",
      "--user-agent", USER_AGENT,
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

// ─── Public API ────────────────────────────────────────────────────

import { convertVideoToGif } from "../../services/VideoService.ts";

export type RedditDownloadFormat = "mp4" | "gif";

interface RedditVideoMetadataResult {
  title: string;
  author: string;
  subreddit: string;
  permalink: string;
  isNsfw: boolean;
  durationSeconds: number | null;
  widthPixels: number | null;
  heightPixels: number | null;
}

export interface RedditVideoFileResult {
  metadata: RedditVideoMetadataResult;
  filePath: string;
  fileSize: number;
  format: string;
  mimeType: string;
  temporaryDirectory: string;
}

export interface RedditVideoGifResult {
  metadata: RedditVideoMetadataResult;
  gifBuffer: Buffer;
  mimeType: "image/gif";
}

export interface RedditVideoErrorResult {
  error: string;
}

export type RedditVideoDownloadResult =
  | RedditVideoFileResult
  | RedditVideoGifResult
  | RedditVideoErrorResult;

export function isRedditFileResult(result: RedditVideoDownloadResult): result is RedditVideoFileResult {
  return "filePath" in result;
}

export function isRedditGifResult(result: RedditVideoDownloadResult): result is RedditVideoGifResult {
  return "gifBuffer" in result;
}

export function isRedditErrorResult(result: RedditVideoDownloadResult): result is RedditVideoErrorResult {
  return "error" in result;
}

export async function downloadRedditVideo(
  input: string,
  format: RedditDownloadFormat = "mp4",
): Promise<RedditVideoDownloadResult> {
  let temporaryDirectory: string | null = null;

  try {
    // Normalize and validate URL
    const normalizedUrl = normalizeRedditUrl(input);
    if (!normalizedUrl) {
      return { error: `Invalid Reddit URL: "${input}"` };
    }

    logger.info(
      `[RedditVideoFetcher] Resolving video metadata for: ${normalizedUrl}`,
    );

    // For v.redd.it URLs, we can pass them directly to yt-dlp
    // since they redirect to the post page automatically
    const isDirectVideoUrl = REDDIT_VIDEO_REGEX.test(input.trim());

    let rawMetadata: RedditVideoMetadata | null = null;

    if (!isDirectVideoUrl) {
      rawMetadata = await extractVideoMetadata(normalizedUrl);
      logger.info(
        `[RedditVideoFetcher] Found video: "${rawMetadata.title}" ` +
          `(${rawMetadata.durationSeconds ?? "?"}s, ${rawMetadata.widthPixels ?? "?"}x${rawMetadata.heightPixels ?? "?"})`,
      );
    }

    // Create temp directory for download
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "reddit-video-"));

    // Use yt-dlp to download and mux the video
    // For direct v.redd.it links, pass them directly
    // For post URLs, pass the permalink which yt-dlp handles natively
    const downloadTargetUrl = isDirectVideoUrl
      ? normalizedUrl
      : (rawMetadata?.permalink ?? normalizedUrl);

    logger.info(
      `[RedditVideoFetcher] Downloading via yt-dlp: ${downloadTargetUrl}`,
    );

    const downloadResult = await runYtDlp(downloadTargetUrl, temporaryDirectory);

    logger.info(
      `[RedditVideoFetcher] Download complete: ${(downloadResult.fileSize / 1024 / 1024).toFixed(1)} MB`,
    );

    const metadata: RedditVideoMetadataResult = {
      title: rawMetadata?.title ?? "Reddit Video",
      author: rawMetadata?.author ?? "unknown",
      subreddit: rawMetadata?.subreddit ?? "unknown",
      permalink: rawMetadata?.permalink ?? normalizedUrl,
      isNsfw: rawMetadata?.isNsfw ?? false,
      durationSeconds: rawMetadata?.durationSeconds ?? null,
      widthPixels: rawMetadata?.widthPixels ?? null,
      heightPixels: rawMetadata?.heightPixels ?? null,
    };

    // ── GIF Conversion Path ──────────────────────────────────
    if (format === "gif") {
      logger.info("[RedditVideoFetcher] Converting MP4 → GIF via ffmpeg...");

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
        `[RedditVideoFetcher] GIF conversion complete: ${(gifResult.buffer.length / 1024 / 1024).toFixed(1)} MB`,
      );

      return {
        metadata,
        gifBuffer: gifResult.buffer,
        mimeType: "image/gif",
      };
    }

    // ── File Path Return (MP4) ───────────────────────────────
    // Caller is responsible for cleanup via temporaryDirectory
    return {
      metadata,
      filePath: downloadResult.filePath,
      fileSize: downloadResult.fileSize,
      format: downloadResult.format,
      mimeType: `video/${downloadResult.format === "mp4" ? "mp4" : "webm"}`,
      temporaryDirectory,
    };
  } catch (error: unknown) {
    // Clean up on error
    if (temporaryDirectory) {
      rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
    }

    logger.error(
      `[RedditVideoFetcher] Download failed: ${errorMessage(error)}`,
    );
    return { error: `Reddit video download failed: ${errorMessage(error)}` };
  }
}
