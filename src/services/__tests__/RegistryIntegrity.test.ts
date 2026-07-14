// ────────────────────────────────────────────────────────────
// Registry Integrity Tests
// ────────────────────────────────────────────────────────────
// Guards against metadata maps drifting from the real tool
// catalog. TOOL_REQUIRED_KEYS drift is the dangerous one: a
// stale key means the gate silently stops applying and the
// tool is advertised to the LLM even when its API key is
// missing (this happened when get_stock_quote/get_macro_*
// were renamed to get_stock/get_macro).
// Also verifies every locale key referenced by a tool
// definition resolves in both locales (PromptLocaleService
// returns "[MISSING: key]" for dangling keys).
// ────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  validateToolRegistries,
  getLocalizedToolDefinitions,
} from "../ToolSchemaService.ts";
import type { ToolParameterProperty } from "../../types/tools.ts";

const report = validateToolRegistries();

describe("Registry integrity — gating maps match real tool names", () => {
  it("TOOL_REQUIRED_KEYS has no stale entries", () => {
    expect(report.staleKeys.TOOL_REQUIRED_KEYS ?? []).toEqual([]);
  });

  it("TOOL_REQUIRED_DATA_FILES has no stale entries", () => {
    expect(report.staleKeys.TOOL_REQUIRED_DATA_FILES ?? []).toEqual([]);
  });

  it("TOOL_DOMAINS / TOOL_EMOJIS stale entries are reported (diagnostic)", () => {
    for (const registry of ["TOOL_DOMAINS", "TOOL_EMOJIS"]) {
      const stale = report.staleKeys[registry] ?? [];
      if (stale.length > 0) {
        console.log(
          `  ⚠  ${registry} has ${stale.length} entries without schemas: ${stale.join(", ")}`,
        );
      }
    }
    expect(true).toBeTruthy();
  });
});

// ── Locale key resolution ────────────────────────────────────

function collectMissingMarkers(
  toolName: string,
  property: ToolParameterProperty,
  path: string,
  missing: string[],
): void {
  if (property.description?.includes("[MISSING:")) {
    missing.push(`${toolName}.${path}: ${property.description}`);
  }
  for (const [childName, child] of Object.entries(property.properties ?? {})) {
    collectMissingMarkers(toolName, child, `${path}.${childName}`, missing);
  }
  if (property.items) {
    collectMissingMarkers(
      toolName,
      property.items as ToolParameterProperty,
      `${path}[]`,
      missing,
    );
  }
  for (const variant of property.anyOf ?? []) {
    collectMissingMarkers(toolName, variant, `${path}(anyOf)`, missing);
  }
}

describe.each(["en", "caveman"])(
  "Locale key resolution — %s",
  (locale) => {
    const definitions = getLocalizedToolDefinitions(locale);

    it("every tool description resolves", () => {
      const missing = definitions
        .filter((tool) => tool.description.includes("[MISSING:"))
        .map((tool) => `${tool.name}: ${tool.description}`);
      expect(missing).toEqual([]);
    });

    it("every parameter description resolves", () => {
      const missing: string[] = [];
      for (const tool of definitions) {
        for (const [propertyName, property] of Object.entries(
          tool.parameters?.properties ?? {},
        )) {
          collectMissingMarkers(tool.name, property, propertyName, missing);
        }
      }
      expect(missing).toEqual([]);
    });
  },
);
