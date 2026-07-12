// ────────────────────────────────────────────────────────────
// Tool Definitions — Security
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getSecurityTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "check_breach",
    dataSource: onDemand("Have I Been Pwned"),
    description: translate("check_breach.description"),
    endpoint: {
      path: "/utility/breach/check",
      queryParams: ["type", "value"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["password", "email"],
          description: translate("check_breach.params.type"),
        },
        value: {
          type: "string",
          description: translate("check_breach.params.value"),
        },
      },
      required: ["type", "value"],
    },
    display: {
      activeVerb: "Checking security breach status for",
      completedVerb: "Checked security breach status for",
      subjectParam: "type",
      subjectFormat: "full",
    },
  },
  ];
}
