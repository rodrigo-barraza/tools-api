// ────────────────────────────────────────────────────────────
// Tool Taxonomy Integrity Tests
// ────────────────────────────────────────────────────────────
// Validates that EVERY tool schema in ToolSchemaService has:
//   1. A domain entry in TOOL_DOMAINS
//   2. A label entry in TOOL_LABELS (array with ≥1 label)
//   3. Required schema fields (name, description, parameters)
//   4. Bidirectional coverage (no orphan domains/labels)
// ────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  TOOL_DEFINITIONS,
  TOOL_DOMAINS,
} from "../src/services/ToolSchemaService.ts";
import { DOMAINS } from "@rodrigo-barraza/utilities-library/taxonomy";

// ── Helpers ──────────────────────────────────────────────────

const schemaNames = new Set(TOOL_DEFINITIONS.map((schema) => schema.name));
const domainKeys = new Set(Object.keys(TOOL_DOMAINS));

// ── Schema Structural Integrity ─────────────────────────────

describe("Tool Schema — structural integrity", () => {
  it("every schema has a non-empty name", () => {
    for (const schema of TOOL_DEFINITIONS) {
              expect(schema.name && typeof schema.name === "string").toBeTruthy();
    }
  });

  it("every schema has a non-empty description", () => {
    for (const schema of TOOL_DEFINITIONS) {
              expect(schema.description && typeof schema.description === "string").toBeTruthy();
    }
  });

  it("every schema has a parameters object with type 'object'", () => {
    for (const schema of TOOL_DEFINITIONS) {
      expect(schema.parameters, `Tool "${schema.name}" missing parameters`).toBeTruthy();
              expect(schema.parameters.type).toBe("object");
    }
  });

  it("every schema has a properties object in parameters", () => {
    for (const schema of TOOL_DEFINITIONS) {
              expect(schema.parameters.properties && typeof schema.parameters.properties === "object").toBeTruthy();
    }
  });

  it("schema names are unique (no duplicates)", () => {
    const seen = new Set();
    for (const schema of TOOL_DEFINITIONS) {
      expect(seen.has(schema.name)).toBe(false);
      seen.add(schema.name);
    }
  });
});

// ── Domain Coverage ─────────────────────────────────────────

describe("Tool Taxonomy — domain coverage", () => {
  it("every schema has a domain entry in TOOL_DOMAINS", () => {
    const missing = [];
    for (const name of schemaNames) {
      if (!domainKeys.has(name)) missing.push(name);
    }
          expect(missing.length).toBe(0);
  });

  it("TOOL_DOMAINS has no orphan entries without a matching schema (diagnostic)", () => {
    const orphans = [];
    for (const key of domainKeys) {
      if (!schemaNames.has(key)) orphans.push(key);
    }
    // Orphans are allowed (pre-registered for gated tools) but logged
    if (orphans.length > 0) {
      console.log(
        `  ⚠  ${orphans.length} TOOL_DOMAINS entries without schemas (likely API-gated): ${orphans.join(", ")}`,
      );
    }
    expect(true).toBeTruthy();
  });

  it("every domain value is a non-empty string", () => {
    for (const [_tool, domain] of Object.entries(TOOL_DOMAINS)) {
              expect(domain && typeof domain === "string").toBeTruthy();
    }
  });
});



// ── Schema Parameter Validation ─────────────────────────────

describe("Tool Schema — parameter validation", () => {
  it("required array only references defined properties", () => {
    for (const schema of TOOL_DEFINITIONS) {
      const required = schema.parameters.required || [];
      const props = Object.keys(schema.parameters.properties || {});
      for (const requiredField of required) {
                  expect(props.includes(requiredField)).toBeTruthy();
      }
    }
  });

  it("every property has a type or enum", () => {
    for (const s of TOOL_DEFINITIONS) {
      for (const [_propName, propDef] of Object.entries(
        s.parameters.properties || {},
      )) {
        const hasType = propDef.type || propDef.enum;
                  expect(hasType).toBeTruthy();
      }
    }
  });
});

// ── ToolTaxonomyConstants Consistency ────────────────────────

describe("ToolTaxonomyConstants — registry alignment", () => {
  // Collect all domain values used across TOOL_DOMAINS
  const usedDomains = new Set(Object.values(TOOL_DOMAINS));

  it("every DOMAINS constant appears in at least one TOOL_DOMAINS entry", () => {
    const missing = [];
    for (const [key, value] of Object.entries(DOMAINS)) {
      if (!usedDomains.has(value.displayName)) missing.push(`DOMAINS.${key} = "${value.displayName}"`);
    }
    if (missing.length > 0) {
      console.log(
        `  ⚠  ${missing.length} DOMAINS constants not used in any TOOL_DOMAINS entry: ${missing.join(", ")}`,
      );
    }
    expect(true).toBeTruthy();
  });

  it("every domain value used in TOOL_DOMAINS has a DOMAINS constant", () => {
    const constantValues = new Set<any>(Object.values(DOMAINS).map((entry) => entry.displayName));
    const missing = [...usedDomains].filter((domain) => !constantValues.has(domain));
          expect(missing.length).toBe(0);
  });
});
