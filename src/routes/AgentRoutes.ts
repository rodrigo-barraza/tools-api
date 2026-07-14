// ─── Workspace Agent Status Endpoints ───────────────────────

import { Request, Response, Router } from "express";
import { getErrorMessage } from "@rodrigo-barraza/utilities-library";
import { getConnectedAgents, disconnectAgent } from "../services/AgentConnectionManager.ts";
import MinioService from "../services/MinioService.ts";
import logger from "../logger.ts";
import AgentCompilerService, { CompilationTarget } from "../services/AgentCompilerService.ts";
import { createReadStream } from "node:fs";

const router = Router();

const AGENT_BUCKET = "artifacts";
const AGENT_OBJECT_KEY = "workspace-service/workspace-agent.mjs";

const TRAY_APP_INSTALLER_KEYS: Record<string, { objectKey: string; fileName: string; contentType: string }> = {
  "win-x64": {
    objectKey: "workspace-service/tray-app/Prism Workspace Agent Setup.exe",
    fileName: "Prism Workspace Agent Setup.exe",
    contentType: "application/octet-stream",
  },
  "mac-x64": {
    objectKey: "workspace-service/tray-app/Prism Workspace Agent-x64.dmg",
    fileName: "Prism Workspace Agent-x64.dmg",
    contentType: "application/octet-stream",
  },
  "mac-arm64": {
    objectKey: "workspace-service/tray-app/Prism Workspace Agent-arm64.dmg",
    fileName: "Prism Workspace Agent-arm64.dmg",
    contentType: "application/octet-stream",
  },
  "linux-x64": {
    objectKey: "workspace-service/tray-app/Prism Workspace Agent.AppImage",
    fileName: "Prism Workspace Agent.AppImage",
    contentType: "application/octet-stream",
  },
};

function mapPlatformToTarget(platform: string): CompilationTarget | null {
  const normalizedPlatform = platform.toLowerCase();
  if (
    normalizedPlatform === "win-x64" ||
    normalizedPlatform === "win32" ||
    normalizedPlatform === "windows" ||
    normalizedPlatform === "win"
  ) {
    return "win-x64";
  }
  if (normalizedPlatform === "linux-x64" || normalizedPlatform === "linux") {
    return "linux-x64";
  }
  if (
    normalizedPlatform === "mac-x64" ||
    normalizedPlatform === "darwin-x64" ||
    normalizedPlatform === "mac-intel"
  ) {
    return "mac-x64";
  }
  if (
    normalizedPlatform === "mac-arm64" ||
    normalizedPlatform === "darwin-arm64" ||
    normalizedPlatform === "mac-m1" ||
    normalizedPlatform === "mac-m2" ||
    normalizedPlatform === "mac-m3" ||
    normalizedPlatform === "mac-silicon"
  ) {
    return "mac-arm64";
  }
  return null;
}

/**
 * GET /agents — List all connected workspace agents.
 */
router.get("/", (_req: Request, res: Response) => {
  const agents = getConnectedAgents();
  res.json({
    count: agents.length,
    agents,
  });
});

/**
 * GET /agents/download/agent — Serve the workspace agent.
 * If 'platform' query parameter is specified, dynamically compiles
 * a pre-configured, zero-dependency standalone executable on-the-fly.
 * Otherwise, falls back to serving the raw .mjs file.
 */
router.get("/download/agent", async (req: Request, res: Response) => {
  const platform = req.query.platform as string;

  if (platform) {
    const target = mapPlatformToTarget(platform);
    if (!target) {
      return res.status(400).json({
        error: `Unsupported platform parameter: ${platform}. Supported: win-x64, linux-x64, mac-x64, mac-arm64`,
      });
    }

    let compiledBinaryInfo: { executablePath: string; fileName: string } | null = null;
    try {
      compiledBinaryInfo = await AgentCompilerService.compile(target);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${compiledBinaryInfo.fileName}"`,
      );

      const fileStream = createReadStream(compiledBinaryInfo.executablePath);
      fileStream.pipe(res);

      await new Promise<void>((resolvePromise, rejectPromise) => {
        res.on("finish", () => resolvePromise());
        res.on("error", (error) => rejectPromise(error));
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      logger.error(
        `[Agents] Failed to compile or download workspace agent: ${errorMessage}`,
      );
      if (!res.headersSent) {
        res.status(500).json({ error: "Compilation or download failed", detail: errorMessage });
      }
    } finally {
      if (compiledBinaryInfo) {
        await AgentCompilerService.cleanBuild(compiledBinaryInfo.executablePath);
      }
    }
    return;
  }

  try {
    const objectStat = await MinioService.statObject(AGENT_BUCKET, AGENT_OBJECT_KEY);
    const objectStream = await MinioService.getObject(AGENT_BUCKET, AGENT_OBJECT_KEY);

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="workspace-agent.mjs"');
    res.setHeader("Content-Length", String(objectStat.size));
    res.setHeader("Cache-Control", "public, max-age=300");

    objectStream.pipe(res);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.warn(`[Agents] Failed to serve agent download: ${errorMessage}`);
    res.status(404).json({ error: "Workspace agent file not available" });
  }
});

/**
 * GET /agents/download/tray-app — Serve the system tray Electron app installer.
 * Requires 'platform' query parameter: win-x64, linux-x64, mac-x64, mac-arm64.
 * Installers are pre-built and stored in MinIO.
 */
router.get("/download/tray-app", async (req: Request, res: Response) => {
  const platform = req.query.platform as string;

  if (!platform) {
    return res.status(400).json({
      error: "Missing 'platform' query parameter. Supported: win-x64, linux-x64, mac-x64, mac-arm64",
    });
  }

  const installerInfo = TRAY_APP_INSTALLER_KEYS[platform.toLowerCase()];
  if (!installerInfo) {
    return res.status(400).json({
      error: `Unsupported platform: ${platform}. Supported: win-x64, linux-x64, mac-x64, mac-arm64`,
    });
  }

  try {
    const objectStat = await MinioService.statObject(AGENT_BUCKET, installerInfo.objectKey);
    const objectStream = await MinioService.getObject(AGENT_BUCKET, installerInfo.objectKey);

    res.setHeader("Content-Type", installerInfo.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${installerInfo.fileName}"`,
    );
    res.setHeader("Content-Length", String(objectStat.size));
    res.setHeader("Cache-Control", "public, max-age=300");

    objectStream.pipe(res);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.warn(`[Agents] Failed to serve tray app installer (${platform}): ${errorMessage}`);
    res.status(404).json({
      error: "Tray app installer not available for this platform",
      detail: errorMessage,
    });
  }
});

/**
 * PUT /agents/upload/tray-app — Upload a tray app installer to MinIO.
 * Used by the build script to publish platform-specific installers.
 * Requires 'platform' query parameter and streams the binary body to MinIO.
 */
router.put("/upload/tray-app", async (req: Request, res: Response) => {
  const platform = req.query.platform as string;

  if (!platform) {
    return res.status(400).json({
      error: "Missing 'platform' query parameter. Supported: win-x64, linux-x64, mac-x64, mac-arm64",
    });
  }

  const installerInfo = TRAY_APP_INSTALLER_KEYS[platform.toLowerCase()];
  if (!installerInfo) {
    return res.status(400).json({
      error: `Unsupported platform: ${platform}. Supported: win-x64, linux-x64, mac-x64, mac-arm64`,
    });
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(chunks);

    if (fileBuffer.length === 0) {
      return res.status(400).json({ error: "Empty request body" });
    }

    const minioClient = MinioService._getClient();
    await minioClient.putObject(
      AGENT_BUCKET,
      installerInfo.objectKey,
      fileBuffer,
      fileBuffer.length,
      { "Content-Type": installerInfo.contentType },
    );

    logger.info(
      `[Agents] Uploaded tray app installer for ${platform}: ${installerInfo.objectKey} (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB)`,
    );

    res.json({
      platform,
      objectKey: installerInfo.objectKey,
      fileName: installerInfo.fileName,
      sizeBytes: fileBuffer.length,
    });
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    logger.error(`[Agents] Failed to upload tray app installer (${platform}): ${errorMessage}`);
    res.status(500).json({
      error: "Failed to upload tray app installer",
      detail: errorMessage,
    });
  }
});

/**
 * GET /agents/:id — Get a specific agent's details.
 */
router.get("/:id", (req: Request, res: Response) => {
  const agents = getConnectedAgents();
  const agent = agents.find((agent) => agent.id === req.params.id);
  if (!agent) {
    return res.status(404).json({ error: "Agent not found" });
  }
  res.json(agent);
});

/**
 * DELETE /agents/:id — Disconnect a specific agent by ID.
 * Sends a kick notification so the agent suppresses auto-reconnect,
 * then closes the WebSocket.
 */
router.delete("/:id", (req: Request, res: Response) => {
  const agentId = req.params.id as string;
  const wasDisconnected = disconnectAgent(agentId);
  if (!wasDisconnected) {
    return res.status(404).json({ error: "Agent not found" });
  }
  res.json({ disconnected: true, agentId });
});

export default router;
