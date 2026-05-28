// ─── Workspace Agent Status Endpoints ───────────────────────

import { Request, Response, Router } from "express";
import { getConnectedAgents } from "../services/AgentConnectionManager.ts";
import MinioService from "../services/MinioService.ts";
import logger from "../logger.ts";

const router = Router();

const AGENT_BUCKET = "artifacts";
const AGENT_OBJECT_KEY = "workspace-service/workspace-agent.mjs";

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
 * GET /agents/download/agent — Serve the single-file workspace agent (.mjs)
 * from MinIO object storage as a browser download.
 */
router.get("/download/agent", async (_req: Request, res: Response) => {
  try {
    const objectStat = await MinioService.statObject(AGENT_BUCKET, AGENT_OBJECT_KEY);
    const objectStream = await MinioService.getObject(AGENT_BUCKET, AGENT_OBJECT_KEY);

    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"workspace-agent.mjs\"");
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
