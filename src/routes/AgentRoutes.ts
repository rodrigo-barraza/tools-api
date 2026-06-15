// ─── Workspace Agent Status Endpoints ───────────────────────

import { Request, Response, Router } from "express";
import { getConnectedAgents } from "../services/AgentConnectionManager.ts";
import MinioService from "../services/MinioService.ts";
import logger from "../logger.ts";
import AgentCompilerService, { CompilationTarget } from "../services/AgentCompilerService.ts";
import { createReadStream } from "node:fs";

const router = Router();

const AGENT_BUCKET = "artifacts";
const AGENT_OBJECT_KEY = "workspace-service/workspace-agent.mjs";

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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.warn(`[Agents] Failed to serve agent download: ${errorMessage}`);
    res.status(404).json({ error: "Workspace agent file not available" });
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

export default router;
