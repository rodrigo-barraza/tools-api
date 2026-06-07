import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { agenticWebSearch } from "../src/services/AgenticWebService.ts";
import CONFIG from "../src/config.ts";

// ─── Realistic DDG HTML Fixture ─────────────────────────────────────────────
// Mirrors the actual structure of html.duckduckgo.com/html/ results

const DUCKDUCKGO_RESULTS_HTML = `
<!DOCTYPE html>
<html>
<head><title>DuckDuckGo</title></head>
<body>
  <div id="links">
    <div class="result results_links results_links_deep web-result">
      <h2 class="result__title">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage-one&amp;rut=abc123">
          Example Page One
        </a>
      </h2>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage-one">
        example.com/page-one
      </a>
      <a class="result__snippet">This is the first search result snippet from DuckDuckGo.</a>
    </div>
    <div class="result results_links results_links_deep web-result">
      <h2 class="result__title">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fsecond-result&amp;rut=def456">
          Second Result Title
        </a>
      </h2>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fsecond-result">
        example.org/second-result
      </a>
      <a class="result__snippet">Second result snippet with useful information.</a>
    </div>
    <div class="result results_links results_links_deep web-result">
      <h2 class="result__title">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.net%2Fthird&amp;rut=ghi789">
          Third Result
        </a>
      </h2>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.net%2Fthird">
        example.net/third
      </a>
      <a class="result__snippet">Third result snippet.</a>
    </div>
  </div>
</body>
</html>
`;

const DUCKDUCKGO_EMPTY_HTML = `
<!DOCTYPE html>
<html>
<head><title>DuckDuckGo</title></head>
<body>
  <div id="links">
    <div class="no-results">No results found.</div>
  </div>
</body>
</html>
`;

// ─── Helper: Mock fetch to return DDG HTML ───────────────────────────────────

function createMockDuckDuckGoResponse(html: string, statusCode = 200) {
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    statusText: statusCode === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "text/html" }),
    text: async () => html,
  } as unknown as Response;
}

// ─── Saved config values for restoration ─────────────────────────────────────

let savedBraveSearchApiKey: string | undefined;
let savedGoogleApiKey: string | undefined;
let savedGoogleCseCx: string | undefined;

beforeEach(() => {
  savedBraveSearchApiKey = CONFIG.BRAVE_SEARCH_API_KEY;
  savedGoogleApiKey = CONFIG.GOOGLE_API_KEY;
  savedGoogleCseCx = CONFIG.GOOGLE_CSE_CX;
});

afterEach(() => {
  CONFIG.BRAVE_SEARCH_API_KEY = savedBraveSearchApiKey;
  CONFIG.GOOGLE_API_KEY = savedGoogleApiKey;
  CONFIG.GOOGLE_CSE_CX = savedGoogleCseCx;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("AgenticWebSearch — DuckDuckGo Fallback", () => {
  describe("DDG as Provider 2 (Brave unconfigured)", () => {
    it("uses DuckDuckGo when Brave API key is not set", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;
      CONFIG.GOOGLE_API_KEY = undefined;
      CONFIG.GOOGLE_CSE_CX = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      const result = await agenticWebSearch("test query");

      expect(result).not.toHaveProperty("error");
      expect(result.provider).toBe("duckduckgo");
      expect(result.results).toHaveLength(3);
      expect(result.query).toBe("test query");

      fetchSpy.mockRestore();
    });

    it("parses titles correctly from DDG HTML", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      const result = await agenticWebSearch("test query");

      expect(result.results[0].title).toBe("Example Page One");
      expect(result.results[1].title).toBe("Second Result Title");
      expect(result.results[2].title).toBe("Third Result");

      fetchSpy.mockRestore();
    });

    it("decodes DDG redirect URLs to actual destination URLs", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      const result = await agenticWebSearch("test query");

      expect(result.results[0].url).toBe("https://example.com/page-one");
      expect(result.results[1].url).toBe("https://example.org/second-result");
      expect(result.results[2].url).toBe("https://example.net/third");

      fetchSpy.mockRestore();
    });

    it("extracts snippets from DDG HTML", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      const result = await agenticWebSearch("test query");

      expect(result.results[0].snippet).toBe(
        "This is the first search result snippet from DuckDuckGo.",
      );
      expect(result.results[1].snippet).toBe(
        "Second result snippet with useful information.",
      );

      fetchSpy.mockRestore();
    });

    it("extracts display URLs from DDG HTML", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      const result = await agenticWebSearch("test query");

      expect(result.results[0].displayUrl).toBe("example.com/page-one");
      expect(result.results[1].displayUrl).toBe("example.org/second-result");

      fetchSpy.mockRestore();
    });

    it("respects the limit parameter", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      const result = await agenticWebSearch("test query", { limit: 2 });

      expect(result.results).toHaveLength(2);
      expect(result.provider).toBe("duckduckgo");

      fetchSpy.mockRestore();
    });
  });

  describe("DDG date restrict mapping", () => {
    it("sends df=d for dateRestrict d1", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      await agenticWebSearch("test query", { dateRestrict: "d1" });

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [, fetchOptions] = fetchSpy.mock.calls[0];
      const body = (fetchOptions as RequestInit).body as string;
      expect(body).toContain("df=d");

      fetchSpy.mockRestore();
    });

    it("sends df=w for dateRestrict w1", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      await agenticWebSearch("test query", { dateRestrict: "w1" });

      const [, fetchOptions] = fetchSpy.mock.calls[0];
      const body = (fetchOptions as RequestInit).body as string;
      expect(body).toContain("df=w");

      fetchSpy.mockRestore();
    });

    it("sends df=m for dateRestrict m1", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      await agenticWebSearch("test query", { dateRestrict: "m1" });

      const [, fetchOptions] = fetchSpy.mock.calls[0];
      const body = (fetchOptions as RequestInit).body as string;
      expect(body).toContain("df=m");

      fetchSpy.mockRestore();
    });

    it("sends df=y for dateRestrict y1", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      await agenticWebSearch("test query", { dateRestrict: "y1" });

      const [, fetchOptions] = fetchSpy.mock.calls[0];
      const body = (fetchOptions as RequestInit).body as string;
      expect(body).toContain("df=y");

      fetchSpy.mockRestore();
    });
  });

  describe("DDG siteSearch support", () => {
    it("prepends site: operator to query when siteSearch is specified", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      await agenticWebSearch("test query", { siteSearch: "example.com" });

      const [, fetchOptions] = fetchSpy.mock.calls[0];
      const body = (fetchOptions as RequestInit).body as string;
      expect(body).toContain("site%3Aexample.com+test+query");

      fetchSpy.mockRestore();
    });
  });

  describe("DDG error handling", () => {
    it("returns error when DDG returns empty results (possible CAPTCHA)", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;
      CONFIG.GOOGLE_API_KEY = undefined;
      CONFIG.GOOGLE_CSE_CX = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_EMPTY_HTML));

      const result = await agenticWebSearch("test query");

      expect(result.results).toEqual([]);
      expect(result.provider).toBeNull();

      fetchSpy.mockRestore();
    });

    it("returns error when DDG returns non-200 HTTP status", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;
      CONFIG.GOOGLE_API_KEY = undefined;
      CONFIG.GOOGLE_CSE_CX = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse("", 503));

      const result = await agenticWebSearch("test query");

      expect(result.results).toEqual([]);
      expect(result.provider).toBeNull();

      fetchSpy.mockRestore();
    });

    it("handles fetch exceptions gracefully", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;
      CONFIG.GOOGLE_API_KEY = undefined;
      CONFIG.GOOGLE_CSE_CX = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockRejectedValue(new Error("Network unreachable"));

      const result = await agenticWebSearch("test query");

      expect(result.results).toEqual([]);
      expect(result.provider).toBeNull();

      fetchSpy.mockRestore();
    });
  });

  describe("waterfall behavior", () => {
    it("falls through to Google CSE (deprecated) when DDG fails", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;
      CONFIG.GOOGLE_API_KEY = "test-google-key";
      CONFIG.GOOGLE_CSE_CX = "test-cse-cx";

      const fetchSpy = vi.spyOn(global, "fetch");

      // First call (DDG) returns empty results
      fetchSpy.mockResolvedValueOnce(
        createMockDuckDuckGoResponse(DUCKDUCKGO_EMPTY_HTML),
      );

      // Second call (Google CSE) returns valid JSON
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          items: [
            {
              title: "Google CSE Result",
              link: "https://cse-result.com",
              snippet: "From Google CSE",
              displayLink: "cse-result.com",
            },
          ],
          searchInformation: { totalResults: "1", searchTime: 0.1 },
        }),
      } as unknown as Response);

      const result = await agenticWebSearch("test query");

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result.provider).toBe("google_cse");
      expect(result.results[0].title).toBe("Google CSE Result");

      fetchSpy.mockRestore();
    });

    it("returns final error message when all providers fail", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;
      CONFIG.GOOGLE_API_KEY = undefined;
      CONFIG.GOOGLE_CSE_CX = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_EMPTY_HTML));

      const result = await agenticWebSearch("test query");

      expect(result.provider).toBeNull();
      expect(result.results).toEqual([]);
      expect(result.message).toContain("All search providers failed");

      fetchSpy.mockRestore();
    });

    it("DDG is not called when Brave succeeds", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = "test-brave-key";

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          web: {
            results: [
              {
                title: "Brave Result",
                url: "https://brave-result.com",
                description: "From Brave",
              },
            ],
          },
        }),
      } as unknown as Response);

      const result = await agenticWebSearch("test query");

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.provider).toBe("brave");

      fetchSpy.mockRestore();
    });
  });

  describe("DDG request format", () => {
    it("sends POST request with correct headers", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      await agenticWebSearch("test query");

      const [requestUrl, requestOptions] = fetchSpy.mock.calls[0];
      expect(requestUrl).toBe("https://html.duckduckgo.com/html/");
      expect((requestOptions as RequestInit).method).toBe("POST");

      const headers = (requestOptions as RequestInit).headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(headers["User-Agent"]).toContain("Mozilla/5.0");
      expect(headers["Accept"]).toBe("text/html");

      fetchSpy.mockRestore();
    });

    it("includes query in POST body", async () => {
      CONFIG.BRAVE_SEARCH_API_KEY = undefined;

      const fetchSpy = vi
        .spyOn(global, "fetch")
        .mockResolvedValue(createMockDuckDuckGoResponse(DUCKDUCKGO_RESULTS_HTML));

      await agenticWebSearch("TypeScript generics");

      const [, requestOptions] = fetchSpy.mock.calls[0];
      const body = (requestOptions as RequestInit).body as string;
      expect(body).toContain("q=TypeScript+generics");

      fetchSpy.mockRestore();
    });
  });

  describe("input validation", () => {
    it("returns error for empty query", async () => {
      const result = await agenticWebSearch("");
      expect(result.error).toContain("'query' is required");
    });

    it("returns error for non-string query", async () => {
      const result = await agenticWebSearch(null as unknown as string);
      expect(result.error).toContain("'query' is required");
    });
  });
});
