// ────────────────────────────────────────────────────────────
// Tool Definitions — Classifieds (Craigslist)
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getClassifiedsTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {

  return [
  {
    name: "search_craigslist",
    dataSource: onDemand("Craigslist"),
    description: translate("search_craigslist.description"),
    endpoint: {
      path: "/knowledge/craigslist/search",
      queryParams: ["q", "city", "category", "from", "to", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_craigslist.params.q"),
        },
        city: {
          type: "string",
          description: translate("search_craigslist.params.city"),
        },
        category: {
          type: "string",
          enum: ["for sale", "jobs", "housing", "services", "gigs", "autos"],
          description: translate("search_craigslist.params.category"),
        },
        from: {
          type: "string",
          description: translate("search_craigslist.params.from"),
        },
        to: {
          type: "string",
          description: translate("search_craigslist.params.to"),
        },
        limit: {
          type: "number",
          description: translate("search_craigslist.params.limit"),
        },
      },
      required: ["q", "city", "category"],
    },
    display: {
      activeVerb: "Searching Craigslist for",
      completedVerb: "Searched Craigslist for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  ];
}
