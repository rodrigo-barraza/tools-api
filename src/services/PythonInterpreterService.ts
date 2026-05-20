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

# ─── Block dangerous modules ───
_BLOCKED = frozenset(["subprocess", "shutil", "ctypes", "multiprocessing", "signal"])
_orig_import = __builtins__.__import__ if hasattr(__builtins__, "__import__") else __import__

def _safe_import(name, *args, **kwargs):
    if name.split(".")[0] in _BLOCKED:
        raise ImportError(f"Module '{name}' is not available in the sandbox")
    return _orig_import(name, *args, **kwargs)

import builtins
builtins.__import__ = _safe_import

# ─── Clean namespace ───
del resource, _mb, _socket, _orig_socket, _blocked_socket
del _BLOCKED, _orig_import, _safe_import, builtins
`;

// ────────────────────────────────────────────────────────────
// Execution Engine
// ────────────────────────────────────────────────────────────

/**
 * Execute Python code in a sandboxed subprocess.
 *


 * }>}
 */
export async function executePython(code: any, { timeout = DEFAULT_TIMEOUT_MS }: Record<string, any> = {}) {
  const clampedTimeout = Math.min(Math.max(timeout, 1000), MAX_TIMEOUT_MS);
  const startTime = performance.now();

  // Write code to a temp file (avoids shell injection via -c)
  let tmpDir: any;
  let scriptPath: any;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), "pyexec-"));
    scriptPath = join(tmpDir, "script.py");
    await writeFile(scriptPath, PREAMBLE + "\n" + code, "utf-8");
  } catch (error: any) {
    return {
      success: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      executionTimeMs: Math.round(performance.now() - startTime),
      timedOut: false,
      error: `Failed to stage script: ${error.message}`,
    };
  }

  return new Promise<any>((resolve: any) => {
    const stdoutChunks: any[] = [];
    const stderrChunks: any[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let timedOut = false;
    let settled = false;

    const child = spawn(PYTHON_BIN, ["-u", scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
      },
      // Kill entire process group on timeout
      detached: false,
    });

    // Close stdin immediately — no interactive input
    child.stdin.end();

    child.stdout.on("data", (chunk: any) => {
      if (stdoutLen < MAX_OUTPUT_BYTES) {
        stdoutChunks.push(chunk);
        stdoutLen += chunk.length;
      }
    });

    child.stderr.on("data", (chunk: any) => {
      if (stderrLen < MAX_OUTPUT_BYTES) {
        stderrChunks.push(chunk);
        stderrLen += chunk.length;
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, clampedTimeout);

    function finish(exitCode: any) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      const executionTimeMs = Math.round(performance.now() - startTime);

      // Cleanup temp dir (includes the script file)
      rm(tmpDir, { recursive: true, force: true }).catch(() => {});

      const truncatedStdout =
        stdoutLen > MAX_OUTPUT_BYTES
          ? stdout + `\n... [output truncated at ${MAX_OUTPUT_BYTES} bytes]`
          : stdout;
      const truncatedStderr =
        stderrLen > MAX_OUTPUT_BYTES
          ? stderr + `\n... [output truncated at ${MAX_OUTPUT_BYTES} bytes]`
          : stderr;

      resolve({
        success: exitCode === 0 && !timedOut,
        stdout: truncatedStdout,
        stderr: truncatedStderr,
        exitCode: timedOut ? null : exitCode,
        executionTimeMs,
        timedOut,
        ...(timedOut && {
          error: `Execution timed out after ${clampedTimeout}ms`,
        }),
      });
    }

    child.on("close", (code: any) => finish(code));
    child.on("error", (error: any) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);

        // Cleanup
        unlink(scriptPath).catch(() => {});

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
export async function executePythonStreaming(code: any, { timeout = DEFAULT_TIMEOUT_MS, onChunk }: Record<string, any> = {}) {
  const clampedTimeout = Math.min(Math.max(timeout, 1000), MAX_TIMEOUT_MS);
  const startTime = performance.now();

  let tmpDir: any;
  let scriptPath: any;
  try {
    tmpDir = await mkdtemp(join(tmpdir(), "pyexec-"));
    scriptPath = join(tmpDir, "script.py");
    await writeFile(scriptPath, PREAMBLE + "\n" + code, "utf-8");
  } catch (error: any) {
    return {
      success: false, stdout: "", stderr: "", exitCode: null,
      executionTimeMs: Math.round(performance.now() - startTime),
      timedOut: false, error: `Failed to stage script: ${error.message}`,
    };
  }

  return new Promise<any>((resolve: any) => {
    const stdoutChunks: any[] = [];
    const stderrChunks: any[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let timedOut = false;
    let settled = false;

    const child = spawn(PYTHON_BIN, ["-u", scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONUNBUFFERED: "1" },
      detached: false,
    });

    child.stdin.end();

    child.stdout.on("data", (chunk: any) => {
      if (stdoutLen < MAX_OUTPUT_BYTES) {
        stdoutChunks.push(chunk);
        stdoutLen += chunk.length;
        onChunk?.("stdout", chunk.toString("utf-8"));
      }
    });

    child.stderr.on("data", (chunk: any) => {
      if (stderrLen < MAX_OUTPUT_BYTES) {
        stderrChunks.push(chunk);
        stderrLen += chunk.length;
        onChunk?.("stderr", chunk.toString("utf-8"));
      }
    });

    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, clampedTimeout);

    function finish(exitCode: any) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");

      rm(tmpDir, { recursive: true, force: true }).catch(() => {});

      resolve({
        success: exitCode === 0 && !timedOut,
        stdout: stdoutLen > MAX_OUTPUT_BYTES ? stdout + `\n... [output truncated]` : stdout,
        stderr: stderrLen > MAX_OUTPUT_BYTES ? stderr + `\n... [output truncated]` : stderr,
        exitCode: timedOut ? null : exitCode,
        executionTimeMs: Math.round(performance.now() - startTime),
        timedOut,
        ...(timedOut && { error: `Execution timed out after ${clampedTimeout}ms` }),
      });
    }

    child.on("close", (code: any) => finish(code));
    child.on("error", (error: any) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        unlink(scriptPath).catch(() => {});
        resolve({
          success: false, stdout: "", stderr: "", exitCode: null,
          executionTimeMs: Math.round(performance.now() - startTime),
          timedOut: false, error: `Process error: ${error.message}`,
        });
      }
    });
  });
}

/**
 * Get interpreter metadata for health checks.
 */
export async function getInterpreterInfo() {
  try {
    const result = await executePython(
      "import sys; print(f'{sys.version}')",
      { timeout: HEALTH_CHECK_TIMEOUT_MS },
    );
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
