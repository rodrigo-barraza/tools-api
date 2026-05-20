// ─── Meta-Tool for Tool Discovery ───────────────────────────

import { getToolSchemas } from "./ToolSchemaService.ts";

/**
 * Search all registered tool schemas by keyword, domain, or label.
 */
export function agenticToolSearch(query: any, { domain, label, limit = 20 }: Record<string, any> = {}) {
  const allSchemas = getToolSchemas();

  if (!allSchemas || allSchemas.length === 0) {
    return { error: "Tool schemas not loaded — tools-api may still be initializing" };
  }

  const queryLower = (query || "").toLowerCase().trim();

  let filtered = allSchemas;

  // Filter by domain (exact match, case-insensitive)
  if (domain) {
    const domainLower = domain.toLowerCase();
    filtered = filtered.filter(
      (t: any) => t.domain && t.domain.toLowerCase() === domainLower,
    );
  }

  // Filter by label category (exact match, case-insensitive)
  if (label) {
    const labelLower = label.toLowerCase();
    filtered = filtered.filter(
      (t: any) =>
        t.labels &&
        Object.values(t.labels).some(
          (v: any) => typeof v === "string" && v.toLowerCase() === labelLower,
        ),
    );
  }

  // Keyword search on name + description
  let scored: any;
  if (queryLower) {
    scored = filtered.map((t: any) => {
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
    }).filter((s: any) => s.score > 0);
  } else {
    // No keyword query — just domain/label filtering, return all matches
    scored = filtered.map((t: any) => ({ schema: t, score: 1 }));
  }

  // Sort by score descending
  scored.sort((a: any, b: any) => b.score - a.score);

  const capped = Math.min(Math.max(1, limit), 50);
  const matches = scored.slice(0, capped).map(({ schema }: any) => ({
    name: schema.name,
    description: schema.description,
    domain: schema.domain || null,
    labels: schema.labels || null,
    parameters: schema.parameters || null,
  }));

  return {
    matches,
    total: scored.length,
    query: query || null,
    domain: domain || null,
    label: label || null,
  };
}
