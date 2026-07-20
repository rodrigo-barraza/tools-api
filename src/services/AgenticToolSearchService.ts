// ─── Meta-Tool for Tool Discovery ───────────────────────────
//
// Uses BM25 ranking (Okapi BM25) for relevance scoring instead
// of naive substring matching. Indexes tool name, description,
// and parameter names for comprehensive search coverage.

import { getToolSchemas } from "./ToolSchemaService.ts";
import { DOMAINS } from "@rodrigo-barraza/utilities-library/taxonomy";
import { Bm25ToolIndex } from "@rodrigo-barraza/utilities-library/search";
import type { ToolSearchMatch, ToolParameters } from "../types/tools.ts";
import PromptLocaleService from "./PromptLocaleService.ts";
import { getRecipeSearchDocuments, isRecipeAvailable } from "./ToolRecipeService.ts";

/** Max recipe entries prepended to a search result. */
const MAX_RECIPE_MATCHES = 2;

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

  // ── Recipe matches ─────────────────────────────────────────
  // Goal-phrased queries ("combine audio", "make a gif from a video")
  // often describe an OUTCOME that spans several tools. Recipes are
  // indexed alongside the catalog; a matching recipe is prepended as the
  // plan, and its constituent tools are appended as ordinary matches so
  // the standard discovery nudge/auto-enable machinery activates them.
  if (queryText) {
    const recipeDocuments = getRecipeSearchDocuments(
      PromptLocaleService.getDefaultLocale(),
    );
    const recipeIndex = new Bm25ToolIndex(recipeDocuments);
    const catalogToolNames = new Set(
      allToolSchemas.map((toolSchema) => toolSchema.name),
    );
    const recipeResults = recipeIndex
      .search(queryText, MAX_RECIPE_MATCHES)
      .filter((result) => result.score > 0)
      // Availability gate: a recipe whose required tools are missing
      // (API-key-gated, runtime-disabled) would be a plan the agent
      // cannot execute — hide it entirely.
      .filter((result) => isRecipeAvailable(result.document.recipe, catalogToolNames));

    if (recipeResults.length > 0) {
      const matchedToolNames = new Set(matches.map((match) => match.name));
      const schemasByName = new Map(
        allToolSchemas.map((toolSchema) => [toolSchema.name, toolSchema]),
      );

      const recipeMatches: ToolSearchMatch[] = [];
      for (const result of recipeResults) {
        const recipe = result.document.recipe;
        recipeMatches.push({
          name: recipe.name,
          description: `${recipe.title}: ${recipe.description}`,
          domain: "Recipes",
          parameters: null,
          recipe: {
            title: recipe.title,
            steps: recipe.steps,
            tools: recipe.tools,
            requiredTools: recipe.requiredTools,
          },
        });

        // Ride-along constituent tools (deduped against existing matches)
        for (const toolName of recipe.tools) {
          if (matchedToolNames.has(toolName)) continue;
          const toolSchema = schemasByName.get(toolName);
          if (!toolSchema) continue;
          matchedToolNames.add(toolName);
          matches.push({
            name: toolSchema.name,
            description: toolSchema.description,
            domain: toolSchema.domain || null,
            parameters: toolSchema.parameters
              ? (toolSchema.parameters as unknown as ToolParameters)
              : null,
            ...(hasEnabledContext && {
              isEnabled: enabledToolsSet.has(toolSchema.name),
            }),
          });
        }
      }
      matches.unshift(...recipeMatches);
    }
  }

  const hasDisabledMatches = hasEnabledContext && matches.some(
    (matchResultEntry) => matchResultEntry.isEnabled === false,
  );

  const actionNudge = hasDisabledMatches
    ? PromptLocaleService.get("en", "prompts.tool-search.action-nudge-disabled")
    : PromptLocaleService.get("en", "prompts.tool-search.action-nudge-enabled");

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
