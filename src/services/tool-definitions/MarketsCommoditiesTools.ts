// ────────────────────────────────────────────────────────────
// Tool Definitions — Markets & Commodities
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";

export function getMarketsCommoditiesTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
  {
    name: "get_commodities",
    dataSource: onDemand("YAML-sourced commodities"),
    description: translate("get_commodities.description"),
    endpoint: {
      path: "/market/commodities/data",
      queryParams: ["action", "category", "ticker", "hours"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("common.params.queryMode"),
          enum: ["summary", "category", "ticker", "categories", "history"],
        },
        category: {
          type: "string",
          description: translate("get_commodities.params.category"),
        },
        ticker: {
          type: "string",
          description: translate("get_commodities.params.ticker"),
        },
        hours: {
          type: "number",
          description: translate("get_commodities.params.hours"),
        },
        ...fieldsParam(FIELDS.COMMODITY),
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
