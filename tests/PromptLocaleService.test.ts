import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ────────────────────────────────────────────────────────────
// PromptLocaleService Integration Tests — Tools Service
// ────────────────────────────────────────────────────────────
// Verifies that:
//   1. All locale JSON files are valid JSON and load without errors
//   2. Tool descriptions and parameter descriptions have locale keys
//   3. The dist/ output contains locale files after build
//   4. Critical prompt keys exist and are non-empty

const LOCALES_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "locales",
);

const DIST_LOCALES_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "locales",
);

function deepFlattenObject(
  source: Record<string, unknown>,
  prefix = "",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(
        result,
        deepFlattenObject(value as Record<string, unknown>, flatKey),
      );
    } else {
      result[flatKey] = value;
    }
  }
  return result;
}

function loadAllLocaleKeys(localeDirectory: string): Map<string, string> {
  const allKeys = new Map<string, string>();

  function processDirectory(directory: string, namespacePrefix: string) {
    if (!fs.existsSync(directory)) return;
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        processDirectory(fullPath, `${namespacePrefix}${entry.name}.`);
      } else if (entry.name.endsWith(".json")) {
        const fileNameWithoutExtension = entry.name.replace(/\.json$/, "");
        const filePrefix = `${namespacePrefix}${fileNameWithoutExtension}`;
        const rawContent = fs.readFileSync(fullPath, "utf-8");
        const parsedContent = JSON.parse(rawContent) as Record<string, unknown>;
        const flattened = deepFlattenObject(parsedContent, filePrefix);
        for (const [flatKey, flatValue] of Object.entries(flattened)) {
          allKeys.set(flatKey, String(flatValue));
        }
      }
    }
  }

  processDirectory(localeDirectory, "");
  return allKeys;
}

describe("PromptLocaleService — Locale Loading (Tools)", () => {
  let englishLocaleKeys: Map<string, string>;

  beforeAll(() => {
    const englishLocaleDirectory = path.join(LOCALES_DIRECTORY, "en");
    englishLocaleKeys = loadAllLocaleKeys(englishLocaleDirectory);
  });

  it("should find the source locales directory", () => {
    expect(fs.existsSync(LOCALES_DIRECTORY)).toBe(true);
  });

  it("should find the 'en' locale subdirectory", () => {
    expect(fs.existsSync(path.join(LOCALES_DIRECTORY, "en"))).toBe(true);
  });

  it("should load a non-zero number of locale keys", () => {
    expect(englishLocaleKeys.size).toBeGreaterThan(0);
  });

  it("should parse all locale JSON files without errors", () => {
    const englishLocaleDirectory = path.join(LOCALES_DIRECTORY, "en");
    const allJsonFiles: string[] = [];

    function collectJsonFiles(directory: string) {
      const entries = fs.readdirSync(directory, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          collectJsonFiles(fullPath);
        } else if (entry.name.endsWith(".json")) {
          allJsonFiles.push(fullPath);
        }
      }
    }

    collectJsonFiles(englishLocaleDirectory);

    for (const jsonFile of allJsonFiles) {
      const rawContent = fs.readFileSync(jsonFile, "utf-8");
      expect(() => JSON.parse(rawContent)).not.toThrow();
    }
  });
});

describe("PromptLocaleService — Tool Schema Locale Keys", () => {
  let englishLocaleKeys: Map<string, string>;

  beforeAll(() => {
    const englishLocaleDirectory = path.join(LOCALES_DIRECTORY, "en");
    englishLocaleKeys = loadAllLocaleKeys(englishLocaleDirectory);
  });

  it("should have tool description keys namespaced under 'tools.'", () => {
    const toolKeys = [...englishLocaleKeys.keys()].filter((key) =>
      key.startsWith("tools."),
    );
    expect(toolKeys.length).toBeGreaterThan(50);
  });

  it("should resolve tool description keys with .description suffix", () => {
    const descriptionKeys = [...englishLocaleKeys.keys()].filter(
      (key) => key.startsWith("tools.") && key.endsWith(".description"),
    );
    expect(descriptionKeys.length).toBeGreaterThan(10);
  });

  it("should resolve tool parameter description keys with .params. infix", () => {
    const parameterKeys = [...englishLocaleKeys.keys()].filter(
      (key) => key.startsWith("tools.") && key.includes(".params."),
    );
    expect(parameterKeys.length).toBeGreaterThan(10);
  });

  const SAMPLE_TOOL_KEYS = [
    "tools.read_url.description",
    "tools.read_url.params.url",
    "tools.execute_python.description",
    "tools.execute_python.params.code",
    "tools.search_web.description",
    "tools.search_web.params.query",
    "tools.evaluate_expression.description",
    "tools.evaluate_expression.params.operation",
    "tools.execute_javascript.description",
    "tools.execute_javascript.params.code",
  ];

  for (const key of SAMPLE_TOOL_KEYS) {
    it(`should resolve tool key: "${key}"`, () => {
      expect(englishLocaleKeys.has(key)).toBe(true);
      const value = englishLocaleKeys.get(key)!;
      expect(value.length).toBeGreaterThan(0);
    });
  }
});

describe("PromptLocaleService — Prompt Keys (prompts.json)", () => {
  let englishLocaleKeys: Map<string, string>;

  beforeAll(() => {
    const englishLocaleDirectory = path.join(LOCALES_DIRECTORY, "en");
    englishLocaleKeys = loadAllLocaleKeys(englishLocaleDirectory);
  });

  const PROMPT_CRITICAL_KEYS = [
    "prompts.creative.describe.photo",
    "prompts.creative.image.editing-system-prompt",
    "prompts.creative.image.safety-block-error",
    "prompts.creative.image.result-success",
    "prompts.tool-search.action-nudge-disabled",
    "prompts.tool-search.action-nudge-enabled",
    "prompts.file.replace-no-match",
  ];

  for (const key of PROMPT_CRITICAL_KEYS) {
    it(`should resolve prompt key: "${key}"`, () => {
      expect(englishLocaleKeys.has(key)).toBe(true);
      const value = englishLocaleKeys.get(key)!;
      expect(value.length).toBeGreaterThan(0);
    });
  }
});

describe("PromptLocaleService — No Value Contains [MISSING:]", () => {
  let englishLocaleKeys: Map<string, string>;

  beforeAll(() => {
    const englishLocaleDirectory = path.join(LOCALES_DIRECTORY, "en");
    englishLocaleKeys = loadAllLocaleKeys(englishLocaleDirectory);
  });

  it("should not have any values containing [MISSING:] placeholder text", () => {
    const missingValueKeys: string[] = [];
    for (const [key, value] of englishLocaleKeys) {
      if (value.includes("[MISSING:")) {
        missingValueKeys.push(key);
      }
    }
    expect(missingValueKeys).toEqual([]);
  });
});

describe("PromptLocaleService — dist/ Production Build", () => {
  it("should have locale files copied to dist/locales/en/ after build", () => {
    if (!fs.existsSync(DIST_LOCALES_DIRECTORY)) {
      return;
    }
    const distEnglishLocaleDirectory = path.join(DIST_LOCALES_DIRECTORY, "en");
    expect(fs.existsSync(distEnglishLocaleDirectory)).toBe(true);

    const distLocaleKeys = loadAllLocaleKeys(distEnglishLocaleDirectory);
    expect(distLocaleKeys.size).toBeGreaterThan(0);

    // Verify critical keys exist in the dist build
    expect(distLocaleKeys.has("tools.read_url.description")).toBe(true);
    expect(distLocaleKeys.has("tools.search_web.description")).toBe(true);
    expect(distLocaleKeys.has("prompts.creative.image.result-success")).toBe(true);
  });

  it("should have identical key counts between src and dist locales", () => {
    if (!fs.existsSync(DIST_LOCALES_DIRECTORY)) return;

    const sourceKeys = loadAllLocaleKeys(path.join(LOCALES_DIRECTORY, "en"));
    const distKeys = loadAllLocaleKeys(path.join(DIST_LOCALES_DIRECTORY, "en"));
    expect(distKeys.size).toBe(sourceKeys.size);
  });
});

describe("PromptLocaleService — Common Params Shared Keys", () => {
  let englishLocaleKeys: Map<string, string>;

  beforeAll(() => {
    const englishLocaleDirectory = path.join(LOCALES_DIRECTORY, "en");
    englishLocaleKeys = loadAllLocaleKeys(englishLocaleDirectory);
  });

  const COMMON_PARAMS_KEYS = [
    { key: "tools.common.params.maxResultsDefault10", expectedValue: "Max results (default: 10)" },
    { key: "tools.common.params.fieldsCsv", expectedValue: "Comma-separated fields to return" },
    { key: "tools.common.params.zeroToOne", expectedValue: "0-1" },
    { key: "tools.common.params.lifxSelector", expectedValue: "LIFX selector. Default: 'all'." },
    { key: "tools.common.params.mediaType", expectedValue: "Movie or TV show" },
    { key: "tools.common.params.queryMode", expectedValue: "Query mode" },
    { key: "tools.common.params.searchQuery", expectedValue: "Search query (action=search)" },
    { key: "tools.common.params.backgroundColorDefault", expectedValue: "Background color (default: '#0f172a')" },
    { key: "tools.common.params.overlayTitle", expectedValue: "Title displayed in the overlay" },
    { key: "tools.common.params.cssColor", expectedValue: "CSS color" },
    { key: "tools.common.params.optionalName", expectedValue: "Optional name" },
    { key: "tools.common.params.daysOfHistory", expectedValue: "Days of history to look back" },
    { key: "tools.common.params.discordGuildId", expectedValue: "Discord guild/server ID to query" },
    { key: "tools.common.params.monthsOfHistory", expectedValue: "Months of history to look back" },
    { key: "tools.common.params.yearsOfHistory", expectedValue: "Years of history to look back" },
    { key: "tools.common.params.subredditName", expectedValue: "Subreddit name" },
    { key: "tools.common.params.lifxAutoOn", expectedValue: "If true (default), turn the light on if it's off." },
  ];

  for (const { key, expectedValue } of COMMON_PARAMS_KEYS) {
    it(`should resolve shared key: "${key}" with correct value`, () => {
      expect(englishLocaleKeys.has(key)).toBe(true);
      expect(englishLocaleKeys.get(key)).toBe(expectedValue);
    });
  }

  it("should NOT have tool-specific duplicates of common param values", () => {
    const commonValues = new Set(COMMON_PARAMS_KEYS.map((entry) => entry.expectedValue));
    const duplicateKeys: string[] = [];

    for (const [key, value] of englishLocaleKeys) {
      if (
        key.startsWith("tools.") &&
        !key.startsWith("tools.common.") &&
        key.includes(".params.") &&
        commonValues.has(value)
      ) {
        duplicateKeys.push(key);
      }
    }
    expect(duplicateKeys).toEqual([]);
  });
});
