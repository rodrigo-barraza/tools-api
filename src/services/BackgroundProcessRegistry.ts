// ─── Background Process Registry ────────────────────────────
// Tracks long-running processes that have been backgrounded
// (dev servers, watchers, etc.) so the agent can return
// immediately while the process continues running.

import type { ChildProcess } from "node:child_process";
import logger from "../logger.ts";
import {
  BACKGROUND_PROCESS_MAX_TTL_MS as MAX_TTL_MS,
  BACKGROUND_PROCESS_CLEANUP_INTERVAL_MS as CLEANUP_INTERVAL_MS,
  BACKGROUND_PROCESS_MAX_BUFFERED_BYTES as MAX_BUFFERED_BYTES,
  BACKGROUND_PROCESS_EXIT_TTL_MS as EXIT_TTL_MS,
  BACKGROUND_PROCESS_FORCE_KILL_DELAY_MS as FORCE_KILL_DELAY_MS,
} from "../constants.ts";
import { errorMessage } from "../utilities.ts";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface BackgroundProcessMeta {
  command: string;
  cwd: string;
}

export interface BackgroundProcessEntry {
  child: ChildProcess;
  command: string;
  cwd: string;
  startedAt: number;
  lastReadAt: number;
  stdoutBuffer: string[];
  stderrBuffer: string[];
  stdoutBytes: number;
  stderrBytes: number;
  exited: boolean;
  exitCode: number | null;
  exitReason: string | null;
}

export interface ProcessListEntry {
  pid: number;
  command: string;
  cwd: string;
  startedAt: number;
  uptimeMs: number;
  exited: boolean;
  exitCode: number | null;
}

// ────────────────────────────────────────────────────────────
// Registry Store
// ────────────────────────────────────────────────────────────

const registry = new Map<number, BackgroundProcessEntry>();

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Register a child process in the background registry.
 * Attaches output listeners and tracks the process lifecycle.
 */
export function register(child: ChildProcess, meta: BackgroundProcessMeta) {
  const pid = child.pid!;
  const entry: BackgroundProcessEntry = {
    child,
    command: meta.command,
    cwd: meta.cwd,
    startedAt: Date.now(),
    lastReadAt: Date.now(),
    stdoutBuffer: [],
    stderrBuffer: [],
    stdoutBytes: 0,
    stderrBytes: 0,
    exited: false,
    exitCode: null,
    exitReason: null,
  };

  // Accumulate output into a bounded ring buffer
  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf-8");
    entry.stdoutBuffer.push(text);
    entry.stdoutBytes += chunk.length;
    // Trim to keep buffer bounded
    while (
      entry.stdoutBytes > MAX_BUFFERED_BYTES &&
      entry.stdoutBuffer.length > 1
    ) {
      const removed = entry.stdoutBuffer.shift()!;
      entry.stdoutBytes -= Buffer.byteLength(removed, "utf-8");
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf-8");
    entry.stderrBuffer.push(text);
    entry.stderrBytes += chunk.length;
    while (
      entry.stderrBytes > MAX_BUFFERED_BYTES &&
      entry.stderrBuffer.length > 1
    ) {
      const removed = entry.stderrBuffer.shift()!;
      entry.stderrBytes -= Buffer.byteLength(removed, "utf-8");
    }
  });

  child.on("close", (code: number | null) => {
    entry.exited = true;
    entry.exitCode = code;
    entry.exitReason = "exited";
    logger.info(
      `[BackgroundProcessRegistry] PID ${pid} exited with code ${code} (${meta.command.slice(0, 60)})`,
    );
  });

  child.on("error", (error: Error) => {
    entry.exited = true;
    entry.exitReason = `error: ${error.message}`;
    logger.warn(
      `[BackgroundProcessRegistry] PID ${pid} error: ${error.message}`,
    );
  });

  registry.set(pid, entry);
  logger.info(
    `[BackgroundProcessRegistry] Registered PID ${pid} (${meta.command.slice(0, 80)})`,
  );

  return { pid };
}

/**
 * Get the current state of a background process.
 * Updates lastReadAt to extend the TTL.
 */
export function getProcess(pid: number) {
  const entry = registry.get(pid);
  if (!entry) return null;

  entry.lastReadAt = Date.now();

  return {
    pid,
    command: entry.command,
    cwd: entry.cwd,
    startedAt: entry.startedAt,
    uptimeMs: Date.now() - entry.startedAt,
    exited: entry.exited,
    exitCode: entry.exitCode,
    exitReason: entry.exitReason,
    stdoutTail: entry.stdoutBuffer.slice(-20).join(""),
    stderrTail: entry.stderrBuffer.slice(-10).join(""),
  };
}

/**
 * Kill a background process and remove it from the registry.
 */
export function kill(pid: number, signal: NodeJS.Signals = "SIGTERM") {
  const entry = registry.get(pid);
  if (!entry) {
    return {
      success: false,
      pid,
      error: `PID ${pid} not found in background registry`,
    };
  }

  if (entry.exited) {
    return {
      success: true,
      pid,
      message: `Process already exited (code ${entry.exitCode})`,
    };
  }

  // Kill the whole process group, not just the wrapper. Children are spawned
  // detached (bash → npm → node dev server), so signalling only entry.child
  // leaves grandchildren orphaned and still holding their ports. Fall back to
  // a single-PID kill if the group signal fails (not a group leader).
  const killGroup = (sig: NodeJS.Signals) => {
    try {
      process.kill(-pid, sig);
    } catch {
      try {
        entry.child.kill(sig);
      } catch {
        /* already dead */
      }
    }
  };

  try {
    killGroup(signal);
    // Schedule forced kill if SIGTERM doesn't work
    if (signal === "SIGTERM") {
      setTimeout(() => {
        if (!entry.exited) killGroup("SIGKILL");
      }, FORCE_KILL_DELAY_MS);
    }
    // Do NOT delete the entry here — leave it so a confirming get_background_output
    // poll still resolves; the child's 'close' handler marks it exited and the
    // exit-TTL reaper removes it shortly after.
    return {
      success: true,
      pid,
      signal,
      message: `Sent ${signal} to process group ${pid}`,
    };
  } catch (error: unknown) {
    return {
      success: false,
      pid,
      error: `Failed to kill: ${errorMessage(error)}`,
    };
  }
}

/**
 * List all tracked background processes.
 */
export function list(): ProcessListEntry[] {
  const result: ProcessListEntry[] = [];
  for (const [pid, entry] of registry) {
    result.push({
      pid,
      command: entry.command,
      cwd: entry.cwd,
      startedAt: entry.startedAt,
      uptimeMs: Date.now() - entry.startedAt,
      exited: entry.exited,
      exitCode: entry.exitCode,
    });
  }
  return result;
}

/**
 * Kill all tracked background processes.
 * Called during graceful shutdown.
 */
export function killAll() {
  for (const [pid] of registry) {
    kill(pid, "SIGTERM");
  }
  logger.info(
    `[BackgroundProcessRegistry] Killed all ${registry.size} background processes`,
  );
}
export function activeCount() {
  let count = 0;
  for (const entry of registry.values()) {
    if (!entry.exited) count++;
  }
  return count;
}

// ────────────────────────────────────────────────────────────
// TTL Cleanup — kill processes that haven't been read recently
// ────────────────────────────────────────────────────────────

function cleanupStale() {
  const now = Date.now();
  for (const [pid, entry] of registry) {
    // Remove exited processes after 5 minutes (their output has been drained)
    if (entry.exited && now - entry.lastReadAt > EXIT_TTL_MS) {
      registry.delete(pid);
      logger.info(`[BackgroundProcessRegistry] Cleaned up exited PID ${pid}`);
      continue;
    }
    // Kill processes that exceed TTL with no reads
    if (!entry.exited && now - entry.lastReadAt > MAX_TTL_MS) {
      logger.warn(
        `[BackgroundProcessRegistry] TTL expired for PID ${pid} — killing (${entry.command.slice(0, 60)})`,
      );
      kill(pid, "SIGTERM");
    }
  }
}

// Start the cleanup interval
const _cleanupTimer = setInterval(cleanupStale, CLEANUP_INTERVAL_MS);
_cleanupTimer.unref(); // Don't keep the process alive just for cleanup
