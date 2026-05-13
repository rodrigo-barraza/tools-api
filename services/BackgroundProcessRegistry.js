// ─── Background Process Registry ────────────────────────────
// Tracks long-running processes that have been backgrounded
// (dev servers, watchers, etc.) so the agent can return
// immediately while the process continues running.

import logger from "../logger.js";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const MAX_TTL_MS = 30 * 60 * 1000; // 30 minutes — auto-kill if no reads
const CLEANUP_INTERVAL_MS = 60 * 1000; // Check every minute
const MAX_BUFFERED_BYTES = 256 * 1024; // 256KB ring buffer per process

// ────────────────────────────────────────────────────────────
// Registry Store
// ────────────────────────────────────────────────────────────

/** @type {Map<number, BackgroundProcess>} pid → process info */
const registry = new Map();

/**
 * @typedef {object} BackgroundProcess
 * @property {import("child_process").ChildProcess} child
 * @property {string} command
 * @property {string} cwd
 * @property {number} startedAt
 * @property {number} lastReadAt
 * @property {string[]} stdoutBuffer - Ring buffer of recent stdout lines
 * @property {string[]} stderrBuffer - Ring buffer of recent stderr lines
 * @property {number} stdoutBytes
 * @property {number} stderrBytes
 * @property {boolean} exited
 * @property {number|null} exitCode
 * @property {string|null} exitReason
 */

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Register a child process in the background registry.
 * Attaches output listeners and tracks the process lifecycle.
 *
 * @param {import("child_process").ChildProcess} child
 * @param {{ command: string, cwd: string }} meta
 * @returns {{ pid: number }}
 */
export function register(child, meta) {
  const pid = child.pid;
  const entry = {
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
  child.stdout?.on("data", (chunk) => {
    const text = chunk.toString("utf-8");
    entry.stdoutBuffer.push(text);
    entry.stdoutBytes += chunk.length;
    // Trim to keep buffer bounded
    while (entry.stdoutBytes > MAX_BUFFERED_BYTES && entry.stdoutBuffer.length > 1) {
      const removed = entry.stdoutBuffer.shift();
      entry.stdoutBytes -= Buffer.byteLength(removed, "utf-8");
    }
  });

  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString("utf-8");
    entry.stderrBuffer.push(text);
    entry.stderrBytes += chunk.length;
    while (entry.stderrBytes > MAX_BUFFERED_BYTES && entry.stderrBuffer.length > 1) {
      const removed = entry.stderrBuffer.shift();
      entry.stderrBytes -= Buffer.byteLength(removed, "utf-8");
    }
  });

  child.on("close", (code) => {
    entry.exited = true;
    entry.exitCode = code;
    entry.exitReason = "exited";
    logger.info(`[BackgroundProcessRegistry] PID ${pid} exited with code ${code} (${meta.command.slice(0, 60)})`);
  });

  child.on("error", (err) => {
    entry.exited = true;
    entry.exitReason = `error: ${err.message}`;
    logger.warn(`[BackgroundProcessRegistry] PID ${pid} error: ${err.message}`);
  });

  registry.set(pid, entry);
  logger.info(`[BackgroundProcessRegistry] Registered PID ${pid} (${meta.command.slice(0, 80)})`);

  return { pid };
}

/**
 * Get the current state of a background process.
 * Updates lastReadAt to extend the TTL.
 *
 * @param {number} pid
 * @returns {object|null}
 */
export function getProcess(pid) {
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
 *
 * @param {number} pid
 * @param {string} [signal="SIGTERM"]
 * @returns {{ success: boolean, pid: number, message?: string, error?: string }}
 */
export function kill(pid, signal = "SIGTERM") {
  const entry = registry.get(pid);
  if (!entry) {
    return { success: false, pid, error: `PID ${pid} not found in background registry` };
  }

  if (entry.exited) {
    registry.delete(pid);
    return { success: true, pid, message: `Process already exited (code ${entry.exitCode})` };
  }

  try {
    entry.child.kill(signal);
    // Schedule forced kill if SIGTERM doesn't work
    if (signal === "SIGTERM") {
      setTimeout(() => {
        try {
          if (!entry.exited) entry.child.kill("SIGKILL");
        } catch { /* already dead */ }
      }, 3000);
    }
    registry.delete(pid);
    return { success: true, pid, signal, message: `Sent ${signal} to PID ${pid}` };
  } catch (err) {
    return { success: false, pid, error: `Failed to kill: ${err.message}` };
  }
}

/**
 * List all tracked background processes.
 *
 * @returns {Array<object>}
 */
export function list() {
  const result = [];
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
  logger.info(`[BackgroundProcessRegistry] Killed all ${registry.size} background processes`);
}

/**
 * @returns {number} Count of active (non-exited) processes
 */
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
    if (entry.exited && now - entry.lastReadAt > 5 * 60 * 1000) {
      registry.delete(pid);
      logger.info(`[BackgroundProcessRegistry] Cleaned up exited PID ${pid}`);
      continue;
    }
    // Kill processes that exceed TTL with no reads
    if (!entry.exited && now - entry.lastReadAt > MAX_TTL_MS) {
      logger.warn(`[BackgroundProcessRegistry] TTL expired for PID ${pid} — killing (${entry.command.slice(0, 60)})`);
      kill(pid, "SIGTERM");
    }
  }
}

// Start the cleanup interval
const _cleanupTimer = setInterval(cleanupStale, CLEANUP_INTERVAL_MS);
_cleanupTimer.unref(); // Don't keep the process alive just for cleanup
