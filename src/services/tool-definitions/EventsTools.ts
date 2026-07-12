// ────────────────────────────────────────────────────────────
// Tool Definitions — Events
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getEventsTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "get_events",
    dataSource: onDemand("Beacon event aggregation"),
    description: translate("get_events.description"),
    endpoint: {
      path: "/event/events",
      queryParams: ["action", "q", "source", "category", "city", "days", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("get_events.params.action"),
          enum: ["search", "upcoming", "today", "summary"],
        },
        "q": { type: "string", description: translate("common.params.searchQuery") },
        city: {
          type: "string",
          description: translate("get_events.params.city"),
        },
        source: {
          type: "string",
          description: translate("get_events.params.source"),
        },
        category: {
          type: "string",
          description: translate("get_events.params.category"),
        },
        days: {
          type: "number",
          description: translate("get_events.params.days"),
        },
        limit: { type: "number", description: translate("get_events.params.limit") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
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
  ];
}
