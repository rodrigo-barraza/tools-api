// ─── Persistent Task State Management ───────────────────────

import { getDatabase } from "@rodrigo-barraza/utilities-library/service/mongo";
import logger from "../logger.ts";
import type { WithId, Document } from "mongodb";
import type {
  AgenticTask,
  AgenticTaskCreateData,
  AgenticTaskUpdates,
  AgenticTaskListOptions,
  SanitizedTask,
  TaskCounterDocument,
} from "../types/agentic.ts";

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
  const database = getDatabase();
  const collection = database.collection(COLLECTION);

  await collection.createIndex({ project: 1, taskId: 1 }, { unique: true });
  await collection.createIndex({ project: 1, status: 1 });
  await collection.createIndex({ project: 1, createdAt: -1 });

  logger.info(`   ✅ ${COLLECTION} indexes ensured`);
}

// ────────────────────────────────────────────────────────────
// Monotonic ID Generator (per-project)
// ────────────────────────────────────────────────────────────

async function nextTaskId(project: string): Promise<number> {
  const database = getDatabase();
  const result = await database
    .collection<TaskCounterDocument>(COUNTER_COLLECTION)
    .findOneAndUpdate(
      { _id: `task_${project}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return result?.seq ?? 1;
}

// ────────────────────────────────────────────────────────────
// CRUD Operations
// ────────────────────────────────────────────────────────────

/**
 * Create a new task.
 */
export async function agenticTaskCreate(
  project: string,
  data: AgenticTaskCreateData,
) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }
  if (!data.subject || typeof data.subject !== "string") {
    return { error: "'subject' is required (string)" };
  }
  if (!data.description || typeof data.description !== "string") {
    return { error: "'description' is required (string)" };
  }

  const status = (data.status as AgenticTask["status"]) || "pending";
  if (!VALID_STATUSES.includes(status)) {
    return {
      error: `Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(", ")}`,
    };
  }

  const database = getDatabase();
  const collection = database.collection(COLLECTION);

  // Guard: cap tasks per project
  const count = await collection.countDocuments({ project });
  if (count >= MAX_TASKS_PER_PROJECT) {
    return {
      error: `Task limit reached (${MAX_TASKS_PER_PROJECT}). Complete or delete existing tasks first.`,
    };
  }

  const taskId = await nextTaskId(project);
  const now = new Date();

  const task: AgenticTask = {
    project,
    taskId,
    subject: data.subject,
    description: data.description,
    status,
    // Present-continuous form shown in spinner when in_progress
    activeForm: data.activeForm || null,
    // Traceability — which agent session created/last touched this task
    agentSessionId: data.agentSessionId || null,
    conversationId: data.conversationId || null,
    // Swarm-ready fields (unused in single-agent mode)
    owner: data.owner || null,
    blocks: [] as number[],
    blockedBy: [] as number[],
    metadata: data.metadata || {},
    createdAt: now,
    updatedAt: now,
  };

  await collection.insertOne(task);

  return {
    task: sanitize(task),
    message: `Task #${taskId} created: ${data.subject}`,
  };
}

/**
 * List tasks for a project, optionally filtered by status.
 */
export async function agenticTaskList(
  project: string,
  { status, limit = 50 }: AgenticTaskListOptions = {},
) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return {
      error: `Invalid status filter '${status}'. Must be one of: ${VALID_STATUSES.join(", ")}`,
    };
  }

  const database = getDatabase();
  const collection = database.collection(COLLECTION);

  const filter: Record<string, unknown> = { project };
  if (status) filter.status = status;

  const [tasks, statusCounts] = await Promise.all([
    collection
      .find(filter)
      .sort({ taskId: 1 })
      .limit(Math.min(Number(limit), MAX_TASKS_PER_PROJECT))
      .toArray(),
    collection
      .aggregate<{ _id: string; count: number }>([
        { $match: { project } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const countsByStatus = Object.fromEntries(
    statusCounts.map((entry: { _id: string; count: number }) => [
      entry._id,
      entry.count,
    ]),
  ) as Record<string, number>;
  const total = statusCounts.reduce(
    (sum: number, entry: { _id: string; count: number }) => sum + entry.count,
    0,
  );

  const summary = {
    total,
    pending: countsByStatus.pending || 0,
    in_progress: countsByStatus.in_progress || 0,
    completed: countsByStatus.completed || 0,
  };

  return {
    project,
    tasks: tasks.map(sanitize),
    summary,
  };
}

/**
 * Get a single task by ID.
 */
export async function agenticTaskGet(project: string, taskId: string | number) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }

  const id = parseInt(String(taskId), 10);
  if (isNaN(id)) {
    return { error: "'taskId' must be a number" };
  }

  const database = getDatabase();
  const task = await database
    .collection(COLLECTION)
    .findOne({ project, taskId: id });

  if (!task) {
    return { error: `Task #${id} not found in project '${project}'` };
  }

  return { task: sanitize(task) };
}

/**
 * Update a task's status, description, or metadata.
 */
export async function agenticTaskUpdate(
  project: string,
  taskId: string | number,
  updates: AgenticTaskUpdates,
) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }

  const id = parseInt(String(taskId), 10);
  if (isNaN(id)) {
    return { error: "'taskId' must be a number" };
  }

  if (!updates || typeof updates !== "object") {
    return { error: "'updates' is required (object)" };
  }

  if (
    updates.status &&
    updates.status !== "deleted" &&
    !VALID_STATUSES.includes(updates.status)
  ) {
    return {
      error: `Invalid status '${updates.status}'. Must be one of: ${VALID_STATUSES.join(", ")}, deleted`,
    };
  }

  const database = getDatabase();
  const collection = database.collection(COLLECTION);

  const existing = await collection.findOne({ project, taskId: id });
  if (!existing) {
    return { error: `Task #${id} not found in project '${project}'` };
  }

  // Handle "deleted" as a special status — remove the task entirely
  if (updates.status === "deleted") {
    await collection.deleteOne({ project, taskId: id });
    return {
      task: sanitize(existing),
      message: `Task #${id} deleted`,
      statusChange: { from: existing.status, to: "deleted" },
    };
  }

  const $set: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.status) $set.status = updates.status;
  if (updates.subject) $set.subject = updates.subject;
  if (updates.description) $set.description = updates.description;
  if (updates.activeForm !== undefined) $set.activeForm = updates.activeForm;
  if (updates.agentSessionId) $set.agentSessionId = updates.agentSessionId;
  if (updates.conversationId) $set.conversationId = updates.conversationId;

  // Merge metadata (don't replace entirely)
  if (updates.metadata && typeof updates.metadata === "object") {
    for (const [key, value] of Object.entries(updates.metadata)) {
      $set[`metadata.${key}`] = value;
    }
  }

  await collection.updateOne({ project, taskId: id }, { $set });

  const updated = await collection.findOne({ project, taskId: id });

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
 */
export async function agenticTaskDelete(
  project: string,
  taskId: string | number,
) {
  if (!project || typeof project !== "string") {
    return { error: "'project' is required (string)" };
  }

  const id = parseInt(String(taskId), 10);
  if (isNaN(id)) {
    return { error: "'taskId' must be a number" };
  }

  const database = getDatabase();
  const collection = database.collection(COLLECTION);

  const existing = await collection.findOne({ project, taskId: id });
  if (!existing) {
    return { error: `Task #${id} not found in project '${project}'` };
  }

  // Clean up references in other tasks
  await collection.updateMany(
    { project, blocks: id } as Document,
    { $pull: { blocks: id } } as Document,
  );
  await collection.updateMany(
    { project, blockedBy: id } as Document,
    { $pull: { blockedBy: id } } as Document,
  );

  await collection.deleteOne({ project, taskId: id });

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
function sanitize(
  task: WithId<Document> | Record<string, unknown> | null,
): SanitizedTask | null {
  if (!task) return null;
  const { _id, ...rest } = task;
  return rest as SanitizedTask;
}
