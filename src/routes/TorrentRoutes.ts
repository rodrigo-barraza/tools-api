import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
// ─── Torrent Search & Download Routes ──────────────────────
// Wraps qBittorrent WebUI API for search, download, and
// torrent management via installed community search plugins.
// ─────────────────────────────────────────────────────────────

import { Request, Response, Router } from "express";
import * as qbt from "../services/QBittorrentService.ts";
import { TORRENT_SEARCH_TIMEOUT_MS, TORRENT_MAX_TIMEOUT_MS } from "../constants.ts";

const router = Router();

// ─── 1. Search — Full lifecycle (start → poll → results) ───

router.get("/search", asyncHandler(async (req: Request, res: Response) => {
  const { q, query, category, plugins, limit, timeout } = req.query as any;
  const searchQuery = q || query;
  if (!searchQuery) {
    return res.status(400).json({
      error: "'q' or 'query' parameter is required",
      example: "/torrent/search?q=ubuntu&category=software",
    });
  }

  try {
    const results = await qbt.search(searchQuery, {
      category: category || "all",
      plugins: plugins || "enabled",
      limit: Math.min(parseInt(limit) || 50, 100),
      timeoutMs: Math.min(parseInt(timeout) || TORRENT_SEARCH_TIMEOUT_MS, TORRENT_MAX_TIMEOUT_MS),
    });
    res.json(results);
  } catch (error: unknown) {
    res.status(500).json({ error: `Search failed: ${(error as Error).message}` });
  }
}));

// ─── 2. Download — Add torrent by magnet/URL ────────────────

router.post("/download", asyncHandler(async (req: Request, res: Response) => {
  const { url, magnetUrl, magnet, savePath, category, tags, paused } = req.body;
  const torrentUrl = url || magnetUrl || magnet;
  if (!torrentUrl) {
    return res.status(400).json({
      error: "'url' or 'magnetUrl' is required (magnet link or .torrent URL)",
    });
  }

  try {
    const result = await qbt.addTorrent(torrentUrl, {
      savePath,
      category,
      tags,
      paused,
    });
    res.json({ ...result, url: torrentUrl });
  } catch (error: unknown) {
    res.status(500).json({ error: `Download failed: ${(error as Error).message}` });
  }
}));

// ─── 3. Status — List active torrents ───────────────────────

router.get("/status", asyncHandler(async (req: Request, res: Response) => {
  const { filter, category, tag, sort, limit, offset } = req.query as any;

  try {
    const torrents = await qbt.listTorrents({
      filter: filter || "all",
      category,
      tag,
      sort: sort || "added_on",
      limit: Math.min(parseInt(limit) || 50, 200),
      offset: parseInt(offset) || 0,
    });
    res.json({ count: torrents.length, torrents });
  } catch (error: unknown) {
    res.status(500).json({ error: `Status check failed: ${(error as Error).message}` });
  }
}));

// ─── 4. Pause/Resume/Delete ─────────────────────────────────

router.post("/pause", asyncHandler(async (req: Request, res: Response) => {
  const { hashes } = req.body;
  try {
    const result = await qbt.pauseTorrents(hashes || "all");
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ error: `Pause failed: ${(error as Error).message}` });
  }
}));

router.post("/resume", asyncHandler(async (req: Request, res: Response) => {
  const { hashes } = req.body;
  try {
    const result = await qbt.resumeTorrents(hashes || "all");
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ error: `Resume failed: ${(error as Error).message}` });
  }
}));

router.post("/delete", asyncHandler(async (req: Request, res: Response) => {
  const { hashes, deleteFiles } = req.body;
  if (!hashes) {
    return res.status(400).json({ error: "'hashes' is required (pipe-separated hash list)" });
  }
  try {
    const result = await qbt.deleteTorrents(hashes, deleteFiles === true);
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ error: `Delete failed: ${(error as Error).message}` });
  }
}));

// ─── 5. Plugins — List/Install/Enable ───────────────────────

router.get("/plugins", asyncHandler(async (req: Request, res: Response) => {
  try {
    const plugins = await qbt.getPlugins();
    res.json({ count: plugins.length, plugins });
  } catch (error: unknown) {
    res.status(500).json({ error: `Plugin list failed: ${(error as Error).message}` });
  }
}));

router.post("/plugins/install", asyncHandler(async (req: Request, res: Response) => {
  const { url, urls } = req.body;
  const sources = url || urls;
  if (!sources) {
    return res.status(400).json({ error: "'url' is required (URL to .py plugin file)" });
  }
  try {
    const result = await qbt.installPlugin(sources);
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ error: `Plugin install failed: ${(error as Error).message}` });
  }
}));

router.post("/plugins/enable", asyncHandler(async (req: Request, res: Response) => {
  const { names, enable } = req.body;
  if (!names) {
    return res.status(400).json({ error: "'names' is required (pipe-separated plugin names)" });
  }
  try {
    const result = await qbt.enablePlugin(names, enable !== false);
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ error: `Plugin enable failed: ${(error as Error).message}` });
  }
}));

router.post("/plugins/update", asyncHandler(async (_req: Request, res: Response) => {
  try {
    const result = await qbt.updatePlugins();
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ error: `Plugin update failed: ${(error as Error).message}` });
  }
}));

// ─── 6. Transfer Info ───────────────────────────────────────

router.get("/transfer", asyncHandler(async (_req: Request, res: Response) => {
  try {
    const info = await qbt.getTransferInfo();
    res.json(info);
  } catch (error: unknown) {
    res.status(500).json({ error: `Transfer info failed: ${(error as Error).message}` });
  }
}));

// ─── Unified Dispatcher (for AI tool schema) ────────────────

router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const { action, q, query, category, plugins, limit, filter, sort, timeout, hashes } = req.query as any;
  if (!action) {
    return res.status(400).json({
      error: "'action' is required",
      actions: ["search", "status", "plugins", "transfer"],
    });
  }

  switch (action) {
    case "search": {
      const searchQuery = q || query;
      if (!searchQuery) return res.status(400).json({ error: "'q' is required for action=search" });
      const results = await qbt.search(searchQuery, {
        category: category || "all",
        plugins: plugins || "enabled",
        limit: Math.min(parseInt(limit) || 50, 100),
        timeoutMs: Math.min(parseInt(timeout) || TORRENT_SEARCH_TIMEOUT_MS, TORRENT_MAX_TIMEOUT_MS),
      });
      return res.json(results);
    }
    case "status": {
      const torrents = await qbt.listTorrents({
        filter: filter || "all",
        category,
        sort: sort || "added_on",
        limit: Math.min(parseInt(limit) || 50, 200),
      });
      return res.json({ count: torrents.length, torrents });
    }
    case "plugins": {
      const pluginList = await qbt.getPlugins();
      return res.json({ count: pluginList.length, plugins: pluginList });
    }
    case "transfer": {
      const info = await qbt.getTransferInfo();
      return res.json(info);
    }
    case "pause": {
      const result = await qbt.pauseTorrents(hashes || "all");
      return res.json(result);
    }
    case "resume": {
      const resumeResult = await qbt.resumeTorrents(hashes || "all");
      return res.json(resumeResult);
    }
    default:
      return res.status(400).json({
        error: `Unknown action: ${action}`,
        actions: ["search", "status", "plugins", "transfer", "pause", "resume"],
      });
  }
}));

// ─── Health ─────────────────────────────────────────────────

export async function getTorrentHealth() {
  const health = await qbt.isHealthy();
  return {
    qbittorrent: (health as any).healthy
      ? `connected (v${(health as any).version})`
      : "unavailable — QBITTORRENT_URL not configured or unreachable",
  };
}

export default router;
