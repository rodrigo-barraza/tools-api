// ─── External API Usage Tracking ─────────────────────────────
// Wraps global fetch once at boot so every fetcher's outbound
// call is counted per (host, UTC day) without touching the ~100
// fetcher call-sites. Counts buffer in memory and flush to the
// `external-api-usage` collection as $inc upserts every 30s;
// portal-service reads that collection for its External APIs
// dashboard. Internal/service-to-service traffic (private IPs,
// hosts of configured *_URL endpoints) is excluded.
// ─────────────────────────────────────────────────────────────

import { getDatabase } from "@rodrigo-barraza/utilities-library/service/mongo";
import CONFIG from "../config.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// Also read by portal-service/src/services/ExternalProviderUsageService.ts —
// keep the collection name and document shape in sync.
export const EXTERNAL_API_USAGE_COLLECTION = "external-api-usage";

const SERVICE_NAME = "tools-service";
const FLUSH_INTERVAL_MILLISECONDS = 30_000;
// Backstop if Mongo is down for a while — drop oldest-day buckets over cap.
const MAXIMUM_PENDING_BUCKETS = 5_000;

interface UsageBucket {
  host: string;
  date: string; // YYYY-MM-DD (UTC)
  requests: number;
  errors: number;
}

const pendingBuckets = new Map<string, UsageBucket>();
const internalHosts = new Set<string>();
let isInstalled = false;
let flushTimer: NodeJS.Timeout | null = null;

// ── Host classification ────────────────────────────────────────────

function isPrivateHostname(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname === "host.docker.internal" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan")
  ) {
    return true;
  }

  // IPv6 literals (fetch URLs carry them bracketed) — treat as internal.
  if (hostname.includes(":") || hostname.startsWith("[")) return true;

  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) return false;

  const firstOctet = Number(ipv4Match[1]);
  const secondOctet = Number(ipv4Match[2]);
  return (
    firstOctet === 0 ||
    firstOctet === 10 ||
    firstOctet === 127 ||
    (firstOctet === 169 && secondOctet === 254) ||
    (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
    (firstOctet === 192 && secondOctet === 168)
  );
}

/** Hostnames of every configured internal endpoint (MinIO, prism, portal…). */
function collectInternalHostsFromConfig(): void {
  for (const value of Object.values(CONFIG)) {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value)) continue;
    try {
      internalHosts.add(new URL(value).hostname.toLowerCase());
    } catch {
      // Not a parseable URL — ignore.
    }
  }
}

function extractRequestUrl(input: RequestInfo | URL): string | null {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === "object" && "url" in input) return input.url;
  return null;
}

/** Returns the external hostname for a fetch input, or null if untracked. */
function resolveExternalHost(input: RequestInfo | URL): string | null {
  const url = extractRequestUrl(input);
  if (!url) return null;

  let hostname: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }

  if (!hostname || isPrivateHostname(hostname) || internalHosts.has(hostname)) {
    return null;
  }
  return hostname;
}

// ── Counting + flushing ────────────────────────────────────────────

function recordCall(host: string, isError: boolean): void {
  const date = new Date().toISOString().slice(0, 10);
  const key = `${host}|${date}`;

  let bucket = pendingBuckets.get(key);
  if (!bucket) {
    if (pendingBuckets.size >= MAXIMUM_PENDING_BUCKETS) return;
    bucket = { host, date, requests: 0, errors: 0 };
    pendingBuckets.set(key, bucket);
  }

  bucket.requests += 1;
  if (isError) bucket.errors += 1;
}

async function flushPendingBuckets(): Promise<void> {
  if (pendingBuckets.size === 0) return;

  const buckets = [...pendingBuckets.values()];
  pendingBuckets.clear();

  try {
    const collection = getDatabase().collection(EXTERNAL_API_USAGE_COLLECTION);
    await collection.bulkWrite(
      buckets.map((bucket) => ({
        updateOne: {
          filter: { service: SERVICE_NAME, host: bucket.host, date: bucket.date },
          update: {
            $inc: { requests: bucket.requests, errors: bucket.errors },
            $setOnInsert: { service: SERVICE_NAME, host: bucket.host, date: bucket.date },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (error: unknown) {
    // Mongo hiccup — put the counts back so the next flush retries them.
    for (const bucket of buckets) {
      const key = `${bucket.host}|${bucket.date}`;
      const existing = pendingBuckets.get(key);
      if (existing) {
        existing.requests += bucket.requests;
        existing.errors += bucket.errors;
      } else if (pendingBuckets.size < MAXIMUM_PENDING_BUCKETS) {
        pendingBuckets.set(key, bucket);
      }
    }
    logger.warn(`[ExternalApiUsage] Flush failed (will retry): ${errorMessage(error)}`);
  }
}

// ── Public API ─────────────────────────────────────────────────────

export async function setupExternalApiUsageCollection(): Promise<void> {
  try {
    const collection = getDatabase().collection(EXTERNAL_API_USAGE_COLLECTION);
    await Promise.all([
      collection.createIndex({ service: 1, host: 1, date: 1 }, { unique: true }),
      collection.createIndex({ date: -1 }),
    ]);
  } catch (error: unknown) {
    logger.error(`[ExternalApiUsage] Failed to ensure indexes: ${errorMessage(error)}`);
  }
}

/** Wrap global fetch with per-host usage counting. Idempotent. */
export function installExternalApiUsageTracking(): void {
  if (isInstalled) return;
  isInstalled = true;

  collectInternalHostsFromConfig();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const host = resolveExternalHost(input);
    if (!host) return originalFetch(input, init);

    try {
      const response = await originalFetch(input, init);
      recordCall(host, response.status >= 400);
      return response;
    } catch (error: unknown) {
      recordCall(host, true); // network failure / abort
      throw error;
    }
  }) as typeof fetch;

  flushTimer = setInterval(() => void flushPendingBuckets(), FLUSH_INTERVAL_MILLISECONDS);
  flushTimer.unref();

  logger.info(
    `[ExternalApiUsage] Outbound fetch instrumentation installed (${internalHosts.size} internal hosts excluded)`,
  );
}

/** Best-effort final flush for shutdown paths. */
export async function flushExternalApiUsageNow(): Promise<void> {
  if (flushTimer) clearInterval(flushTimer);
  await flushPendingBuckets();
}

// Exported for tests only.
export const __internal = {
  isPrivateHostname,
  resolveExternalHost,
  recordCall,
  pendingBuckets,
  internalHosts,
};
