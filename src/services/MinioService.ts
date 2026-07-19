// ─── MinIO Storage Service ──────────────────────────────────
// Facade over the shared MinioManager from utilities-library — the
// single MinIO implementation across the workspace (same pattern as
// PrismApiClient). The per-call bucketName parameters are kept for
// API stability; they route through MinioManager's bucket override.
// Initialized once at boot via MinioService.init() (which also
// ensures the artifacts bucket exists with a public-read policy).

import { MinioManager } from "@rodrigo-barraza/utilities-library/service/minio";
import { getErrorMessage } from "@rodrigo-barraza/utilities-library";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import CONFIG from "../config.ts";
import logger from "../logger.ts";

const TOOL_ASSETS_BUCKET = "artifacts";

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/webm": "weba",
};

export default class MinioService {
  /**
   * Connect the shared MinioManager. Call once at boot before any
   * other method. No-op (with a warning) when MinIO isn't configured.
   */
  static async init(): Promise<void> {
    if (!CONFIG.MINIO_ENDPOINT) {
      logger.warn("[MinioService] No MINIO_ENDPOINT configured — MinIO disabled");
      return;
    }
    await MinioManager.init({
      endpoint: CONFIG.MINIO_ENDPOINT,
      accessKey: CONFIG.MINIO_ACCESS_KEY || "",
      secretKey: CONFIG.MINIO_SECRET_KEY || "",
      bucket: TOOL_ASSETS_BUCKET,
      publicRead: true,
      logger,
    });
  }

  static isAvailable(): boolean {
    return MinioManager.isAvailable();
  }

  static async statObject(bucketName: string, objectName: string) {
    return MinioManager.stat(objectName, bucketName);
  }

  static async getObject(bucketName: string, objectName: string) {
    return MinioManager.get(objectName, bucketName);
  }

  static async fPutObject(
    bucketName: string,
    objectName: string,
    filePath: string,
    metadata: Record<string, string> = {},
  ) {
    return MinioManager.uploadFile(objectName, filePath, metadata, bucketName);
  }

  static async putBuffer(
    bucketName: string,
    objectName: string,
    buffer: Buffer,
    contentType: string,
  ) {
    return MinioManager.upload(objectName, buffer, contentType, bucketName);
  }

  static getPublicUrl(bucketName: string, objectName: string): string {
    if (!CONFIG.MINIO_PUBLIC_URL) {
      throw new Error("No MINIO_PUBLIC_URL configured. Set it in projects.json under the minio config block.");
    }
    return `${CONFIG.MINIO_PUBLIC_URL.replace(/\/$/, "")}/${bucketName}/${objectName}`;
  }

  static async objectExists(bucketName: string, objectName: string): Promise<boolean> {
    return MinioManager.exists(objectName, bucketName);
  }

  /**
   * Upload a tool-generated image/asset buffer to MinIO and return a public URL.
   * Returns null if MinIO is not configured, allowing callers to fall back to
   * PersistentStore + render endpoints for local development.
   */
  static async uploadToolAsset(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string | null> {
    if (!MinioManager.isAvailable()) return null;

    try {
      const fileExtension = MIME_TO_EXTENSION[mimeType] || "bin";
      const objectName = `tool-assets/${crypto.randomUUID()}.${fileExtension}`;
      await MinioService.putBuffer(TOOL_ASSETS_BUCKET, objectName, buffer, mimeType);
      return MinioService.getPublicUrl(TOOL_ASSETS_BUCKET, objectName);
    } catch (error: unknown) {
      logger.warn(
        `[MinioService] Tool asset upload failed: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  static async seedWorkspaceAgent(): Promise<void> {
    if (!MinioManager.isAvailable()) {
      logger.warn(
        "[MinioService] MinIO not available; skipping workspace agent seed.",
      );
      return;
    }
    try {
      // Bucket existence + public-read policy are ensured by init()

      const filesToSeed = [
        {
          objectName: "workspace-service/workspace-agent.mjs",
          fileName: "workspace-agent.mjs",
        },
        {
          objectName: "workspace-service/workspace-agent-core.mjs",
          fileName: "workspace-agent-core.mjs",
        },
      ];

      for (const fileEntry of filesToSeed) {
        const potentialPaths = [
          path.resolve(
            process.cwd(),
            `vendor/workspace-agent/${fileEntry.fileName}`,
          ),
          path.resolve(
            process.cwd(),
            `../workspace-service/standalone/${fileEntry.fileName}`,
          ),
          path.resolve(
            process.cwd(),
            `workspace-service/standalone/${fileEntry.fileName}`,
          ),
          `/home/rodrigo/development/workspace-service/standalone/${fileEntry.fileName}`,
        ];

        let localFilePath = "";
        for (const resolvedPath of potentialPaths) {
          try {
            await fs.access(resolvedPath);
            localFilePath = resolvedPath;
            break;
          } catch {
            // Continue trying next path
          }
        }

        if (!localFilePath) {
          logger.warn(
            `[MinioService] Could not locate local ${fileEntry.fileName} in potential paths: ${potentialPaths.join(", ")}`,
          );
          continue;
        }

        logger.info(
          `[MinioService] Seeding ${fileEntry.fileName} from local file: ${localFilePath}`,
        );

        await MinioService.fPutObject(
          TOOL_ASSETS_BUCKET,
          fileEntry.objectName,
          localFilePath,
          { "Content-Type": "application/javascript" },
        );

        logger.success(
          `[MinioService] Successfully seeded ${fileEntry.fileName} into MinIO bucket '${TOOL_ASSETS_BUCKET}'`,
        );
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error(
        `[MinioService] Failed to seed workspace agent: ${errorMessage}`,
      );
    }
  }
}
