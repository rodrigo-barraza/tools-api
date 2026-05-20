// ─── JSON-RPC 2.0 over stdio ────────────────────────────────

import { spawn } from "node:child_process";
import logger from "../../logger.ts";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node.js";

/**
 * Create an LSP client wrapper using vscode-jsonrpc.
 * Manages communication with an LSP server process via stdio.
 */
export function createLspClient(serverName: any, onCrash: any) {
  // ── Closure state ──────────────────────────────────────────
  let proc: any = null;
  let connection: any = null;
  let capabilities: any = null;
  let isInitialized = false;
  let startFailed = false;
  let startError: any = null;
  let isStopping = false;

  // Queues for handlers registered before connection is ready
  const pendingNotificationHandlers: any[] = [];
  const pendingRequestHandlers: any[] = [];

  function checkStartFailed() {
    if (startFailed) {
      throw startError || new Error(`LSP server ${serverName} failed to start`);
    }
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    get capabilities() {
      return capabilities;
    },

    get isInitialized() {
      return isInitialized;
    },

    /**
     * Spawn the LSP server process and establish JSON-RPC connection.
     */
    async start(command: any, args: any, options: Record<string, any> = {}) {
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
        await new Promise<void>((resolve: any, reject: any) => {
          const onSpawn = () => { cleanup(); resolve(); };
          const onError = (error: any) => { cleanup(); reject(error); };
          const cleanup = () => {
            spawnedProc.removeListener("spawn", onSpawn);
            spawnedProc.removeListener("error", onError);
          };
          spawnedProc.once("spawn", onSpawn);
          spawnedProc.once("error", onError);
        });

        // 3. Capture stderr for diagnostics
        if (proc.stderr) {
          proc.stderr.on("data", (data: any) => {
            const output = data.toString().trim();
            if (output) {
              logger.info(`[LSP:${serverName}:stderr] ${output}`);
            }
          });
        }

        // 4. Handle process errors after spawn
        proc.on("error", (error: any) => {
          if (!isStopping) {
            startFailed = true;
            startError = error;
            logger.error(`[LSP:${serverName}] Process error: ${error.message}`);
          }
        });

        proc.on("exit", (code: any, _signal: any) => {
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
        proc.stdin.on("error", (error: any) => {
          if (!isStopping) {
            logger.warn(`[LSP:${serverName}] stdin error: ${error.message}`);
          }
        });

        // 5. Create JSON-RPC connection
        const reader = new StreamMessageReader(proc.stdout);
        const writer = new StreamMessageWriter(proc.stdin);
        connection = createMessageConnection(reader, writer);

        // 6. Register error/close handlers BEFORE listen()
        connection.onError(([error]: any) => {
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
      } catch (error: any) {
        logger.error(`[LSP:${serverName}] Failed to start: ${error.message}`);
        throw error;
      }
    },

    /**
     * Send the LSP `initialize` request and `initialized` notification.
     */
    async initialize(params: any) {
      if (!connection) throw new Error("LSP client not started");
      checkStartFailed();

      try {
        const result = await connection.sendRequest("initialize", params);
        capabilities = result.capabilities;

        // Send initialized notification
        await connection.sendNotification("initialized", {});

        isInitialized = true;
        logger.info(`[LSP:${serverName}] Initialized`);
        return result;
      } catch (error: any) {
        logger.error(`[LSP:${serverName}] Initialize failed: ${error.message}`);
        throw error;
      }
    },

    /**
     * Send an LSP request and return the result.
     */
    async sendRequest(method: any, params: any) {
      if (!connection) throw new Error("LSP client not started");
      checkStartFailed();
      if (!isInitialized) throw new Error("LSP server not initialized");

      try {
        return await connection.sendRequest(method, params);
      } catch (error: any) {
        logger.error(`[LSP:${serverName}] Request ${method} failed: ${error.message}`);
        throw error;
      }
    },

    /**
     * Send an LSP notification (fire-and-forget).
     */
    async sendNotification(method: any, params: any) {
      if (!connection) throw new Error("LSP client not started");
      checkStartFailed();

      try {
        await connection.sendNotification(method, params);
      } catch (error: any) {
        logger.warn(`[LSP:${serverName}] Notification ${method} failed: ${error.message}`);
        // Don't re-throw — notifications are fire-and-forget
      }
    },

    /**
     * Register a handler for notifications FROM the server.
     */
    onNotification(method: any, handler: any) {
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
    onRequest(method: any, handler: any) {
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
    async stop() {
      let shutdownError: any = null;
      isStopping = true;

      try {
        if (connection) {
          await connection.sendRequest("shutdown", {});
          await connection.sendNotification("exit", {});
        }
      } catch (error: any) {
        logger.warn(`[LSP:${serverName}] Shutdown error: ${error.message}`);
        shutdownError = error;
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
