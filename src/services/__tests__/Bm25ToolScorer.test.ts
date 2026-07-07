import { describe, it, expect, beforeAll } from "vitest";
import {
  Bm25ToolIndex,
  tokenize,
  extractSearchableText,
} from "@rodrigo-barraza/utilities-library/search";
import {
  TOOL_DEFINITIONS,
  TOOL_DOMAINS,
} from "../ToolSchemaService.ts";

// ────────────────────────────────────────────────────────────
// BM25 Tool Scorer — Integration Tests
// ────────────────────────────────────────────────────────────
// Exercises the BM25 scorer against the REAL tool catalog to
// verify ranking quality, parameter-name indexing, edge cases,
// and the substring fallback.

interface DiscoverableToolDocument {
  name: string;
  description: string;
  domain: string;
  parameters?: {
    properties?: Record<string, { description?: string }>;
  };
}

let discoverableTools: DiscoverableToolDocument[];
let searchIndex: Bm25ToolIndex<DiscoverableToolDocument>;

beforeAll(() => {
  discoverableTools = TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    domain:
      TOOL_DOMAINS[tool.name as keyof typeof TOOL_DOMAINS] || "Other",
    parameters: tool.parameters as DiscoverableToolDocument["parameters"],
  }));

  searchIndex = new Bm25ToolIndex(discoverableTools);
});

// ── Tokenizer ───────────────────────────────────────────────

describe("tokenize", () => {
  it("should split underscored tool names", () => {
    const tokens = tokenize("get_weather_forecast");
    expect(tokens).toContain("get");
    expect(tokens).toContain("weather");
    expect(tokens).toContain("forecast");
  });

  it("should split camelCase", () => {
    const tokens = tokenize("getWeatherForecast");
    expect(tokens).toContain("get");
    expect(tokens).toContain("weather");
    expect(tokens).toContain("forecast");
  });

  it("should remove stop words", () => {
    const tokens = tokenize("get the weather for a location");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("for");
    expect(tokens).not.toContain("a");
    expect(tokens).toContain("weather");
    expect(tokens).toContain("location");
  });

  it("should filter single-character tokens", () => {
    const tokens = tokenize("a b c weather d e");
    expect(tokens).toEqual(["weather"]);
  });
});

// ── extractSearchableText ───────────────────────────────────

describe("extractSearchableText", () => {
  it("should include tool name, description, and parameter names", () => {
    const text = extractSearchableText({
      name: "get_weather",
      description: "Get live weather data",
      parameters: {
        properties: {
          latitude: { description: "Latitude coordinate" },
          longitude: { description: "Longitude coordinate" },
        },
      },
    });
    expect(text).toContain("get_weather");
    expect(text).toContain("Get live weather data");
    expect(text).toContain("latitude");
    expect(text).toContain("longitude");
    expect(text).toContain("Latitude coordinate");
  });

  it("should handle tools with no parameters", () => {
    const text = extractSearchableText({
      name: "think",
      description: "Think through a problem",
    });
    expect(text).toContain("think");
    expect(text).toContain("Think through a problem");
  });
});

// ── Catalog Integrity ───────────────────────────────────────

describe("catalog integrity", () => {
  it("should load a substantial number of discoverable tools", () => {
    expect(discoverableTools.length).toBeGreaterThan(100);
  });

  it("should have tools from multiple domains", () => {
    const uniqueDomains = new Set(discoverableTools.map((tool) => tool.domain));
    expect(uniqueDomains.size).toBeGreaterThan(10);
  });
});

// ── Core Relevance: Exact & Substring Matches ───────────────

describe("exact and substring name matching", () => {
  it("should rank exact name match first", () => {
    const results = searchIndex.search("get_weather");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].document.name).toBe("get_weather");
  });

  it("should rank partial name matches highly", () => {
    const results = searchIndex.search("weather");
    const topFiveToolNames = results.slice(0, 5).map((result) => result.document.name);
    expect(topFiveToolNames.some((name) => name.includes("weather"))).toBe(true);
  });

  it("should find tools by multi-word query", () => {
    const results = searchIndex.search("stock market news");
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames).toContain("get_market_news");
  });
});

// ── BM25 Quality: IDF Downweighting ─────────────────────────

describe("BM25 IDF downweighting", () => {
  it("should rank rare-term matches higher than common-term matches", () => {
    const results = searchIndex.search("avalanche");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].document.name).toBe("get_canada_avalanche_forecast");
  });

  it("should find niche tools by specific domain terms", () => {
    const results = searchIndex.search("exoplanet");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].document.name).toBe("get_exoplanet");
  });

  it("should find astronomy tools by celestial terms", () => {
    const results = searchIndex.search("moon phase");
    const topThreeToolNames = results.slice(0, 3).map((result) => result.document.name);
    expect(topThreeToolNames).toContain("get_moon_phase");
  });
});

// ── Parameter Name Indexing ─────────────────────────────────

describe("parameter name indexing", () => {
  it("should find weather tools when searching by parameter name 'latitude'", () => {
    const results = searchIndex.search("latitude longitude");
    expect(results.length).toBeGreaterThan(0);
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames.some((name) => name.includes("weather") || name.includes("location") || name.includes("places"))).toBe(true);
  });

  it("should find file tools when searching by parameter name 'path'", () => {
    const results = searchIndex.search("file path content");
    expect(results.length).toBeGreaterThan(0);
    const matchedNames = results.map((result) => result.document.name);
    expect(
      matchedNames.some(
        (name) =>
          name.includes("file") ||
          name.includes("read") ||
          name.includes("write"),
      ),
    ).toBe(true);
  });
});

// ── Domain-Specific Queries ─────────────────────────────────

describe("domain-specific queries", () => {
  it("should find finance tools for 'stock price'", () => {
    const results = searchIndex.search("stock price");
    expect(results.length).toBeGreaterThan(0);
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames.some((name) => name.includes("stock"))).toBe(true);
  });

  it("should find transit tools for 'bus schedule'", () => {
    const results = searchIndex.search("bus schedule");
    const matchedNames = results.map((result) => result.document.name);
    expect(
      matchedNames.some(
        (name) => name.includes("bus") || name.includes("transit"),
      ),
    ).toBe(true);
  });

  it("should find media tools for 'movie recommendations'", () => {
    const results = searchIndex.search("movie recommendations");
    const matchedNames = results.map((result) => result.document.name);
    expect(
      matchedNames.some(
        (name) => name.includes("media") || name.includes("movie"),
      ),
    ).toBe(true);
  });

  it("should find nutrition tools for 'calories food'", () => {
    const results = searchIndex.search("calories food");
    const matchedNames = results.map((result) => result.document.name);
    expect(
      matchedNames.some(
        (name) =>
          name.includes("food") ||
          name.includes("nutrition") ||
          name.includes("calor"),
      ),
    ).toBe(true);
  });

  it("should find discord tools for 'discord messages'", () => {
    const results = searchIndex.search("discord messages");
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames.some((name) => name.includes("discord"))).toBe(true);
  });

  it("should find energy tools for 'petroleum oil prices'", () => {
    const results = searchIndex.search("petroleum oil prices");
    const matchedNames = results.map((result) => result.document.name);
    expect(
      matchedNames.some(
        (name) =>
          name.includes("petroleum") ||
          name.includes("energy") ||
          name.includes("natural_gas"),
      ),
    ).toBe(true);
  });

  it("should find maritime tools for 'vessel ship tracking'", () => {
    const results = searchIndex.search("vessel ship tracking");
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames.some((name) => name.includes("vessel"))).toBe(true);
  });

  it("should find light tools for 'smart lights brightness'", () => {
    const results = searchIndex.search("smart lights brightness");
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames.some((name) => name.includes("light"))).toBe(true);
  });

  it("should find creative tools for 'generate image'", () => {
    const results = searchIndex.search("generate image");
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames).toContain("generate_image");
  });

  it("should find 3D tools for 'three dimensional model scene'", () => {
    const results = searchIndex.search("3d model scene");
    const matchedNames = results.map((result) => result.document.name);
    expect(
      matchedNames.some((name) => name.includes("3d")),
    ).toBe(true);
  });

  it("should find security tools for 'data breach password'", () => {
    const results = searchIndex.search("data breach password");
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames.some((name) => name.includes("breach"))).toBe(true);
  });

  it("should find network tools for 'dns lookup domain'", () => {
    const results = searchIndex.search("dns lookup domain");
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames.some((name) => name.includes("dns"))).toBe(true);
  });
});

// ── Natural Language Queries ────────────────────────────────

describe("natural language intent queries", () => {
  it("should find relevant tools for 'what is the weather like'", () => {
    const results = searchIndex.search("what is the weather like");
    expect(results.length).toBeGreaterThan(0);
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames.some((name) => name.includes("weather"))).toBe(true);
  });

  it("should find reddit tools for 'search reddit posts'", () => {
    const results = searchIndex.search("search reddit posts");
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames.some((name) => name.includes("reddit"))).toBe(true);
  });

  it("should find audio tools for 'create music song'", () => {
    const results = searchIndex.search("create music song");
    const matchedNames = results.map((result) => result.document.name);
    expect(
      matchedNames.some(
        (name) =>
          name.includes("audio") ||
          name.includes("music") ||
          name.includes("synthesize"),
      ),
    ).toBe(true);
  });

  it("should find utility tools for 'currency conversion exchange rate'", () => {
    const results = searchIndex.search("currency conversion exchange rate");
    const matchedNames = results.map((result) => result.document.name);
    expect(matchedNames).toContain("convert_currency");
  });
});

// ── Edge Cases ──────────────────────────────────────────────

describe("edge cases", () => {
  it("should return all tools for empty query", () => {
    const results = searchIndex.search("");
    expect(results.length).toBe(discoverableTools.length);
    expect(results.every((result) => result.score === 1)).toBe(true);
  });

  it("should return empty results for completely irrelevant query", () => {
    const results = searchIndex.search("xyzzyplugh12345");
    expect(results.length).toBe(0);
  });

  it("should handle single character query gracefully", () => {
    const results = searchIndex.search("a");
    // 'a' is a stop word AND single char — tokenizer filters it out,
    // but the raw query is non-empty so it enters BM25 path with 0 query terms.
    // BM25 returns nothing → substring fallback catches tools with 'a' in name.
    expect(results.length).toBeGreaterThan(0);
  });

  it("should respect the limit parameter", () => {
    const results = searchIndex.search("weather", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("should handle queries with special characters", () => {
    const results = searchIndex.search("file (read/write)");
    expect(results.length).toBeGreaterThan(0);
  });
});

// ── Substring Fallback ──────────────────────────────────────

describe("substring fallback for zero-IDF cases", () => {
  it("should still find tools when BM25 IDF collapses", () => {
    // "get" appears in almost every tool name — IDF approaches zero.
    // The substring fallback should still return results.
    const results = searchIndex.search("get");
    expect(results.length).toBeGreaterThan(0);
  });
});

// ── Scoring Sanity ──────────────────────────────────────────

describe("scoring sanity", () => {
  it("should score exact name matches higher than partial matches", () => {
    const results = searchIndex.search("get_weather");
    const exactMatch = results.find((result) => result.document.name === "get_weather");
    const partialMatch = results.find(
      (result) =>
        result.document.name !== "get_weather" &&
        result.document.name.includes("weather"),
    );
    if (exactMatch && partialMatch) {
      expect(exactMatch.score).toBeGreaterThan(partialMatch.score);
    }
  });

  it("should produce positive scores for all matched documents", () => {
    const results = searchIndex.search("weather forecast");
    for (const result of results) {
      expect(result.score).toBeGreaterThan(0);
    }
  });

  it("should sort results by descending score", () => {
    const results = searchIndex.search("stock market analysis");
    for (let resultIndex = 1; resultIndex < results.length; resultIndex++) {
      expect(results[resultIndex - 1].score).toBeGreaterThanOrEqual(
        results[resultIndex].score,
      );
    }
  });
});

// ── Comparative: Multi-Domain Query ─────────────────────────

describe("multi-domain query ranking", () => {
  it("should rank domain-specific tools above generic ones for targeted queries", () => {
    const results = searchIndex.search("Pokemon TCG release dates english japanese editions market analysis");
    expect(results.length).toBeGreaterThan(0);
    // This is the exact query from the screenshot — should return knowledge/search tools
    const topTenToolNames = results.slice(0, 10).map((result) => result.document.name);
    // Should find search, knowledge, or market-related tools
    expect(
      topTenToolNames.some(
        (name) =>
          name.includes("search") ||
          name.includes("web") ||
          name.includes("market") ||
          name.includes("product") ||
          name.includes("paper"),
      ),
    ).toBe(true);
  });
});
