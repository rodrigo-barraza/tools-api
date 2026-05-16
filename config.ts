// ─── Configuration ──────────────────────────────────────────

/**
 * Parse a comma-separated env var into an array of strings.
 * Returns empty array if not set.
 */
function parseCommaSeparated(envKey: string): string[] {
  const raw = process.env[envKey];
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

// ── Workspace / Agentic ────────────────────────────────────────────
// Exported individually for AgenticFileService, AgenticGitService, etc.
export const WORKSPACE_ROOTS = parseCommaSeparated("WORKSPACE_ROOTS");
export const WORKTREE_DIR = process.env.WORKTREE_DIR;

// ── Location (mutable — populated dynamically by LocationService) ──
interface LocationData {
  latitude: number;
  longitude: number;
  radiusMiles: number;
  timezone: string;
  tideStationId: string | null;
}

// ── Config Shape ───────────────────────────────────────────────────
interface ToolsServiceConfig {
  // Server
  TOOLS_SERVICE_PORT: string | undefined;
  TOOLS_SERVICE_URL: string | undefined;
  MONGODB_URI: string | undefined;

  // Location (mutable)
  LATITUDE: number;
  LONGITUDE: number;
  RADIUS_MILES: number;
  TIMEZONE: string;
  TIDE_STATION_ID: string | null;

  // Event
  TICKETMASTER_API_KEY: string | undefined;
  SEATGEEK_CLIENT_ID: string | undefined;
  TMDB_API_KEY: string | undefined;
  GOOGLE_PLACES_API_KEY: string | undefined;

  // Finance
  FINNHUB_API_KEY: string | undefined;
  FRED_API_KEY: string | undefined;

  // Product
  BESTBUY_API_KEY: string | undefined;
  PRODUCTHUNT_API_KEY: string | undefined;
  PRODUCTHUNT_API_SECRET: string | undefined;
  EBAY_CLIENT_ID: string | undefined;
  EBAY_CLIENT_SECRET: string | undefined;
  ETSY_API_KEY: string | undefined;
  ETSY_SHARED_SECRET: string | undefined;

  // Trend
  REDDIT_CLIENT_ID: string | undefined;
  REDDIT_CLIENT_SECRET: string | undefined;
  REDDIT_USER_AGENT: string | undefined;
  X_BEARER_TOKEN: string | undefined;

  // Weather / Search
  TOMORROWIO_API_KEY: string | undefined;
  NASA_API_KEY: string | undefined;
  GOOGLE_API_KEY: string | undefined;
  GOOGLE_CSE_CX: string | undefined;
  BRAVE_SEARCH_API_KEY: string | undefined;

  // Transit
  TRANSLINK_API_KEY: string | undefined;

  // Utility
  IPINFO_TOKEN: string | undefined;

  // Maritime
  AIS_STREAM_API_KEY: string | undefined;

  // Energy
  EIA_API_KEY: string | undefined;

  // Communication (Twilio)
  TWILIO_ACCOUNT_SID: string | undefined;
  TWILIO_AUTH_TOKEN: string | undefined;

  // Prism (LLM Gateway)
  PRISM_SERVICE_URL: string | undefined;

  // Default AI Models
  TOOLS_IMAGE_MODEL: string | undefined;
  TOOLS_VISION_MODEL: string | undefined;

  // Smart Home
  LIGHTS_SERVICE_URL: string | undefined;

  // MinIO
  MINIO_ENDPOINT: string | undefined;
  MINIO_ACCESS_KEY: string | undefined;
  MINIO_SECRET_KEY: string | undefined;

  // Workspace Agent
  AGENT_SECRET: string | undefined;
  AGENT_MAX_CONNECTIONS: string;
  API_SECRET: string | undefined;

  // qBittorrent
  QBITTORRENT_URL: string | undefined;
  QBITTORRENT_USERNAME: string;
  QBITTORRENT_PASSWORD: string | undefined;
}

const CONFIG: ToolsServiceConfig = {
  // ─── Server ──────────────────────────────────────────────────────
  TOOLS_SERVICE_PORT: process.env.TOOLS_SERVICE_PORT,
  TOOLS_SERVICE_URL: process.env.TOOLS_SERVICE_URL,
  MONGODB_URI: process.env.MONGO_URI,

  // ─── Location (populated dynamically by LocationService.initLocation()) ───
  // Defaults act as fallbacks if initLocation() hasn't run yet.
  LATITUDE: 0,
  LONGITUDE: 0,
  RADIUS_MILES: 50,
  TIMEZONE: "UTC",
  TIDE_STATION_ID: null,

  // ─── Event ───────────────────────────────────────────────────────
  TICKETMASTER_API_KEY: process.env.TICKETMASTER_API_KEY,
  SEATGEEK_CLIENT_ID: process.env.SEATGEEK_CLIENT_ID,
  TMDB_API_KEY: process.env.TMDB_API_KEY,
  GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,

  // ─── Finance (Finnhub) ────────────────────────────────────────────
  FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,

  // ─── Finance (FRED) ──────────────────────────────────────────────
  FRED_API_KEY: process.env.FRED_API_KEY,

  // ─── Product ─────────────────────────────────────────────────────
  BESTBUY_API_KEY: process.env.BESTBUY_API_KEY,
  PRODUCTHUNT_API_KEY: process.env.PRODUCTHUNT_API_KEY,
  PRODUCTHUNT_API_SECRET: process.env.PRODUCTHUNT_API_SECRET,
  EBAY_CLIENT_ID: process.env.EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET: process.env.EBAY_CLIENT_SECRET,
  ETSY_API_KEY: process.env.ETSY_API_KEY,
  ETSY_SHARED_SECRET: process.env.ETSY_SHARED_SECRET,

  // ─── Trend ───────────────────────────────────────────────────────
  REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
  REDDIT_USER_AGENT: process.env.REDDIT_USER_AGENT,
  X_BEARER_TOKEN: process.env.X_BEARER_TOKEN,

  // ─── Weather ─────────────────────────────────────────────────────
  TOMORROWIO_API_KEY: process.env.TOMORROWIO_API_KEY,
  NASA_API_KEY: process.env.NASA_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GOOGLE_CSE_CX: process.env.GOOGLE_CSE_CX,

  // ─── Web Search ───────────────────────────────────────────────────
  BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY,

  // ─── Transit ─────────────────────────────────────────────────────
  TRANSLINK_API_KEY: process.env.TRANSLINK_API_KEY,

  // ─── Utility ─────────────────────────────────────────────────────
  IPINFO_TOKEN: process.env.IPINFO_TOKEN,

  // ─── Maritime ────────────────────────────────────────────────────
  AIS_STREAM_API_KEY: process.env.AIS_STREAM_API_KEY,

  // ─── Energy ──────────────────────────────────────────────────────
  EIA_API_KEY: process.env.EIA_API_KEY,

  // ─── Communication (Twilio) ─────────────────────────────────────
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,

  // ─── Prism (LLM Gateway) ────────────────────────────────────────
  PRISM_SERVICE_URL: process.env.PRISM_SERVICE_URL,

  // ─── Default AI Models (vault-backed) ───────────────────────────
  TOOLS_IMAGE_MODEL: process.env.TOOLS_IMAGE_MODEL,
  TOOLS_VISION_MODEL: process.env.TOOLS_VISION_MODEL,

  // ─── Smart Home (Lights) ────────────────────────────────────────
  LIGHTS_SERVICE_URL: process.env.LIGHTS_SERVICE_URL,

  // ─── MinIO (S3-compatible object storage) ───────────────────────
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT,
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY,

  // ─── Workspace Agent ────────────────────────────────────────────
  AGENT_SECRET: process.env.AGENT_SECRET,
  AGENT_MAX_CONNECTIONS: process.env.AGENT_MAX_CONNECTIONS || "5",
  API_SECRET: process.env.API_SECRET,

  // ─── qBittorrent (Torrent Search & Download) ────────────────────
  QBITTORRENT_URL: process.env.QBITTORRENT_URL,
  QBITTORRENT_USERNAME: process.env.QBITTORRENT_USERNAME || "admin",
  QBITTORRENT_PASSWORD: process.env.QBITTORRENT_PASSWORD,
};

/**
 * Apply resolved location data onto the CONFIG singleton.
 * Called by server.ts after LocationService.initLocation() completes.
 */
export function applyLocation(loc: LocationData): void {
  CONFIG.LATITUDE = loc.latitude;
  CONFIG.LONGITUDE = loc.longitude;
  CONFIG.RADIUS_MILES = loc.radiusMiles;
  CONFIG.TIMEZONE = loc.timezone;
  CONFIG.TIDE_STATION_ID = loc.tideStationId;
}

export type { ToolsServiceConfig, LocationData };
export default CONFIG;
