import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
// ─── Video Game Data Endpoints ──────────────────────────────

import { Request, Response, Router } from "express";
import { createBonfire, bonfireStore } from "../services/BonfireService.ts";
import {
  getHeroes,
  getHero,
  getHeroMatchups,
  getPlayer,
  getPlayerRecentMatches,
  getMatch,
  getProMatches,
} from "../fetchers/gaming/DotaFetcher.ts";
import { errorMessage } from "../utilities.ts";

const router = Router();

// ─── 1. Dota 2 — Hero Data ──────────────────────────────────

router.get("/dota/heroes", asyncHandler(async (req: Request, res: Response) => {
  try {
    const heroes = await getHeroes();
    const { role, attr, q } = req.query as Record<string, string | undefined>;

    let filtered = heroes;

    if (q) {
      const query = q.toLowerCase();
      filtered = filtered.filter((h) => h.name.toLowerCase().includes(query));
    }

    if (role) {
      const roleLower = role.toLowerCase();
      filtered = filtered.filter((h) =>
        h.roles.some((r: string) => r.toLowerCase() === roleLower),
      );
    }

    if (attr) {
      const attrMap: Record<string, string> = { str: "str", agi: "agi", int: "int", all: "all", universal: "all" };
      const attrKey = attrMap[attr.toLowerCase()] || attr.toLowerCase();
      filtered = filtered.filter((h) => h.primaryAttr === attrKey);
    }

    res.json({ count: filtered.length, heroes: filtered });
  } catch (error: unknown) {
    res.status(500).json({ error: `Failed to fetch heroes: ${errorMessage(error)}` });
  }
}));

router.get("/dota/heroes/:query", asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await getHero(req.params.query as string);
    if (!result) {
      return res.status(404).json({ error: `Hero not found: ${req.params.query as string}` });
    }
    res.json(result);
  } catch (error: unknown) {
    res.status(500).json({ error: `Failed to fetch hero: ${errorMessage(error)}` });
  }
}));

router.get("/dota/heroes/:heroId/matchups", asyncHandler(async (req: Request, res: Response) => {
  try {
    const heroId = parseInt(req.params.heroId as string);
    if (isNaN(heroId)) {
      return res.status(400).json({ error: "heroId must be a number" });
    }

    // Enrich matchup hero IDs with names
    const [matchups, heroes] = await Promise.all([
      getHeroMatchups(heroId),
      getHeroes(),
    ]);

    const heroMap = new Map(heroes.map((h) => [h.id, h.name]));
    const enrichMatchup = (m: { heroId: number; gamesPlayed: number; wins: number; winRate: string }) => ({ ...m, heroName: heroMap.get(m.heroId) || "Unknown" });

    res.json({
      ...matchups,
      bestAgainst: matchups.bestAgainst.map(enrichMatchup),
      worstAgainst: matchups.worstAgainst.map(enrichMatchup),
    });
  } catch (error: unknown) {
    res.status(500).json({ error: `Failed to fetch matchups: ${errorMessage(error)}` });
  }
}));

// ─── 2. Dota 2 — Player Data ────────────────────────────────

router.get("/dota/players/:accountId", asyncHandler(async (req: Request, res: Response) => {
  try {
    const accountId = parseInt(req.params.accountId as string);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: "accountId must be a number (Steam32 ID)" });
    }
    const player = await getPlayer(accountId);
    res.json(player);
  } catch (error: unknown) {
    res.status(500).json({ error: `Failed to fetch player: ${errorMessage(error)}` });
  }
}));

router.get("/dota/players/:accountId/matches", asyncHandler(async (req: Request, res: Response) => {
  try {
    const accountId = parseInt(req.params.accountId as string);
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: "accountId must be a number (Steam32 ID)" });
    }

    const [matches, heroes] = await Promise.all([
      getPlayerRecentMatches(accountId, limit),
      getHeroes(),
    ]);

    const heroMap = new Map(heroes.map((h) => [h.id, h.name]));
    const enriched = matches.map((m) => ({
      ...m,
      heroName: heroMap.get(m.heroId) || "Unknown",
    }));

    res.json({ count: enriched.length, matches: enriched });
  } catch (error: unknown) {
    res.status(500).json({ error: `Failed to fetch matches: ${errorMessage(error)}` });
  }
}));

// ─── 3. Dota 2 — Match Data ─────────────────────────────────

router.get("/dota/matches/:matchId", asyncHandler(async (req: Request, res: Response) => {
  try {
    const matchId = parseInt(req.params.matchId as string);
    if (isNaN(matchId)) {
      return res.status(400).json({ error: "matchId must be a number" });
    }

    const [match, heroes] = await Promise.all([
      getMatch(matchId),
      getHeroes(),
    ]);

    const heroMap = new Map(heroes.map((h) => [h.id, h.name]));
    match.players = match.players.map((p) => ({
      ...p,
      heroName: heroMap.get(p.heroId) || "Unknown",
    }));

    res.json(match);
  } catch (error: unknown) {
    res.status(500).json({ error: `Failed to fetch match: ${errorMessage(error)}` });
  }
}));

// ─── 4. Dota 2 — Pro Scene ──────────────────────────────────

router.get("/dota/pro-matches", asyncHandler(async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const matches = await getProMatches(limit);
    res.json({ count: matches.length, matches });
  } catch (error: unknown) {
    res.status(500).json({ error: `Failed to fetch pro matches: ${errorMessage(error)}` });
  }
}));

// ─── Unified Dota Dispatcher (for AI tool schema) ───────────

router.get("/dota", asyncHandler(async (req: Request, res: Response) => {
  const { action, query, heroId, accountId, matchId, limit, role, attr } = req.query as Record<string, string | undefined>;
  if (!action) {
    return res.status(400).json({
      error: "'action' is required",
      actions: ["heroes", "hero", "matchups", "player", "player_matches", "match", "pro_matches"],
    });
  }

  // Build query string for sub-routes
  const buildQueryString = (params: Record<string, string | undefined>) => {
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) searchParams.set(k, String(v));
    }
    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : "";
  };

  switch (action) {
    case "heroes":
      req.url = `/dota/heroes${buildQueryString({ q: query, role, attr })}`;
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    case "hero":
      if (!query) return res.status(400).json({ error: "'query' is required for action=hero (hero name or ID)" });
      req.url = `/dota/heroes/${encodeURIComponent(query)}`;
      req.params.query = query;
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    case "matchups":
      if (!heroId) return res.status(400).json({ error: "'heroId' is required for action=matchups" });
      req.url = `/dota/heroes/${heroId}/matchups`;
      req.params.heroId = String(heroId);
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    case "player":
      if (!accountId) return res.status(400).json({ error: "'accountId' is required for action=player" });
      req.url = `/dota/players/${accountId}`;
      req.params.accountId = String(accountId);
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    case "player_matches":
      if (!accountId) return res.status(400).json({ error: "'accountId' is required for action=player_matches" });
      req.url = `/dota/players/${accountId}/matches${buildQueryString({ limit })}`;
      req.params.accountId = String(accountId);
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    case "match":
      if (!matchId) return res.status(400).json({ error: "'matchId' is required for action=match" });
      req.url = `/dota/matches/${matchId}`;
      req.params.matchId = String(matchId);
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    case "pro_matches":
      req.url = `/dota/pro-matches${buildQueryString({ limit })}`;
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    default:
      return res.status(400).json({
        error: `Unknown action: ${action}`,
        actions: ["heroes", "hero", "matchups", "player", "player_matches", "match", "pro_matches"],
      });
  }
}));

// ─── 5. Bonfire — Fun campfire generator ───────────────────

router.post("/bonfire", asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = createBonfire(req.body);
    res.json(result);
  } catch (error: unknown) {
    res.status(400).json({ error: errorMessage(error) });
  }
}));

router.get("/bonfire/embed", (req: Request, res: Response) => {
  const { id } = req.query as Record<string, string | undefined>;
  if (!id) {
    return res.status(400).send("Missing 'id' parameter");
  }
  const bonfire = bonfireStore.get(id);
  if (!bonfire) {
    return res.status(404).send("Bonfire not found or expired");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(bonfire.htmlEmbed);
});

// ─── Health ─────────────────────────────────────────────────

export function getGamingHealth() {
  return {
    dota: "on-demand (OpenDota API)",
    bonfire: "on-demand (Custom Bonfire Service)",
  };
}

export default router;
