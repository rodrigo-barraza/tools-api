// ─── Web Analytics Fetcher ──────────────────────────────────
// Unified web-analytics reader for the user's own web properties.
//
// Two independent analytics sources cover these sites:
//   • Google Analytics (GA4)  — proxied by portal-service at
//     /google-analytics/*, keyed by a numeric GA property id.
//   • First-party sessions-service — proxied by portal-service at
//     /session-analytics/* (which forwards to sessions-service
//     /stats/* with the shared secret), keyed by projectId.
//
// Some properties exist in BOTH sources. They are joined on the
// registry project id — exposed as `serviceId` on a GA property and
// as `projectId` on a sessions-service project — so each property is
// reported ONCE, with whichever source(s) have data attached.
//
// Data flows entirely through portal-service, which tools-service
// already reaches via PORTAL_SERVICE_URL. No GA credentials or
// sessions secret are needed here.
//
// NOTE ON UNIFICATION: a "GA session" and a "sessions-service
// session" are measured differently (GA de-dupes and drops bots via
// its own model; sessions-service counts server-side heartbeats).
// The two are therefore reported SIDE BY SIDE and never summed. The
// `headline` block picks a single primary source (Google Analytics
// when present, else first-party) so a caller has one coherent set
// of numbers to cite.

import CONFIG from "../../config.ts";
import logger from "../../logger.ts";
import { getErrorMessage } from "@rodrigo-barraza/utilities-library";
import { createApiClient, type ApiClient } from "@rodrigo-barraza/utilities-library/http";

const REQUEST_TIMEOUT_MS = 15_000;

export type AnalyticsPeriod = "7d" | "30d" | "90d";
export type AnalyticsSource = "all" | "google" | "firstParty";
export type AnalyticsBreakdown =
  | "overview"
  | "timeseries"
  | "pages"
  | "sources"
  | "geo"
  | "devices";

export const VALID_PERIODS: AnalyticsPeriod[] = ["7d", "30d", "90d"];
export const VALID_SOURCES: AnalyticsSource[] = ["all", "google", "firstParty"];
export const VALID_BREAKDOWNS: AnalyticsBreakdown[] = [
  "overview",
  "timeseries",
  "pages",
  "sources",
  "geo",
  "devices",
];

// ─── Portal transport ──────────────────────────────────────────

function resolvePortalBaseUrl(): string {
  const baseUrl = CONFIG.PORTAL_SERVICE_URL;
  if (!baseUrl) {
    throw new Error("PORTAL_SERVICE_URL is not configured");
  }
  return baseUrl;
}

export function isAnalyticsConfigured(): boolean {
  return Boolean(CONFIG.PORTAL_SERVICE_URL);
}

// Lazily created so an unconfigured PORTAL_SERVICE_URL throws at call time
// (inside safeGet's catch) rather than at import time, and runtime CONFIG
// changes are picked up. Both GA and sessions analytics flow through
// portal-service, so a single client covers both sources.
let cachedPortalClient: ApiClient | null = null;
let cachedPortalBaseUrl: string | null = null;

function portalClient(): ApiClient {
  const baseUrl = resolvePortalBaseUrl();
  if (!cachedPortalClient || cachedPortalBaseUrl !== baseUrl) {
    cachedPortalClient = createApiClient(baseUrl, {
      headers: { Accept: "application/json" },
      timeoutMilliseconds: REQUEST_TIMEOUT_MS,
      fetchImplementation: (input, init) => fetch(input, init),
    });
    cachedPortalBaseUrl = baseUrl;
  }
  return cachedPortalClient;
}

// A single failing source must not break the whole tool — callers
// treat null as "no data from this source for this property".
async function safeGet<T = unknown>(path: string): Promise<T | null> {
  try {
    return await portalClient().get<T>(path);
  } catch (error: unknown) {
    logger.warn(`[WebAnalytics] GET ${path} failed: ${getErrorMessage(error)}`);
    return null;
  }
}

// sessions-service wraps every /stats payload as { success, data }.
// portal-service forwards it verbatim; unwrap to the inner data.
async function safeSessionsGet<T = unknown>(path: string): Promise<T | null> {
  const response = await safeGet<{ success?: boolean; data?: T }>(path);
  if (!response) return null;
  return response.data ?? (response as unknown as T) ?? null;
}

// ─── Source enumeration ────────────────────────────────────────

interface GaProperty {
  id: string;
  label: string;
  measurementId: string;
  serviceId: string;
  domain: string | null;
}

interface SessionsProject {
  projectId: string;
  sessionCount?: number;
  uniqueVisitors?: number;
  lastActivity?: string | null;
}

async function listGaProperties(): Promise<GaProperty[]> {
  const response = await safeGet<{ properties?: GaProperty[] }>(
    "/google-analytics/properties",
  );
  return response?.properties ?? [];
}

async function listSessionsProjects(
  period: string,
): Promise<SessionsProject[]> {
  const data = await safeSessionsGet<SessionsProject[]>(
    `/session-analytics/projects?period=${encodeURIComponent(period)}`,
  );
  return Array.isArray(data) ? data : [];
}

// ─── Property registry (the join) ──────────────────────────────

interface PropertyMeta {
  key: string; // registry project id — the join key (serviceId === projectId)
  label: string;
  domain: string | null;
  gaPropertyId: string | null;
  measurementId: string | null;
  hasSessions: boolean;
  lastActivity: string | null;
}

function buildRegistry(
  gaProperties: GaProperty[],
  sessionsProjects: SessionsProject[],
): Map<string, PropertyMeta> {
  const registry = new Map<string, PropertyMeta>();

  for (const property of gaProperties) {
    registry.set(property.serviceId, {
      key: property.serviceId,
      label: property.label || property.serviceId,
      domain: property.domain ?? null,
      gaPropertyId: property.id,
      measurementId: property.measurementId || null,
      hasSessions: false,
      lastActivity: null,
    });
  }

  for (const project of sessionsProjects) {
    const existing = registry.get(project.projectId);
    if (existing) {
      existing.hasSessions = true;
      existing.lastActivity = project.lastActivity ?? null;
    } else {
      registry.set(project.projectId, {
        key: project.projectId,
        label: project.projectId,
        domain: null,
        gaPropertyId: null,
        measurementId: null,
        hasSessions: true,
        lastActivity: project.lastActivity ?? null,
      });
    }
  }

  return registry;
}

// Match the caller's `property` filter against any stable identifier.
function matchesFilter(meta: PropertyMeta, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return [meta.key, meta.domain, meta.gaPropertyId, meta.label]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLowerCase() === needle);
}

// ─── Normalisation ─────────────────────────────────────────────
// GA reports rates as 0..1 ratios and durations in seconds.
// sessions-service reports rates as 0..100 percentages and durations
// in milliseconds. Normalise both to percentages + seconds so the two
// blocks (and the headline) are directly comparable.

interface NormalizedOverview {
  sessions: number;
  pageviews: number;
  visitors: number;
  newUsers: number | null;
  avgSessionDurationSeconds: number;
  engagementRatePct: number;
  bounceRatePct: number;
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round((value || 0) * factor) / factor;
}

interface GaOverviewPayload {
  sessions?: number;
  pageviews?: number;
  activeUsers?: number;
  totalUsers?: number;
  newUsers?: number;
  bounceRate?: number;
  avgSessionDuration?: number;
  engagementRate?: number;
  deltas?: Record<string, number>;
}

function normalizeGaOverview(ga: GaOverviewPayload): NormalizedOverview {
  return {
    sessions: ga.sessions ?? 0,
    pageviews: ga.pageviews ?? 0,
    visitors: ga.totalUsers ?? 0,
    newUsers: ga.newUsers ?? 0,
    avgSessionDurationSeconds: round(ga.avgSessionDuration ?? 0),
    engagementRatePct: round((ga.engagementRate ?? 0) * 100, 1),
    bounceRatePct: round((ga.bounceRate ?? 0) * 100, 1),
  };
}

interface SessionsOverviewPayload {
  totalSessions?: number;
  totalPageViews?: number;
  uniqueVisitors?: number;
  avgSessionDuration?: number; // milliseconds
  engagementRate?: number; // 0..100
  bounceRate?: number; // 0..100
}

function normalizeSessionsOverview(
  session: SessionsOverviewPayload,
): NormalizedOverview {
  return {
    sessions: session.totalSessions ?? 0,
    pageviews: session.totalPageViews ?? 0,
    visitors: session.uniqueVisitors ?? 0,
    newUsers: null, // sessions-service does not distinguish new vs returning here
    avgSessionDurationSeconds: round((session.avgSessionDuration ?? 0) / 1000),
    engagementRatePct: round(session.engagementRate ?? 0, 1),
    bounceRatePct: round(session.bounceRate ?? 0, 1),
  };
}

// ─── Breakdown endpoint map ────────────────────────────────────
// GA and sessions-service name some breakdowns differently
// (geography vs geo, sources vs referrers); this reconciles them.

const BREAKDOWN_ENDPOINTS: Record<
  AnalyticsBreakdown,
  {
    ga: (propertyId: string, period: string) => string;
    sessions: (projectId: string, period: string) => string;
  }
> = {
  overview: {
    ga: (id, p) =>
      `/google-analytics/${encodeURIComponent(id)}/overview?period=${p}`,
    sessions: (k, p) =>
      `/session-analytics/overview?projectId=${encodeURIComponent(k)}&period=${p}`,
  },
  timeseries: {
    ga: (id, p) =>
      `/google-analytics/${encodeURIComponent(id)}/timeseries?period=${p}`,
    sessions: (k, p) =>
      `/session-analytics/timeseries?projectId=${encodeURIComponent(k)}&period=${p}`,
  },
  pages: {
    ga: (id, p) =>
      `/google-analytics/${encodeURIComponent(id)}/pages?period=${p}`,
    sessions: (k, p) =>
      `/session-analytics/pages?projectId=${encodeURIComponent(k)}&period=${p}`,
  },
  sources: {
    ga: (id, p) =>
      `/google-analytics/${encodeURIComponent(id)}/sources?period=${p}`,
    sessions: (k, p) =>
      `/session-analytics/referrers?projectId=${encodeURIComponent(k)}&period=${p}`,
  },
  geo: {
    ga: (id, p) =>
      `/google-analytics/${encodeURIComponent(id)}/geography?period=${p}`,
    sessions: (k, p) =>
      `/session-analytics/geo?projectId=${encodeURIComponent(k)}&period=${p}`,
  },
  devices: {
    ga: (id, p) =>
      `/google-analytics/${encodeURIComponent(id)}/devices?period=${p}`,
    sessions: (k, p) =>
      `/session-analytics/devices?projectId=${encodeURIComponent(k)}&period=${p}`,
  },
};

// ─── Per-property assembly ─────────────────────────────────────

interface UnifiedProperty {
  property: string;
  label: string;
  domain: string | null;
  sources: string[];
  google: Record<string, unknown> | null;
  firstParty: Record<string, unknown> | null;
  headline?: Record<string, unknown> | null;
  lastActivity?: string | null;
}

async function buildOverviewProperty(
  meta: PropertyMeta,
  period: string,
  includeGoogle: boolean,
  includeSessions: boolean,
): Promise<UnifiedProperty> {
  const endpoints = BREAKDOWN_ENDPOINTS.overview;

  const [gaRaw, sessionsRaw] = await Promise.all([
    includeGoogle && meta.gaPropertyId
      ? safeGet<GaOverviewPayload>(endpoints.ga(meta.gaPropertyId, period))
      : Promise.resolve(null),
    includeSessions && meta.hasSessions
      ? safeSessionsGet<SessionsOverviewPayload>(
          endpoints.sessions(meta.key, period),
        )
      : Promise.resolve(null),
  ]);

  const google = gaRaw
    ? {
        propertyId: meta.gaPropertyId,
        measurementId: meta.measurementId,
        ...normalizeGaOverview(gaRaw),
        deltas: gaRaw.deltas ?? null,
      }
    : null;

  const firstParty = sessionsRaw
    ? {
        projectId: meta.key,
        ...normalizeSessionsOverview(sessionsRaw),
      }
    : null;

  const sources: string[] = [];
  if (google) sources.push("google");
  if (firstParty) sources.push("firstParty");

  // Single set of numbers to cite; GA preferred, never a sum.
  const primary = google ?? firstParty;
  const headline = primary
    ? {
        primarySource: google ? "google" : "firstParty",
        sessions: primary.sessions,
        pageviews: primary.pageviews,
        visitors: primary.visitors,
        avgSessionDurationSeconds: primary.avgSessionDurationSeconds,
        engagementRatePct: primary.engagementRatePct,
        bounceRatePct: primary.bounceRatePct,
      }
    : null;

  return {
    property: meta.key,
    label: meta.label,
    domain: meta.domain,
    sources,
    google,
    firstParty,
    headline,
    lastActivity: meta.lastActivity,
  };
}

async function buildBreakdownProperty(
  meta: PropertyMeta,
  breakdown: Exclude<AnalyticsBreakdown, "overview">,
  period: string,
  includeGoogle: boolean,
  includeSessions: boolean,
): Promise<UnifiedProperty> {
  const endpoints = BREAKDOWN_ENDPOINTS[breakdown];

  const [google, firstParty] = await Promise.all([
    includeGoogle && meta.gaPropertyId
      ? safeGet<Record<string, unknown>>(
          endpoints.ga(meta.gaPropertyId, period),
        )
      : Promise.resolve(null),
    includeSessions && meta.hasSessions
      ? safeSessionsGet<Record<string, unknown>>(
          endpoints.sessions(meta.key, period),
        )
      : Promise.resolve(null),
  ]);

  const sources: string[] = [];
  if (google) sources.push("google");
  if (firstParty) sources.push("firstParty");

  return {
    property: meta.key,
    label: meta.label,
    domain: meta.domain,
    sources,
    google,
    firstParty,
    lastActivity: meta.lastActivity,
  };
}

// ─── Public entry point ────────────────────────────────────────

export interface WebAnalyticsOptions {
  property?: string;
  period?: AnalyticsPeriod;
  source?: AnalyticsSource;
  breakdown?: AnalyticsBreakdown;
}

export interface WebAnalyticsResult {
  period: AnalyticsPeriod;
  breakdown: AnalyticsBreakdown;
  source: AnalyticsSource;
  propertyCount: number;
  properties: UnifiedProperty[];
  notes: string[];
  fetchedAt: string;
}

export async function getWebAnalytics(
  options: WebAnalyticsOptions = {},
): Promise<WebAnalyticsResult> {
  const period: AnalyticsPeriod = VALID_PERIODS.includes(
    options.period as AnalyticsPeriod,
  )
    ? (options.period as AnalyticsPeriod)
    : "30d";
  const source: AnalyticsSource = VALID_SOURCES.includes(
    options.source as AnalyticsSource,
  )
    ? (options.source as AnalyticsSource)
    : "all";
  const breakdown: AnalyticsBreakdown = VALID_BREAKDOWNS.includes(
    options.breakdown as AnalyticsBreakdown,
  )
    ? (options.breakdown as AnalyticsBreakdown)
    : "overview";

  const includeGoogle = source === "all" || source === "google";
  const includeSessions = source === "all" || source === "firstParty";

  const [gaProperties, sessionsProjects] = await Promise.all([
    includeGoogle ? listGaProperties() : Promise.resolve([]),
    includeSessions ? listSessionsProjects(period) : Promise.resolve([]),
  ]);

  const registry = buildRegistry(gaProperties, sessionsProjects);

  let candidates = [...registry.values()];

  // A `source` filter also restricts which properties appear at all:
  // google-only excludes sessions-only sites, and vice versa.
  if (source === "google")
    candidates = candidates.filter((meta) => meta.gaPropertyId);
  if (source === "firstParty")
    candidates = candidates.filter((meta) => meta.hasSessions);

  if (options.property) {
    candidates = candidates.filter((meta) =>
      matchesFilter(meta, options.property!),
    );
  }

  candidates.sort((a, b) => a.key.localeCompare(b.key));

  const properties = await Promise.all(
    candidates.map((meta) =>
      breakdown === "overview"
        ? buildOverviewProperty(meta, period, includeGoogle, includeSessions)
        : buildBreakdownProperty(
            meta,
            breakdown,
            period,
            includeGoogle,
            includeSessions,
          ),
    ),
  );

  const notes: string[] = [];
  if (!isAnalyticsConfigured()) {
    notes.push(
      "PORTAL_SERVICE_URL is not configured; no analytics sources are reachable.",
    );
  }
  if (options.property && properties.length === 0) {
    notes.push(`No web property matched "${options.property}".`);
  }
  const joined = properties.filter((p) => p.sources.length > 1).length;
  if (joined > 0) {
    notes.push(
      `${joined} propert${joined === 1 ? "y is" : "ies are"} tracked by both Google Analytics and the first-party sessions-service; their metrics are reported side by side (never summed) because the two count sessions differently.`,
    );
  }

  return {
    period,
    breakdown,
    source,
    propertyCount: properties.length,
    properties,
    notes,
    fetchedAt: new Date().toISOString(),
  };
}
