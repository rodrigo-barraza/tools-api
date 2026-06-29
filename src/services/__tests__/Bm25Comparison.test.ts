import { Bm25ToolIndex } from "@rodrigo-barraza/utilities-library/search";
import {
  TOOL_DEFINITIONS,
  TOOL_DOMAINS,
} from "../ToolSchemaService.ts";
import { describe, it, expect, beforeAll } from "vitest";

// ────────────────────────────────────────────────────────────
// Old Scorer (exact replica of the deleted substring algorithm)
// ────────────────────────────────────────────────────────────

interface ToolDocument {
  name: string;
  description: string;
  domain: string;
  parameters?: {
    properties?: Record<string, { description?: string }>;
  };
}

function oldSubstringSearch(
  tools: ToolDocument[],
  query: string,
  limit = 20,
): { name: string; score: number }[] {
  const queryTextLowerCase = query.toLowerCase().trim();
  if (!queryTextLowerCase) {
    return tools.map((tool) => ({ name: tool.name, score: 1 }));
  }

  const scoredMatches = tools
    .map((tool) => {
      const toolNameLowerCase = tool.name.toLowerCase();
      const descriptionTextLowerCase = tool.description.toLowerCase();

      let matchScore = 0;
      if (toolNameLowerCase === queryTextLowerCase) {
        matchScore += 100;
      } else if (toolNameLowerCase.includes(queryTextLowerCase)) {
        matchScore += 50;
      }
      if (descriptionTextLowerCase.includes(queryTextLowerCase)) {
        matchScore += 20;
      }

      const queryWords = queryTextLowerCase.split(/\s+/);
      for (const queryWord of queryWords) {
        if (queryWord.length < 2) continue;
        if (toolNameLowerCase.includes(queryWord)) matchScore += 10;
        if (descriptionTextLowerCase.includes(queryWord)) matchScore += 5;
      }

      return { name: tool.name, score: matchScore };
    })
    .filter((match) => match.score > 0)
    .sort((first, second) => second.score - first.score);

  return scoredMatches.slice(0, limit);
}

// ────────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────────

let discoverableTools: ToolDocument[];
let bm25Index: Bm25ToolIndex<ToolDocument>;

beforeAll(() => {
  discoverableTools = TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    domain:
      TOOL_DOMAINS[tool.name as keyof typeof TOOL_DOMAINS] || "Other",
    parameters: tool.parameters as ToolDocument["parameters"],
  }));
  bm25Index = new Bm25ToolIndex(discoverableTools);
});

// ────────────────────────────────────────────────────────────
// Comparison Helpers
// ────────────────────────────────────────────────────────────



function runComparison(query: string, limit = 10) {
  const oldResults = oldSubstringSearch(discoverableTools, query, limit);
  const bm25Results = bm25Index.search(query, limit);
  const newResults = bm25Results.map((result) => ({
    name: result.document.name,
    score: result.score,
  }));

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  QUERY: "${query}"`);
  console.log(`${"═".repeat(60)}`);
  console.log(`\n  OLD (Substring)          NEW (BM25)`);
  console.log(`  ${"─".repeat(25)}  ${"─".repeat(25)}`);

  const maxRows = Math.max(
    Math.min(oldResults.length, 5),
    Math.min(newResults.length, 5),
  );
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
    const oldEntry = oldResults[rowIndex];
    const newEntry = newResults[rowIndex];
    const oldColumn = oldEntry
      ? `${rowIndex + 1}. ${oldEntry.name} (${oldEntry.score.toFixed(0)})`.padEnd(
          27,
        )
      : " ".repeat(27);
    const newColumn = newEntry
      ? `${rowIndex + 1}. ${newEntry.name} (${newEntry.score.toFixed(1)})`
      : "";
    console.log(`  ${oldColumn}${newColumn}`);
  }

  console.log(
    `\n  Total: OLD=${oldResults.length}  NEW=${newResults.length}`,
  );

  return { oldResults, newResults };
}

// ────────────────────────────────────────────────────────────
// Head-to-Head Tests
// ────────────────────────────────────────────────────────────

describe("before vs after: BM25 improvement comparison", () => {
  // ── 1. Parameter-name indexing (OLD: invisible, NEW: indexed) ──

  it("IMPROVEMENT: 'latitude longitude' — parameter name indexing finds tools the old algorithm missed", () => {
    const { newResults } = runComparison("latitude longitude");

    // Old algorithm: only searches name + description, so "latitude"
    // and "longitude" must appear literally in those fields
    // New algorithm: also indexes parameter names, catching tools by
    // their argument signatures

    // BM25 should find get_weather (has latitude/longitude params)
    const newMatchesWeather = newResults.some(
      (result) => result.name === "get_weather",
    );
    expect(newMatchesWeather).toBe(true);
  });

  // ── 2. IDF downweighting (OLD: "get" dominates, NEW: weighted) ──

  it("IMPROVEMENT: 'get avalanche' — IDF downweights the ubiquitous 'get' term", () => {
    const { oldResults, newResults } = runComparison("get avalanche");

    // Old: "get" matches ~80% of tools with +10 each, polluting results
    // New: "get" has near-zero IDF (too common), so "avalanche" drives ranking

    expect(newResults[0].name).toBe("get_avalanche_forecast");

    // Check that the old algorithm also finds it, but the RANKING quality differs
    const oldAvIndex = oldResults.findIndex(
      (result) => result.name === "get_avalanche_forecast",
    );
    const newAvIndex = newResults.findIndex(
      (result) => result.name === "get_avalanche_forecast",
    );
    // BM25 should rank it at position 0 (or at least as high or higher than old)
    expect(newAvIndex).toBeLessThanOrEqual(oldAvIndex);
  });

  // ── 3. Multi-word specificity (OLD: flat additive, NEW: IDF-weighted) ──

  it("IMPROVEMENT: 'moon phase astronomy' — rare terms score higher than common ones", () => {
    const { newResults } = runComparison("moon phase astronomy");

    const newTopFiveNames = newResults
      .slice(0, 5)
      .map((result) => result.name);
    expect(newTopFiveNames).toContain("get_moon_phase");
  });

  // ── 4. Description-heavy matches no longer dominate ──

  it("IMPROVEMENT: 'weather' — exact name match ranks above description-only matches", () => {
    const { oldResults, newResults } = runComparison("weather");

    // Both algorithms should rank get_weather highly, but BM25
    // gives better separation between name-match and description-only
    expect(newResults[0].name).toContain("weather");
    expect(oldResults[0].name).toContain("weather");

    // Verify the top results are weather-specific, not generic tools
    // that happen to mention "weather" in their descriptions
    const newTopThreeNames = newResults
      .slice(0, 3)
      .map((result) => result.name);
    expect(
      newTopThreeNames.every((name) => name.includes("weather")),
    ).toBe(true);
  });

  // ── 5. Compound domain queries ──

  it("IMPROVEMENT: 'petroleum oil energy prices' — compound queries surface domain-specific tools", () => {
    const { newResults } = runComparison(
      "petroleum oil energy prices",
    );

    const newTopFiveNames = newResults
      .slice(0, 5)
      .map((result) => result.name);
    expect(
      newTopFiveNames.some(
        (name) =>
          name.includes("petroleum") ||
          name.includes("energy") ||
          name.includes("natural_gas"),
      ),
    ).toBe(true);
  });

  // ── 6. Parameter description search ──

  it("IMPROVEMENT: 'city name geocode' — finds tools via parameter descriptions", () => {
    const { newResults } = runComparison("city name geocode");

    // The old algorithm can't see parameter descriptions at all.
    // BM25 indexes parameter descriptions, so "city name" matches
    // the get_weather parameter description: "City name, optionally with country code"

    const newMatchesWeather = newResults.some(
      (result) =>
        result.name === "get_weather" || result.name.includes("location"),
    );
    expect(newMatchesWeather).toBe(true);
  });

  // ── 7. Noise resilience ──

  it("IMPROVEMENT: 'how do I read a file from disk' — natural language with noise words", () => {
    const { newResults } = runComparison(
      "how do I read a file from disk",
    );

    // Old: "how", "do", "I", "a", "from" all match description substrings,
    // polluting results with unrelated tools
    // New: stop words removed by tokenizer, "read", "file", "disk" drive ranking

    const newTopFiveNames = newResults
      .slice(0, 5)
      .map((result) => result.name);
    expect(
      newTopFiveNames.some(
        (name) => name.includes("file") || name.includes("read"),
      ),
    ).toBe(true);
  });

  // ── 8. Rare domain terms ──

  it("IMPROVEMENT: 'exoplanet habitable zone' — rare terms get massive IDF boost", () => {
    const { oldResults, newResults } = runComparison(
      "exoplanet habitable zone",
    );

    // "exoplanet" appears in exactly 1 tool → extremely high IDF
    expect(newResults[0].name).toBe("get_exoplanet");
    // Old algorithm also finds it but the score differentiation is flat
    expect(oldResults[0].name).toBe("get_exoplanet");
  });

  // ── 9. Common prefix degeneration ──

  it("IMPROVEMENT: 'search' — common verb doesn't flatten into noise", () => {
    const { oldResults, newResults } = runComparison("search");

    // Both find results, but BM25 should rank tools where "search"
    // is a RARE discriminating feature (not just a prefix of 50 tools)
    expect(newResults.length).toBeGreaterThan(0);
    expect(oldResults.length).toBeGreaterThan(0);

    // The top BM25 results should all have "search" in their name
    const newTopThreeNames = newResults
      .slice(0, 3)
      .map((result) => result.name);
    expect(
      newTopThreeNames.every((name) => name.includes("search")),
    ).toBe(true);
  });

  // ── 10. Summary stats ──

  it("prints comparison summary for all test queries", () => {
    const testQueries = [
      "latitude longitude",
      "get avalanche",
      "moon phase astronomy",
      "weather",
      "petroleum oil energy prices",
      "city name geocode",
      "how do I read a file from disk",
      "exoplanet habitable zone",
      "search",
      "dns ssl certificate",
      "convert image to ascii art",
      "smart home lights color",
    ];

    console.log("\n\n" + "═".repeat(60));
    console.log("  FULL COMPARISON SUMMARY");
    console.log("═".repeat(60));

    for (const query of testQueries) {
      runComparison(query);
    }

    expect(true).toBe(true);
  });
});
