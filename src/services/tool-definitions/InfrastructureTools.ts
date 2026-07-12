// ────────────────────────────────────────────────────────────
// Tool Definitions — Infrastructure
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getInfrastructureTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "get_infrastructure_status",
    dataSource: onDemand("Portal Service"),
    description: translate("get_infrastructure_status.description"),
    endpoint: {
      path: "/infrastructure/status",
      queryParams: ["action"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("get_infrastructure_status.params.action"),
          enum: ["services", "devices", "summary"],
        },
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Checking infrastructure status for",
      completedVerb: "Checked infrastructure status for",
      subjectParam: "action",
      subjectFormat: "full",
    },
  },
  {
    name: "get_container_diagnostics",
    dataSource: onDemand("Portal Service / Docker Engine API"),
    description: translate("get_container_diagnostics.description"),
    endpoint: {
      path: "/infrastructure/containers",
      queryParams: ["action", "container", "device", "range", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("get_container_diagnostics.params.action"),
          enum: ["stats", "metrics", "history", "system"],
        },
        container: {
          type: "string",
          description: translate("get_container_diagnostics.params.container"),
        },
        device: {
          type: "string",
          description: translate("get_container_diagnostics.params.device"),
        },
        range: {
          type: "string",
          description: translate("get_container_diagnostics.params.range"),
          enum: ["1h", "6h", "24h", "7d"],
        },
        limit: {
          type: "number",
          description: translate("get_container_diagnostics.params.limit"),
        },
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Checking container diagnostics",
      completedVerb: "Checked container diagnostics",
      subjectParam: "container",
      subjectFormat: "full",
    },
  },
  {
    name: "get_container_logs",
    dataSource: onDemand("Portal Service / Docker Engine API"),
    description: translate("get_container_logs.description"),
    endpoint: {
      path: "/infrastructure/logs",
      queryParams: ["container", "device", "tail", "level", "search", "since"],
    },
    parameters: {
      type: "object",
      properties: {
        container: {
          type: "string",
          description: translate("get_container_logs.params.container"),
        },
        device: {
          type: "string",
          description: translate("get_container_logs.params.device"),
        },
        tail: {
          type: "number",
          description: translate("get_container_logs.params.tail"),
        },
        level: {
          type: "string",
          enum: ["error", "warn", "info", "debug"],
          description: translate("get_container_logs.params.level"),
        },
        search: {
          type: "string",
          description: translate("get_container_logs.params.search"),
        },
        since: {
          type: "string",
          description: translate("get_container_logs.params.since"),
        },
      },
      required: [],
    },
    display: {
      activeVerb: "Fetching container logs",
      completedVerb: "Fetched container logs",
      subjectParam: "container",
      subjectFormat: "full",
    },
  },
  ];
}
