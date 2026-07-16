// ─── Sandboxed Code Execution ───────────────────────────────

import { spawn } from "node:child_process";
import { writeFile, unlink, mkdtemp, rm, readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { tmpdir } from "node:os";
import {
  PYTHON_DEFAULT_TIMEOUT_MS as DEFAULT_TIMEOUT_MS,
  PYTHON_MAX_TIMEOUT_MS as MAX_TIMEOUT_MS,
  PYTHON_MAX_OUTPUT_BYTES as MAX_OUTPUT_BYTES,
  PYTHON_MEMORY_LIMIT_MB as MEMORY_LIMIT_MB,
  PYTHON_HEALTH_CHECK_TIMEOUT_MS as HEALTH_CHECK_TIMEOUT_MS,
  PYTHON_MAX_FIGURES as MAX_FIGURES,
  PYTHON_MAX_FIGURE_BYTES as MAX_FIGURE_BYTES,
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
# RLIMIT_DATA (heap + anonymous mappings), NOT RLIMIT_AS: numpy/OpenBLAS and
# matplotlib reserve large virtual address ranges they never back with real
# memory, so an address-space cap makes "import matplotlib" hang or die at
# ~67 MB real RSS while a data-segment cap still stops runaway allocations.
_mb = ${MEMORY_LIMIT_MB} * 1024 * 1024
try:
    resource.setrlimit(resource.RLIMIT_DATA, (_mb, _mb))
except (ValueError, resource.error):
    pass  # Some environments restrict setrlimit

# ─── Disable network (block socket creation) ───
import socket as _socket
_orig_socket = _socket.socket
def _blocked_socket(*args, **kwargs):
    raise PermissionError("Network access is disabled in the sandbox")
_socket.socket = _blocked_socket

# ─── Quiet the Agg backend's plt.show() warning ───
import warnings as _warnings
_warnings.filterwarnings("ignore", message="FigureCanvasAgg is non-interactive")
_warnings.filterwarnings("ignore", message="Matplotlib is currently using agg")

# Where figure files land: the run's temp working directory. Captured at
# start so os.chdir() in user code can't redirect the epilogue's output.
_PRISM_WORKDIR = os.getcwd()

# ─── Clean namespace ───
del resource, _mb, _socket, _orig_socket, _blocked_socket, _warnings
`;

// Appended after user code. Auto-saves any still-open matplotlib figures so
// the host can return them as images (Jupyter/e2b-style rich results — see
// https://github.com/e2b-dev/code-interpreter for the result model). An
// atexit hook can't do this: pyplot registers its own atexit handler at
// import time, which runs FIRST (LIFO) and destroys all figures. If user
// code raises, the epilogue is skipped — but files it savefig()'d into the
// working directory are still collected by the host afterwards.
const EPILOGUE = `
# ─── prism: auto-capture open matplotlib figures ───
try:
    import sys as _prism_sys
    if "matplotlib" in _prism_sys.modules:
        import os as _prism_os
        import matplotlib.pyplot as _prism_plt
        for _prism_index, _prism_num in enumerate(_prism_plt.get_fignums()):
            _prism_plt.figure(_prism_num).savefig(
                _prism_os.path.join(_PRISM_WORKDIR, "_prism_figure_%d.png" % (_prism_index + 1)),
                format="png", dpi=110, bbox_inches="tight")
except Exception:
    pass
`;

// Spawn-env additions for headless plotting. The thread caps are load-bearing:
// without them, multi-threaded OpenBLAS/OpenMP reservations exhaust the memory
// cap during "import numpy" (verified empirically — the import hangs).
const PYTHON_RUNTIME_ENV = {
  MPLBACKEND: "Agg",
  MPLCONFIGDIR: join(tmpdir(), "prism-matplotlib-cache"),
  OPENBLAS_NUM_THREADS: "1",
  OMP_NUM_THREADS: "1",
  MKL_NUM_THREADS: "1",
  NUMEXPR_NUM_THREADS: "1",
  MALLOC_ARENA_MAX: "2",
};

// Image files collected from the working directory after a run: both the
// epilogue's auto-captures and anything user code savefig()'d itself.
const FIGURE_MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export interface PythonFigure {
  filename: string;
  mimeType: string;
  /** Base64-encoded image bytes. */
  data: string;
  bytes: number;
}

/**
 * Collect image files from the run's working directory (auto-captured
 * figures sort first via their _prism_ prefix). Returns at most MAX_FIGURES
 * figures plus the total number of candidate files found.
 */
async function collectFigures(
  directory: string,
): Promise<{ figures: PythonFigure[]; totalFigureFiles: number }> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return { figures: [], totalFigureFiles: 0 };
  }

  const candidates = entries
    .filter((name) => FIGURE_MIME_BY_EXTENSION[extname(name).toLowerCase()])
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const figures: PythonFigure[] = [];
  for (const filename of candidates) {
    if (figures.length >= MAX_FIGURES) break;
    try {
      const filePath = join(directory, filename);
      const fileStat = await stat(filePath);
      if (!fileStat.isFile() || fileStat.size === 0 || fileStat.size > MAX_FIGURE_BYTES) {
        continue;
      }
      const buffer = await readFile(filePath);
      figures.push({
        filename,
        mimeType: FIGURE_MIME_BY_EXTENSION[extname(filename).toLowerCase()],
        data: buffer.toString("base64"),
        bytes: buffer.length,
      });
    } catch {
      // Unreadable file — skip it rather than failing the whole run
    }
  }

  return { figures, totalFigureFiles: candidates.length };
}

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
  /** Captured matplotlib figures / image files written by the script. */
  figures?: PythonFigure[];
  /** Total image files found (may exceed figures.length when capped). */
  totalFigureFiles?: number;
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
    await writeFile(scriptPath, PREAMBLE + "\n" + code + "\n" + EPILOGUE, "utf-8");
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
      // cwd is the temp dir so relative savefig()/open() writes land there
      // (collected as figures, then wiped) instead of in the service cwd.
      cwd: temporaryDirectory,
      env: {
        ...buildCommandEnv(),
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
        ...PYTHON_RUNTIME_ENV,
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

    async function finish(exitCode: number | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const executionTimeMs = Math.round(performance.now() - startTime);

      // Collect figures before wiping the temp dir
      const { figures, totalFigureFiles } = await collectFigures(
        temporaryDirectory,
      );

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
        ...(figures.length > 0 && { figures, totalFigureFiles }),
      });
    }

    child.on("close", (code: number | null) => void finish(code));
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
    await writeFile(scriptPath, PREAMBLE + "\n" + code + "\n" + EPILOGUE, "utf-8");
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
      cwd: temporaryDirectory,
      env: {
        ...buildCommandEnv(),
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONUNBUFFERED: "1",
        ...PYTHON_RUNTIME_ENV,
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

    async function finish(exitCode: number | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const { figures, totalFigureFiles } = await collectFigures(
        temporaryDirectory,
      );

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
        ...(figures.length > 0 && { figures, totalFigureFiles }),
      });
    }

    child.on("close", (code: number | null) => void finish(code));
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
