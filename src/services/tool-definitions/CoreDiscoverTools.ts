// ────────────────────────────────────────────────────────────
// Tool Definitions — Core Discover Tools
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getCoreDiscoverTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "search_tools",
    dataSource: onDemand("ToolSchemaService"),
    description: translate("search_tools.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/tool/search",
      bodyParams: ["query", "domain", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: translate("search_tools.params.query"),
        },
        domain: {
          type: "string",
          description: translate("search_tools.params.domain"),
        },
        limit: {
          type: "number",
          description: translate("search_tools.params.limit"),
        },
      },
      required: [],
    },
  },
  ];
}
