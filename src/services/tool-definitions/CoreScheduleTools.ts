// ────────────────────────────────────────────────────────────
// Tool Definitions — Core Schedule Tools
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getCoreScheduleTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "create_cron_job",
    dataSource: onDemand("AgenticSchedulerService"),
    description: translate("create_cron_job.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/scheduled-task/create",
      bodyParams: [
        "project",
        "name",
        "prompt",
        "scheduleType",
        "cronExpression",
        "scheduleTime",
        "scheduleDay",
        "scheduleDate",
        "agent",
        "provider",
        "model",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: translate("create_cron_job.params.name"),
        },
        prompt: {
          type: "string",
          description: translate("create_cron_job.params.prompt"),
        },
        scheduleType: {
          type: "string",
          enum: ["hourly", "daily", "weekly", "cron", "trigger", "once"],
          description: translate("create_cron_job.params.scheduleType"),
        },
        cronExpression: {
          type: "string",
          description: translate("create_cron_job.params.cronExpression"),
        },
        scheduleTime: {
          type: "string",
          description: translate("create_cron_job.params.scheduleTime"),
        },
        scheduleDay: {
          type: "number",
          description: translate("create_cron_job.params.scheduleDay"),
        },
        scheduleDate: {
          type: "string",
          description: translate("create_cron_job.params.scheduleDate"),
        },
        agent: {
          type: "string",
          description: translate("create_cron_job.params.agent"),
        },
        provider: {
          type: "string",
          description: translate("create_cron_job.params.provider"),
        },
        model: {
          type: "string",
          description: translate("create_cron_job.params.model"),
        },
      },
      required: ["name", "prompt", "scheduleType"],
    },
  },
  {
    name: "list_cron_jobs",
    dataSource: onDemand("AgenticSchedulerService"),
    description: translate("list_cron_jobs.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/scheduled-task/list",
      bodyParams: ["project"],
    },
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "delete_cron_job",
    dataSource: onDemand("AgenticSchedulerService"),
    description: translate("delete_cron_job.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/scheduled-task/delete",
      bodyParams: ["project", "scheduleId"],
    },
    parameters: {
      type: "object",
      properties: {
        scheduleId: {
          type: "string",
          description: translate("delete_cron_job.params.scheduleId"),
        },
      },
      required: ["scheduleId"],
    },
  },
  {
    name: "trigger_cron_job",
    dataSource: onDemand("AgenticSchedulerService"),
    description: translate("trigger_cron_job.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/scheduled-task/trigger",
      bodyParams: ["project", "triggerName", "payload"],
    },
    parameters: {
      type: "object",
      properties: {
        triggerName: {
          type: "string",
          description: translate("trigger_cron_job.params.triggerName"),
        },
        payload: {
          type: "object",
          description: translate("trigger_cron_job.params.payload"),
        },
      },
      required: ["triggerName"],
    },
  },
  ];
}
