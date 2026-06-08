// ─── Meta-Tool for Tool Discovery ───────────────────────────

import { getToolSchemas } from "./ToolSchemaService.ts";
import type { ToolSearchMatch, ToolParameters } from "../types/tools.ts";
import { CORE_AGENTIC_TOOLS, CORE_ORCHESTRATOR_TOOLS } from "@rodrigo-barraza/utilities-library/taxonomy";

type InferredToolSchema = ReturnType<typeof getToolSchemas>[number];

interface ScoredMatch {
  schema: InferredToolSchema;
  score: number;
}

/**
 * Search all registered tool schemas by keyword or domain.
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

  const isAllToolsEnabled =
    !enabledTools ||
    !Array.isArray(enabledTools) ||
    enabledTools.includes("*");

  const enabledToolsSet = new Set<string>();
  if (!isAllToolsEnabled && enabledTools) {
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

    for (const toolName of CORE_AGENTIC_TOOLS) {
      enabledToolsSet.add(toolName);
    }
    for (const toolName of CORE_ORCHESTRATOR_TOOLS) {
      enabledToolsSet.add(toolName);
    }
  }

  if (domain) {
    const domainNameLowerCase = domain.toLowerCase();
    const hasEnabledToolInDomain = allToolSchemas.some(
      (toolSchema: InferredToolSchema) => {
        const matchesDomain =
          toolSchema.domain &&
          toolSchema.domain.toLowerCase() === domainNameLowerCase;
        if (!matchesDomain) {
          return false;
        }
        return isAllToolsEnabled || enabledToolsSet.has(toolSchema.name);
      },
    );

    if (!hasEnabledToolInDomain) {
      return {
        error: `Cannot search tools in domain '${domain}' because no tools under this domain are enabled for the current agent.`,
        matches: [],
        total: 0,
        query: query || null,
        domain: domain || null,
      };
    }
  }

  let filteredToolSchemas: InferredToolSchema[] = allToolSchemas;

  if (!isAllToolsEnabled) {
    filteredToolSchemas = filteredToolSchemas.filter(
      (toolSchema: InferredToolSchema) => enabledToolsSet.has(toolSchema.name),
    );
  }

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
    }));

  return {
    matches,
    total: scoredToolMatches.length,
    query: query || null,
    domain: domain || null,
  };
}
