import { describe, it, expect } from "vitest";
import { agenticToolSearch } from "../src/services/AgenticToolSearchService.ts";

describe("Agentic Tool Search Service", () => {
  it("should return matching tools when query matches available tools", () => {
    const searchResult = agenticToolSearch("weather", {
      limit: 5,
    });

    expect(searchResult.error).toBeUndefined();
    expect(searchResult.matches).toBeDefined();
    expect(searchResult.matches!.length).toBeGreaterThan(0);
    const hasWeatherTool = searchResult.matches!.some((match) =>
      match.name.includes("weather"),
    );
    expect(hasWeatherTool).toBe(true);
  });

  it("should fail when searching a domain with no enabled tools", () => {
    const searchResult = agenticToolSearch("", {
      domain: "Weather & Environment",
      enabledTools: ["read_file", "grep_search"],
    });

    expect(searchResult.error).toBeDefined();
    expect(searchResult.error).toContain(
      "Cannot search tools in domain 'Weather & Environment' because no tools under this domain are enabled",
    );
    expect(searchResult.matches).toEqual([]);
    expect(searchResult.total).toBe(0);
  });

  it("should succeed when searching a domain with at least one enabled tool", () => {
    const searchResult = agenticToolSearch("", {
      domain: "Weather & Environment",
      enabledTools: ["get_weather", "read_file"],
    });

    expect(searchResult.error).toBeUndefined();
    expect(searchResult.matches).toBeDefined();
    expect(searchResult.matches!.length).toBeGreaterThan(0);
    const allMatchesAreWeather = searchResult.matches!.every(
      (match) => match.domain === "Weather & Environment",
    );
    expect(allMatchesAreWeather).toBe(true);
  });

  it("should fail when searching a label with no enabled tools", () => {
    const searchResult = agenticToolSearch("", {
      label: "smart_home",
      enabledTools: ["read_file", "grep_search"],
    });

    expect(searchResult.error).toBeDefined();
    expect(searchResult.error).toContain(
      "Cannot search tools with label 'smart_home' because no tools with this label are enabled",
    );
    expect(searchResult.matches).toEqual([]);
  });

  it("should succeed when searching any domain if wildcard is specified", () => {
    const searchResult = agenticToolSearch("", {
      domain: "Weather & Environment",
      enabledTools: ["*"],
    });

    expect(searchResult.error).toBeUndefined();
    expect(searchResult.matches).toBeDefined();
    expect(searchResult.matches!.length).toBeGreaterThan(0);
  });

  it("should succeed when searching any domain if no enabled tools are specified", () => {
    const searchResult = agenticToolSearch("", {
      domain: "Weather & Environment",
    });

    expect(searchResult.error).toBeUndefined();
    expect(searchResult.matches).toBeDefined();
    expect(searchResult.matches!.length).toBeGreaterThan(0);
  });
});
