// ─── JSON-RPC 2.0 over stdio ────────────────────────────────

import { spawn, ChildProcess } from "node:child_process";
import logger from "../../logger.ts";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  MessageConnection,
} from "vscode-jsonrpc/node.js";
import { errorMessage } from "../../utilities.ts";

export interface LspClient {
  readonly capabilities: Record<string, unknown> | null;
  readonly isInitialized: boolean;
  start(command: string, args: string[], options?: { env?: Record<string, string>; cwd?: string }): Promise<void>;
  initialize(params: Record<string, unknown>): Promise<any>;
  sendRequest(method: string, params: any): Promise<any>;
  sendNotification(method: string, params: any): Promise<void>;
  onNotification(method: string, handler: (...args: any[]) => void): void;
  onRequest(method: string, handler: (...args: any[]) => any): void;
  stop(): Promise<void>;
}

interface PendingNotification {
  method: string;
  handler: (...args: any[]) => void;
}

interface PendingRequest {
  method: string;
  handler: (...args: any[]) => any;
}

/**
 * Create an LSP client wrapper using vscode-jsonrpc.
 * Manages communication with an LSP server process via stdio.
 */
export function createLspClient(
  serverName: string,
  onCrash?: (error: Error) => void,
): LspClient {
  // ── Closure state ──────────────────────────────────────────
  let proc: ChildProcess | null = null;
  let connection: MessageConnection | null = null;
  let capabilities: Record<string, unknown> | null = null;
  let isInitialized = false;
  let startFailed = false;
  let startError: Error | null = null;
  let isStopping = false;

  // Queues for handlers registered before connection is ready
  const pendingNotificationHandlers: PendingNotification[] = [];
  const pendingRequestHandlers: PendingRequest[] = [];

  function checkStartFailed() {
    if (startFailed) {
      throw startError || new Error(`LSP server ${serverName} failed to start`);
    }
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    get capabilities(): Record<string, unknown> | null {
      return capabilities;
    },

    get isInitialized(): boolean {
      return isInitialized;
    },

    /**
     * Spawn the LSP server process and establish JSON-RPC connection.
     */
    async start(command: string, args: string[], options: { env?: Record<string, string>; cwd?: string } = {}): Promise<void> {
      try {
        // 1. Spawn process
        proc = spawn(command, args, {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, ...options.env },
          cwd: options.cwd,
          windowsHide: true,
        });

        if (!proc.stdout || !proc.stdin) {
          throw new Error("LSP server process stdio not available");
        }

        // 2. Wait for successful spawn (catch ENOENT for missing binaries)
        const spawnedProc = proc;
        await new Promise<void>((resolve, reject) => {
          const onSpawn = () => { cleanup(); resolve(); };
          const onError = (error: Error) => { cleanup(); reject(error); };
          const cleanup = () => {
            spawnedProc.removeListener("spawn", onSpawn);
            spawnedProc.removeListener("error", onError);
          };
          spawnedProc.once("spawn", onSpawn);
          spawnedProc.once("error", onError);
        });

        // 3. Capture stderr for diagnostics
        if (proc.stderr) {
          proc.stderr.on("data", (data: Buffer) => {
            const output = data.toString().trim();
            if (output) {
              logger.info(`[LSP:${serverName}:stderr] ${output}`);
            }
          });
        }

        // 4. Handle process errors after spawn
        proc.on("error", (error: Error) => {
          if (!isStopping) {
            startFailed = true;
            startError = error;
            logger.error(`[LSP:${serverName}] Process error: ${error.message}`);
          }
        });

        proc.on("exit", (code: number | null) => {
          if (code !== 0 && code !== null && !isStopping) {
            isInitialized = false;
            startFailed = false;
            startError = null;
            const crashError = new Error(`LSP server ${serverName} crashed with exit code ${code}`);
            logger.error(`[LSP:${serverName}] ${crashError.message}`);
            onCrash?.(crashError);
          }
        });

        // Handle stdin errors (process exits before we finish writing)
        proc.stdin.on("error", (error: Error) => {
          if (!isStopping) {
            logger.warn(`[LSP:${serverName}] stdin error: ${error.message}`);
          }
        });

        // 5. Create JSON-RPC connection
        const reader = new StreamMessageReader(proc.stdout);
        const writer = new StreamMessageWriter(proc.stdin);
        connection = createMessageConnection(reader, writer);

        // 6. Register error/close handlers BEFORE listen()
        connection.onError(([error]) => {
          if (!isStopping) {
            startFailed = true;
            startError = error;
            logger.error(`[LSP:${serverName}] Connection error: ${error.message}`);
          }
        });

        connection.onClose(() => {
          if (!isStopping) {
            isInitialized = false;
            logger.info(`[LSP:${serverName}] Connection closed`);
          }
        });

        // 7. Start listening
        connection.listen();

        // 8. Apply queued handlers
        for (const { method, handler } of pendingNotificationHandlers) {
          connection.onNotification(method, handler);
        }
        pendingNotificationHandlers.length = 0;

        for (const { method, handler } of pendingRequestHandlers) {
          connection.onRequest(method, handler);
        }
        pendingRequestHandlers.length = 0;

        logger.info(`[LSP:${serverName}] Client started`);
      } catch (error: unknown) {
        logger.error(`[LSP:${serverName}] Failed to start: ${errorMessage(error)}`);
        throw error;
      }
    },

    /**
     * Send the LSP `initialize` request and `initialized` notification.
     */
    async initialize(params: Record<string, unknown>): Promise<any> {
      if (!connection) throw new Error("LSP client not started");
      checkStartFailed();

      try {
        const result = await connection.sendRequest("initialize", params);
        capabilities = (result as any).capabilities;

        // Send initialized notification
        await connection.sendNotification("initialized", {});

        isInitialized = true;
        logger.info(`[LSP:${serverName}] Initialized`);
        return result;
      } catch (error: unknown) {
        logger.error(`[LSP:${serverName}] Initialize failed: ${errorMessage(error)}`);
        throw error;
      }
    },

    /**
     * Send an LSP request and return the result.
     */
    async sendRequest(method: string, params: any): Promise<any> {
      if (!connection) throw new Error("LSP client not started");
      checkStartFailed();
      if (!isInitialized) throw new Error("LSP server not initialized");

      try {
        return await connection.sendRequest(method, params);
      } catch (error: unknown) {
        logger.error(`[LSP:${serverName}] Request ${method} failed: ${errorMessage(error)}`);
        throw error;
      }
    },

    /**
     * Send an LSP notification (fire-and-forget).
     */
    async sendNotification(method: string, params: any): Promise<void> {
      if (!connection) throw new Error("LSP client not started");
      checkStartFailed();

      try {
        await connection.sendNotification(method, params);
      } catch (error: unknown) {
        logger.warn(`[LSP:${serverName}] Notification ${method} failed: ${errorMessage(error)}`);
        // Don't re-throw — notifications are fire-and-forget
      }
    },

    /**
     * Register a handler for notifications FROM the server.
     */
    onNotification(method: string, handler: (...args: any[]) => void): void {
      if (!connection) {
        pendingNotificationHandlers.push({ method, handler });
        return;
      }
      checkStartFailed();
      connection.onNotification(method, handler);
    },

    /**
     * Register a handler for requests FROM the server (reverse direction).
     */
    onRequest(method: string, handler: (...args: any[]) => any): void {
      if (!connection) {
        pendingRequestHandlers.push({ method, handler });
        return;
      }
      checkStartFailed();
      connection.onRequest(method, handler);
    },

    /**
     * Gracefully stop the LSP server and clean up.
     */
    async stop(): Promise<void> {
      let shutdownError: Error | null = null;
      isStopping = true;

      try {
        if (connection) {
          await connection.sendRequest("shutdown", {});
          await connection.sendNotification("exit", {});
        }
      } catch (error: unknown) {
        logger.warn(`[LSP:${serverName}] Shutdown error: ${errorMessage(error)}`);
        shutdownError = error as Error;
      } finally {
        // Always cleanup regardless of shutdown success
        if (connection) {
          try { connection.dispose(); } catch { /* disposal errors are non-critical */ }
          connection = null;
        }

        if (proc) {
          proc.removeAllListeners("error");
          proc.removeAllListeners("exit");
          if (proc.stdin) proc.stdin.removeAllListeners("error");
          if (proc.stderr) proc.stderr.removeAllListeners("data");

          try { proc.kill(); } catch { /* process may already be dead */ }
          proc = null;
        }

        isInitialized = false;
        capabilities = null;
        isStopping = false;

        if (shutdownError) {
          startFailed = true;
          startError = shutdownError;
        }

        logger.info(`[LSP:${serverName}] Client stopped`);
      }

      if (shutdownError) throw shutdownError;
    },
  };
}
