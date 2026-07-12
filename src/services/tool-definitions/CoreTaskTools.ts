// ────────────────────────────────────────────────────────────
// Tool Definitions — Core Task Tools
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { compute } from "./utils.ts";

export function getCoreTaskTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "create_task",
    dataSource: compute("MongoDB agent_tasks"),
    description: translate("create_task.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/task/create",
      bodyParams: [
        "project",
        "subject",
        "description",
        "status",
        "activeForm",
        "metadata",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: translate("create_task.params.subject"),
        },
        description: {
          type: "string",
          description: translate("create_task.params.description"),
        },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed"],
          description: translate("create_task.params.status"),
        },
        activeForm: {
          type: "string",
          description: translate("create_task.params.activeForm"),
        },
        metadata: {
          type: "object",
          description: translate("create_task.params.metadata"),
        },
      },
      required: ["subject", "description"],
    },
  },
  {
    name: "list_tasks",
    dataSource: compute("MongoDB agent_tasks"),
    description: translate("list_tasks.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/task/list",
      bodyParams: ["project", "status", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed"],
          description: translate("list_tasks.params.status"),
        },
        limit: {
          type: "integer",
          description: translate("list_tasks.params.limit"),
        },
      },
      required: [],
    },
  },
  {
    name: "get_task",
    dataSource: compute("MongoDB agent_tasks"),
    description: translate("get_task.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/task/get",
      bodyParams: ["project", "taskId"],
    },
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "integer",
          description: translate("get_task.params.taskId"),
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "update_task",
    dataSource: compute("MongoDB agent_tasks"),
    description: translate("update_task.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/task/update",
      bodyParams: [
        "project",
        "taskId",
        "status",
        "subject",
        "description",
        "activeForm",
        "metadata",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        taskId: {
          type: "integer",
          description: translate("update_task.params.taskId"),
        },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed", "deleted"],
          description: translate("update_task.params.status"),
        },
        subject: {
          type: "string",
          description: translate("update_task.params.subject"),
        },
        description: {
          type: "string",
          description: translate("update_task.params.description"),
        },
        activeForm: {
          type: "string",
          description: translate("update_task.params.activeForm"),
        },
        metadata: {
          type: "object",
          description: translate("update_task.params.metadata"),
        },
      },
      required: ["taskId"],
    },
  },
  ];
}
