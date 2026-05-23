// ─── Sandboxed / Privileged Code Execution ─────────────────

import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { errorMessage } from "../utilities.ts";

const __filename = fileURLToPath(import.meta.url);
const nodeRequire = createRequire(__filename);

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 512 * 1024; // 512 KB max stdout

// ────────────────────────────────────────────────────────────
// Safe Globals — what the sandbox can access
// ────────────────────────────────────────────────────────────

/**
 * Build the globals object injected into the vm context.
 */
function buildGlobals(outputBuffer: any, execution: any = "sandboxed") {
  let outputLen = 0;

  const safePrint = (...args: any) => {
    if (outputLen >= MAX_OUTPUT_BYTES) return;
    const line = args
      .map((a: any) =>
        typeof a === "string" ? a : JSON.stringify(a, null, 2) ?? String(a),
      )
      .join(" ");
    outputBuffer.push(line);
    outputLen += line.length;
  };

  // ── Shared globals (both tiers) ────────────────────────────
  const shared = {
    console: {
      log: safePrint,
      warn: safePrint,
      error: safePrint,
      info: safePrint,
      dir: (...args: any) =>
        safePrint(
          ...args.map((a: any) => JSON.stringify(a, null, 2) ?? String(a)),
        ),
      table: (data: any) => safePrint(JSON.stringify(data, null, 2)),
    },

    // Safe built-ins
    JSON,
    Math,
    Date,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Symbol,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Proxy,
    Reflect,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
    URIError,
    EvalError,
    Infinity,
    NaN,
    undefined,
    isNaN,
    isFinite,
    parseInt,
    parseFloat,
    encodeURI,
    decodeURI,
    encodeURIComponent,
    decodeURIComponent,
    structuredClone,
    queueMicrotask,

    // Typed arrays (useful for binary/numeric work)
    ArrayBuffer,
    SharedArrayBuffer,
    DataView,
    Int8Array,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
    BigInt,

    // Text encoding
    TextEncoder,
    TextDecoder,

    // Timing (useful for perf measurement)
    performance: { now: () => performance.now() },
  };

  // ── Privileged tier — inject real Node.js globals ──────────
  if (execution === "privileged") {
    return {
      ...shared,
      require: nodeRequire,
      process,
      globalThis,
      global: globalThis,
      fetch,
      setTimeout,
      setInterval,
      setImmediate,
      clearTimeout,
      clearInterval,
      clearImmediate,
      Buffer,
      URL,
      URLSearchParams,
      AbortController,
      AbortSignal,
      Headers,
      Request,
      Response,
      FormData,
    };
  }

  // ── Sandboxed tier — explicitly block dangerous globals ────
  return {
    ...shared,
    require: undefined,
    process: undefined,
    globalThis: undefined,
    global: undefined,
    fetch: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    clearTimeout: undefined,
    clearInterval: undefined,
    clearImmediate: undefined,
  };
}

// ────────────────────────────────────────────────────────────
// Execution Engine
// ────────────────────────────────────────────────────────────

/**
 * Execute JavaScript code in a vm context.
 *


 * }}
 */
export function executeJavaScript(code: any, { timeout = DEFAULT_TIMEOUT_MS, execution = "sandboxed" }: Record<string, unknown> = {}) {
  const clampedTimeout = Math.min(Math.max(Number(timeout), 100), MAX_TIMEOUT_MS);
  const startTime = performance.now();
  const outputBuffer: unknown[] = [];

  try {
    const sandbox = buildGlobals(outputBuffer, execution);
    const context = vm.createContext(sandbox);

    const result = vm.runInContext(code, context, {
      timeout: clampedTimeout,
      displayErrors: true,
      breakOnSigint: true,
    });

    const executionTimeMs = Math.round(performance.now() - startTime);
    const output = outputBuffer.join("\n");

    // Serialize the result for JSON transport
    let serializedResult: any;
    if (result === undefined) {
      serializedResult = undefined;
    } else if (typeof result === "bigint") {
      serializedResult = result.toString();
    } else {
      try {
        // Test if it's JSON-safe
        JSON.stringify(result);
        serializedResult = result;
      } catch {
        serializedResult = String(result);
      }
    }

    return {
      success: true,
      output: output.length > MAX_OUTPUT_BYTES
        ? output.slice(0, MAX_OUTPUT_BYTES) + "\n... [output truncated]"
        : output,
      result: serializedResult,
      executionTimeMs,
      timedOut: false,
      execution,
    };
  } catch (error: unknown) {
    const executionTimeMs = Math.round(performance.now() - startTime);
    const timedOut =
      (error as any).code === "ERR_SCRIPT_EXECUTION_TIMEOUT" ||
      errorMessage(error)?.includes("Script execution timed out");

    return {
      success: false,
      output: outputBuffer.join("\n"),
      result: null,
      executionTimeMs,
      timedOut,
      error: timedOut
        ? `Execution timed out after ${clampedTimeout}ms`
        : `${(error as any).constructor.name}: ${errorMessage(error)}`,
    };
  }
}

/**
 * Get interpreter metadata for health checks.
 */
export function getJsInterpreterInfo() {
  return {
    available: true,
    runtime: "Node.js vm",
    nodeVersion: process.version,
    maxTimeoutMs: MAX_TIMEOUT_MS,
    maxOutputBytes: MAX_OUTPUT_BYTES,
  };
}
