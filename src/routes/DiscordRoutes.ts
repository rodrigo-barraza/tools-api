import {
  asyncHandler,
  HealthTracker,
  setupStreamingServerSentEvents,
} from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { Request, Response, Router } from "express";
import DiscordDataService from "../services/DiscordDataService.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";
import CONFIG from "../config.ts";

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
  asyncHandler(
    (req: Request) => {
      return DiscordDataService.searchMessages({
        guildId: req.query.guildId as string,
        channelId: req.query.channelId as string,
        userId: req.query.userId as string,
        username: req.query.username as string,
        query: req.query.query as string,
        messageId: req.query.messageId as string,
        before: req.query.before as string,
        after: req.query.after as string,
        limit: parseIntParam(req.query.limit as string, 50),
        mode:
          (req.query.mode as "messages" | "count" | "compact") || "messages",
        includeBots: (req.query.includeBots as string) === "true",
      });
    },
    "Message search",
    options,
  ),
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
  const includeBots = (req.query.includeBots as string) === "true";
  if (!guildId) {
    return res.status(400).json({ error: "guildId is required" });
  }
  // Set SSE headers (Content-Type: text/event-stream, etc.)
  setupStreamingServerSentEvents(res);
  let closed = false;
  // Track known message IDs so we can detect deletions
  let knownIds = new Set<string>();
  // Track per-message reaction fingerprints to detect reaction changes
  // on existing messages (reactions don't change the message ID, so
  // the old poll missed them entirely).
  let reactionFingerprints = new Map<string, string>();

  interface StreamMessage {
    id: string;
    reactions?: Array<{
      emoji?: { id?: string; name?: string };
      count: number;
    }>;
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
        guildId,
        channelId,
        limit,
        includeBots,
      });
      if (closed) return;
      const messages = data.messages || [];
      knownIds = new Set(
        (messages as StreamMessage[]).map((message) => message.id),
      );
      reactionFingerprints = new Map(
        (messages as StreamMessage[]).map((message) => [
          message.id,
          reactionHash(message),
        ]),
      );
      res.write(`event: init\ndata: ${JSON.stringify({ messages })}\n\n`);
      health.markSuccess();
    } catch (error: unknown) {
      logger.error("[discord/stream] Init error:", errorMessage(error));
      health.markError(error);
      if (!closed) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: errorMessage(error) })}\n\n`,
        );
      }
    }
  }
  // ── Poll for changes (new messages + deletions + reaction changes) ──
  async function poll() {
    if (closed) return;
    try {
      const data = await DiscordDataService.searchMessages({
        guildId,
        channelId,
        limit,
        includeBots,
      });
      const messages = data.messages || [];
      const currentIds = new Set(
        (messages as StreamMessage[]).map((message) => message.id),
      );
      // ── Detect new messages ─────────────────────────────────
      const newMessages = (messages as StreamMessage[]).filter(
        (message) => !knownIds.has(message.id),
      );
      if (newMessages.length > 0) {
        // Send newest-first (same order as searchMessages returns)
        res.write(
          `event: new\ndata: ${JSON.stringify({ messages: newMessages })}\n\n`,
        );
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
        res.write(
          `event: delete\ndata: ${JSON.stringify({ ids: deletedIds })}\n\n`,
        );
      }
      // ── Detect reaction changes on existing messages ─────────
      // Compare reaction fingerprints — if they differ, the message's
      // reactions were added/removed since the last poll.
      const updatedMessages = (messages as StreamMessage[]).filter(
        (message) => {
          if (!knownIds.has(message.id)) return false; // new messages handled above
          const oldHash = reactionFingerprints.get(message.id);
          const newHash = reactionHash(message);
          return oldHash !== newHash;
        },
      );
      if (updatedMessages.length > 0) {
        res.write(
          `event: update\ndata: ${JSON.stringify({ messages: updatedMessages })}\n\n`,
        );
      }
      // Update tracked sets
      knownIds = currentIds;
      reactionFingerprints = new Map(
        (messages as StreamMessage[]).map((message) => [
          message.id,
          reactionHash(message),
        ]),
      );
    } catch (error: unknown) {
      logger.error("[discord/stream] Poll error:", errorMessage(error));
      health.markError(error);
    }
  }
  // ── Heartbeat — keeps the connection alive through proxies ────
  const heartbeatInterval = setInterval(() => {
    if (closed) return;
    res.write(
      `event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`,
    );
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
  asyncHandler(
    (req: Request) => {
      return DiscordDataService.analyzeMessages({
        guildId: req.query.guildId as string,
        channelId: req.query.channelId as string,
        userId: req.query.userId as string,
        username: req.query.username as string,
        query: req.query.query as string,
        before: req.query.before as string,
        after: req.query.after as string,
        groupBy:
          (req.query.groupBy as
            | "user"
            | "channel"
            | "day"
            | "hour"
            | "weekday"
            | "month") || "user",
        topN: parseIntParam(req.query.topN as string, 25),
        includeBots: (req.query.includeBots as string) === "true",
      });
    },
    "Message analytics",
    options,
  ),
);
// ─── GET /activity ──────────────────────────────────────────────
// Get server activity stats: top users, channel breakdown, hourly distribution.
// Query: ?guildId=...&channelId=...&days=7&topN=15
router.get(
  "/activity",
  asyncHandler(
    (req: Request) => {
      return DiscordDataService.getServerActivity({
        guildId: req.query.guildId as string,
        channelId: req.query.channelId as string,
        days: parseIntParam(req.query.days as string, 7),
        topN: parseIntParam(req.query.topN as string, 15),
      });
    },
    "Server activity",
    options,
  ),
);

const LUPOS_BOT_URL = CONFIG.LUPOS_BOT_URL || "http://localhost:1337";

async function forwardToLuposBot(path: string, queryParams: Record<string, unknown> = {}) {
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (value !== undefined && value !== null && value !== "") {
      urlParams.set(key, String(value));
    }
  }
  const queryString = urlParams.toString();
  const targetUrl = `${LUPOS_BOT_URL}${path}${queryString ? `?${queryString}` : ""}`;

  const response = await fetch(targetUrl);
  if (!response.ok) {
    throw new Error(`Lupos-bot API returned ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// ─── GET /guild/channels ────────────────────────────────────────
router.get(
  "/guild/channels",
  asyncHandler(
    (req: Request) => {
      return forwardToLuposBot("/guild/channels", {
        guildId: req.query.guildId,
      });
    },
    "Get guild channels",
    options,
  ),
);

// ─── GET /guild/members ─────────────────────────────────────────
router.get(
  "/guild/members",
  asyncHandler(
    (req: Request) => {
      return forwardToLuposBot("/guild/members", {
        guildId: req.query.guildId,
      });
    },
    "Get guild members",
    options,
  ),
);

// ─── GET /guild/emojis ──────────────────────────────────────────
router.get(
  "/guild/emojis",
  asyncHandler(
    (req: Request) => {
      return forwardToLuposBot("/guild/emojis", {
        guildId: req.query.guildId,
      });
    },
    "Get guild emojis",
    options,
  ),
);

// ─── GET /bot/stats ─────────────────────────────────────────────
router.get(
  "/bot/stats",
  asyncHandler(
    () => {
      return forwardToLuposBot("/bot/stats");
    },
    "Get bot stats",
    options,
  ),
);

// ─── GET /bot/guilds ────────────────────────────────────────────
router.get(
  "/bot/guilds",
  asyncHandler(
    () => {
      return forwardToLuposBot("/bot/guilds");
    },
    "Get bot guilds",
    options,
  ),
);

// ─── GET /bot/activity ──────────────────────────────────────────
router.get(
  "/bot/activity",
  asyncHandler(
    () => {
      return forwardToLuposBot("/bot/activity");
    },
    "Get bot activity timeline",
    options,
  ),
);

// ─── GET /guild/heatmap ─────────────────────────────────────────
router.get(
  "/guild/heatmap",
  asyncHandler(
    (req: Request) => {
      return forwardToLuposBot("/guild/heatmap", {
        guildId: req.query.guildId,
        userId: req.query.userId,
        channelId: req.query.channelId,
        years: req.query.years,
        months: req.query.months,
        days: req.query.days,
      });
    },
    "Get user heatmap data",
    options,
  ),
);

// ─── GET /guild/mentions ────────────────────────────────────────
router.get(
  "/guild/mentions",
  asyncHandler(
    (req: Request) => {
      return forwardToLuposBot("/guild/mentions", {
        guildId: req.query.guildId,
        userId: req.query.userId,
        years: req.query.years,
        months: req.query.months,
        days: req.query.days,
        channelId: req.query.channelId,
      });
    },
    "Get user mentions",
    options,
  ),
);

// ─── GET /guild/leaderboard ─────────────────────────────────────
router.get(
  "/guild/leaderboard",
  asyncHandler(
    (req: Request) => {
      return forwardToLuposBot("/guild/leaderboard", {
        guildId: req.query.guildId,
        years: req.query.years,
        months: req.query.months,
        days: req.query.days,
        channelId: req.query.channelId,
      });
    },
    "Get server message leaderboard",
    options,
  ),
);

// ─── GET /guild/word-frequencies ────────────────────────────────
router.get(
  "/guild/word-frequencies",
  asyncHandler(
    (req: Request) => {
      return forwardToLuposBot("/guild/word-frequencies", {
        guildId: req.query.guildId,
        userId: req.query.userId,
        years: req.query.years,
        months: req.query.months,
        days: req.query.days,
        limit: req.query.limit,
      });
    },
    "Get user word frequencies",
    options,
  ),
);

async function forwardPostToLuposBot(path: string, body: Record<string, unknown> = {}) {
  const targetUrl = `${LUPOS_BOT_URL}${path}`;

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Lupos-bot API returned ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// ─── POST /guild/react ──────────────────────────────────────────
router.post(
  "/guild/react",
  asyncHandler(
    (req: Request) => {
      return forwardPostToLuposBot("/guild/react", req.body);
    },
    "React to discord message",
    options,
  ),
);

// ─── GET /guild/voice-members ───────────────────────────────────
router.get(
  "/guild/voice-members",
  asyncHandler(
    (req: Request) => {
      return forwardToLuposBot("/guild/voice-members", {
        guildId: req.query.guildId,
      });
    },
    "Get voice channel members",
    options,
  ),
);

// ─── GET /guild/user-profile ────────────────────────────────────
router.get(
  "/guild/user-profile",
  asyncHandler(
    (req: Request) => {
      return forwardToLuposBot("/guild/user-profile", {
        userId: req.query.userId,
        guildId: req.query.guildId,
      });
    },
    "Get discord user profile",
    options,
  ),
);

// ─── GET /guild/channel-stats ───────────────────────────────────
router.get(
  "/guild/channel-stats",
  asyncHandler(
    (req: Request) => {
      return forwardToLuposBot("/guild/channel-stats", {
        guildId: req.query.guildId,
        days: req.query.days,
      });
    },
    "Get channel activity stats",
    options,
  ),
);

export default router;
