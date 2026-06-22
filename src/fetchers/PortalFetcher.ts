// ─── Portal Service Fetcher ─────────────────────────────────
// HTTP client that proxies requests to portal-service for
// infrastructure observability: service health, container
// stats, metrics history, system info, and log snapshots.

import CONFIG from "../config.ts";
import logger from "../logger.ts";

const REQUEST_TIMEOUT_MS = 15_000;
const LOG_SNAPSHOT_TIMEOUT_MS = 10_000;
const LOG_MAX_TAIL = 2000;
const LOG_DEFAULT_TAIL = 200;

function resolvePortalBaseUrl(): string {
  const baseUrl = CONFIG.PORTAL_SERVICE_URL;
  if (!baseUrl) {
    throw new Error("PORTAL_SERVICE_URL is not configured");
  }
  return baseUrl.replace(/\/+$/, "");
}

async function portalGet(path: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<unknown> {
  const baseUrl = resolvePortalBaseUrl();
  const fullUrl = `${baseUrl}${path}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(fullUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Portal API ${response.status}: ${errorBody || response.statusText}`);
    }

    return await response.json();
  } catch (error: unknown) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Portal API timeout after ${timeoutMs}ms: ${fullUrl}`);
    }
    throw error;
  }
}

export async function fetchServiceStatuses(refreshHealthChecks = false): Promise<unknown> {
  const queryString = refreshHealthChecks ? "?refresh=true" : "";
  return portalGet(`/services${queryString}`);
}

export async function fetchContainerStats(deviceId?: string): Promise<unknown> {
  const queryString = deviceId ? `?device=${encodeURIComponent(deviceId)}` : "";
  return portalGet(`/stats/containers${queryString}`);
}

export async function fetchContainerMetrics(options: {
  container?: string;
  device?: string;
  range?: string;
  limit?: number;
} = {}): Promise<unknown> {
  const queryParameters = new URLSearchParams();
  if (options.container) queryParameters.set("container", options.container);
  if (options.device) queryParameters.set("device", options.device);
  if (options.range) queryParameters.set("range", options.range);
  if (options.limit) queryParameters.set("limit", String(options.limit));

  const queryString = queryParameters.toString();
  return portalGet(`/stats/containers/metrics${queryString ? `?${queryString}` : ""}`);
}

export async function fetchContainerHistory(deviceId?: string): Promise<unknown> {
  const queryString = deviceId ? `?device=${encodeURIComponent(deviceId)}` : "";
  return portalGet(`/stats/containers/history${queryString}`);
}

export async function fetchSystemInfo(deviceId?: string): Promise<unknown> {
  const queryString = deviceId ? `?device=${encodeURIComponent(deviceId)}` : "";
  return portalGet(`/stats/system${queryString}`);
}

export async function fetchDevices(): Promise<unknown> {
  return portalGet("/devices");
}

export async function fetchContainerLogs(
  containerName: string,
  options: { device?: string; tail?: number } = {},
): Promise<{ container: string; lines: string[]; lineCount: number; truncated: boolean }> {
  const baseUrl = resolvePortalBaseUrl();
  const tailCount = Math.min(Math.max(options.tail || LOG_DEFAULT_TAIL, 1), LOG_MAX_TAIL);

  const queryParameters = new URLSearchParams({
    tail: String(tailCount),
    follow: "0",
  });
  if (options.device) queryParameters.set("device", options.device);

  const fullUrl = `${baseUrl}/logs/${encodeURIComponent(containerName)}?${queryParameters.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOG_SNAPSHOT_TIMEOUT_MS);

  try {
    const response = await fetch(fullUrl, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Portal logs API ${response.status}: ${errorBody || response.statusText}`);
    }

    const collectedLines: string[] = [];
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("No readable stream from portal logs endpoint");
    }

    const decoder = new TextDecoder();
    let accumulatedBuffer = "";

    const readTimeout = setTimeout(() => {
      reader.cancel().catch(() => {});
    }, LOG_SNAPSHOT_TIMEOUT_MS);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulatedBuffer += decoder.decode(value, { stream: true });
        const blocks = accumulatedBuffer.split("\n\n");
        accumulatedBuffer = blocks.pop() || "";

        for (const block of blocks) {
          const lines = block.split("\n");
          let eventType = "";
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataLines.push(line.slice(6));
            }
          }

          if (eventType === "") {
            for (const dataLine of dataLines) {
              collectedLines.push(dataLine);
            }
          } else if (eventType === "end" || eventType === "error") {
            reader.cancel().catch(() => {});
            clearTimeout(readTimeout);
            return {
              container: containerName,
              lines: collectedLines,
              lineCount: collectedLines.length,
              truncated: false,
            };
          }
        }
      }
    } finally {
      clearTimeout(readTimeout);
    }

    return {
      container: containerName,
      lines: collectedLines,
      lineCount: collectedLines.length,
      truncated: collectedLines.length >= tailCount,
    };
  } catch (error: unknown) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      logger.warn(`[PortalFetcher] Log snapshot timed out for ${containerName}`);
      throw new Error(`Log snapshot timed out for container: ${containerName}`);
    }
    throw error;
  }
}

export function isPortalConfigured(): boolean {
  return Boolean(CONFIG.PORTAL_SERVICE_URL);
}
