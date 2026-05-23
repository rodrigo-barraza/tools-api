import CONFIG from "../../config.ts";
import { IPINFO_BASE_URL } from "../../constants.ts";

/**
 * IPinfo.io IP Geolocation fetcher.
 * https://ipinfo.io/developers
 * Free tier: 50,000 requests/month (legacy API with full city-level data).
 *
 * Resolves IP addresses to geographic locations including city, region,
 * country, coordinates, timezone, and ISP/organization information.
 */

// ─── In-Memory Cache ───────────────────────────────────────────────

interface IpLookupResult {
  ip: string;
  hostname: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  org: string | null;
  postal: string | null;
  timezone: string | null;
  fetchedAt: string;
}

interface IpCacheEntry {
  data: IpLookupResult;
  fetchedAt: number;
}

const ipCache = new Map<string, IpCacheEntry>();
const IP_CACHE_TTL_MS = 86_400_000; // 24 hours — IP geo rarely changes
const MAX_CACHE_SIZE = 5_000; // prevent unbounded growth

// ─── Helpers ───────────────────────────────────────────────────────

function evictStaleEntries() {
  if (ipCache.size <= MAX_CACHE_SIZE) return;
  const now = Date.now();
  for (const [key, entry] of ipCache) {
    if (now - entry.fetchedAt > IP_CACHE_TTL_MS) {
      ipCache.delete(key);
    }
  }
  // If still over limit after TTL eviction, drop oldest half
  if (ipCache.size > MAX_CACHE_SIZE) {
    const entries = [...ipCache.entries()].sort(
      (a: [string, IpCacheEntry], b: [string, IpCacheEntry]) => a[1].fetchedAt - b[1].fetchedAt,
    );
    const toRemove = Math.floor(entries.length / 2);
    for (let i = 0; i < toRemove; i++) {
      ipCache.delete(entries[i][0]);
    }
  }
}

// ─── Lookup IP ─────────────────────────────────────────────────────

/**
 * Look up geolocation data for an IP address.


 */
export async function lookupIp(ip: string) {
  const targetIp = ip && ip !== "self" ? ip : "";

  // Check cache
  const cacheKey = targetIp || "__self__";
  const cached = ipCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < IP_CACHE_TTL_MS) {
    return cached.data;
  }

  const tokenParam = CONFIG.IPINFO_TOKEN ? `?token=${CONFIG.IPINFO_TOKEN}` : "";
  const url = `${IPINFO_BASE_URL}/${targetIp}/json${tokenParam}`;

  const response = await fetch(url);

  if (response.status === 429) {
    throw new Error("IPinfo rate limit exceeded");
  }
  if (!response.ok) {
    throw new Error(`IPinfo API → ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Parse lat/lng from "loc" field (format: "49.2827,-123.1207")
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (data.loc) {
    const [lat, lng] = data.loc.split(",").map(Number);
    latitude = lat;
    longitude = lng;
  }

  const result = {
    ip: data.ip,
    hostname: data.hostname || null,
    city: data.city || null,
    region: data.region || null,
    country: data.country || null,
    latitude,
    longitude,
    org: data.org || null,
    postal: data.postal || null,
    timezone: data.timezone || null,
    fetchedAt: new Date().toISOString(),
  };

  // Cache with eviction
  evictStaleEntries();
  ipCache.set(cacheKey, { data: result, fetchedAt: Date.now() });

  return result;
}

// ─── Batch Lookup ──────────────────────────────────────────────────

/**
 * Look up geolocation data for multiple IPs.


 */
export async function batchLookupIps(ips: string[]) {
  const results = await Promise.allSettled(
    ips.slice(0, 20).map((ip) => lookupIp(ip)),
  );

  return results.map((r, i) => ({
    ip: ips[i],
    ...(r.status === "fulfilled" ? r.value : { error: (r as PromiseRejectedResult).reason.message }),
  }));
}
