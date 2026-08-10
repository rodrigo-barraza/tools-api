// ─── Interactive Debugging (Debug Adapter Protocol) ─────────
// Minimal DAP-backed debug tool. Target adapter: debugpy (Python) over
// stdio (`python3 -m debugpy.adapter`). Sessions are keyed by id, carry a
// hard lifetime timeout, and are always cleaned up (terminate, process kill,
// client dispose). The protocol client lives in ./dap/DapClient.ts and is
// unit-tested against a scripted fake adapter.

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";

import { createDapClient, type DapClient } from "./dap/DapClient.ts";
import { validatePath } from "./AgenticFileService.ts";
import { errorMessage } from "../utilities.ts";
import logger from "../logger.ts";

// ── Configuration ────────────────────────────────────────────

const MAX_CONCURRENT_SESSIONS = 4;
const SESSION_HARD_TIMEOUT_MS = 5 * 60 * 1000; // absolute session lifetime
const LAUNCH_TIMEOUT_MS = 30_000;
const STOP_WAIT_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_CHARS = 8_000;
const PYTHON_COMMAND = process.env.DEBUGPY_PYTHON || "python3";

// ── Session registry ─────────────────────────────────────────

interface DebugSession {
  id: string;
  program: string;
  client: DapClient;
  process: ChildProcess;
  output: string[];
  outputChars: number;
  threadId: number | null;
  hardTimeout: NodeJS.Timeout;
  createdAt: number;
}

const sessions = new Map<string, DebugSession>();

function getSession(sessionId: unknown):
  | { ok: true; session: DebugSession }
  | { ok: false; error: string } {
  if (!sessionId || typeof sessionId !== "string") {
    return { ok: false, error: "'sessionId' is required (string)" };
  }
  const session = sessions.get(sessionId);
  if (!session) {
    return {
      ok: false,
      error: `No debug session '${sessionId}'. It may have hit its ${SESSION_HARD_TIMEOUT_MS / 60000}-minute lifetime and been cleaned up — launch again.`,
    };
  }
  return { ok: true, session };
}

async function destroySession(session: DebugSession): Promise<void> {
  sessions.delete(session.id);
  clearTimeout(session.hardTimeout);
  try {
    await session.client.sendRequest("disconnect", { terminateDebuggee: true }, 2_000);
  } catch {
    /* adapter may already be gone */
  }
  session.client.dispose();
  if (session.process.exitCode === null && !session.process.killed) {
    session.process.kill("SIGKILL");
  }
}

// ── Formatting helpers ───────────────────────────────────────

function sessionOutput(session: DebugSession): string {
  return session.output.join("");
}

interface DapStackFrame {
  id: number;
  name: string;
  line: number;
  column: number;
  source?: { path?: string; name?: string };
}

function formatStoppedResult(
  session: DebugSession,
  event: string,
  body: Record<string, unknown>,
) {
  if (event === "stopped") {
    if (typeof body.threadId === "number") session.threadId = body.threadId;
    return {
      sessionId: session.id,
      status: "stopped",
      reason: (body.reason as string) ?? "unknown",
      ...(body.description ? { description: body.description } : {}),
      ...(body.text ? { text: body.text } : {}),
      output: sessionOutput(session),
    };
  }
  // terminated / exited — the program ran to completion (or died)
  const exitCode = typeof body.exitCode === "number" ? body.exitCode : undefined;
  return {
    sessionId: session.id,
    status: "terminated",
    ...(exitCode !== undefined ? { exitCode } : {}),
    output: sessionOutput(session),
    message:
      "The debuggee has terminated. The session will be cleaned up; launch again to debug from the start.",
  };
}

// ── Actions ──────────────────────────────────────────────────

interface DebugBreakpoint {
  file: string;
  line: number;
}

interface DebugActionParams {
  action: string;
  sessionId?: string;
  program?: string;
  args?: string[];
  cwd?: string;
  breakpoints?: DebugBreakpoint[];
  expression?: string;
  frameId?: number;
  variablesReference?: number;
}

async function launchSession({
  program,
  args = [],
  cwd,
  breakpoints = [],
}: DebugActionParams) {
  if (sessions.size >= MAX_CONCURRENT_SESSIONS) {
    return {
      error: `Maximum ${MAX_CONCURRENT_SESSIONS} concurrent debug sessions. Terminate one first.`,
      activeSessions: [...sessions.keys()],
    };
  }
  const programValidation = validatePath(program);
  if (!programValidation.safe) {
    return { error: programValidation.error };
  }
  const resolvedProgram = programValidation.resolved;
  if (!resolvedProgram.endsWith(".py")) {
    return {
      error: "Only Python programs are supported (debugpy adapter). Pass a .py file.",
    };
  }
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== "string")) {
    return { error: "'args' must be an array of strings" };
  }
  for (const breakpoint of breakpoints) {
    const breakpointValidation = validatePath(breakpoint?.file);
    if (!breakpointValidation.safe) {
      return { error: `breakpoint file: ${breakpointValidation.error}` };
    }
    if (typeof breakpoint.line !== "number" || breakpoint.line < 1) {
      return { error: "breakpoint 'line' must be a positive integer (1-based)" };
    }
  }

  const workingDirectory = cwd ? resolve(cwd) : dirname(resolvedProgram);

  const adapterProcess = spawn(PYTHON_COMMAND, ["-m", "debugpy.adapter"], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd: workingDirectory,
    windowsHide: true,
  });

  const spawnErrorPromise = new Promise<never>((_, reject) => {
    adapterProcess.once("error", (spawnError) =>
      reject(
        new Error(
          `Failed to spawn '${PYTHON_COMMAND} -m debugpy.adapter': ${spawnError.message}. Is debugpy installed (pip install debugpy)?`,
        ),
      ),
    );
  });

  const client = createDapClient(adapterProcess.stdout!, adapterProcess.stdin!);

  const session: DebugSession = {
    id: randomUUID().slice(0, 8),
    program: resolvedProgram,
    client,
    process: adapterProcess,
    output: [],
    outputChars: 0,
    threadId: null,
    createdAt: Date.now(),
    hardTimeout: setTimeout(() => {
      logger.warn(`[Debug] Session hit hard timeout — cleaning up`);
      const timedOutSession = sessions.get(sessionIdForTimeout);
      if (timedOutSession) void destroySession(timedOutSession);
    }, SESSION_HARD_TIMEOUT_MS),
  };
  const sessionIdForTimeout = session.id;
  session.hardTimeout.unref();

  // Capture program output (bounded)
  client.onEvent("output", (body) => {
    const text = typeof body.output === "string" ? body.output : "";
    if (!text || session.outputChars >= MAX_OUTPUT_CHARS) return;
    session.output.push(text.slice(0, MAX_OUTPUT_CHARS - session.outputChars));
    session.outputChars += text.length;
  });

  sessions.set(session.id, session);

  try {
    const handshake = (async () => {
      await client.sendRequest("initialize", {
        clientID: "tools-service",
        clientName: "tools-service debug tool",
        adapterID: "debugpy",
        pathFormat: "path",
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsRunInTerminalRequest: false,
      });

      // launch does not complete until configurationDone — start it, then
      // configure on the 'initialized' event.
      const launchPromise = client.sendRequest(
        "launch",
        {
          program: resolvedProgram,
          args,
          cwd: workingDirectory,
          console: "internalConsole",
          justMyCode: true,
          stopOnEntry: breakpoints.length === 0,
        },
        LAUNCH_TIMEOUT_MS,
      );

      await client.waitForEvent(["initialized"], LAUNCH_TIMEOUT_MS);

      // Set breakpoints per file
      const breakpointsByFile = new Map<string, number[]>();
      for (const breakpoint of breakpoints) {
        const file = resolve(breakpoint.file);
        breakpointsByFile.set(file, [
          ...(breakpointsByFile.get(file) ?? []),
          breakpoint.line,
        ]);
      }
      for (const [file, fileLines] of breakpointsByFile) {
        await client.sendRequest("setBreakpoints", {
          source: { path: file },
          breakpoints: fileLines.map((line) => ({ line })),
        });
      }

      await client.sendRequest("configurationDone");
      await launchPromise;

      return client.waitForEvent(
        ["stopped", "terminated", "exited"],
        STOP_WAIT_TIMEOUT_MS,
      );
    })();

    const firstStop = await Promise.race([handshake, spawnErrorPromise]);

    const result = formatStoppedResult(session, firstStop.event, firstStop.body);
    if (result.status === "terminated") {
      await destroySession(session);
    }
    return result;
  } catch (launchError: unknown) {
    await destroySession(session);
    return { error: `Debug launch failed: ${errorMessage(launchError)}` };
  }
}

async function resumeSession(
  session: DebugSession,
  command: "continue" | "next" | "stepIn" | "stepOut",
) {
  try {
    const threadId = session.threadId ?? 1;
    await session.client.sendRequest(command, { threadId });
    const stopEvent = await session.client.waitForEvent(
      ["stopped", "terminated", "exited"],
      STOP_WAIT_TIMEOUT_MS,
    );
    const result = formatStoppedResult(session, stopEvent.event, stopEvent.body);
    if (result.status === "terminated") {
      await destroySession(session);
    }
    return result;
  } catch (resumeError: unknown) {
    return {
      sessionId: session.id,
      error: `'${command}' failed: ${errorMessage(resumeError)}`,
    };
  }
}

async function stackTrace(session: DebugSession) {
  try {
    const threadId = session.threadId ?? 1;
    const response = await session.client.sendRequest("stackTrace", {
      threadId,
      startFrame: 0,
      levels: 20,
    });
    const frames = ((response.body?.stackFrames as DapStackFrame[]) ?? []).map(
      (frame) => ({
        id: frame.id,
        name: frame.name,
        file: frame.source?.path ?? frame.source?.name ?? null,
        line: frame.line,
        column: frame.column,
      }),
    );
    return { sessionId: session.id, frameCount: frames.length, frames };
  } catch (stackError: unknown) {
    return { sessionId: session.id, error: `stackTrace failed: ${errorMessage(stackError)}` };
  }
}

async function evaluateExpression(
  session: DebugSession,
  expression: unknown,
  frameId: unknown,
) {
  if (!expression || typeof expression !== "string") {
    return { error: "'expression' is required (string) for evaluate" };
  }
  try {
    const response = await session.client.sendRequest("evaluate", {
      expression,
      context: "repl",
      ...(typeof frameId === "number" ? { frameId } : {}),
    });
    if (!response.success) {
      return {
        sessionId: session.id,
        error: `evaluate failed: ${response.message ?? "unknown error"}`,
      };
    }
    return {
      sessionId: session.id,
      result: response.body?.result ?? null,
      type: response.body?.type ?? null,
      variablesReference: response.body?.variablesReference ?? 0,
    };
  } catch (evaluateError: unknown) {
    return { sessionId: session.id, error: `evaluate failed: ${errorMessage(evaluateError)}` };
  }
}

interface DapVariable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
}

async function listVariables(session: DebugSession, variablesReference: unknown) {
  try {
    let reference = typeof variablesReference === "number" ? variablesReference : 0;
    if (!reference) {
      // Default: locals of the top stack frame
      const threadId = session.threadId ?? 1;
      const stackResponse = await session.client.sendRequest("stackTrace", {
        threadId,
        startFrame: 0,
        levels: 1,
      });
      const topFrame = (stackResponse.body?.stackFrames as DapStackFrame[])?.[0];
      if (!topFrame) {
        return { sessionId: session.id, error: "No stack frame available (is the program stopped?)" };
      }
      const scopesResponse = await session.client.sendRequest("scopes", {
        frameId: topFrame.id,
      });
      const scopes = (scopesResponse.body?.scopes as Array<{
        name: string;
        variablesReference: number;
      }>) ?? [];
      reference = scopes[0]?.variablesReference ?? 0;
      if (!reference) {
        return { sessionId: session.id, error: "No variable scopes available" };
      }
    }
    const variablesResponse = await session.client.sendRequest("variables", {
      variablesReference: reference,
    });
    const variables = ((variablesResponse.body?.variables as DapVariable[]) ?? []).map(
      (variable) => ({
        name: variable.name,
        value: variable.value,
        type: variable.type ?? null,
        variablesReference: variable.variablesReference,
      }),
    );
    return { sessionId: session.id, count: variables.length, variables };
  } catch (variablesError: unknown) {
    return { sessionId: session.id, error: `variables failed: ${errorMessage(variablesError)}` };
  }
}

// ── Public entry point ───────────────────────────────────────

export async function agenticDebugAction(params: DebugActionParams) {
  const { action } = params;

  switch (action) {
    case "launch": {
      if (!params.program) {
        return { error: "'program' is required for launch (absolute path to a .py file)" };
      }
      return launchSession(params);
    }
    case "continue":
    case "next":
    case "stepIn":
    case "stepOut": {
      const lookup = getSession(params.sessionId);
      if (!lookup.ok) return { error: lookup.error };
      return resumeSession(lookup.session, action);
    }
    case "stackTrace": {
      const lookup = getSession(params.sessionId);
      if (!lookup.ok) return { error: lookup.error };
      return stackTrace(lookup.session);
    }
    case "evaluate": {
      const lookup = getSession(params.sessionId);
      if (!lookup.ok) return { error: lookup.error };
      return evaluateExpression(lookup.session, params.expression, params.frameId);
    }
    case "variables": {
      const lookup = getSession(params.sessionId);
      if (!lookup.ok) return { error: lookup.error };
      return listVariables(lookup.session, params.variablesReference);
    }
    case "terminate": {
      const lookup = getSession(params.sessionId);
      if (!lookup.ok) return { error: lookup.error };
      const output = sessionOutput(lookup.session);
      await destroySession(lookup.session);
      return { sessionId: params.sessionId, status: "terminated", output };
    }
    case "list": {
      return {
        sessions: [...sessions.values()].map((session) => ({
          sessionId: session.id,
          program: session.program,
          ageSeconds: Math.round((Date.now() - session.createdAt) / 1000),
        })),
      };
    }
    default:
      return {
        error: `Unknown action '${String(action)}'. Supported: launch, continue, next, stepIn, stepOut, stackTrace, evaluate, variables, terminate, list.`,
      };
  }
}

/** Shutdown hook — terminate all sessions (used by boot cleanup and tests). */
export async function agenticDebugShutdown(): Promise<void> {
  await Promise.allSettled([...sessions.values()].map(destroySession));
}

export function agenticDebugHealth() {
  return {
    activeSessions: sessions.size,
    maxSessions: MAX_CONCURRENT_SESSIONS,
    adapter: `${PYTHON_COMMAND} -m debugpy.adapter`,
  };
}
