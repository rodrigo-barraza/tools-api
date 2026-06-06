// ─── Crawlee + Playwright Orchestration ─────────────────────

import { CheerioCrawler, Configuration } from "crawlee";
import type { CheerioCrawlingContext, ProxyConfiguration } from "crawlee";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const DEFAULTS = {
  maxConcurrency: 3,
  maxRequestsPerMinute: 30,
  maxRequestRetries: 3,
  requestHandlerTimeoutSecs: 60,
  navigationTimeoutSecs: 30,
  headless: true,
  // Storage directory for Crawlee's persistent state (queues, datasets)
  storageDir: "/tmp/crawlee-storage",
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ────────────────────────────────────────────────────────────
// Proxy Configuration
// ────────────────────────────────────────────────────────────
// Uncomment and configure when Bright Data credentials are ready.
// Add BRIGHTDATA_* values to secrets.js and config.js.

/**
 * Build a ProxyConfiguration for Bright Data.
 * Supports datacenter and residential zones.
 */
function buildProxyConfig(
  _options: Record<string, unknown> = {},
): ProxyConfiguration | null {
  // ──────────────────────────────────────────────────────────
  // BRIGHT DATA PROXY — UNCOMMENT WHEN READY
  // ──────────────────────────────────────────────────────────
  //
  // import CONFIG from "../config.ts";
  //
  // const {
  //   BRIGHTDATA_CUSTOMER_ID,
  //   BRIGHTDATA_ZONE_DATACENTER,
  //   BRIGHTDATA_ZONE_RESIDENTIAL,
  //   BRIGHTDATA_ZONE_ISP,
  //   BRIGHTDATA_PASSWORD,
  // } = CONFIG;
  //
  // if (!BRIGHTDATA_CUSTOMER_ID || !BRIGHTDATA_PASSWORD) {
  //   logger.warn("[Crawler] Bright Data credentials not configured — running without proxy");
  //   return null;
  // }
  //
  // const zone = options.zone || "datacenter";
  // const zoneMap = {
  //   datacenter: BRIGHTDATA_ZONE_DATACENTER || "datacenter",
  //   residential: BRIGHTDATA_ZONE_RESIDENTIAL || "residential",
  //   isp: BRIGHTDATA_ZONE_ISP || "isp",
  // };
  //
  // const proxyUrl =
  //   `http://brd-customer-${BRIGHTDATA_CUSTOMER_ID}-zone-${zoneMap[zone]}` +
  //   `:${BRIGHTDATA_PASSWORD}@brd.superproxy.io:22225`;
  //
  // logger.info(`[Crawler] Proxy configured — zone: ${zone}`);
  //
  // return new ProxyConfiguration({
  //   proxyUrls: [proxyUrl],
  // });
  // ──────────────────────────────────────────────────────────

  return null;
}

// ────────────────────────────────────────────────────────────
// Crawlee Configuration
// ────────────────────────────────────────────────────────────

// Disable Crawlee's default storage to prevent cluttering the project dir.
// We use an explicit storageDir instead.
const crawleeConfig = Configuration.getGlobalConfig();
crawleeConfig.set("persistStorage", false);

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type ExtractFn = (
  ctx: CheerioCrawlingContext,
) => unknown | Promise<unknown>;

export interface CrawlStaticOptions {
  extractFn?: ExtractFn;
  proxyZone?: string;
}

export interface CrawlResult {
  url: string;
  data?: unknown;
  error?: string;
}

// ────────────────────────────────────────────────────────────
// Single-Page Crawl (Cheerio — No Browser)
// ────────────────────────────────────────────────────────────

/**
 * Crawl a single URL using Cheerio (static HTML parsing).
 * Best for: Static pages, forums, blogs — much faster than Playwright.
 */
export async function crawlSingleStatic(
  url: string,
  options: CrawlStaticOptions = {},
): Promise<CrawlResult> {
  const { extractFn, proxyZone } = options;

  if (!extractFn) {
    return { url, error: "extractFn is required" };
  }

  let result: unknown = null;
  let crawlError: Error | null = null;

  const proxyConfiguration = proxyZone
    ? buildProxyConfig({ zone: proxyZone })
    : null;

  const crawlerOptions: Record<string, unknown> = {
    maxConcurrency: 1,
    maxRequestRetries: DEFAULTS.maxRequestRetries,
    requestHandlerTimeoutSecs: DEFAULTS.requestHandlerTimeoutSecs,
    useSessionPool: true,
    persistCookiesPerSession: true,

    preNavigationHooks: [
      async (_crawlingContext: CheerioCrawlingContext, gotOptions: Record<string, unknown>) => {
        const existingHeaders = (gotOptions.headers as Record<string, string>) || {};
        gotOptions.headers = {
          ...existingHeaders,
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        };
      },
    ],

    async requestHandler(ctx: CheerioCrawlingContext) {
      logger.info(`[Crawler] Processing (static): ${ctx.request.url}`);

      try {
        result = await extractFn(ctx);
      } catch (error: unknown) {
        crawlError = error instanceof Error ? error : new Error(String(error));
        logger.error(
          `[Crawler] Extract failed for ${ctx.request.url}: ${errorMessage(error)}`,
        );
      }
    },

    async failedRequestHandler(
      { request }: CheerioCrawlingContext,
      error: Error,
    ) {
      crawlError = error;
      logger.error(
        `[Crawler] Failed after retries: ${request.url} — ${error.message}`,
      );
    },
  };

  if (proxyConfiguration) {
    crawlerOptions.proxyConfiguration = proxyConfiguration;
  }

  const crawler = new CheerioCrawler(
    crawlerOptions as ConstructorParameters<typeof CheerioCrawler>[0],
  );

  try {
    await crawler.run([url]);
  } catch (error: unknown) {
    return { error: `Crawler failed: ${errorMessage(error)}`, url };
  }

  if (crawlError) {
    return { error: errorMessage(crawlError), url };
  }

  return { url, data: result };
}
