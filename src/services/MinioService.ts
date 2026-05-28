// ─── MinIO Storage Service ──────────────────────────────────

import { Client } from "minio";
import CONFIG from "../config.ts";
import logger from "../logger.ts";

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
    const client = MinioService._getClient();
    return client.statObject(bucketName, objectName);
  }

  static async getObject(bucketName: string, objectName: string) {
    const client = MinioService._getClient();
    return client.getObject(bucketName, objectName);
  }
}
