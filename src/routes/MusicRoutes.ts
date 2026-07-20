import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { type Request, type Response, Router } from "express";
import {
  searchSpotify,
  getSpotify,
  controlSpotify,
  buildAuthorizeUrl,
  handleAuthCallback,
  getAuthStatus,
} from "../fetchers/music/SpotifyFetcher.ts";

const router = Router();

// ─── Spotify Catalog Search ────────────────────────────────────────

router.get(
  "/spotify/search",
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query['q'] as string | undefined;
    const type = req.query.type as string | undefined;
    const limit = req.query.limit as string | undefined;
    const market = req.query.market as string | undefined;
    if (!query) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    const result = await searchSpotify(query, {
      type,
      limit: limit ? parseIntParam(limit, 10) : undefined,
      market,
    });
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);

// ─── Spotify Details & Library Reads ───────────────────────────────

router.get(
  "/spotify/get",
  asyncHandler(async (req: Request, res: Response) => {
    const action = req.query.action as string | undefined;
    const id = req.query.id as string | undefined;
    const limit = req.query.limit as string | undefined;
    const market = req.query.market as string | undefined;
    const timeRange = req.query.timeRange as string | undefined;
    if (!action) {
      return res.status(400).json({ error: "Query parameter 'action' is required" });
    }
    const result = await getSpotify(action, {
      id,
      limit: limit ? parseIntParam(limit, 20) : undefined,
      market,
      timeRange,
    });
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);

// ─── Spotify Playback Control ──────────────────────────────────────

router.post(
  "/spotify/control",
  asyncHandler(async (req: Request, res: Response) => {
    const { action, query, uri, id, deviceId, percent, mode, enabled, positionMs } =
      req.body || {};
    if (!action) {
      return res.status(400).json({ error: "Body parameter 'action' is required" });
    }
    const result = await controlSpotify(action, {
      query,
      uri,
      id,
      deviceId,
      percent: percent !== undefined ? Number(percent) : undefined,
      mode,
      enabled: typeof enabled === "string" ? enabled !== "false" : enabled,
      positionMs: positionMs !== undefined ? Number(positionMs) : undefined,
    });
    if ("error" in result) {
      return res.status(400).json(result);
    }
    res.json(result);
  }),
);

// ─── Spotify OAuth (one-time account connection) ───────────────────

router.get("/spotify/auth/login", (_req: Request, res: Response) => {
  const result = buildAuthorizeUrl();
  if ("error" in result) {
    return res.status(500).json(result);
  }
  res.redirect(result.url);
});

router.get(
  "/spotify/auth/callback",
  asyncHandler(async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const oauthError = req.query.error as string | undefined;
    const page = (title: string, detail: string) =>
      `<!doctype html><html><head><meta charset="utf-8"><title>Spotify — ${title}</title>` +
      `<style>body{font-family:system-ui,sans-serif;background:#121212;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}` +
      `main{text-align:center;max-width:28rem;padding:2rem}h1{color:#1db954;font-size:1.5rem}p{color:#b3b3b3}</style></head>` +
      `<body><main><h1>${title}</h1><p>${detail}</p></main></body></html>`;

    if (oauthError) {
      return res.status(400).send(page("Authorization declined", `Spotify returned: ${oauthError}`));
    }
    if (!code || !state) {
      return res.status(400).send(page("Missing parameters", "Expected 'code' and 'state' from Spotify."));
    }
    const result = await handleAuthCallback(code, state);
    if ("error" in result) {
      return res.status(400).send(page("Authorization failed", result.error));
    }
    res.send(
      page(
        "Spotify connected ✓",
        `Account ${result.account ?? "unknown"} is now linked. Playback and library tools are live — you can close this tab.`,
      ),
    );
  }),
);

router.get(
  "/spotify/auth/status",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getAuthStatus());
  }),
);

export default router;
