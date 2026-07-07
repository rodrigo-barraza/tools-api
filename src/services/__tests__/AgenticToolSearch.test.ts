import { describe, it, expect } from "vitest";
import { agenticToolSearch } from "../AgenticToolSearchService.ts";

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

  it("should succeed and return disabled tools when searching a domain with no enabled tools", () => {
    const searchResult = agenticToolSearch("", {
      domain: "Weather & Environment",
      enabledTools: ["read_file", "search_file_contents"],
    });

    expect(searchResult.error).toBeUndefined();
    expect(searchResult.matches).toBeDefined();
    expect(searchResult.matches!.length).toBeGreaterThan(0);
    const allMatchesAreDisabled = searchResult.matches!.every(
      (match) => match.isEnabled === false,
    );
    expect(allMatchesAreDisabled).toBe(true);
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
