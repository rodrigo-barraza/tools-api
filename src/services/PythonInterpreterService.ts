// ─── Sandboxed Code Execution ───────────────────────────────

import { spawn } from "node:child_process";
import { writeFile, unlink, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  PYTHON_DEFAULT_TIMEOUT_MS as DEFAULT_TIMEOUT_MS,
  PYTHON_MAX_TIMEOUT_MS as MAX_TIMEOUT_MS,
  PYTHON_MAX_OUTPUT_BYTES as MAX_OUTPUT_BYTES,
  PYTHON_MEMORY_LIMIT_MB as MEMORY_LIMIT_MB,
  PYTHON_HEALTH_CHECK_TIMEOUT_MS as HEALTH_CHECK_TIMEOUT_MS,
} from "../constants.ts";
import { errorMessage } from "../utilities.ts";
import { OutputAccumulator } from "../utilities/OutputAccumulator.ts";
import { buildCommandEnv } from "./AgenticCommandService.ts";

const PYTHON_BIN = "python3";

// Pre-injected preamble that sets resource limits from within Python
// This is more portable than relying on ulimit in all environments.
const PREAMBLE = `
import resource, sys, os

# ─── Memory limit (${MEMORY_LIMIT_MB} MB) ───
_mb = ${MEMORY_LIMIT_MB} * 1024 * 1024
try:
    resource.setrlimit(resource.RLIMIT_AS, (_mb, _mb))
except (ValueError, resource.error):
    pass  # Some environments restrict setrlimit

# ─── Disable network (block socket creation) ───
import socket as _socket
_orig_socket = _socket.socket
def _blocked_socket(*args, **kwargs):
    raise PermissionError("Network access is disabled in the sandbox")
_socket.socket = _blocked_socket

# ─── Clean namespace ───
del resource, _mb, _socket, _orig_socket, _blocked_socket
`;

// ────────────────────────────────────────────────────────────
// Execution Engine
// ────────────────────────────────────────────────────────────

export interface PythonExecutionOptions {
  timeout?: number;
}

export interface PythonExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  timedOut: boolean;
  error?: string;
}

export interface PythonStreamingOptions {
  timeout?: number;
  onChunk?: (stream: "stdout" | "stderr", chunk: string) => void;
}

export interface InterpreterInfo {
  available: boolean;
  version: string | null;
  maxTimeoutMs?: number;
  maxOutputBytes?: number;
  memoryLimitMb?: number;
}

/**
 * Execute Python code in a sandboxed subprocess.
 */
export async function executePython(
  code: string,
  { timeout = DEFAULT_TIMEOUT_MS }: PythonExecutionOptions = {},
): Promise<PythonExecutionResult> {
  const clampedTimeout = Math.min(Math.max(timeout, 1000), MAX_TIMEOUT_MS);
  const startTime = performance.now();

  // Write code to a temp file (avoids shell injection via -c)
  let temporaryDirectory = "";
  let scriptPath = "";
  try {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "pyexec-"));
    scriptPath = join(temporaryDirectory, "script.py");
    await writeFile(scriptPath, PREAMBLE + "\n" + code, "utf-8");
  } catch (error: unknown) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      executionTimeMs: Math.round(performance.now() - startTime),
      timedOut: false,
      error: `Failed to stage script: ${errorMessage(error)}`,
    };
  }

  return new Promise<PythonExecutionResult>((resolve) => {
    const stdoutAccumulator = new OutputAccumulator(MAX_OUTPUT_BYTES);
    const stderrAccumulator = new OutputAccumulator(MAX_OUTPUT_BYTES);
    let timedOut = false;
    let settled = false;

    const child = spawn(PYTHON_BIN, ["-u", scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...buildCommandEnv(),
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
      },
      detached: false,
    });

    // Close stdin immediately — no interactive input
    if (child.stdin) {
      child.stdin.end();
    }

    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutAccumulator.append(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        stderrAccumulator.append(chunk);
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, clampedTimeout);

    function finish(exitCode: number | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const executionTimeMs = Math.round(performance.now() - startTime);

      // Cleanup temp dir (includes the script file)
      if (temporaryDirectory) {
        rm(temporaryDirectory, { recursive: true, force: true }).catch(
          () => {},
        );
      }

      resolve({
        success: exitCode === 0 && !timedOut,
        stdout: stdoutAccumulator.toString(),
        stderr: stderrAccumulator.toString(),
        exitCode: timedOut ? null : exitCode,
        executionTimeMs,
        timedOut,
        ...(timedOut && {
          error: `Execution timed out after ${clampedTimeout}ms`,
        }),
      });
    }

    child.on("close", (code: number | null) => finish(code));
    child.on("error", (error: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);

        // Cleanup
        if (scriptPath) {
          unlink(scriptPath).catch(() => {});
        }

        resolve({
          success: false,
          stdout: "",
          stderr: "",
          exitCode: null,
          executionTimeMs: Math.round(performance.now() - startTime),
          timedOut: false,
          error: `Process error: ${error.message}`,
        });
      }
    });
  });
}

/**
 * Execute Python code with real-time output streaming.
 * Same sandbox as executePython, but invokes `onChunk` for each
 * stdout/stderr data event as it arrives.
 */
export async function executePythonStreaming(
  code: string,
  { timeout = DEFAULT_TIMEOUT_MS, onChunk }: PythonStreamingOptions = {},
): Promise<PythonExecutionResult> {
  const clampedTimeout = Math.min(Math.max(timeout, 1000), MAX_TIMEOUT_MS);
  const startTime = performance.now();

  let temporaryDirectory = "";
  let scriptPath = "";
  try {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "pyexec-"));
    scriptPath = join(temporaryDirectory, "script.py");
    await writeFile(scriptPath, PREAMBLE + "\n" + code, "utf-8");
  } catch (error: unknown) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      executionTimeMs: Math.round(performance.now() - startTime),
      timedOut: false,
      error: `Failed to stage script: ${errorMessage(error)}`,
    };
  }

  return new Promise<PythonExecutionResult>((resolve) => {
    const stdoutAccumulator = new OutputAccumulator(MAX_OUTPUT_BYTES);
    const stderrAccumulator = new OutputAccumulator(MAX_OUTPUT_BYTES);
    let streamedBytes = 0;
    let timedOut = false;
    let settled = false;

    const child = spawn(PYTHON_BIN, ["-u", scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...buildCommandEnv(),
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
      },
      detached: false,
    });

    if (child.stdin) {
      child.stdin.end();
    }

    // SSE emission stays capped; the buffered result keeps the tail.
    function streamChunk(type: "stdout" | "stderr", chunk: Buffer) {
      if (streamedBytes < MAX_OUTPUT_BYTES) {
        streamedBytes += chunk.length;
        onChunk?.(type, chunk.toString("utf-8"));
      }
    }

    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutAccumulator.append(chunk);
        streamChunk("stdout", chunk);
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        stderrAccumulator.append(chunk);
        streamChunk("stderr", chunk);
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, clampedTimeout);

    function finish(exitCode: number | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (temporaryDirectory) {
        rm(temporaryDirectory, { recursive: true, force: true }).catch(
          () => {},
        );
      }

      resolve({
        success: exitCode === 0 && !timedOut,
        stdout: stdoutAccumulator.toString(),
        stderr: stderrAccumulator.toString(),
        exitCode: timedOut ? null : exitCode,
        executionTimeMs: Math.round(performance.now() - startTime),
        timedOut,
        ...(timedOut && {
          error: `Execution timed out after ${clampedTimeout}ms`,
        }),
      });
    }

    child.on("close", (code: number | null) => finish(code));
    child.on("error", (error: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (scriptPath) {
          unlink(scriptPath).catch(() => {});
        }
        resolve({
          success: false,
          stdout: "",
          stderr: "",
          exitCode: null,
          executionTimeMs: Math.round(performance.now() - startTime),
          timedOut: false,
          error: `Process error: ${error.message}`,
        });
      }
    });
  });
}


/**
 * Get interpreter metadata for health checks.
 */
export async function getInterpreterInfo(): Promise<InterpreterInfo> {
  try {
    const result = await executePython("import sys; print(f'{sys.version}')", {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
    });
    return {
      available: result.success,
      version: result.stdout.trim(),
      maxTimeoutMs: MAX_TIMEOUT_MS,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      memoryLimitMb: MEMORY_LIMIT_MB,
    };
  } catch {
    return { available: false, version: null };
  }
}
