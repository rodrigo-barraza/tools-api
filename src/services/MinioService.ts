// ─── MinIO Storage Service ──────────────────────────────────

import { Client } from "minio";
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
};

export default class MinioService {
  static client: Client | null = null;

  static _getClient(): Client {
    if (MinioService.client) return MinioService.client;

    if (!CONFIG.MINIO_ENDPOINT) {
      throw new Error("No MINIO_ENDPOINT configured");
    }

    const url = new URL(CONFIG.MINIO_ENDPOINT);
    MinioService.client = new Client({
      endPoint: url.hostname,
      port: parseInt(url.port, 10) || (url.protocol === "https:" ? 443 : 80),
      useSSL: url.protocol === "https:",
      accessKey: CONFIG.MINIO_ACCESS_KEY || "",
      secretKey: CONFIG.MINIO_SECRET_KEY || "",
    });

    logger.info(`[MinioService] Client initialized → ${CONFIG.MINIO_ENDPOINT}`);
    return MinioService.client;
  }

  static async statObject(bucketName: string, objectName: string) {
    const minioClient = MinioService._getClient();
    return minioClient.statObject(bucketName, objectName);
  }

  static async getObject(bucketName: string, objectName: string) {
    const minioClient = MinioService._getClient();
    return minioClient.getObject(bucketName, objectName);
  }

  static async fPutObject(bucketName: string, objectName: string, filePath: string, metadata: Record<string, string> = {}) {
    const minioClient = MinioService._getClient();
    return minioClient.fPutObject(bucketName, objectName, filePath, metadata);
  }

  static async putBuffer(
    bucketName: string,
    objectName: string,
    buffer: Buffer,
    contentType: string,
  ) {
    const minioClient = MinioService._getClient();
    return minioClient.putObject(bucketName, objectName, buffer, buffer.length, {
      "Content-Type": contentType,
    });
  }

  static getPublicUrl(bucketName: string, objectName: string): string {
    if (!CONFIG.MINIO_PUBLIC_URL) {
      throw new Error("No MINIO_PUBLIC_URL configured. Set it in projects.json under the minio config block.");
    }
    return `${CONFIG.MINIO_PUBLIC_URL.replace(/\/$/, "")}/${bucketName}/${objectName}`;
  }

  static async objectExists(bucketName: string, objectName: string): Promise<boolean> {
    try {
      await MinioService.statObject(bucketName, objectName);
      return true;
    } catch {
      return false;
    }
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
    if (!CONFIG.MINIO_ENDPOINT) return null;

    try {
      const fileExtension = MIME_TO_EXTENSION[mimeType] || "bin";
      const objectName = `tool-assets/${crypto.randomUUID()}.${fileExtension}`;
      await MinioService.putBuffer(TOOL_ASSETS_BUCKET, objectName, buffer, mimeType);
      return MinioService.getPublicUrl(TOOL_ASSETS_BUCKET, objectName);
    } catch (error: unknown) {
      logger.warn(
        `[MinioService] Tool asset upload failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  static async seedWorkspaceAgent(): Promise<void> {
    if (!CONFIG.MINIO_ENDPOINT) {
      logger.warn(
        "[MinioService] MinIO not configured; skipping workspace agent seed.",
      );
      return;
    }
    try {
      const minioClient = MinioService._getClient();
      const bucketName = "artifacts";

      const bucketExists = await minioClient
        .bucketExists(bucketName)
        .catch(() => false);
      if (!bucketExists) {
        await minioClient.makeBucket(bucketName);
        logger.info(`[MinioService] Created bucket: ${bucketName}`);
      }

      const publicPolicy = JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      });
      await minioClient
        .setBucketPolicy(bucketName, publicPolicy)
        .catch((error: Error) => {
          logger.warn(
            `[MinioService] Failed to set bucket policy: ${error.message}`,
          );
        });

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

        await minioClient.fPutObject(bucketName, fileEntry.objectName, localFilePath, {
          "Content-Type": "application/javascript",
        });

        logger.success(
          `[MinioService] Successfully seeded ${fileEntry.fileName} into MinIO bucket '${bucketName}'`,
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `[MinioService] Failed to seed workspace agent: ${errorMessage}`,
      );
    }
  }
}
