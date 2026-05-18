// ─── Persistent Task State Management ───────────────────────

import { getDB } from "../db.ts";
import logger from "../logger.ts";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const COLLECTION = "agent_tasks";
const COUNTER_COLLECTION = "agent_task_counters";

const VALID_STATUSES = ["pending", "in_progress", "completed"];

const MAX_TASKS_PER_PROJECT = 200;

// ────────────────────────────────────────────────────────────
// Collection Setup (called at server start)
// ────────────────────────────────────────────────────────────

export async function setupAgenticTaskCollection() {
  const db = getDB();
  const col = db.collection(COLLECTION);

  await col.createIndex({ project: 1, taskId: 1 }, { unique: true });
  await col.createIndex({ project: 1, status: 1 });
  await col.createIndex({ project: 1, createdAt: -1 });

  logger.info(`   ✅ ${COLLECTION} indexes ensured`);
}

// ────────────────────────────────────────────────────────────
// Monotonic ID Generator (per-project)
// ────────────────────────────────────────────────────────────

async function nextTaskId(project: any) {
  const db = getDB();
  const result = await db.collection(COUNTER_COLLECTION).findOneAndUpdate(
    { _id: `task_${project}` as any },
    { $inc: { seq: 1 } } as any,
    { upsert: true, returnDocument: "after" },
  );
  // @ts-expect-error - suppress remaining error
  return result.seq;
}

// ────────────────────────────────────────────────────────────
// CRUD Operations
// ────────────────────────────────────────────────────────────

/**
 * Create a new task.
 *


 * @param {string} data.subject - Brief title
 * @param {string} data.description - What needs to be done


 * @returns {Promise<object>} Created task document
 */
export async function agenticTaskCreate(project: any, data: any) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }
  if (!data.subject || typeof data.subject !== "string") {
    return { error: "'subject' is required (string)" };
  }
  if (!data.description || typeof data.description !== "string") {
    return { error: "'description' is required (string)" };
  }

  const status = data.status || "pending";
  if (!VALID_STATUSES.includes(status)) {
    return { error: `Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(", ")}` };
  }

  const db = getDB();
  const col = db.collection(COLLECTION);

  // Guard: cap tasks per project
  const count = await col.countDocuments({ project });
  if (count >= MAX_TASKS_PER_PROJECT) {
    return { error: `Task limit reached (${MAX_TASKS_PER_PROJECT}). Complete or delete existing tasks first.` };
  }

  const taskId = await nextTaskId(project);
  const now = new Date();

  const task = {
    project,
    taskId,
    subject: data.subject,
    description: data.description,
    status,
    // Present-continuous form shown in spinner when in_progress
    activeForm: data.activeForm || null,
    // Traceability — which agent session created/last touched this task
    agentSessionId: data.agentSessionId || null,
    // Swarm-ready fields (unused in single-agent mode)
    owner: data.owner || null,
    blocks: [],
    blockedBy: [],
    metadata: data.metadata || {},
    createdAt: now,
    updatedAt: now,
  };

  await col.insertOne(task);

  return {
    task: sanitize(task),
    message: `Task #${taskId} created: ${data.subject}`,
  };
}

/**
 * List tasks for a project, optionally filtered by status.
 *


 */
export async function agenticTaskList(project: any, { status, limit = 50 }: Record<string, any> = {}) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return { error: `Invalid status filter '${status}'. Must be one of: ${VALID_STATUSES.join(", ")}` };
  }

  const db = getDB();
  const col = db.collection(COLLECTION);

  const filter: Record<string, any> = { project };
  if (status) filter.status = status;

  const tasks = await col
    .find(filter)
    .sort({ taskId: 1 })
    .limit(Math.min(limit, MAX_TASKS_PER_PROJECT))
    .toArray();

  // Summary counts
  const allTasks = await col.find({ project }).toArray();
  const summary = {
    total: allTasks.length,
    pending: allTasks.filter((t: any) => t.status === "pending").length,
    in_progress: allTasks.filter((t: any) => t.status === "in_progress").length,
    completed: allTasks.filter((t: any) => t.status === "completed").length,
  };

  return {
    project,
    tasks: tasks.map(sanitize),
    summary,
  };
}

/**
 * Get a single task by ID.
 *


 */
export async function agenticTaskGet(project: any, taskId: any) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }

  const id = parseInt(taskId, 10);
  if (isNaN(id)) {
    return { error: "'taskId' must be a number" };
  }

  const db = getDB();
  const task = await db.collection(COLLECTION).findOne({ project, taskId: id });

  if (!task) {
    return { error: `Task #${id} not found in project '${project}'` };
  }

  return { task: sanitize(task) };
}

/**
 * Update a task's status, description, or metadata.
 *


 */
export async function agenticTaskUpdate(project: any, taskId: any, updates: any) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }

  const id = parseInt(taskId, 10);
  if (isNaN(id)) {
    return { error: "'taskId' must be a number" };
  }

  if (!updates || typeof updates !== "object") {
    return { error: "'updates' is required (object)" };
  }

  if (updates.status && updates.status !== "deleted" && !VALID_STATUSES.includes(updates.status)) {
    return { error: `Invalid status '${updates.status}'. Must be one of: ${VALID_STATUSES.join(", ")}, deleted` };
  }

  const db = getDB();
  const col = db.collection(COLLECTION);

  const existing = await col.findOne({ project, taskId: id });
  if (!existing) {
    return { error: `Task #${id} not found in project '${project}'` };
  }

  // Handle "deleted" as a special status — remove the task entirely
  if (updates.status === "deleted") {
    await col.deleteOne({ project, taskId: id });
    return {
      task: sanitize(existing),
      message: `Task #${id} deleted`,
      statusChange: { from: existing.status, to: "deleted" },
    };
  }

  const $set: Record<string, any> = { updatedAt: new Date() };

  if (updates.status) $set.status = updates.status;
  if (updates.subject) $set.subject = updates.subject;
  if (updates.description) $set.description = updates.description;
  if (updates.activeForm !== undefined) $set.activeForm = updates.activeForm;
  if (updates.agentSessionId) $set.agentSessionId = updates.agentSessionId;

  // Merge metadata (don't replace entirely)
  if (updates.metadata && typeof updates.metadata === "object") {
    for (const [key, value] of Object.entries(updates.metadata)) {
      $set[`metadata.${key}`] = value;
    }
  }

  await col.updateOne({ project, taskId: id }, { $set });

  const updated = await col.findOne({ project, taskId: id });

  return {
    task: sanitize(updated),
    message: `Task #${id} updated`,
    ...(updates.status && updates.status !== existing.status
      ? { statusChange: { from: existing.status, to: updates.status } }
      : {}),
  };
}

/**
 * Delete a task.
 *


 */
export async function agenticTaskDelete(project: any, taskId: any) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }

  const id = parseInt(taskId, 10);
  if (isNaN(id)) {
    return { error: "'taskId' must be a number" };
  }

  const db = getDB();
  const col = db.collection(COLLECTION);

  const existing = await col.findOne({ project, taskId: id });
  if (!existing) {
    return { error: `Task #${id} not found in project '${project}'` };
  }

  // Clean up references in other tasks
  await col.updateMany(
    { project, blocks: id } as any,
    { $pull: { blocks: id } } as any,
  );
  await col.updateMany(
    { project, blockedBy: id } as any,
    { $pull: { blockedBy: id } } as any,
  );

  await col.deleteOne({ project, taskId: id });

  return {
    deleted: true,
    taskId: id,
    message: `Task #${id} deleted`,
  };
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Strip MongoDB _id from API responses */
function sanitize(task: any) {
  if (!task) return null;
  const { _id, ...rest } = task;
  return rest;
}
