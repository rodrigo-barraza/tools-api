// ─── Meta-Tool for Tool Discovery ───────────────────────────

import { getToolSchemas } from "./ToolSchemaService.ts";
import type { ToolSearchMatch, ToolParameters } from "../types/tools.ts";

type InferredToolSchema = ReturnType<typeof getToolSchemas>[number];

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

  const queryTextLowerCase = (query || "").toLowerCase().trim();

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
  let filteredToolSchemas: InferredToolSchema[] = allToolSchemas;

  if (domain) {
    const domainNameLowerCase = domain.toLowerCase();
    filteredToolSchemas = filteredToolSchemas.filter(
      (toolSchema: InferredToolSchema) =>
        toolSchema.domain &&
        toolSchema.domain.toLowerCase() === domainNameLowerCase,
    );
  }

  let scoredToolMatches: ScoredMatch[];
  if (queryTextLowerCase) {
    scoredToolMatches = filteredToolSchemas
      .map((toolSchema: InferredToolSchema) => {
        const toolNameLowerCase = (toolSchema.name || "").toLowerCase();
        const descriptionTextLowerCase = (
          toolSchema.description || ""
        ).toLowerCase();

        let matchScore = 0;
        if (toolNameLowerCase === queryTextLowerCase) {
          matchScore += 100;
        } else if (toolNameLowerCase.includes(queryTextLowerCase)) {
          matchScore += 50;
        }
        if (descriptionTextLowerCase.includes(queryTextLowerCase)) {
          matchScore += 20;
        }

        const queryWords = queryTextLowerCase.split(/\s+/);
        for (const queryWord of queryWords) {
          if (queryWord.length < 2) {
            continue;
          }
          if (toolNameLowerCase.includes(queryWord)) {
            matchScore += 10;
          }
          if (descriptionTextLowerCase.includes(queryWord)) {
            matchScore += 5;
          }
        }

        return { schema: toolSchema, score: matchScore };
      })
      .filter((scoredMatch: ScoredMatch) => scoredMatch.score > 0);
  } else {
    scoredToolMatches = filteredToolSchemas.map(
      (toolSchema: InferredToolSchema) => ({ schema: toolSchema, score: 1 }),
    );
  }

  scoredToolMatches.sort(
    (firstMatch: ScoredMatch, secondMatch: ScoredMatch) =>
      secondMatch.score - firstMatch.score,
  );

  const cappedLimit = Math.min(Math.max(1, limit), 50);
  const matches: ToolSearchMatch[] = scoredToolMatches
    .slice(0, cappedLimit)
    .map((scoredMatch: ScoredMatch) => ({
      name: scoredMatch.schema.name,
      description: scoredMatch.schema.description,
      domain: scoredMatch.schema.domain || null,
      parameters: scoredMatch.schema.parameters
        ? (scoredMatch.schema.parameters as unknown as ToolParameters)
        : null,
      ...(hasEnabledContext && {
        isEnabled: enabledToolsSet.has(scoredMatch.schema.name),
      }),
    }));

  const hasDisabledMatches = hasEnabledContext && matches.some(
    (matchEntry) => matchEntry.isEnabled === false,
  );

  return {
    matches,
    total: scoredToolMatches.length,
    query: query || null,
    domain: domain || null,
    ...(hasEnabledContext && {
      action_required: hasDisabledMatches
        ? "IMPORTANT: Some discovered tools are NOT currently enabled (isEnabled: false). " +
          "You MUST call enable_tools with the tool names you need before you can use them. " +
          "After enabling, the tools become available on your next iteration."
        : "All matched tools are already enabled — you can call them directly.",
    }),
  };
}

