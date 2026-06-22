// ─── Meta-Tool for Tool Discovery ───────────────────────────
//
// Uses BM25 ranking (Okapi BM25) for relevance scoring instead
// of naive substring matching. Indexes tool name, description,
// and parameter names for comprehensive search coverage.

import { getToolSchemas } from "./ToolSchemaService.ts";
import { DOMAINS } from "@rodrigo-barraza/utilities-library/taxonomy";
import { Bm25ToolIndex } from "@rodrigo-barraza/utilities-library/search";
import type { ToolSearchMatch, ToolParameters } from "../types/tools.ts";

type InferredToolSchema = ReturnType<typeof getToolSchemas>[number];

/**
 * Meta-tool domains whose tools are always injected as core agentic tools.
 * Exclude from search results to prevent self-referential discovery loops
 * (e.g. search_tools returning search_tools → agent calls enable_tools → no-op).
 */
const EXCLUDED_META_DOMAINS: Set<string> = new Set([
  DOMAINS.CORE_DISCOVER.displayName,
]);

interface ScoredMatch {
  schema: InferredToolSchema;
  score: number;
}

/**
 * Search all registered tool schemas by keyword or domain.
 *
 * Discovery-first design: search_tools always searches the FULL tool catalog
 * regardless of what the agent currently has enabled. Each result is annotated
 * with `isEnabled` so the agent knows which tools need activation via
 * `enable_tools` before use.
 */
export interface AgenticToolSearchOptions {
  domain?: string;
  limit?: number;
  enabledTools?: string[];
}

export interface TransformedToolSearchResult {
  matches?: ToolSearchMatch[];
  total?: number;
  query?: string | null;
  domain?: string | null;
  actionRequired?: string;
  action_required?: string;
  error?: string;
}

export function agenticToolSearch(
  query: string,
  { domain, limit = 20, enabledTools }: AgenticToolSearchOptions = {},
): TransformedToolSearchResult {
  const allToolSchemas = getToolSchemas();

  if (!allToolSchemas || allToolSchemas.length === 0) {
    return {
      error: "Tool schemas not loaded — tools-api may still be initializing",
    };
  }

  // Build enabled set for annotation only (not filtering)
  const enabledToolsSet = new Set<string>();
  const hasEnabledContext =
    enabledTools &&
    Array.isArray(enabledTools) &&
    enabledTools.length > 0 &&
    !enabledTools.includes("*");

  if (hasEnabledContext) {
    for (const entry of enabledTools) {
      if (entry.startsWith("domain:")) {
        const domainFilter = entry.slice(7).toLowerCase();
        for (const toolSchema of allToolSchemas) {
          if (
            toolSchema.domain &&
            toolSchema.domain.toLowerCase() === domainFilter
          ) {
            enabledToolsSet.add(toolSchema.name);
          }
        }
      } else {
        enabledToolsSet.add(entry);
      }
    }
  }

  // Domain filter narrows the search scope (not enabledTools)
  // Always exclude meta-tool domains (e.g. Core Discover) — these are
  // always-on tools that should never appear in their own search results.
  let filteredToolSchemas: InferredToolSchema[] = allToolSchemas.filter(
    (toolSchema: InferredToolSchema) =>
      !EXCLUDED_META_DOMAINS.has(toolSchema.domain || ""),
  );

  if (domain) {
    const domainNameLowerCase = domain.toLowerCase();
    filteredToolSchemas = filteredToolSchemas.filter(
      (toolSchema: InferredToolSchema) =>
        toolSchema.domain &&
        toolSchema.domain.toLowerCase() === domainNameLowerCase,
    );
  }

  // Build BM25 index over the filtered catalog and search
  const searchIndex = new Bm25ToolIndex(filteredToolSchemas);
  const cappedLimit = Math.min(Math.max(1, limit), 50);
  const queryText = (query || "").trim();

  const indexResults = searchIndex.search(queryText, cappedLimit);

  const scoredToolMatches: ScoredMatch[] = indexResults.map((result) => ({
    schema: result.document,
    score: result.score,
  }));

  const matches: ToolSearchMatch[] = scoredToolMatches.map(
    (scoredToolMatch: ScoredMatch) => ({
      name: scoredToolMatch.schema.name,
      description: scoredToolMatch.schema.description,
      domain: scoredToolMatch.schema.domain || null,
      parameters: scoredToolMatch.schema.parameters
        ? (scoredToolMatch.schema.parameters as unknown as ToolParameters)
        : null,
      ...(hasEnabledContext && {
        isEnabled: enabledToolsSet.has(scoredToolMatch.schema.name),
      }),
    }),
  );

  const hasDisabledMatches = hasEnabledContext && matches.some(
    (matchResultEntry) => matchResultEntry.isEnabled === false,
  );

  const actionNudge = hasDisabledMatches
    ? "IMPORTANT: Some discovered tools are NOT currently enabled (isEnabled: false). " +
      "You MUST call enable_tools with the tool names you need before you can use them. " +
      "After enabling, the tools become available on your next iteration."
    : "All matched tools are already enabled — you can call them directly.";

  return {
    matches,
    total: scoredToolMatches.length,
    query: query || null,
    domain: domain || null,
    ...(hasEnabledContext && {
      actionRequired: actionNudge,
      action_required: actionNudge,
    }),
  };
}
