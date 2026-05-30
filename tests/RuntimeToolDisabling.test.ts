// ────────────────────────────────────────────────────────────
// Runtime Tool Disabling Tests
// ────────────────────────────────────────────────────────────
// Validates the runtime health registry mechanism that hides
// tools from the bot when their backing APIs are broken.
// ────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from "vitest";
import {
  TOOL_DEFINITIONS,
  disableToolRuntime,
  enableToolRuntime,
  getToolSchemas,
  getToolSchemasForAI,
  getDisabledTools,
} from "../src/services/ToolSchemaService.ts";

// ── Helpers ──────────────────────────────────────────────────

const KNOWN_TOOL_NAME = TOOL_DEFINITIONS[0]?.name;

function findToolInSchemas(
  schemas: { name: string }[],
  toolName: string,
): boolean {
  return schemas.some((schema) => schema.name === toolName);
}

function findToolInDisabled(
  disabled: { name: string; runtimeDisabled?: string }[],
  toolName: string,
): { name: string; runtimeDisabled?: string } | undefined {
  return disabled.find((tool) => tool.name === toolName);
}

// ── disableToolRuntime / enableToolRuntime ───────────────────

describe("Runtime Tool Disabling — disableToolRuntime()", () => {
  const FAKE_TOOL_NAME = "__test_fake_tool_for_disable__";

  beforeEach(() => {
    enableToolRuntime(FAKE_TOOL_NAME);
    enableToolRuntime(KNOWN_TOOL_NAME);
  });

  it("disabling a tool removes it from getToolSchemasForAI()", () => {
    const beforeDisable = getToolSchemasForAI();
    const wasAvailable = findToolInSchemas(beforeDisable, KNOWN_TOOL_NAME);
    expect(wasAvailable).toBe(true);

    disableToolRuntime(KNOWN_TOOL_NAME, "test: simulated API failure");

    const afterDisable = getToolSchemasForAI();
    const isStillAvailable = findToolInSchemas(afterDisable, KNOWN_TOOL_NAME);
    expect(isStillAvailable).toBe(false);
  });

  it("disabling a tool removes it from getToolSchemas()", () => {
    disableToolRuntime(KNOWN_TOOL_NAME, "test: simulated API failure");

    const schemas = getToolSchemas();
    const isPresent = findToolInSchemas(schemas, KNOWN_TOOL_NAME);
    expect(isPresent).toBe(false);
  });

  it("disabled tool appears in getDisabledTools() with runtimeDisabled reason", () => {
    const disableReason = "test: Google API blocked";
    disableToolRuntime(KNOWN_TOOL_NAME, disableReason);

    const disabled = getDisabledTools();
    const entry = findToolInDisabled(disabled, KNOWN_TOOL_NAME);
    expect(entry).toBeDefined();
    expect(entry?.runtimeDisabled).toBe(disableReason);
  });

  it("disabling is idempotent — calling twice does not change the reason", () => {
    disableToolRuntime(KNOWN_TOOL_NAME, "first reason");
    disableToolRuntime(KNOWN_TOOL_NAME, "second reason");

    const disabled = getDisabledTools();
    const entry = findToolInDisabled(disabled, KNOWN_TOOL_NAME);
    expect(entry?.runtimeDisabled).toBe("first reason");
  });

  it("disabling a non-existent tool name does not crash", () => {
    expect(() => {
      disableToolRuntime(FAKE_TOOL_NAME, "test: should not crash");
    }).not.toThrow();
  });
});

// ── enableToolRuntime ───────────────────────────────────────

describe("Runtime Tool Disabling — enableToolRuntime()", () => {
  beforeEach(() => {
    enableToolRuntime(KNOWN_TOOL_NAME);
  });

  it("re-enabling a disabled tool restores it to getToolSchemasForAI()", () => {
    disableToolRuntime(KNOWN_TOOL_NAME, "test: temporary failure");

    const duringDisable = getToolSchemasForAI();
    expect(findToolInSchemas(duringDisable, KNOWN_TOOL_NAME)).toBe(false);

    enableToolRuntime(KNOWN_TOOL_NAME);

    const afterEnable = getToolSchemasForAI();
    expect(findToolInSchemas(afterEnable, KNOWN_TOOL_NAME)).toBe(true);
  });

  it("re-enabled tool disappears from getDisabledTools()", () => {
    disableToolRuntime(KNOWN_TOOL_NAME, "test: temporary failure");

    const disabledBefore = getDisabledTools();
    expect(findToolInDisabled(disabledBefore, KNOWN_TOOL_NAME)).toBeDefined();

    enableToolRuntime(KNOWN_TOOL_NAME);

    const disabledAfter = getDisabledTools();
    expect(findToolInDisabled(disabledAfter, KNOWN_TOOL_NAME)).toBeUndefined();
  });

  it("enabling an already-enabled tool does not crash", () => {
    expect(() => {
      enableToolRuntime(KNOWN_TOOL_NAME);
    }).not.toThrow();
  });

  it("enabling a non-existent tool name does not crash", () => {
    expect(() => {
      enableToolRuntime("__definitely_not_a_real_tool__");
    }).not.toThrow();
  });
});

// ── Schema Count Integrity ──────────────────────────────────

describe("Runtime Tool Disabling — schema count integrity", () => {
  beforeEach(() => {
    enableToolRuntime(KNOWN_TOOL_NAME);
  });

  it("disabling one tool reduces schema count by exactly one", () => {
    const countBefore = getToolSchemasForAI().length;

    disableToolRuntime(KNOWN_TOOL_NAME, "test: count check");

    const countAfter = getToolSchemasForAI().length;
    expect(countAfter).toBe(countBefore - 1);
  });

  it("disabling then enabling restores original schema count", () => {
    const countBefore = getToolSchemasForAI().length;

    disableToolRuntime(KNOWN_TOOL_NAME, "test: roundtrip");
    enableToolRuntime(KNOWN_TOOL_NAME);

    const countAfter = getToolSchemasForAI().length;
    expect(countAfter).toBe(countBefore);
  });

  it("disabling multiple tools reduces count accordingly", () => {
    const toolA = TOOL_DEFINITIONS[0]?.name;
    const toolB = TOOL_DEFINITIONS[1]?.name;
    const toolC = TOOL_DEFINITIONS[2]?.name;

    const countBefore = getToolSchemasForAI().length;

    disableToolRuntime(toolA, "test: multi A");
    disableToolRuntime(toolB, "test: multi B");
    disableToolRuntime(toolC, "test: multi C");

    const countAfter = getToolSchemasForAI().length;
    expect(countAfter).toBe(countBefore - 3);

    enableToolRuntime(toolA);
    enableToolRuntime(toolB);
    enableToolRuntime(toolC);
  });
});

// ── getDisabledTools Diagnostics ────────────────────────────

describe("Runtime Tool Disabling — getDisabledTools() diagnostics", () => {
  beforeEach(() => {
    enableToolRuntime(KNOWN_TOOL_NAME);
  });

  it("runtime-disabled tools include runtimeDisabled field", () => {
    disableToolRuntime(KNOWN_TOOL_NAME, "API returned 403");

    const disabled = getDisabledTools();
    const entry = findToolInDisabled(disabled, KNOWN_TOOL_NAME);
    expect(entry).toBeDefined();
    expect(entry).toHaveProperty("runtimeDisabled");
    expect(entry).toHaveProperty("name");
    expect(entry).toHaveProperty("domain");
    expect(entry).toHaveProperty("missingKeys");
  });

  it("statically-disabled tools do not have runtimeDisabled field", () => {
    const disabled = getDisabledTools();
    const staticOnly = disabled.filter(
      (tool) =>
        tool.name !== KNOWN_TOOL_NAME && !tool.runtimeDisabled,
    );

    for (const entry of staticOnly) {
      expect(entry.runtimeDisabled).toBeUndefined();
    }
  });
});

// ── Collector Integration Contracts ─────────────────────────
// These tests verify the tool names that collectors are expected
// to disable match actual TOOL_DEFINITIONS entries.

describe("Runtime Tool Disabling — collector integration contracts", () => {
  const toolDefinitionNames = new Set(
    TOOL_DEFINITIONS.map((tool) => tool.name),
  );

  it("Costco US tool name exists in TOOL_DEFINITIONS", () => {
    expect(toolDefinitionNames.has("get_costco_us_products")).toBe(true);
  });

  it("Costco CA tool name exists in TOOL_DEFINITIONS", () => {
    expect(toolDefinitionNames.has("get_costco_ca_products")).toBe(true);
  });

  it("Google Air Quality tool name exists in TOOL_DEFINITIONS", () => {
    expect(toolDefinitionNames.has("get_detailed_air_quality")).toBe(true);
  });

  it("Google Pollen tool name exists in TOOL_DEFINITIONS", () => {
    expect(toolDefinitionNames.has("get_pollen_forecast")).toBe(true);
  });

  const TMDB_TOOL_NAMES = [
    "search_media",
    "get_media_details",
    "get_media_credits",
    "get_trending_media",
    "browse_media",
    "get_media_genres",
  ];

  for (const tmdbToolName of TMDB_TOOL_NAMES) {
    it(`TMDb tool "${tmdbToolName}" exists in TOOL_DEFINITIONS`, () => {
      expect(toolDefinitionNames.has(tmdbToolName)).toBe(true);
    });
  }

  it("disabling all TMDb tools hides all 6 from AI schema", () => {
    for (const name of TMDB_TOOL_NAMES) {
      disableToolRuntime(name, "test: TMDb 410 Gone simulation");
    }

    const aiSchemas = getToolSchemasForAI();
    for (const name of TMDB_TOOL_NAMES) {
      expect(findToolInSchemas(aiSchemas, name)).toBe(false);
    }

    for (const name of TMDB_TOOL_NAMES) {
      enableToolRuntime(name);
    }
  });

  it("disabling Costco tools does not affect multi-source product tools", () => {
    disableToolRuntime(
      "get_costco_us_products",
      "test: Costco blocked",
    );
    disableToolRuntime(
      "get_costco_ca_products",
      "test: Costco blocked",
    );

    const aiSchemas = getToolSchemasForAI();
    expect(findToolInSchemas(aiSchemas, "search_products")).toBe(true);
    expect(findToolInSchemas(aiSchemas, "get_trending_products")).toBe(true);

    enableToolRuntime("get_costco_us_products");
    enableToolRuntime("get_costco_ca_products");
  });
});
