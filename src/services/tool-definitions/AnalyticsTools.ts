// ────────────────────────────────────────────────────────────
// Tool Definitions — Analytics
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getAnalyticsTools(
  translate: (key: string, variables?: Record<string, string>) => string,
): ToolDefinition[] {
  return [
    {
      name: "get_web_analytics",
      dataSource: onDemand("Google Analytics + Sessions Service (via Portal)"),
      description: translate("get_web_analytics.description"),
      endpoint: {
        path: "/analytics/web",
        queryParams: ["property", "period", "source", "breakdown"],
      },
      parameters: {
        type: "object",
        properties: {
          property: {
            type: "string",
            description: translate("get_web_analytics.params.property"),
          },
          period: {
            type: "string",
            description: translate("get_web_analytics.params.period"),
            enum: ["7d", "30d", "90d"],
          },
          source: {
            type: "string",
            description: translate("get_web_analytics.params.source"),
            enum: ["all", "google", "firstParty"],
          },
          breakdown: {
            type: "string",
            description: translate("get_web_analytics.params.breakdown"),
            enum: ["overview", "timeseries", "pages", "sources", "geo", "devices"],
          },
        },
        required: [],
      },
      display: {
        activeVerb: "Fetching web analytics for",
        completedVerb: "Fetched web analytics for",
        subjectParam: "property",
        subjectFormat: "full",
      },
    },
  ];
}
