// ─── Multi-Server Router ────────────────────────────────────

import { extname, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createLspServerInstance,
  LspServerInstance,
} from "./LspServerInstance.ts";
import { LspParams } from "./LspClient.ts";
import { getLspServerConfigs } from "./LspConfig.ts";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

export interface LspConfigurationItem {
  scopeUri?: string;
  section?: string;
}

export interface LspConfigurationParams {
  items: LspConfigurationItem[];
}

// Raw diagnostic shape from textDocument/publishDiagnostics (LSP 3.x)
export interface LspRawDiagnostic {
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
}

export interface FileDiagnostics {
  uri: string;
  version?: number;
  diagnostics: LspRawDiagnostic[];
  receivedAt: number;
}

export interface WaitForDiagnosticsOptions {
  /** Only publishes at/after this timestamp count as fresh. */
  since?: number;
  /** How long to wait for a fresh publish before giving up. */
  timeoutMs?: number;
  /** Linger after the first fresh publish to absorb multi-pass servers. */
  settleMs?: number;
}

export interface LspServerManager {
  initialize(): void;
  getServerForFile(filePath: string): LspServerInstance | undefined;
  ensureServerStarted(filePath: string): Promise<LspServerInstance | undefined>;
  sendRequest(
    filePath: string,
    method: string,
    params?: LspParams,
  ): Promise<unknown>;
  openFile(filePath: string, content: string): Promise<void>;
  changeFile(filePath: string, content: string): Promise<void>;
  closeFile(filePath: string): Promise<void>;
  isFileOpen(filePath: string): boolean;
  getDiagnostics(filePath: string): FileDiagnostics | undefined;
  waitForDiagnostics(
    filePath: string,
    options?: WaitForDiagnosticsOptions,
  ): Promise<FileDiagnostics | undefined>;
  getHealth(): Record<string, string>;
  getAllServers(): Map<string, LspServerInstance>;
  shutdown(): Promise<void>;
}

/**
 * Creates an LSP server manager instance.
 */
export function createLspServerManager(
  workspaceFolder?: string,
): LspServerManager {
  // ── Private state ──────────────────────────────────────────
  const servers = new Map<string, LspServerInstance>();
  const extensionMap = new Map<string, string[]>();
  const openedFiles = new Map<string, string>();
  // Tracks the last LSP document version sent per file URI so didChange
  // notifications carry a monotonically increasing version (required by LSP).
  const documentVersions = new Map<string, number>();
  // Diagnostics are PUSHED by servers (textDocument/publishDiagnostics)
  // rather than requested, so we store the latest publish per file URI and
  // let waiters block until a fresh one lands. Pattern follows
  // https://github.com/isaacphi/mcp-language-server and
  // https://github.com/oraios/serena
  const fileDiagnostics = new Map<string, FileDiagnostics>();
  const diagnosticsWaiters = new Map<
    string,
    Array<(entry: FileDiagnostics) => void>
  >();
  let initialized = false;

  // ── Initialization ─────────────────────────────────────────

  /**
   * Load all configured LSP servers and build extension routing map.
   * Does NOT start any servers — they start lazily on first request.
   */
  function initialize(): void {
    if (initialized) return;

    const configs = getLspServerConfigs(workspaceFolder);

    for (const [serverName, config] of Object.entries(configs)) {
      try {
        if (!config.command) {
          logger.warn(
            `[LSP Manager] Server '${serverName}' missing 'command' — skipping`,
          );
          continue;
        }
        if (
          !config.extensionToLanguage ||
          Object.keys(config.extensionToLanguage).length === 0
        ) {
          logger.warn(
            `[LSP Manager] Server '${serverName}' missing 'extensionToLanguage' — skipping`,
          );
          continue;
        }

        // Build extension → server mapping
        for (const fileExtension of Object.keys(config.extensionToLanguage)) {
          const normalized = fileExtension.toLowerCase();
          if (!extensionMap.has(normalized)) {
            extensionMap.set(normalized, []);
          }
          extensionMap.get(normalized)!.push(serverName);
        }

        // Create instance (not started yet)
        const instance = createLspServerInstance(serverName, config);

        // Handle workspace/configuration requests from servers that send them
        // even when we say we don't support it (TypeScript does this)
        instance.onRequest<LspConfigurationParams, (null | undefined)[]>(
          "workspace/configuration",
          (params) => {
            return (params?.items || []).map(() => null);
          },
        );

        // Capture pushed diagnostics and release any waiters for that file
        instance.onNotification<{
          uri?: string;
          version?: number;
          diagnostics?: LspRawDiagnostic[];
        }>("textDocument/publishDiagnostics", (params) => {
          if (!params?.uri) return;
          const entry: FileDiagnostics = {
            uri: params.uri,
            version: params.version,
            diagnostics: params.diagnostics ?? [],
            receivedAt: Date.now(),
          };
          fileDiagnostics.set(params.uri, entry);
          const waiters = diagnosticsWaiters.get(params.uri);
          if (waiters?.length) {
            diagnosticsWaiters.delete(params.uri);
            for (const waiter of waiters) waiter(entry);
          }
        });

        servers.set(serverName, instance);
      } catch (error: unknown) {
        logger.error(
          `[LSP Manager] Failed to create server '${serverName}': ${errorMessage(error)}`,
        );
      }
    }

    initialized = true;
    logger.info(
      `[LSP Manager] Initialized with ${servers.size} server(s): ${[...servers.keys()].join(", ")}`,
    );
  }

  // ── Routing ────────────────────────────────────────────────

  /**
   * Get the server instance for a given file path based on extension.
   */
  function getServerForFile(filePath: string): LspServerInstance | undefined {
    const fileExtension = extname(filePath).toLowerCase();
    const serverNames = extensionMap.get(fileExtension);
    if (!serverNames || serverNames.length === 0) return undefined;
    return servers.get(serverNames[0]);
  }

  /**
   * Ensure the appropriate server is started for a file.
   * Lazy-starts the server on first request for that language.
   */
  async function ensureServerStarted(
    filePath: string,
  ): Promise<LspServerInstance | undefined> {
    const server = getServerForFile(filePath);
    if (!server) return undefined;

    if (server.state === "stopped" || server.state === "error") {
      try {
        await server.start();
      } catch (error: unknown) {
        logger.error(
          `[LSP Manager] Failed to start server for ${basename(filePath)}: ${errorMessage(error)}`,
        );
        throw error;
      }
    }

    return server;
  }

  // ── Request forwarding ─────────────────────────────────────

  /**
   * Send an LSP request to the appropriate server for the given file.
   */
  async function sendRequest(
    filePath: string,
    method: string,
    params?: LspParams,
  ): Promise<unknown> {
    const server = await ensureServerStarted(filePath);
    if (!server) return undefined;

    try {
      return await server.sendRequest(method, params);
    } catch (error: unknown) {
      logger.error(
        `[LSP Manager] Request '${method}' failed for ${basename(filePath)}: ${errorMessage(error)}`,
      );
      throw error;
    }
  }

  // ── File synchronization ───────────────────────────────────

  /**
   * Open a file in the appropriate LSP server (sends didOpen).
   * Skips if already open on the same server.
   */
  async function openFile(filePath: string, content: string): Promise<void> {
    const server = await ensureServerStarted(filePath);
    if (!server) return;

    const fileUri = pathToFileURL(resolve(filePath)).href;

    // Skip if already open on this server
    if (openedFiles.get(fileUri) === server.name) return;

    const fileExtension = extname(filePath).toLowerCase();
    const languageId =
      server.config.extensionToLanguage[fileExtension] || "plaintext";

    try {
      await server.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: fileUri,
          languageId,
          version: 1,
          text: content,
        },
      });
      openedFiles.set(fileUri, server.name);
      documentVersions.set(fileUri, 1);
    } catch (error: unknown) {
      logger.error(
        `[LSP Manager] didOpen failed for ${basename(filePath)}: ${errorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Notify the server of file content changes.
   */
  async function changeFile(filePath: string, content: string): Promise<void> {
    const server = getServerForFile(filePath);
    if (!server || server.state !== "running") {
      return openFile(filePath, content);
    }

    const fileUri = pathToFileURL(resolve(filePath)).href;

    // If not yet open, open it first (LSP requires didOpen before didChange)
    if (openedFiles.get(fileUri) !== server.name) {
      return openFile(filePath, content);
    }

    // Monotonically increasing document version — didChange with a stale or
    // constant version is ignored by many servers, which is why edits used to
    // be invisible to subsequent queries.
    const version = (documentVersions.get(fileUri) ?? 1) + 1;
    documentVersions.set(fileUri, version);

    try {
      await server.sendNotification("textDocument/didChange", {
        textDocument: { uri: fileUri, version },
        contentChanges: [{ text: content }],
      });
    } catch (error: unknown) {
      logger.error(
        `[LSP Manager] didChange failed for ${basename(filePath)}: ${errorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Close a file in the LSP server (sends didClose).
   */
  async function closeFile(filePath: string): Promise<void> {
    const server = getServerForFile(filePath);
    if (!server || server.state !== "running") return;

    const fileUri = pathToFileURL(resolve(filePath)).href;

    try {
      await server.sendNotification("textDocument/didClose", {
        textDocument: { uri: fileUri },
      });
      openedFiles.delete(fileUri);
      documentVersions.delete(fileUri);
    } catch (error: unknown) {
      logger.error(
        `[LSP Manager] didClose failed for ${basename(filePath)}: ${errorMessage(error)}`,
      );
    }
  }

  /**
   * Check if a file is currently open on a compatible server.
   */
  function isFileOpen(filePath: string): boolean {
    const fileUri = pathToFileURL(resolve(filePath)).href;
    return openedFiles.has(fileUri);
  }

  // ── Diagnostics ────────────────────────────────────────────

  /**
   * Latest published diagnostics for a file, if any have arrived.
   */
  function getDiagnostics(filePath: string): FileDiagnostics | undefined {
    return fileDiagnostics.get(pathToFileURL(resolve(filePath)).href);
  }

  /**
   * Wait for a diagnostics publish newer than `since` for this file.
   * Servers publish asynchronously (and debounced) after didOpen/didChange.
   * After the first fresh publish, lingers `settleMs` and returns the latest
   * stored entry — tsserver sends syntax and semantic passes as separate
   * publishes, and resolving on the first one would miss type errors.
   * On timeout, falls back to whatever is stored (possibly stale) so the
   * caller can decide how to report it.
   */
  async function waitForDiagnostics(
    filePath: string,
    {
      since = 0,
      timeoutMs = 8_000,
      settleMs = 400,
    }: WaitForDiagnosticsOptions = {},
  ): Promise<FileDiagnostics | undefined> {
    const fileUri = pathToFileURL(resolve(filePath)).href;

    const stored = fileDiagnostics.get(fileUri);
    let fresh = stored && stored.receivedAt >= since ? stored : undefined;

    if (!fresh) {
      fresh = await new Promise<FileDiagnostics | undefined>(
        (resolvePromise) => {
          const waiter = (entry: FileDiagnostics) => {
            clearTimeout(timer);
            resolvePromise(entry);
          };
          const timer = setTimeout(() => {
            const waiters = diagnosticsWaiters.get(fileUri);
            if (waiters) {
              const remaining = waiters.filter((w) => w !== waiter);
              if (remaining.length > 0) diagnosticsWaiters.set(fileUri, remaining);
              else diagnosticsWaiters.delete(fileUri);
            }
            resolvePromise(undefined);
          }, timeoutMs);
          const waiters = diagnosticsWaiters.get(fileUri) ?? [];
          waiters.push(waiter);
          diagnosticsWaiters.set(fileUri, waiters);
        },
      );
    }

    if (!fresh) return fileDiagnostics.get(fileUri);

    if (settleMs > 0) {
      await new Promise((resolveSleep) => setTimeout(resolveSleep, settleMs));
    }
    return fileDiagnostics.get(fileUri) ?? fresh;
  }

  // ── Status & Shutdown ──────────────────────────────────────

  /**
   * Get health status of all configured servers.
   */
  function getHealth(): Record<string, string> {
    const health: Record<string, string> = {};
    for (const [name, server] of servers) {
      health[name] = server.state;
    }
    return health;
  }

  /**
   * Get all server instances.
   */
  function getAllServers(): Map<string, LspServerInstance> {
    return servers;
  }

  /**
   * Shutdown all running servers and clear state.
   */
  async function shutdown(): Promise<void> {
    const toStop = [...servers.entries()].filter(
      ([, s]) => s.state === "running" || s.state === "error",
    );

    const results = await Promise.allSettled(
      toStop.map(([, server]) => server.stop()),
    );

    const errors = results
      .map((r, i) =>
        r.status === "rejected"
          ? `${toStop[i][0]}: ${(r as PromiseRejectedResult).reason?.message}`
          : null,
      )
      .filter(Boolean);

    servers.clear();
    extensionMap.clear();
    openedFiles.clear();
    documentVersions.clear();
    fileDiagnostics.clear();
    diagnosticsWaiters.clear();
    initialized = false;

    if (errors.length > 0) {
      logger.error(`[LSP Manager] Shutdown errors: ${errors.join("; ")}`);
    } else {
      logger.info("[LSP Manager] All servers shut down");
    }
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    initialize,
    getServerForFile,
    ensureServerStarted,
    sendRequest,
    openFile,
    changeFile,
    closeFile,
    isFileOpen,
    getDiagnostics,
    waitForDiagnostics,
    getHealth,
    getAllServers,
    shutdown,
  };
}

// ── Module-level singleton ───────────────────────────────────
// Lazily created on first use. The workspace folder can be
// overridden per-request via AgenticLspService.

const managers = new Map<string, LspServerManager>();

/**
 * Get or create the LSP server manager for a workspace.
 */
export function getLspManager(workspaceFolder?: string): LspServerManager {
  const key = workspaceFolder || "__default__";

  if (!managers.has(key)) {
    const manager = createLspServerManager(workspaceFolder);
    manager.initialize();
    managers.set(key, manager);
  }

  return managers.get(key)!;
}

/**
 * Shutdown all managers (for graceful process exit).
 */
export async function shutdownAllLspManagers(): Promise<void> {
  const all = [...managers.values()];
  managers.clear();
  await Promise.allSettled(all.map((message) => message.shutdown()));
  logger.info("[LSP Manager] All managers shut down");
}

/**
 * Get health of all managers.
 */
export function getAllLspHealth(): Record<string, Record<string, string>> {
  const health: Record<string, Record<string, string>> = {};
  for (const [key, manager] of managers) {
    health[key] = manager.getHealth();
  }
  return health;
}
