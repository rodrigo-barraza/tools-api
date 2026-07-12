// ────────────────────────────────────────────────────────────
// Tool Definitions — Trends
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";

export function getTrendsTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
  {
    name: "get_trends",
    dataSource: onDemand("Trend aggregation"),
    description: translate("get_trends.description"),
    endpoint: {
      path: "/trend/data",
      queryParams: ["action", "source", "hours", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("get_trends.params.action"),
          enum: ["current", "hot", "top"],
        },
        source: {
          type: "string",
          description: translate("get_trends.params.source"),
        },
        hours: {
          type: "number",
          description: translate("get_trends.params.hours"),
        },
        limit: { type: "number", description: translate("get_trends.params.limit") },
        ...fieldsParam(FIELDS.TRENDS),
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "action",
      subjectFormat: "full",
    },
  },
  {
    name: "get_github_trending",
    dataSource: onDemand("GitHub"),
    description: translate("get_github_trending.description"),
    endpoint: {
      path: "/trend/github/trending",
      queryParams: ["language", "since", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        language: {
          type: "string",
          description: translate("get_github_trending.params.language"),
        },
        since: {
          type: "string",
          enum: ["daily", "weekly", "monthly"],
          description: translate("get_github_trending.params.since"),
        },
        limit: {
          type: "number",
          description: translate("get_github_trending.params.limit"),
        },
      },
      required: [],
    },
    display: {
      activeVerb: "Fetching GitHub trending repositories",
      completedVerb: "Fetched GitHub trending repositories",
      subjectParam: "language",
      subjectFormat: "full",
    },
  },
  ];
}
