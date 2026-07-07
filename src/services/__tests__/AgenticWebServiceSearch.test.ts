import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { API_RATE_LIMITS } from "../../constants.ts";

// ────────────────────────────────────────────────────────────
// Mocks — must be declared before the module under test loads
// ────────────────────────────────────────────────────────────

const rateLimiterWaitSpy = vi.fn().mockResolvedValue(undefined);

vi.mock("../RateLimiterService.ts", () => ({
  default: {
    wait: rateLimiterWaitSpy,
    getDelay: vi.fn(),
    getStats: vi.fn(),
    getAllLimits: vi.fn(),
  },
}));

vi.mock("../../config.ts", () => ({
  default: {
    BRAVE_SEARCH_API_KEY: undefined,
    SEARCH_PROVIDER_PRIORITY: "duckduckgo",
    GOOGLE_CLOUD_API_KEY: undefined,
    GOOGLE_CSE_CX: undefined,
  },
}));

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function buildDuckDuckGoResultHtml(
  results: Array<{ title: string; url: string; snippet: string }>,
): string {
  const resultBlocks = results
    .map(
      (result) => `
    <div class="result">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(result.url)}&rut=abc">${result.title}</a>
      <span class="result__snippet">${result.snippet}</span>
      <span class="result__url">${new URL(result.url).hostname}</span>
    </div>`,
    )
    .join("\n");

  return `<html><body>${resultBlocks}</body></html>`;
}

function createMockFetchResponse(
  body: string,
  options: { ok?: boolean; status?: number; contentType?: string } = {},
) {
  const { ok = true, status = 200, contentType = "text/html" } = options;
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    headers: new Headers({ "content-type": contentType }),
    text: vi.fn().mockResolvedValue(body),
    json: vi.fn().mockImplementation(async () => JSON.parse(body || "{}")),
  };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe("API_RATE_LIMITS — DUCKDUCKGO entry", () => {
  it("has a DUCKDUCKGO key registered in API_RATE_LIMITS", () => {
    expect(API_RATE_LIMITS).toHaveProperty("DUCKDUCKGO");
  });

  it("enforces 30 QPM with a 2000ms inter-request delay", () => {
    const duckDuckGoLimits = API_RATE_LIMITS.DUCKDUCKGO;
    expect(duckDuckGoLimits.qpm).toBe(30);
    expect(duckDuckGoLimits.requestDelayMs).toBe(2_000);
  });

  it("has no daily or per-second caps", () => {
    const duckDuckGoLimits = API_RATE_LIMITS.DUCKDUCKGO;
    expect(duckDuckGoLimits.qps).toBeNull();
    expect(duckDuckGoLimits.qpd).toBeNull();
  });
});

describe("agenticWebSearch — DuckDuckGo rate limiter integration", () => {
  let agenticWebSearch: typeof import("../AgenticWebService.ts").agenticWebSearch;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    rateLimiterWaitSpy.mockClear();
    originalFetch = globalThis.fetch;

    const module = await import("../AgenticWebService.ts");
    agenticWebSearch = module.agenticWebSearch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls rateLimiter.wait with DUCKDUCKGO before making the HTTP request", async () => {
    const callOrder: string[] = [];

    rateLimiterWaitSpy.mockImplementation(async () => {
      callOrder.push("rateLimiter.wait");
    });

    const mockHtml = buildDuckDuckGoResultHtml([
      { title: "Test Result", url: "https://example.com", snippet: "A test snippet" },
    ]);

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callOrder.push("fetch");
      return createMockFetchResponse(mockHtml);
    });

    await agenticWebSearch("test query", { provider: "duckduckgo" });

    expect(rateLimiterWaitSpy).toHaveBeenCalledWith("DUCKDUCKGO");
    expect(callOrder.indexOf("rateLimiter.wait")).toBeLessThan(
      callOrder.indexOf("fetch"),
    );
  });

  it("returns parsed results from DuckDuckGo HTML with correct provider tag", async () => {
    const mockHtml = buildDuckDuckGoResultHtml([
      { title: "First Result", url: "https://example.com/first", snippet: "First snippet" },
      { title: "Second Result", url: "https://example.com/second", snippet: "Second snippet" },
    ]);

    globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(mockHtml));

    const result = await agenticWebSearch("vitest mock", { provider: "duckduckgo" });

    expect(result).not.toHaveProperty("error");
    expect(result).toHaveProperty("provider", "duckduckgo");
    expect(result).toHaveProperty("results");

    const results = (result as Record<string, unknown>).results as Array<Record<string, string>>;
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe("First Result");
    expect(results[0].url).toBe("https://example.com/first");
    expect(results[1].title).toBe("Second Result");
  });

  it("returns an error when DuckDuckGo responds with a non-OK status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      createMockFetchResponse("", { ok: false, status: 503 }),
    );

    const result = await agenticWebSearch("failing query", { provider: "duckduckgo" });

    expect(result).toHaveProperty("results", []);
    expect(result).toHaveProperty("message");
  });

  it("returns an error when DuckDuckGo HTML contains no parseable results", async () => {
    const emptyHtml = "<html><body><div class='no-results'>No results</div></body></html>";
    globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(emptyHtml));

    const result = await agenticWebSearch("obscure query", { provider: "duckduckgo" });

    expect(result).toHaveProperty("results", []);
    expect(result).toHaveProperty("message");
  });

  it("respects the limit parameter when parsing DuckDuckGo results", async () => {
    const mockHtml = buildDuckDuckGoResultHtml([
      { title: "Result 1", url: "https://example.com/1", snippet: "Snippet 1" },
      { title: "Result 2", url: "https://example.com/2", snippet: "Snippet 2" },
      { title: "Result 3", url: "https://example.com/3", snippet: "Snippet 3" },
      { title: "Result 4", url: "https://example.com/4", snippet: "Snippet 4" },
      { title: "Result 5", url: "https://example.com/5", snippet: "Snippet 5" },
    ]);

    globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(mockHtml));

    const result = await agenticWebSearch("limited query", {
      provider: "duckduckgo",
      limit: 2,
    });

    const results = (result as Record<string, unknown>).results as Array<Record<string, string>>;
    expect(results).toHaveLength(2);
  });

  it("still calls rateLimiter.wait even when the fetch ultimately fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

    await agenticWebSearch("network error query", { provider: "duckduckgo" });

    expect(rateLimiterWaitSpy).toHaveBeenCalledWith("DUCKDUCKGO");
  });
});

describe("agenticWebSearch — provider chain fallback", () => {
  let agenticWebSearch: typeof import("../AgenticWebService.ts").agenticWebSearch;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    rateLimiterWaitSpy.mockClear();
    originalFetch = globalThis.fetch;

    const module = await import("../AgenticWebService.ts");
    agenticWebSearch = module.agenticWebSearch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("falls back gracefully when all providers fail and returns an empty results array", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("All down"));

    const result = await agenticWebSearch("doomed query");

    expect(result).toHaveProperty("results", []);
    expect(result).toHaveProperty("message");
    expect((result as Record<string, unknown>).provider).toBeNull();
  });

  it("rejects empty query strings", async () => {
    const result = await agenticWebSearch("");

    expect(result).toHaveProperty("error");
    expect((result as Record<string, string>).error).toContain("required");
  });
});
