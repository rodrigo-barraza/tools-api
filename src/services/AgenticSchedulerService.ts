// @ts-nocheck
// ─── Cron + Remote Trigger System ───────────────────────────

import { getDB } from "../db.ts";
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

const VALID_TYPES = ["cron", "once", "trigger"];

let pollerInterval = null;

// ────────────────────────────────────────────────────────────
// Collection Setup
// ────────────────────────────────────────────────────────────

export async function setupAgenticScheduleCollection() {
  const db = getDB();
  const col = db.collection(COLLECTION);

  await col.createIndex({ project: 1, scheduleId: 1 }, { unique: true });
  await col.createIndex({ project: 1, type: 1 });
  await col.createIndex({ nextRunAt: 1 });
  await col.createIndex({ type: 1, name: 1 });

  logger.info(`   ✅ ${COLLECTION} indexes ensured`);
}

// ────────────────────────────────────────────────────────────
// Monotonic ID Generator
// ────────────────────────────────────────────────────────────

async function nextScheduleId(project) {
  const db = getDB();
  const result = await db.collection(COUNTER_COLLECTION).findOneAndUpdate(
    { _id: `schedule_${project}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return result.seq;
}

// ────────────────────────────────────────────────────────────
// Cron Expression → Next Run Date
// ────────────────────────────────────────────────────────────

/**
 * Parse a simple cron-like delay expression into milliseconds.
 * Supports: "5m", "30m", "1h", "2h", "24h", "1d", "7d"
 * Also supports full cron expressions (basic 5-field) — but for
 * v1 we use delay-based scheduling with repeat support.
 *
 * @param {string} schedule - Delay expression (e.g. "30m", "2h", "1d")
 * @returns {number|null} Delay in milliseconds, or null if invalid
 */
function parseDelay(schedule) {
  if (!schedule || typeof schedule !== "string") return null;

  const match = schedule.trim().match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (multipliers[unit] || 0);
}

// ────────────────────────────────────────────────────────────
// CRUD Operations
// ────────────────────────────────────────────────────────────

/**
 * Create a new schedule.
 *
 * @param {object} data
 * @param {string} data.project - Project scope
 * @param {string} data.name - Human-readable schedule name
 * @param {string} data.schedule - Delay expression (e.g. "30m", "2h")
 * @param {string} data.prompt - The prompt to send to Prism when fired
 * @param {string} [data.type="once"] - "once", "cron", or "trigger"
 * @param {string} [data.agent] - Agent persona to use
 * @param {string} [data.model] - Model override
 * @returns {Promise<object>}
 */
export async function agenticScheduleCreate(data) {
  const {
    project, name, schedule, prompt, type = "once",
    agent, model,
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
  if (!VALID_TYPES.includes(type)) {
    return { error: `Invalid type '${type}'. Must be one of: ${VALID_TYPES.join(", ")}` };
  }

  // Triggers don't need a schedule expression
  if (type !== "trigger") {
    if (!schedule || typeof schedule !== "string") {
      return { error: "'schedule' is required for cron/once types (e.g. '30m', '2h', '1d')" };
    }
    const delayMs = parseDelay(schedule);
    if (!delayMs) {
      return { error: `Invalid schedule expression '${schedule}'. Use format: 5m, 30m, 1h, 2h, 24h, 1d, 7d` };
    }
  }

  const db = getDB();
  const col = db.collection(COLLECTION);

  // Guard: cap schedules per project
  const count = await col.countDocuments({ project });
  if (count >= MAX_SCHEDULES_PER_PROJECT) {
    return { error: `Schedule limit reached (${MAX_SCHEDULES_PER_PROJECT}). Delete existing schedules first.` };
  }

  const scheduleId = await nextScheduleId(project);
  const now = new Date();

  // Calculate nextRunAt for time-based schedules
  let nextRunAt = null;
  if (type !== "trigger") {
    const delayMs = parseDelay(schedule);
    nextRunAt = new Date(now.getTime() + delayMs);
  }

  const document = {
    project,
    scheduleId,
    name,
    type,
    schedule: schedule || null,
    prompt,
    agent: agent || null,
    model: model || null,
    enabled: true,
    nextRunAt,
    lastRunAt: null,
    runCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await col.insertOne(document);

  return {
    schedule: sanitize(document),
    message: type === "trigger"
      ? `Trigger '${name}' created (fire with remote_trigger)`
      : `Schedule #${scheduleId} '${name}' created — next run at ${nextRunAt.toISOString()}`,
  };
}

/**
 * List schedules for a project.
 */
export async function agenticScheduleList(project, { type, limit = 50 }: Record<string, any> = {}) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }

  const db = getDB();
  const col = db.collection(COLLECTION);

  const filter: Record<string, any> = { project };
  if (type) filter.type = type;

  const schedules = await col
    .find(filter)
    .sort({ scheduleId: 1 })
    .limit(Math.min(limit, MAX_SCHEDULES_PER_PROJECT))
    .toArray();

  return {
    project,
    schedules: schedules.map(sanitize),
    total: schedules.length,
  };
}

/**
 * Delete a schedule.
 */
export async function agenticScheduleDelete(project, scheduleId) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }

  const id = parseInt(scheduleId, 10);
  if (isNaN(id)) {
    return { error: "'scheduleId' must be a number" };
  }

  const db = getDB();
  const col = db.collection(COLLECTION);

  const existing = await col.findOne({ project, scheduleId: id });
  if (!existing) {
    return { error: `Schedule #${id} not found in project '${project}'` };
  }

  await col.deleteOne({ project, scheduleId: id });

  return {
    deleted: true,
    scheduleId: id,
    message: `Schedule #${id} '${existing.name}' deleted`,
  };
}

/**
 * Fire a named remote trigger.
 */
export async function agenticTriggerFire(project, triggerName, payload: Record<string, any> = {}) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }
  if (!triggerName || typeof triggerName !== "string") {
    return { error: "'triggerName' is required (string)" };
  }

  const db = getDB();
  const col = db.collection(COLLECTION);

  const trigger = await col.findOne({
    project,
    type: "trigger",
    name: triggerName,
    enabled: true,
  });

  if (!trigger) {
    return { error: `No active trigger named '${triggerName}' found in project '${project}'` };
  }

  // Execute the trigger's prompt via Prism
  const result = await firePrismAgent(trigger, payload);

  // Update run stats
  await col.updateOne(
    { _id: trigger._id },
    {
      $set: { lastRunAt: new Date(), updatedAt: new Date() },
      $inc: { runCount: 1 },
    },
  );

  return {
    fired: true,
    trigger: triggerName,
    message: `Trigger '${triggerName}' fired`,
    result: result || null,
  };
}

// ────────────────────────────────────────────────────────────
// Poller — checks for due schedules and fires them
// ────────────────────────────────────────────────────────────

/**
 * Start the schedule poller.
 * Runs every POLLER_INTERVAL_MS, finds due schedules, and fires them.
 */
export function startSchedulePoller() {
  if (pollerInterval) return; // Already running

  pollerInterval = setInterval(async () => {
    try {
      const db = getDB();
      const col = db.collection(COLLECTION);

      const now = new Date();

      // Find due schedules (time-based only, not triggers)
      const dueSchedules = await col.find({
        type: { $in: ["cron", "once"] },
        enabled: true,
        nextRunAt: { $lte: now },
      }).toArray();

      for (const schedule of dueSchedules) {
        try {
          logger.info(`[Scheduler] Firing schedule #${schedule.scheduleId} '${schedule.name}'`);

          await firePrismAgent(schedule);

          // Update run stats
          const updates: Record<string, any> = {
            lastRunAt: now,
            updatedAt: now,
          };

          if (schedule.type === "once") {
            // One-shot: disable after firing
            updates.enabled = false;
            updates.nextRunAt = null;
          } else if (schedule.type === "cron") {
            // Recurring: calculate next run
            const delayMs = parseDelay(schedule.schedule);
            updates.nextRunAt = delayMs ? new Date(now.getTime() + delayMs) : null;
            if (!updates.nextRunAt) updates.enabled = false;
          }

          await col.updateOne(
            { _id: schedule._id },
            { $set: updates, $inc: { runCount: 1 } },
          );
        } catch (error) {
          logger.error(`[Scheduler] Failed to fire schedule #${schedule.scheduleId}: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error(`[Scheduler] Poller error: ${error.message}`);
    }
  }, POLLER_INTERVAL_MS);

  logger.info(`   ⏰ Schedule poller started (interval: ${POLLER_INTERVAL_MS / 1000}s)`);
}

// ────────────────────────────────────────────────────────────
// Fire a schedule/trigger via Prism's /agent endpoint
// ────────────────────────────────────────────────────────────

async function firePrismAgent(schedule, payload: Record<string, any> = {}) {
  try {
    const prismUrl = CONFIG.PRISM_SERVICE_URL;
    if (!prismUrl) {
      logger.error("[Scheduler] PRISM_SERVICE_URL not configured — cannot fire schedule");
      return null;
    }

    // Build the prompt with optional payload context
    let prompt = schedule.prompt;
    if (payload && Object.keys(payload).length > 0) {
      prompt += `\n\nTrigger payload: ${JSON.stringify(payload)}`;
    }

    const body = {
      messages: [
        { role: "user", content: prompt },
      ],
      project: schedule.project,
      agent: schedule.agent || "CODING",
      model: schedule.model || undefined,
      autoApprove: true, // Scheduled tasks run unattended
    };

    const response = await fetch(`${prismUrl}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      logger.error(`[Scheduler] Prism returned ${response.status}: ${errBody.error || response.statusText}`);
      return { error: errBody.error || `Prism returned ${response.status}` };
    }

    return await response.json().catch(() => ({ acknowledged: true }));
  } catch (error) {
    logger.error(`[Scheduler] Failed to reach Prism: ${error.message}`);
    return { error: error.message };
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function sanitize(document) {
  if (!document) return null;
  const { _id, ...rest } = document;
  return rest;
}
