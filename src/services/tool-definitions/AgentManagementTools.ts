// ────────────────────────────────────────────────────────────
// Tool Definitions — Agent Management
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getAgentManagementTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "create_custom_agent",
    dataSource: onDemand("Prism CustomAgentService"),
    description: translate("create_custom_agent.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/custom-agent/create",
      bodyParams: [
        "name",
        "description",
        "project",
        "icon",
        "avatar",
        "color",
        "backgroundImage",
        "identity",
        "guidelines",
        "toolPolicy",
        "enabledTools",
        "usesDirectoryTree",
        "usesCodingGuidelines",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: translate("create_custom_agent.params.name"),
        },
        description: {
          type: "string",
          description: translate("create_custom_agent.params.description"),
        },
        project: {
          type: "string",
          description: translate("create_custom_agent.params.project"),
        },
        icon: {
          type: "string",
          description: translate("create_custom_agent.params.icon"),
        },
        avatar: {
          type: "string",
          description: translate("create_custom_agent.params.avatar"),
        },
        color: {
          type: "string",
          description: translate("create_custom_agent.params.color"),
        },
        backgroundImage: {
          type: "string",
          description: translate("create_custom_agent.params.backgroundImage"),
        },
        identity: {
          type: "string",
          description: translate("create_custom_agent.params.identity"),
        },
        guidelines: {
          type: "string",
          description: translate("create_custom_agent.params.guidelines"),
        },
        toolPolicy: {
          type: "string",
          description: translate("create_custom_agent.params.toolPolicy"),
        },
        enabledTools: {
          type: "array",
          items: { type: "string" },
          description: translate("create_custom_agent.params.enabledTools"),
        },
        usesDirectoryTree: {
          type: "boolean",
          description: translate("create_custom_agent.params.usesDirectoryTree"),
        },
        usesCodingGuidelines: {
          type: "boolean",
          description: translate("create_custom_agent.params.usesCodingGuidelines"),
        },
      },
      required: ["name", "identity"],
    },
  },
  {
    name: "list_custom_agents",
    dataSource: onDemand("Prism CustomAgentService"),
    description: translate("list_custom_agents.description"),
    endpoint: {
      path: "/agentic/custom-agent/list",
    },
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "list_agents",
    dataSource: onDemand("Prism AgentPersonaRegistry"),
    description: translate("list_agents.description"),
    endpoint: {
      path: "/agentic/agent/list",
    },
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "update_custom_agent",
    dataSource: onDemand("Prism CustomAgentService"),
    description: translate("update_custom_agent.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/custom-agent/update",
      bodyParams: [
        "id",
        "name",
        "description",
        "project",
        "icon",
        "avatar",
        "color",
        "backgroundImage",
        "identity",
        "guidelines",
        "toolPolicy",
        "enabledTools",
        "usesDirectoryTree",
        "usesCodingGuidelines",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: translate("update_custom_agent.params.id"),
        },
        name: {
          type: "string",
          description: translate("update_custom_agent.params.name"),
        },
        description: {
          type: "string",
          description: translate("update_custom_agent.params.description"),
        },
        project: {
          type: "string",
          description: translate("update_custom_agent.params.project"),
        },
        icon: {
          type: "string",
          description: translate("update_custom_agent.params.icon"),
        },
        avatar: {
          type: "string",
          description: translate("update_custom_agent.params.avatar"),
        },
        color: {
          type: "string",
          description: translate("update_custom_agent.params.color"),
        },
        backgroundImage: {
          type: "string",
          description: translate("update_custom_agent.params.backgroundImage"),
        },
        identity: {
          type: "string",
          description: translate("update_custom_agent.params.identity"),
        },
        guidelines: {
          type: "string",
          description: translate("update_custom_agent.params.guidelines"),
        },
        toolPolicy: {
          type: "string",
          description: translate("update_custom_agent.params.toolPolicy"),
        },
        enabledTools: {
          type: "array",
          items: { type: "string" },
          description: translate("update_custom_agent.params.enabledTools")
        },
        usesDirectoryTree: {
          type: "boolean",
          description: translate("update_custom_agent.params.usesDirectoryTree"),
        },
        usesCodingGuidelines: {
          type: "boolean",
          description: translate("update_custom_agent.params.usesCodingGuidelines"),
        },
      },
      required: ["id"],
    },
  },
  ];
}
