// ─── Sandboxed Project Command Execution ────────────────────

import { spawn } from "node:child_process";
import { validatePath } from "./AgenticFileService.ts";
import {
  routeForPath,
  sendRpc,
  sendRpcStreaming,
} from "./AgentConnectionManager.ts";
import * as BackgroundProcessRegistry from "./BackgroundProcessRegistry.ts";
import logger from "../logger.ts";
import {
  AGENTIC_COMMAND_DEFAULT_TIMEOUT_MS as DEFAULT_TIMEOUT_MS,
  AGENTIC_COMMAND_MAX_TIMEOUT_MS as MAX_TIMEOUT_MS,
  AGENTIC_COMMAND_MAX_OUTPUT_BYTES as MAX_OUTPUT_BYTES,
  AGENTIC_COMMAND_BACKGROUND_WARMUP_MS as BACKGROUND_WARMUP_MS,
  AGENTIC_COMMAND_KILL_GRACE_PERIOD_MS as KILL_GRACE_PERIOD_MS,
} from "../constants.ts";
import { errorMessage } from "../utilities.ts";

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  error?: string;
  aborted?: boolean;
  backgrounded?: boolean;
  pid?: number;
  backgroundReason?: string;
  timedOut?: boolean;
}

// Only these command prefixes are allowed as the first token.
const ALLOWED_COMMANDS = new Set([
  // Node.js ecosystem
  "npm",
  "npx",
  "node",
  // Linting / formatting
  "eslint",
  "prettier",
  "tsc",
  "stylelint",
  // Python
  "python3",
  "pip",
  "pip3",
  // Git (read-only operations are safeguarded in args)
  "git",
  // File inspection (read-only)
  "cat",
  "ls",
  "find",
  "wc",
  "diff",
  "which",
  "file",
  "head",
  "tail",
  "tree",
  "du",
  // Process inspection
  "ps",
  "lsof",
]);

// ────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────

function validateCommand(command: string): { valid: boolean; error?: string } {
  if (!command) {
    return { valid: false, error: "Command is required (string)" };
  }

  // Split by semicolon, double ampersand, or pipe to check chained commands
  const subCommands = command.split(/[;&|]/);
  for (let subCommand of subCommands) {
    subCommand = subCommand.trim();
    if (!subCommand) continue;

    // Split sub-command into tokens by whitespace
    const tokens = subCommand.split(/\s+/);
    let commandTokenIndex = 0;

    // Skip environment variables: KEY=VALUE or export keyword
    while (
      commandTokenIndex < tokens.length &&
      (tokens[commandTokenIndex].includes("=") || tokens[commandTokenIndex] === "export")
    ) {
      commandTokenIndex++;
    }

    if (commandTokenIndex >= tokens.length) {
      continue; // Only env vars or exports, no actual command executable
    }

    let baseCommand = tokens[commandTokenIndex];

    // If command starts with an absolute or relative path, take the basename
    if (baseCommand.includes("/")) {
      const parts = baseCommand.split("/");
      baseCommand = parts[parts.length - 1];
    }

    if (!ALLOWED_COMMANDS.has(baseCommand)) {
      return {
        valid: false,
        error: `Command '${baseCommand}' is not in the allowed command list: ${Array.from(ALLOWED_COMMANDS).join(", ")}`,
      };
    }
  }

  return { valid: true };
}

// ────────────────────────────────────────────────────────────
// Execution Engine
// ────────────────────────────────────────────────────────────

// Agent routing helper
async function tryAgentRouteCommand(
  method: string,
  params: Record<string, unknown>,
  cwd: string | null | undefined,
): Promise<CommandResult | null> {
  if (!cwd) return null;
  const agent = routeForPath(cwd);
  if (!agent) return null;
  try {
    return (await sendRpc(agent.id, method, params)) as CommandResult;
  } catch (error: unknown) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      executionTimeMs: 0,
      error: `Agent RPC failed: ${errorMessage(error)}`,
    };
  }
}

/**
 * Execute a project-scoped command.
 *
 * Supports two non-blocking strategies for long-running processes:
 *   1. **Explicit `runInBackground`** — model sets this to true; the command
 *      spawns, collects warmup output (~2.5s), then returns with a `pid`.
 *   2. **Auto-background on timeout** — instead of killing the process,
 *      it's promoted to the background registry and returns what we have.
 */
export async function executeCommand(
  command: string,
  {
    cwd,
    timeout = DEFAULT_TIMEOUT_MS,
    signal,
    runInBackground = false,
  }: {
    cwd?: string;
    timeout?: number;
    signal?: AbortSignal;
    runInBackground?: boolean;
  } = {},
): Promise<CommandResult> {
  // Agent routing — if CWD is served by a remote agent, proxy the command
  const agentResult = await tryAgentRouteCommand(
    "command.run",
    { command, cwd, timeout, runInBackground },
    cwd,
  );
  if (agentResult) return agentResult;

  const clampedTimeout = Math.min(Math.max(timeout, 1000), MAX_TIMEOUT_MS);

  // Validate command
  const validation = validateCommand(command);
  if (!validation.valid) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      executionTimeMs: 0,
      error: validation.error,
    };
  }

  // Validate CWD
  const cwdValidation = validatePath(cwd || (process.env.HOME ?? ""));
  if (!cwdValidation.safe) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      executionTimeMs: 0,
      error: `Invalid working directory: ${cwdValidation.error}`,
    };
  }

  // Fast path: already aborted before we spawn
  if (signal?.aborted) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      executionTimeMs: 0,
      aborted: true,
      error: "Command aborted before execution",
    };
  }

  const startTime = performance.now();

  return new Promise<CommandResult>((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    const timedOut = false;
    let aborted = false;
    let settled = false;

    // Use bash -l -c to get full PATH (conda, nvm, etc.)
    const child = spawn("bash", ["-l", "-c", command], {
      cwd: cwdValidation.resolved,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CI: "true", // Disable interactive features
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      detached: false,
    });

    child.stdin.end();

    // ── Helper: background the process and resolve immediately ────
    function backgroundAndResolve(reason: string) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);

      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      const executionTimeMs = Math.round(performance.now() - startTime);

      // Register in the background process registry
      BackgroundProcessRegistry.register(child, {
        command,
        cwd: cwdValidation.resolved || "",
      });
      logger.info(
        `[AgenticCommandService] Backgrounded PID ${child.pid}: ${reason} (${command.slice(0, 60)})`,
      );

      resolve({
        success: true,
        stdout:
          stdoutLength > MAX_OUTPUT_BYTES
            ? stdout + "\n... [output truncated]"
            : stdout,
        stderr:
          stderrLength > MAX_OUTPUT_BYTES
            ? stderr + "\n... [output truncated]"
            : stderr,
        exitCode: null,
        executionTimeMs,
        backgrounded: true,
        pid: child.pid,
        backgroundReason: reason,
      });
    }

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutLength < MAX_OUTPUT_BYTES) {
        stdoutChunks.push(chunk);
        stdoutLength += chunk.length;
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrLength < MAX_OUTPUT_BYTES) {
        stderrChunks.push(chunk);
        stderrLength += chunk.length;
      }
    });

    // Tier 3: On timeout, auto-background instead of killing
    const timer = setTimeout(() => {
      if (!settled) {
        // If the process is still alive and producing output, background it
        // instead of killing it. This handles unexpected long-running commands.
        backgroundAndResolve("auto_backgrounded_timeout");
      }
    }, clampedTimeout);

    // Kill child process when upstream abort signal fires (user pressed Stop)
    const onAbort = () => {
      if (!settled) {
        aborted = true;
        child.kill("SIGKILL");
      }
    };
    if (signal && !signal.aborted) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    // Tier 1: Explicit run_in_background — warmup then return
    if (runInBackground) {
      setTimeout(() => {
        if (!settled) {
          backgroundAndResolve("run_in_background");
        }
      }, BACKGROUND_WARMUP_MS);
    }

    function finish(exitCode: number | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);

      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      const executionTimeMs = Math.round(performance.now() - startTime);

      resolve({
        success: exitCode === 0 && !timedOut && !aborted,
        stdout:
          stdoutLength > MAX_OUTPUT_BYTES
            ? stdout + "\n... [output truncated]"
            : stdout,
        stderr:
          stderrLength > MAX_OUTPUT_BYTES
            ? stderr + "\n... [output truncated]"
            : stderr,
        exitCode: timedOut || aborted ? null : exitCode,
        executionTimeMs,
        timedOut,
        ...(aborted
          ? { aborted: true, error: "Command aborted (session stopped)" }
          : {}),
        ...(timedOut && !aborted
          ? { error: `Command timed out after ${clampedTimeout}ms` }
          : {}),
      });
    }

    child.on("close", (code: number | null) => finish(code));
    child.on("error", (error: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve({
          success: false,
          stdout: "",
          stderr: "",
          exitCode: null,
          executionTimeMs: Math.round(performance.now() - startTime),
          error: `Process error: ${error.message}`,
        });
      }
    });
  });
}

/**
 * Execute a command with SSE streaming output.
 */
export async function executeCommandStreaming(
  command: string,
  {
    cwd,
    timeout = DEFAULT_TIMEOUT_MS,
    onChunk,
    signal,
  }: {
    cwd?: string;
    timeout?: number;
    onChunk?: (type: "stdout" | "stderr", chunk: string) => void;
    signal?: AbortSignal;
  } = {},
): Promise<CommandResult> {
  // Agent routing for streaming commands
  if (cwd) {
    const agent = routeForPath(cwd);
    if (agent) {
      try {
        return (await sendRpcStreaming(
          agent.id,
          "command.stream",
          { command, cwd, timeout },
          (method: string, params: Record<string, unknown>) => {
            if (method === "command.stdout")
              onChunk?.("stdout", params.data as string);
            else if (method === "command.stderr")
              onChunk?.("stderr", params.data as string);
          },
        )) as CommandResult;
      } catch (error: unknown) {
        return {
          success: false,
          stdout: "",
          stderr: "",
          exitCode: null,
          executionTimeMs: 0,
          error: `Agent RPC failed: ${errorMessage(error)}`,
        };
      }
    }
  }

  const clampedTimeout = Math.min(Math.max(timeout, 1000), MAX_TIMEOUT_MS);

  const validation = validateCommand(command);
  if (!validation.valid) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      executionTimeMs: 0,
      error: validation.error,
    };
  }

  const cwdValidation = validatePath(cwd || (process.env.HOME ?? ""));
  if (!cwdValidation.safe) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      executionTimeMs: 0,
      error: `Invalid working directory: ${cwdValidation.error}`,
    };
  }

  // Fast path: already aborted before we spawn
  if (signal?.aborted) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      executionTimeMs: 0,
      aborted: true,
      error: "Command aborted before execution",
    };
  }

  const startTime = performance.now();

  return new Promise<CommandResult>((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let timedOut = false;
    let aborted = false;
    let settled = false;

    const child = spawn("bash", ["-l", "-c", command], {
      cwd: cwdValidation.resolved,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CI: "true",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      detached: false,
    });

    child.stdin.end();

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutLength < MAX_OUTPUT_BYTES) {
        stdoutChunks.push(chunk);
        stdoutLength += chunk.length;
        onChunk?.("stdout", chunk.toString("utf-8"));
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrLength < MAX_OUTPUT_BYTES) {
        stderrChunks.push(chunk);
        stderrLength += chunk.length;
        onChunk?.("stderr", chunk.toString("utf-8"));
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, clampedTimeout);

    // Kill child process when upstream abort signal fires (user pressed Stop)
    const onAbort = () => {
      if (!settled) {
        aborted = true;
        child.kill("SIGKILL");
      }
    };
    if (signal && !signal.aborted) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    function finish(exitCode: number | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      resolve({
        success: exitCode === 0 && !timedOut && !aborted,
        stdout:
          stdoutLength > MAX_OUTPUT_BYTES
            ? stdout + "\n... [output truncated]"
            : stdout,
        stderr:
          stderrLength > MAX_OUTPUT_BYTES
            ? stderr + "\n... [output truncated]"
            : stderr,
        exitCode: timedOut || aborted ? null : exitCode,
        executionTimeMs: Math.round(performance.now() - startTime),
        timedOut,
        ...(aborted
          ? { aborted: true, error: "Command aborted (session stopped)" }
          : {}),
        ...(timedOut && !aborted
          ? { error: `Command timed out after ${clampedTimeout}ms` }
          : {}),
      });
    }

    child.on("close", (code: number | null) => finish(code));
    child.on("error", (error: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
        resolve({
          success: false,
          stdout: "",
          stderr: "",
          exitCode: null,
          executionTimeMs: Math.round(performance.now() - startTime),
          error: `Process error: ${error.message}`,
        });
      }
    });
  });
}

/**
 * Get the list of allowed commands.
 */
export function getAllowedCommands(): string[] {
  return [...ALLOWED_COMMANDS].sort();
}

/**
 * List all background processes.
 */
export function listBackgroundProcesses(): BackgroundProcessRegistry.ProcessListEntry[] {
  return BackgroundProcessRegistry.list();
}

/**
 * Get a specific background process by PID.
 */
export function getBackgroundProcess(pid: number) {
  return BackgroundProcessRegistry.getProcess(pid);
}

/**
 * Kill a process tree by PID.
 * Attempts SIGTERM first, then SIGKILL after a grace period.
 */
export async function killProcessTree(
  pid: number,
  { gracePeriodMs = KILL_GRACE_PERIOD_MS }: { gracePeriodMs?: number } = {},
): Promise<{
  success: boolean;
  pid?: number;
  signal?: string;
  escalated?: boolean;
  error?: string;
  message?: string;
}> {
  if (!pid || typeof pid !== "number" || pid <= 0) {
    return {
      success: false,
      error: "Valid PID is required (positive integer)",
    };
  }

  // Safety: refuse to kill PID 1 or our own process
  if (pid === 1 || pid === process.pid) {
    return {
      success: false,
      error: `Refusing to kill PID ${pid} (protected process)`,
    };
  }

  try {
    // Check if the process exists first
    process.kill(pid, 0); // Signal 0 = existence check, no actual signal sent
  } catch {
    return {
      success: false,
      error: `Process ${pid} not found or not accessible`,
    };
  }

  try {
    // Try to kill the entire process group (negative PID)
    // This catches child processes spawned by the target
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // If process group kill fails (e.g. not a group leader), kill just the process
      process.kill(pid, "SIGTERM");
    }

    // Wait for grace period then check if still alive
    await new Promise<void>((resolve) => setTimeout(resolve, gracePeriodMs));

    try {
      process.kill(pid, 0); // Still alive?
      // Escalate to SIGKILL
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        process.kill(pid, "SIGKILL");
      }
      return { success: true, pid, signal: "SIGKILL", escalated: true };
    } catch {
      // Process is gone — SIGTERM was sufficient
      return { success: true, pid, signal: "SIGTERM", escalated: false };
    }
  } catch (error: unknown) {
    return {
      success: false,
      pid,
      error: `Failed to kill process: ${errorMessage(error)}`,
    };
  }
}
