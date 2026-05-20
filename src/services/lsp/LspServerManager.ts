// ─── Multi-Server Router ────────────────────────────────────

import { extname, resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { createLspServerInstance } from "./LspServerInstance.ts";
import { getLspServerConfigs } from "./LspConfig.ts";
import logger from "../../logger.ts";

/**
 * Creates an LSP server manager instance.
 */
export function createLspServerManager(workspaceFolder: any) {
  // ── Private state ──────────────────────────────────────────
  /** @type {Map<string, object>} name → LspServerInstance */
  const servers = new Map();

  /** @type {Map<string, string[]>} extension → server name[] */
  const extensionMap = new Map();

  /** @type {Map<string, string>} fileURI → server name (tracks open files) */
  const openedFiles = new Map();

  let initialized = false;

  // ── Initialization ─────────────────────────────────────────

  /**
   * Load all configured LSP servers and build extension routing map.
   * Does NOT start any servers — they start lazily on first request.
   */
  function initialize() {
    if (initialized) return;

    const configs = getLspServerConfigs(workspaceFolder);

    for (const [serverName, config] of Object.entries(configs)) {
      try {
        if (!config.command) {
          logger.warn(`[LSP Manager] Server '${serverName}' missing 'command' — skipping`);
          continue;
        }
        if (!config.extensionToLanguage || Object.keys(config.extensionToLanguage).length === 0) {
          logger.warn(`[LSP Manager] Server '${serverName}' missing 'extensionToLanguage' — skipping`);
          continue;
        }

        // Build extension → server mapping
        for (const ext of Object.keys(config.extensionToLanguage)) {
          const normalized = ext.toLowerCase();
          if (!extensionMap.has(normalized)) {
            extensionMap.set(normalized, []);
          }
          extensionMap.get(normalized).push(serverName);
        }

        // Create instance (not started yet)
        const instance = createLspServerInstance(serverName, config);

        // Handle workspace/configuration requests from servers that send them
        // even when we say we don't support it (TypeScript does this)
        instance.onRequest("workspace/configuration", (params: any) => {
          return (params?.items || []).map(() => null);
        });

        servers.set(serverName, instance);
      } catch (error: any) {
        logger.error(`[LSP Manager] Failed to create server '${serverName}': ${error.message}`);
      }
    }

    initialized = true;
    logger.info(`[LSP Manager] Initialized with ${servers.size} server(s): ${[...servers.keys()].join(", ")}`);
  }

  // ── Routing ────────────────────────────────────────────────

  /**
   * Get the server instance for a given file path based on extension.
   */
  function getServerForFile(filePath: any) {
    const ext = extname(filePath).toLowerCase();
    const serverNames = extensionMap.get(ext);
    if (!serverNames || serverNames.length === 0) return undefined;
    return servers.get(serverNames[0]);
  }

  /**
   * Ensure the appropriate server is started for a file.
   * Lazy-starts the server on first request for that language.
   */
  async function ensureServerStarted(filePath: any) {
    const server = getServerForFile(filePath);
    if (!server) return undefined;

    if (server.state === "stopped" || server.state === "error") {
      try {
        await server.start();
      } catch (error: any) {
        logger.error(`[LSP Manager] Failed to start server for ${basename(filePath)}: ${error.message}`);
        throw error;
      }
    }

    return server;
  }

  // ── Request forwarding ─────────────────────────────────────

  /**
   * Send an LSP request to the appropriate server for the given file.
   */
  async function sendRequest(filePath: any, method: any, params: any) {
    const server = await ensureServerStarted(filePath);
    if (!server) return undefined;

    try {
      return await server.sendRequest(method, params);
    } catch (error: any) {
      logger.error(`[LSP Manager] Request '${method}' failed for ${basename(filePath)}: ${error.message}`);
      throw error;
    }
  }

  // ── File synchronization ───────────────────────────────────

  /**
   * Open a file in the appropriate LSP server (sends didOpen).
   * Skips if already open on the same server.
   */
  async function openFile(filePath: any, content: any) {
    const server = await ensureServerStarted(filePath);
    if (!server) return;

    const fileUri = pathToFileURL(resolve(filePath)).href;

    // Skip if already open on this server
    if (openedFiles.get(fileUri) === server.name) return;

    const ext = extname(filePath).toLowerCase();
    const languageId = server.config.extensionToLanguage[ext] || "plaintext";

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
    } catch (error: any) {
      logger.error(`[LSP Manager] didOpen failed for ${basename(filePath)}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Notify the server of file content changes.
   */
  async function changeFile(filePath: any, content: any) {
    const server = getServerForFile(filePath);
    if (!server || server.state !== "running") {
      return openFile(filePath, content);
    }

    const fileUri = pathToFileURL(resolve(filePath)).href;

    // If not yet open, open it first (LSP requires didOpen before didChange)
    if (openedFiles.get(fileUri) !== server.name) {
      return openFile(filePath, content);
    }

    try {
      await server.sendNotification("textDocument/didChange", {
        textDocument: { uri: fileUri, version: 1 },
        contentChanges: [{ text: content }],
      });
    } catch (error: any) {
      logger.error(`[LSP Manager] didChange failed for ${basename(filePath)}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close a file in the LSP server (sends didClose).
   */
  async function closeFile(filePath: any) {
    const server = getServerForFile(filePath);
    if (!server || server.state !== "running") return;

    const fileUri = pathToFileURL(resolve(filePath)).href;

    try {
      await server.sendNotification("textDocument/didClose", {
        textDocument: { uri: fileUri },
      });
      openedFiles.delete(fileUri);
    } catch (error: any) {
      logger.error(`[LSP Manager] didClose failed for ${basename(filePath)}: ${error.message}`);
    }
  }

  /**
   * Check if a file is currently open on a compatible server.
   */
  function isFileOpen(filePath: any) {
    const fileUri = pathToFileURL(resolve(filePath)).href;
    return openedFiles.has(fileUri);
  }

  // ── Status & Shutdown ──────────────────────────────────────

  /**
   * Get health status of all configured servers.
   */
  function getHealth() {
    const health: Record<string, any> = {};
    for (const [name, server] of servers) {
      health[name] = server.state;
    }
    return health;
  }

  /**
   * Get all server instances.
   */
  function getAllServers() {
    return servers;
  }

  /**
   * Shutdown all running servers and clear state.
   */
  async function shutdown() {
    const toStop = [...servers.entries()].filter(
      ([, s]: any) => s.state === "running" || s.state === "error",
    );

    const results = await Promise.allSettled(
      toStop.map(([, server]: any) => server.stop()),
    );

    const errors = results
      .map((r: any, i: any) => r.status === "rejected" ? `${toStop[i][0]}: ${r.reason?.message}` : null)
      .filter(Boolean);

    servers.clear();
    extensionMap.clear();
    openedFiles.clear();
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
    getHealth,
    getAllServers,
    shutdown,
  };
}

// ── Module-level singleton ───────────────────────────────────
// Lazily created on first use. The workspace folder can be
// overridden per-request via AgenticLspService.

/** @type {Map<string, object>} workspaceFolder → manager */
const managers = new Map();

/**
 * Get or create the LSP server manager for a workspace.
 */
export function getLspManager(workspaceFolder: any) {
  const key = workspaceFolder || "__default__";

  if (!managers.has(key)) {
    const manager = createLspServerManager(workspaceFolder);
    manager.initialize();
    managers.set(key, manager);
  }

  return managers.get(key);
}

/**
 * Shutdown all managers (for graceful process exit).
 */
export async function shutdownAllLspManagers() {
  const all = [...managers.values()];
  managers.clear();
  await Promise.allSettled(all.map((m: any) => m.shutdown()));
  logger.info("[LSP Manager] All managers shut down");
}

/**
 * Get health of all managers.
 */
export function getAllLspHealth() {
  const health: Record<string, any> = {};
  for (const [key, manager] of managers) {
    health[key] = manager.getHealth();
  }
  return health;
}
