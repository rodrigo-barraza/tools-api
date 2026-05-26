// ─── Workspace Agent Status Endpoints ───────────────────────

import { Request, Response, Router } from "express";
import { getConnectedAgents } from "../services/AgentConnectionManager.ts";

const router = Router();

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
