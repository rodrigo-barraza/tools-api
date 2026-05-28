// ─── Cron + Remote Trigger System ───────────────────────────

import { getDB } from "@rodrigo-barraza/utilities-library/mongo";
import CONFIG from "../config.ts";
import logger from "../logger.ts";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const COLLECTION = "agent_schedules";
const COUNTER_COLLECTION = "agent_schedule_counters";

import {
  SCHEDULER_MAX_PER_PROJECT as MAX_SCHEDULES_PER_PROJECT,
  SCHEDULER_POLLER_INTERVAL_MS as POLLER_INTERVAL_MS,
} from "../constants.ts";
import { errorMessage } from "../utilities.ts";

const VALID_TYPES = ["cron", "once", "trigger"];

// ────────────────────────────────────────────────────────────
// Collection Setup — No-op since we proxy to prism-service
// ────────────────────────────────────────────────────────────

export async function setupAgenticScheduleCollection() {
  logger.info(
    `   ✅ Agentic schedules collection setup bypassed (authoritative scheduler is in prism-service)`,
  );
}

// ────────────────────────────────────────────────────────────
// Proxy Actions to Prism Service
// ────────────────────────────────────────────────────────────

function delayToCron(delayStr: string): string | null {
  const match = delayStr.trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (unit === "m") {
    return `*/${value} * * * *`;
  } else if (unit === "h") {
    return `0 */${value} * * *`;
  } else if (unit === "d") {
    return `0 0 */${value} * *`;
  }
  return null;
}

function getPrismUrl() {
  return CONFIG.PRISM_SERVICE_URL || "http://localhost:7777";
}

/**
 * Create a new schedule. Proxy to prism-service /scheduled-tasks.
 */
export async function agenticScheduleCreate(data: Record<string, unknown>) {
  const {
    project,
    name,
    schedule,
    prompt,
    type = "once",
    agent,
    model,
    provider,
    scheduleType,
    scheduleTime,
    scheduleDay,
    scheduleDate,
    cronExpression,
  } = data;

  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }
  if (!name || typeof name !== "string") {
    return { error: "'name' is required (string)" };
  }
  if (!prompt || typeof prompt !== "string") {
    return { error: "'prompt' is required (string)" };
  }

  // Determine the scheduled parameters
  let sType = scheduleType || type; // fallback
  let cronExpr = cronExpression;
  const sDate = scheduleDate;

  if (sType === "once" && !sDate && schedule && typeof schedule === "string") {
    // once with a relative delay (e.g. "5m") remains modeled as cron
    sType = "cron";
    cronExpr = delayToCron(schedule);
  }

  // Build body for prism-service
  const body = {
    name,
    prompt,
    agent: agent === "NONE" ? null : agent || "CODING",
    provider: provider || "anthropic",
    model: model || "claude-sonnet-4-5-20250929",
    scheduleType: sType,
    scheduleTime,
    scheduleDay,
    scheduleDate: sDate,
    cronExpression: cronExpr,
  };

  try {
    const schedulerResponse = await fetch(`${getPrismUrl()}/scheduled-tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-project": project,
        "x-username": "system",
      },
      body: JSON.stringify(body),
    });

    if (!schedulerResponse.ok) {
      const errorPayload = await schedulerResponse.json().catch(() => ({}));
      return {
        error:
          errorPayload.error ||
          `Prism returned HTTP ${schedulerResponse.status}`,
      };
    }

    const created = await schedulerResponse.json();
    return {
      success: true,
      schedule: created,
      message: `Scheduled Task '${name}' created successfully in Prism.`,
    };
  } catch (error: any) {
    return { error: `Failed to reach Prism Service: ${error.message}` };
  }
}

/**
 * List schedules for a project. Proxy to prism-service /scheduled-tasks.
 */
export async function agenticScheduleList(
  project: string,
  _options?: Record<string, unknown>,
) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }

  try {
    const schedulerResponse = await fetch(`${getPrismUrl()}/scheduled-tasks`, {
      method: "GET",
      headers: {
        "x-project": project,
        "x-username": "system",
      },
    });

    if (!schedulerResponse.ok) {
      const errorPayload = await schedulerResponse.json().catch(() => ({}));
      return {
        error:
          errorPayload.error ||
          `Prism returned HTTP ${schedulerResponse.status}`,
      };
    }

    const tasks = await schedulerResponse.json();
    return {
      project,
      schedules: tasks,
      total: tasks.length,
    };
  } catch (error: any) {
    return { error: `Failed to reach Prism Service: ${error.message}` };
  }
}

/**
 * Delete a schedule. Proxy to prism-service /scheduled-tasks/:id.
 */
export async function agenticScheduleDelete(
  project: string,
  scheduleId: string | number,
) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }
  if (!scheduleId) {
    return { error: "'scheduleId' is required" };
  }

  try {
    const schedulerResponse = await fetch(
      `${getPrismUrl()}/scheduled-tasks/${scheduleId}`,
      {
        method: "DELETE",
        headers: {
          "x-project": project,
          "x-username": "system",
        },
      },
    );

    if (!schedulerResponse.ok) {
      const errorPayload = await schedulerResponse.json().catch(() => ({}));
      return {
        error:
          errorPayload.error ||
          `Prism returned HTTP ${schedulerResponse.status}`,
      };
    }

    const deleted = await schedulerResponse.json();
    return {
      deleted: deleted.success,
      scheduleId,
      message: `Scheduled Task '${scheduleId}' deleted successfully.`,
    };
  } catch (error: any) {
    return { error: `Failed to reach Prism Service: ${error.message}` };
  }
}

/**
 * Fire a named remote trigger. Proxy to prism-service /scheduled-tasks/:id/trigger.
 */
export async function agenticTriggerFire(
  project: string,
  triggerName: string,
  payload: Record<string, unknown> = {},
) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }
  if (!triggerName || typeof triggerName !== "string") {
    return { error: "'triggerName' is required (string)" };
  }

  try {
    const schedulerResponse = await fetch(
      `${getPrismUrl()}/scheduled-tasks/${encodeURIComponent(triggerName)}/trigger`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-project": project,
          "x-username": "system",
        },
        body: JSON.stringify({ payload }),
      },
    );

    if (!schedulerResponse.ok) {
      const errorPayload = await schedulerResponse.json().catch(() => ({}));
      return {
        error:
          errorPayload.error ||
          `Prism returned HTTP ${schedulerResponse.status}`,
      };
    }

    const result = await schedulerResponse.json();
    return {
      fired: true,
      trigger: triggerName,
      message: `Scheduled Task/Trigger '${triggerName}' fired successfully.`,
      result,
    };
  } catch (error: any) {
    return { error: `Failed to reach Prism Service: ${error.message}` };
  }
}

// ────────────────────────────────────────────────────────────
// Poller — No-op since poller is natively handled by prism-service
// ────────────────────────────────────────────────────────────

export function startSchedulePoller() {
  logger.info(
    "   ⏰ Local schedule poller bypassed (authoritative scheduler poller is running in prism-service)",
  );
}
