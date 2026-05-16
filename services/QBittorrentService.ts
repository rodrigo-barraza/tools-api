// ─── qBittorrent WebUI API Service ─────────────────────────
// HTTP client wrapping the qBittorrent Web API v2 for torrent
// search, download, and management via installed search plugins.
// ─────────────────────────────────────────────────────────────

import CONFIG from "../config.ts";
import logger from "../logger.ts";

const LOG_PREFIX = "🧲 QBittorrent";

/** Session cookie (SID) cached across requests */
let sessionCookie = null;
let sessionExpiry = 0;

/** Session TTL — re-authenticate after 50 minutes (qBT default session is 60m) */
const SESSION_TTL_MS = 50 * 60 * 1000;

// ─── Internals ──────────────────────────────────────────────

function getBaseUrl() {
  return CONFIG.QBITTORRENT_URL?.replace(/\/+$/, "") || "";
}

/**
 * Authenticate with qBittorrent WebUI API.
 * Returns the SID session cookie for subsequent requests.
 */
async function authenticate() {
  const now = Date.now();
  if (sessionCookie && now < sessionExpiry) return sessionCookie;

  const baseUrl = getBaseUrl();
  if (!baseUrl) throw new Error("QBITTORRENT_URL not configured");

  const res = await fetch(`${baseUrl}/api/v2/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: CONFIG.QBITTORRENT_USERNAME || "admin",
      password: CONFIG.QBITTORRENT_PASSWORD || "",
    }),
  });

  if (!res.ok) {
    throw new Error(`qBittorrent auth failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  if (text.trim() !== "Ok.") {
    throw new Error(`qBittorrent auth rejected: ${text}`);
  }

  // Extract SID from Set-Cookie header
  const setCookie = res.headers.get("set-cookie") || "";
  const sidMatch = setCookie.match(/SID=([^;]+)/);
  if (!sidMatch) {
    throw new Error("qBittorrent did not return SID cookie");
  }

  sessionCookie = sidMatch[1];
  sessionExpiry = now + SESSION_TTL_MS;
  logger.info(`${LOG_PREFIX} — Authenticated (session valid for 50m)`);
  return sessionCookie;
}

/**
 * Make an authenticated request to the qBittorrent API.
 */
async function qbtFetch(path, { method = "GET", body, params }: Record<string, any> = {}) {
  const sid = await authenticate();
  const baseUrl = getBaseUrl();

  let url = `${baseUrl}${path}`;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    if (qs) url += `?${qs}`;
  }

  const opts: Record<string, any> = {
    method,
    headers: { Cookie: `SID=${sid}` },
  };

  if (body && method !== "GET") {
    if (body instanceof URLSearchParams) {
      opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.body = body;
    } else {
      opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.body = new URLSearchParams(body);
    }
  }

  const res = await fetch(url, opts);

  // Session expired — re-auth once
  if (res.status === 403) {
    sessionCookie = null;
    sessionExpiry = 0;
    const newSid = await authenticate();
    opts.headers.Cookie = `SID=${newSid}`;
    const retry = await fetch(url, opts);
    if (!retry.ok) {
      throw new Error(`qBittorrent API error: ${retry.status} ${retry.statusText}`);
    }
    const ct = retry.headers.get("content-type") || "";
    return ct.includes("json") ? retry.json() : retry.text();
  }

  if (!res.ok) {
    throw new Error(`qBittorrent API error: ${res.status} ${res.statusText}`);
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("json") ? res.json() : res.text();
}

// ─── Search API ─────────────────────────────────────────────

/**
 * Start a torrent search across installed plugins.
 * @param {string} pattern - Search query
 * @param {string} plugins - Plugin names (pipe-separated) or "all" or "enabled"
 * @param {string} category - Category filter: all|movies|tv|music|games|anime|software|pictures|books
 * @returns {{ id: number }} Search job ID
 */
export async function startSearch(pattern, plugins = "enabled", category = "all") {
  const result = await qbtFetch("/api/v2/search/start", {
    method: "POST",
    body: { pattern, plugins, category },
  });
  logger.info(`${LOG_PREFIX} — Search started: "${pattern}" → job ${result?.id}`);
  return result;
}

/**
 * Get the status of a search job.
 * @param {number} id - Search job ID
 */
export async function getSearchStatus(id) {
  return qbtFetch("/api/v2/search/status", {
    method: "POST",
    body: { id: String(id) },
  });
}

/**
 * Get search results.
 * @param {number} id - Search job ID
 * @param {number} limit - Max results
 * @param {number} offset - Result offset
 */
export async function getSearchResults(id, limit = 50, offset = 0) {
  return qbtFetch("/api/v2/search/results", {
    method: "POST",
    body: { id: String(id), limit: String(limit), offset: String(offset) },
  });
}

/**
 * Stop a running search.
 */
export async function stopSearch(id) {
  return qbtFetch("/api/v2/search/stop", {
    method: "POST",
    body: { id: String(id) },
  });
}

/**
 * Delete a search job and free resources.
 */
export async function deleteSearch(id) {
  return qbtFetch("/api/v2/search/delete", {
    method: "POST",
    body: { id: String(id) },
  });
}

/**
 * Run a complete search lifecycle: start → poll → get results → cleanup.
 * This is the primary method used by the route handler.
 */
export async function search(pattern, { plugins = "enabled", category = "all", limit = 50, timeoutMs = 30000 }: Record<string, any> = {}) {
  const { id } = await startSearch(pattern, plugins, category);
  const deadline = Date.now() + timeoutMs;

  // Poll until complete or timeout
  let status = "Running";
  while (status === "Running" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const statusRes = await getSearchStatus(id);
    // statusRes is an array of search statuses
    const job = Array.isArray(statusRes) ? statusRes.find((s) => s.id === id) : statusRes;
    status = job?.status || "Stopped";
  }

  // Fetch results
  const results = await getSearchResults(id, limit, 0);

  // Cleanup
  try {
    await deleteSearch(id);
  } catch {
    // Ignore cleanup errors
  }

  return {
    query: pattern,
    category,
    plugins,
    totalResults: results?.total || 0,
    results: (results?.results || []).map((r) => ({
      name: r.fileName,
      size: r.fileSize,
      seeds: r.nbSeeders,
      leech: r.nbLeechers,
      link: r.fileUrl,
      siteUrl: r.siteUrl,
      descriptionUrl: r.descrLink,
      publishDate: r.pubDate ? new Date(r.pubDate * 1000).toISOString() : null,
    })),
  };
}

// ─── Plugin Management ──────────────────────────────────────

/**
 * List installed search plugins.
 */
export async function getPlugins() {
  const plugins = await qbtFetch("/api/v2/search/plugins");
  return (Array.isArray(plugins) ? plugins : []).map((p) => ({
    name: p.name,
    fullName: p.fullName,
    url: p.url,
    enabled: p.enabled,
    version: p.version,
    supportedCategories: p.supportedCategories?.map((c) => c.name) || [],
  }));
}

/**
 * Install search plugins from URLs.
 * @param {string} sources - Pipe-separated URLs to plugin .py files
 */
export async function installPlugin(sources) {
  await qbtFetch("/api/v2/search/installPlugin", {
    method: "POST",
    body: { sources },
  });
  logger.info(`${LOG_PREFIX} — Plugin installed from: ${sources}`);
  return { success: true, sources };
}

/**
 * Enable or disable a search plugin.
 */
export async function enablePlugin(names, enable = true) {
  await qbtFetch("/api/v2/search/enablePlugin", {
    method: "POST",
    body: { names, enable: String(enable) },
  });
  return { success: true, names, enabled: enable };
}

/**
 * Update all installed search plugins.
 */
export async function updatePlugins() {
  await qbtFetch("/api/v2/search/updatePlugins", { method: "POST" });
  return { success: true };
}

// ─── Torrent Management ─────────────────────────────────────

/**
 * Add a torrent via magnet link or URL.
 * @param {string} urls - Magnet URIs or torrent URLs (one per line or pipe-separated)
 * @param {object} opts - savepath, category, tags, paused, etc.
 */
export async function addTorrent(urls, opts: Record<string, any> = {}) {
  const body: Record<string, any> = { urls: urls.replace(/\|/g, "\n") };
  if (opts.savePath) body.savepath = opts.savePath;
  if (opts.category) body.category = opts.category;
  if (opts.tags) body.tags = opts.tags;
  if (opts.paused !== undefined) body.paused = String(opts.paused);
  if (opts.sequentialDownload) body.sequentialDownload = "true";
  if (opts.firstLastPiece) body.firstLastPiecePrio = "true";

  await qbtFetch("/api/v2/torrents/add", {
    method: "POST",
    body,
  });
  logger.info(`${LOG_PREFIX} — Torrent added: ${urls.slice(0, 80)}...`);
  return { success: true };
}

/**
 * List torrents with optional filter.
 * @param {object} opts - filter, category, tag, sort, limit
 */
export async function listTorrents(opts: Record<string, any> = {}) {
  const params: Record<string, any> = {};
  if (opts.filter) params.filter = opts.filter; // all|downloading|seeding|completed|paused|active|inactive|resumed|stalled|errored
  if (opts.category) params.category = opts.category;
  if (opts.tag) params.tag = opts.tag;
  if (opts.sort) params.sort = opts.sort;
  if (opts.limit) params.limit = String(opts.limit);
  if (opts.offset) params.offset = String(opts.offset);

  const torrents = await qbtFetch("/api/v2/torrents/info", { params });
  return (Array.isArray(torrents) ? torrents : []).map((t) => ({
    hash: t.hash,
    name: t.name,
    size: t.size,
    progress: Math.round(t.progress * 100),
    state: t.state,
    seeds: t.num_seeds,
    leech: t.num_leechs,
    downloadSpeed: t.dlspeed,
    uploadSpeed: t.upspeed,
    eta: t.eta,
    category: t.category,
    tags: t.tags,
    addedOn: new Date(t.added_on * 1000).toISOString(),
    savePath: t.save_path,
    ratio: t.ratio,
    amountLeft: t.amount_left,
    downloaded: t.downloaded,
    uploaded: t.uploaded,
  }));
}

/**
 * Pause one or more torrents.
 * @param {string} hashes - Pipe-separated hashes, or "all"
 */
export async function pauseTorrents(hashes = "all") {
  await qbtFetch("/api/v2/torrents/pause", {
    method: "POST",
    body: { hashes },
  });
  return { success: true };
}

/**
 * Resume one or more torrents.
 */
export async function resumeTorrents(hashes = "all") {
  await qbtFetch("/api/v2/torrents/resume", {
    method: "POST",
    body: { hashes },
  });
  return { success: true };
}

/**
 * Delete one or more torrents.
 * @param {string} hashes - Pipe-separated hashes
 * @param {boolean} deleteFiles - Also delete downloaded data
 */
export async function deleteTorrents(hashes, deleteFiles = false) {
  await qbtFetch("/api/v2/torrents/delete", {
    method: "POST",
    body: { hashes, deleteFiles: String(deleteFiles) },
  });
  return { success: true };
}

/**
 * Get global transfer info (speeds, session stats).
 */
export async function getTransferInfo() {
  return qbtFetch("/api/v2/transfer/info");
}

// ─── Health Check ───────────────────────────────────────────

/**
 * Check if qBittorrent is reachable and authenticated.
 */
export async function isHealthy() {
  try {
    if (!getBaseUrl()) return false;
    await authenticate();
    const version = await qbtFetch("/api/v2/app/version");
    return { healthy: true, version };
  } catch {
    return { healthy: false };
  }
}
