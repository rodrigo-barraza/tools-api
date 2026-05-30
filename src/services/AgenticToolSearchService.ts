// ─── Meta-Tool for Tool Discovery ───────────────────────────

import { getToolSchemas } from "./ToolSchemaService.ts";
import type { ToolSearchMatch, ToolParameters } from "../types/tools.ts";

type InferredToolSchema = ReturnType<typeof getToolSchemas>[number];

interface ScoredMatch {
  schema: InferredToolSchema;
  score: number;
}

/**
 * Search all registered tool schemas by keyword, domain, or label.
 */
export interface AgenticToolSearchOptions {
  domain?: string;
  label?: string;
  limit?: number;
  enabledTools?: string[];
}

export interface TransformedToolSearchResult {
  matches?: ToolSearchMatch[];
  total?: number;
  query?: string | null;
  domain?: string | null;
  label?: string | null;
  error?: string;
}

export function agenticToolSearch(
  query: string,
  { domain, label, limit = 20, enabledTools }: AgenticToolSearchOptions = {},
): TransformedToolSearchResult {
  const allSchemas = getToolSchemas();

  if (!allSchemas || allSchemas.length === 0) {
    return {
      error: "Tool schemas not loaded — tools-api may still be initializing",
    };
  }

  const queryLower = (query || "").toLowerCase().trim();

  let filtered: InferredToolSchema[] = allSchemas;

  // Filter by enabled tools for the active agent session if specified
  if (enabledTools && Array.isArray(enabledTools)) {
    const enabledSet = new Set(enabledTools);
    filtered = filtered.filter((toolSchema: InferredToolSchema) =>
      enabledSet.has(toolSchema.name),
    );
  }

  // Filter by domain (exact match, case-insensitive)
  if (domain) {
    const domainLower = domain.toLowerCase();
    filtered = filtered.filter(
      (toolSchema: InferredToolSchema) =>
        toolSchema.domain && toolSchema.domain.toLowerCase() === domainLower,
    );
  }

  // Filter by label category (exact match, case-insensitive)
  if (label) {
    const labelLower = label.toLowerCase();
    filtered = filtered.filter(
      (toolSchema: InferredToolSchema) =>
        toolSchema.labels &&
        Object.values(toolSchema.labels).some(
          (labelValue: unknown) =>
            typeof labelValue === "string" &&
            labelValue.toLowerCase() === labelLower,
        ),
    );
  }

  // Keyword search on name + description
  let scored: ScoredMatch[];
  if (queryLower) {
    scored = filtered
      .map((t: InferredToolSchema) => {
        const nameLower = (t.name || "").toLowerCase();
        const descLower = (t.description || "").toLowerCase();

        let score = 0;
        // Exact name match → highest score
        if (nameLower === queryLower) score += 100;
        // Name contains query
        else if (nameLower.includes(queryLower)) score += 50;
        // Description contains query
        if (descLower.includes(queryLower)) score += 20;

        // Bonus: match individual words
        const queryWords = queryLower.split(/\s+/);
        for (const word of queryWords) {
          if (word.length < 2) continue;
          if (nameLower.includes(word)) score += 10;
          if (descLower.includes(word)) score += 5;
        }

        return { schema: t, score };
      })
      .filter((s: ScoredMatch) => s.score > 0);
  } else {
    // No keyword query — just domain/label filtering, return all matches
    scored = filtered.map((t: InferredToolSchema) => ({ schema: t, score: 1 }));
  }

  // Sort by score descending
  scored.sort((a: ScoredMatch, b: ScoredMatch) => b.score - a.score);

  const capped = Math.min(Math.max(1, limit), 50);
  const matches: ToolSearchMatch[] = scored
    .slice(0, capped)
    .map(({ schema }: ScoredMatch) => ({
      name: schema.name,
      description: schema.description,
      domain: schema.domain || null,
      labels: schema.labels ? (schema.labels as string[]) : null,
      parameters: schema.parameters
        ? (schema.parameters as unknown as ToolParameters)
        : null,
    }));

  return {
    matches,
    total: scored.length,
    query: query || null,
    domain: domain || null,
    label: label || null,
  };
}
