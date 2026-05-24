import { asyncHandler, HealthTracker, setupStreamingSSE } from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { Request, Response, Router } from "express";
import DiscordDataService from "../services/DiscordDataService.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

const router = Router();
// ─── Health ─────────────────────────────────────────────────────
const health = new HealthTracker();
export function getDiscordHealth() {
  return health.getHealth();
}
const options = { errorStatus: 500, health };
// ─── GET /messages/search ───────────────────────────────────────
// Search Discord messages with flexible filters.
// Query: ?guildId=...&channelId=...&userId=...&query=...&before=...&after=...&limit=50&mode=messages
router.get(
  "/messages/search",
  asyncHandler((req: Request) => {
    return DiscordDataService.searchMessages({
      guildId: req.query.guildId as string,
      channelId: req.query.channelId as string,
      userId: req.query.userId as string,
      username: req.query.username as string,
      query: req.query.query as string,
      before: req.query.before as string,
      after: req.query.after as string,
      limit: parseIntParam(req.query.limit as string, 50),
      mode: (req.query.mode as "messages" | "count" | "compact") || "messages",
      includeBots: req.query.includeBots as string === "true",
    });
  }, "Message search", options),
);
// ─── GET /messages/stream ───────────────────────────────────────
// SSE endpoint — streams Discord messages in real-time.
// Sends an `init` event with the initial batch, then polls every
// second and pushes:
//   `new`       — messages that appeared since the last poll
//   `delete`    — IDs of messages removed since the last poll
//   `heartbeat` — keep-alive ping every 15s
// Query: ?guildId=...&channelId=...&limit=50
router.get("/messages/stream", (req: Request, res: Response) => {
  const guildId = req.query.guildId as string;
  const channelId = req.query.channelId as string;
  const limit = parseIntParam(req.query.limit as string, 50, 500);
  const includeBots = req.query.includeBots as string === "true";
  if (!guildId) {
    return res.status(400).json({ error: "guildId is required" });
  }
  // Set SSE headers (Content-Type: text/event-stream, etc.)
  setupStreamingSSE(res);
  let closed = false;
  // Track known message IDs so we can detect deletions
  let knownIds = new Set<string>();
  // Track per-message reaction fingerprints to detect reaction changes
  // on existing messages (reactions don't change the message ID, so
  // the old poll missed them entirely).
  let reactionFingerprints = new Map<string, string>();

  interface StreamMessage {
    id: string;
    reactions?: Array<{ emoji?: { id?: string; name?: string }; count: number }>;
    [key: string]: unknown;
  }

  /**
   * Build a lightweight fingerprint of a message's reactions array.
   * Used to detect when someone adds/removes a reaction on Discord
   * without the message ID itself changing.
   */
  function reactionHash(message: StreamMessage) {
    if (!message.reactions?.length) return "";
    return message.reactions
      .map((r) => `${r.emoji?.id || r.emoji?.name}:${r.count}`)
      .join(",");
  }

  // ── Initial load ──────────────────────────────────────────────
  async function init() {
    try {
      const data = await DiscordDataService.searchMessages({
        guildId, channelId, limit, includeBots,
      });
      if (closed) return;
      const messages = data.messages || [];
      knownIds = new Set((messages as StreamMessage[]).map((m) => m.id));
      reactionFingerprints = new Map((messages as StreamMessage[]).map((m) => [m.id, reactionHash(m)]));
      res.write(`event: init\ndata: ${JSON.stringify({ messages })}\n\n`);
      health.markSuccess();
    } catch (error: unknown) {
      logger.error("[discord/stream] Init error:", errorMessage(error));
      health.markError(error);
      if (!closed) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: errorMessage(error) })}\n\n`);
      }
    }
  }
  // ── Poll for changes (new messages + deletions + reaction changes) ──
  async function poll() {
    if (closed) return;
    try {
      const data = await DiscordDataService.searchMessages({
        guildId, channelId, limit, includeBots,
      });
      const messages = data.messages || [];
      const currentIds = new Set((messages as StreamMessage[]).map((m) => m.id));
      // ── Detect new messages ─────────────────────────────────
      const newMessages = (messages as StreamMessage[]).filter((m) => !knownIds.has(m.id));
      if (newMessages.length > 0) {
        // Send newest-first (same order as searchMessages returns)
        res.write(`event: new\ndata: ${JSON.stringify({ messages: newMessages })}\n\n`);
        health.markSuccess();
      }
      // ── Detect deleted messages ─────────────────────────────
      const deletedIds: unknown[] = [];
      for (const id of knownIds) {
        if (!currentIds.has(id)) {
          deletedIds.push(id);
        }
      }
      if (deletedIds.length > 0) {
        res.write(`event: delete\ndata: ${JSON.stringify({ ids: deletedIds })}\n\n`);
      }
      // ── Detect reaction changes on existing messages ─────────
      // Compare reaction fingerprints — if they differ, the message's
      // reactions were added/removed since the last poll.
      const updatedMessages = (messages as StreamMessage[]).filter((m) => {
        if (!knownIds.has(m.id)) return false; // new messages handled above
        const oldHash = reactionFingerprints.get(m.id);
        const newHash = reactionHash(m);
        return oldHash !== newHash;
      });
      if (updatedMessages.length > 0) {
        res.write(`event: update\ndata: ${JSON.stringify({ messages: updatedMessages })}\n\n`);
      }
      // Update tracked sets
      knownIds = currentIds;
      reactionFingerprints = new Map((messages as StreamMessage[]).map((m) => [m.id, reactionHash(m)]));
    } catch (error: unknown) {
      logger.error("[discord/stream] Poll error:", errorMessage(error));
      health.markError(error);
    }
  }
  // ── Heartbeat — keeps the connection alive through proxies ────
  const heartbeatInterval = setInterval(() => {
    if (closed) return;
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  }, 15_000);
  // ── Start polling at 1s interval ──────────────────────────────
  init().then(() => {
    if (!closed) {
      pollInterval = setInterval(poll, 1_000);
    }
  });
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  // ── Cleanup on disconnect ─────────────────────────────────────
  req.on("close", () => {
    closed = true;
    if (pollInterval) clearInterval(pollInterval);
    clearInterval(heartbeatInterval);
  });
});
// ─── GET /messages/analytics ────────────────────────────────────
// Aggregate Discord messages with group-by queries.
// Query: ?guildId=...&groupBy=user&query=...&before=...&after=...&topN=25
router.get(
  "/messages/analytics",
  asyncHandler((req: Request) => {
    return DiscordDataService.analyzeMessages({
      guildId: req.query.guildId as string,
      channelId: req.query.channelId as string,
      userId: req.query.userId as string,
      username: req.query.username as string,
      query: req.query.query as string,
      before: req.query.before as string,
      after: req.query.after as string,
      groupBy: (req.query.groupBy as "user" | "channel" | "day" | "hour" | "weekday" | "month") || "user",
      topN: parseIntParam(req.query.topN as string, 25),
      includeBots: req.query.includeBots as string === "true",
    });
  }, "Message analytics", options),
);
// ─── GET /activity ──────────────────────────────────────────────
// Get server activity stats: top users, channel breakdown, hourly distribution.
// Query: ?guildId=...&channelId=...&days=7&topN=15
router.get(
  "/activity",
  asyncHandler((req: Request) => {
    return DiscordDataService.getServerActivity({
      guildId: req.query.guildId as string,
      channelId: req.query.channelId as string,
      days: parseIntParam(req.query.days as string, 7),
      topN: parseIntParam(req.query.topN as string, 15),
    });
  }, "Server activity", options),
);
export default router;
