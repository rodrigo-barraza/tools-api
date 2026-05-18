// ─── Remote Workspace Agent Registry ────────────────────────

import { WebSocketServer } from "ws";
import crypto from "node:crypto";
import logger from "../logger.ts";
// NOTE: AgenticFileService imports from this module → circular dependency.
// We use dynamic import() in rebuildAllowedRootsFromAgents() to break the cycle.
import CONFIG from "../config.ts";
import {
  AGENT_RPC_TIMEOUT_FILE_MS as RPC_TIMEOUT_FILE_MS,
  AGENT_RPC_TIMEOUT_GIT_MS as RPC_TIMEOUT_GIT_MS,
  AGENT_RPC_TIMEOUT_COMMAND_MS as RPC_TIMEOUT_COMMAND_MS,
  AGENT_RPC_TIMEOUT_DEFAULT_MS as RPC_TIMEOUT_DEFAULT_MS,
  AGENT_HEALTH_CHECK_INTERVAL_MS as HEALTH_CHECK_INTERVAL_MS,
  AGENT_STALE_TIMEOUT_MS as STALE_AGENT_TIMEOUT_MS,
} from "../constants.ts";

// RPC method → timeout category
const TIMEOUT_MAP = {
  "file.read": RPC_TIMEOUT_FILE_MS,
  "file.write": RPC_TIMEOUT_FILE_MS,
  "file.strReplace": RPC_TIMEOUT_FILE_MS,
  "file.patch": RPC_TIMEOUT_FILE_MS,
  "file.info": RPC_TIMEOUT_FILE_MS,
  "file.diff": RPC_TIMEOUT_FILE_MS,
  "file.move": RPC_TIMEOUT_FILE_MS,
  "file.delete": RPC_TIMEOUT_FILE_MS,
  "file.readMulti": RPC_TIMEOUT_FILE_MS * 2,
  "directory.list": RPC_TIMEOUT_FILE_MS,
  "search.grep": RPC_TIMEOUT_FILE_MS * 3,
  "search.glob": RPC_TIMEOUT_FILE_MS * 2,
  "git.status": RPC_TIMEOUT_GIT_MS,
  "git.diff": RPC_TIMEOUT_GIT_MS,
  "git.log": RPC_TIMEOUT_GIT_MS,
  "command.run": RPC_TIMEOUT_COMMAND_MS,
  "command.stream": RPC_TIMEOUT_COMMAND_MS,
  "project.summary": RPC_TIMEOUT_FILE_MS * 3,
  "directory.create": RPC_TIMEOUT_FILE_MS,
  "watch.subscribe": RPC_TIMEOUT_FILE_MS,
  "watch.unsubscribe": RPC_TIMEOUT_FILE_MS,
};

// ────────────────────────────────────────────────────────────
// Agent Registry
// ────────────────────────────────────────────────────────────

/**
 * @typedef {object} AgentEntry
 * @property {string} id
 * @property {string} name
 * @property {string[]} roots
 * @property {string[]} capabilities
 * @property {string} version
 * @property {WebSocket} ws
 * @property {Date} connectedAt
 * @property {Date} lastPong
 * @property {Map<string, { resolve, reject, timer }>} pendingRpc
 */


const agents = new Map();

/** @type {Map<string, string>} rootPath → agentId (for fast routing) */
const rootToAgent = new Map();

let healthCheckTimer: any = null;

// ────────────────────────────────────────────────────────────
// WebSocket Server Setup
// ────────────────────────────────────────────────────────────

/**
 * Initialize the agent WebSocket server on an existing HTTP server.
 * Handles upgrade requests on /ws/agent path.
 *

 */
export function initAgentWebSocket(httpServer: any) {
  const wss = new WebSocketServer({ noServer: true });
  const clientWss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req: any, socket: any, head: any) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Auth check (shared across both endpoints)
    const secret = req.headers["x-api-secret"];
    const expectedSecret = CONFIG.AGENT_SECRET || CONFIG.API_SECRET;

    if (expectedSecret && secret !== expectedSecret) {
      logger.warn(`[AgentWS] Rejected connection — invalid secret`);
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    // Agent connections (workspace-service sidecar → tools-service)
    if (url.pathname === "/ws/agent") {
      wss.handleUpgrade(req, socket, head, (ws: any) => {
        wss.emit("connection", ws, req);
      });
      return;
    }

    // Client connections (VS Code extension → tools-service → agent)
    if (url.pathname === "/ws/workspace") {
      clientWss.handleUpgrade(req, socket, head, (ws: any) => {
        clientWss.emit("connection", ws, req);
      });
      return;
    }
  });

  // ── Agent WebSocket (workspace-service sidecar) ──────────

  wss.on("connection", (ws: any, req: any) => {
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress?.replace(/^::ffff:/, "");

    logger.info(`[AgentWS] New connection from ${clientIp}`);

    (ws as any).isAlive = true;
    ws.on("pong", () => { (ws as any).isAlive = true; });

    ws.on("message", (raw: any) => {
      try {
        const message = JSON.parse(raw.toString());
        handleAgentMessage(ws, message, clientIp);
      } catch (error: any) {
        logger.error(`[AgentWS] Invalid message: ${error.message}`);
      }
    });

    ws.on("close", () => {
      for (const [agentId, agent] of agents) {
        if (agent.ws === ws) {
          deregisterAgent(agentId, "disconnected");
          break;
        }
      }
    });

    ws.on("error", (error: any) => {
      logger.error(`[AgentWS] Connection error: ${error.message}`);
    });
  });

  // ── Client WebSocket (VS Code extension proxy) ──────────

  clientWss.on("connection", (ws: any, req: any) => {
    const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress?.replace(/^::ffff:/, "");

    logger.info(`[ClientWS] New client connection from ${clientIp}`);

    (ws as any).isAlive = true;
    ws.on("pong", () => { (ws as any).isAlive = true; });

    ws.on("message", async (raw: any) => {
      try {
        const message = JSON.parse(raw.toString());

        // Only handle RPC requests (has id + method)
        if (!message.id || !message.method) return;

        // Meta-methods (no path routing needed)
        if (message.method === "agents.list") {
          sendJson(ws, { jsonrpc: "2.0", id: message.id, result: getConnectedAgents() });
          return;
        }

        // Extract the target path from params
        const targetPath = message.params?.path ||
          message.params?.paths ||
          message.params?.searchPath ||
          message.params?.source ||
          message.params?.pathA ||
          message.params?.cwd;

        // Resolve target path to a string for routing
        const routePath = Array.isArray(targetPath) ? targetPath[0] : targetPath;

        if (!routePath) {
          sendJson(ws, { jsonrpc: "2.0", id: message.id, error: { code: -32602, message: "No routable path found in params" } });
          return;
        }

        // Find the agent that serves this path
        const route = routeForPath(routePath);
        if (!route) {
          sendJson(ws, { jsonrpc: "2.0", id: message.id, error: { code: -32001, message: `No agent found for path: ${routePath}` } });
          return;
        }

        // Proxy the RPC to the agent
        try {
          const result = await sendRpc(route.id, message.method, message.params);
          sendJson(ws, { jsonrpc: "2.0", id: message.id, result });
        } catch (error: any) {
          sendJson(ws, { jsonrpc: "2.0", id: message.id, error: { code: -32000, message: error.message } });
        }
      } catch (error: any) {
        logger.error(`[ClientWS] Invalid message: ${error.message}`);
      }
    });

    ws.on("close", () => {
      logger.info(`[ClientWS] Client disconnected (${clientIp})`);
    });

    ws.on("error", (error: any) => {
      logger.error(`[ClientWS] Connection error: ${error.message}`);
    });
  });

  // Start health check interval
  startHealthCheck(wss);

  logger.info(`[AgentWS] Agent WebSocket initialized on /ws/agent`);
  logger.info(`[ClientWS] Client WebSocket initialized on /ws/workspace`);
}

// ────────────────────────────────────────────────────────────
// Message Handling
// ────────────────────────────────────────────────────────────

function handleAgentMessage(ws: any, message: any, clientIp: any) {
  // Registration
  if (message.method === "agent.register") {
    const { agentId, name, roots, capabilities, version } = message.params || {};

    if (!agentId || !Array.isArray(roots) || roots.length === 0) {
      sendJson(ws, { jsonrpc: "2.0", method: "agent.error", params: { error: "Invalid registration: agentId and roots required" } });
      return;
    }

    // Check max connections
    const maxConnections = parseInt(CONFIG.AGENT_MAX_CONNECTIONS || "5", 10);
    if (agents.size >= maxConnections) {
      sendJson(ws, { jsonrpc: "2.0", method: "agent.error", params: { error: `Max agent connections reached (${maxConnections})` } });
      ws.close(1008, "Max connections reached");
      return;
    }

    // Register
    const entry = {
      id: agentId,
      name: name || `agent-${agentId.slice(0, 8)}`,
      roots: [...roots],
      capabilities: capabilities || [],
      version: version || "unknown",
      ws,
      clientIp,
      connectedAt: new Date(),
      lastPong: new Date(),
      pendingRpc: new Map(),
    };

    agents.set(agentId, entry);

    // Map roots to this agent
    for (const root of roots) {
      rootToAgent.set(root, agentId);
    }

    // Merge agent roots into ALLOWED_ROOTS so they appear in the workspace list
    rebuildAllowedRootsFromAgents();

    logger.success(`[AgentWS] Agent registered: "${entry.name}" (${agentId.slice(0, 8)}) — roots: ${roots.join(", ")}`);

    // Confirm registration
    sendJson(ws, { jsonrpc: "2.0", method: "agent.registered", params: { agentId } });
    return;
  }

  // Deregistration
  if (message.method === "agent.deregister") {
    const { agentId } = message.params || {};
    if (agentId && agents.has(agentId)) {
      deregisterAgent(agentId, "graceful");
    }
    return;
  }

  // Pong (application-level)
  if (message.method === "agent.pong") {
    const { agentId } = message.params || {};
    if (agentId && agents.has(agentId)) {
      agents.get(agentId).lastPong = new Date();
    }
    return;
  }

  // RPC response — resolve pending request
  if (message.id && (message.result !== undefined || message.error)) {
    for (const [, agent] of agents) {
      if (agent.ws === ws && agent.pendingRpc.has(message.id)) {
        const pending = agent.pendingRpc.get(message.id);
        agent.pendingRpc.delete(message.id);
        clearTimeout(pending.timer);

        if (message.error) {
          pending.reject(new Error(message.error.message || "RPC error"));
        } else {
          pending.resolve(message.result);
        }
        return;
      }
    }
    return;
  }

  // Streaming notification from agent (command.stdout, command.stderr)
  if (message.method && !message.id) {
    // These are forwarded to the appropriate SSE response
    // by the caller who set up the streaming RPC
    for (const [, agent] of agents) {
      if (agent.ws === ws && agent._streamCallback) {
        agent._streamCallback(message.method, message.params);
      }
    }
    return;
  }
}

// ────────────────────────────────────────────────────────────
// Agent Lifecycle
// ────────────────────────────────────────────────────────────

function deregisterAgent(agentId: any, reason: any) {
  const agent = agents.get(agentId);
  if (!agent) return;

  // Clear root mappings
  for (const root of agent.roots) {
    if (rootToAgent.get(root) === agentId) {
      rootToAgent.delete(root);
    }
  }

  // Reject all pending RPCs
  for (const [, pending] of agent.pendingRpc) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Agent disconnected"));
  }

  agents.delete(agentId);

  // Rebuild ALLOWED_ROOTS without the disconnected agent's roots
  rebuildAllowedRootsFromAgents();

  logger.info(`[AgentWS] Agent deregistered: "${agent.name}" (${reason})`);
}

// ────────────────────────────────────────────────────────────
// RPC — Send request to agent, get response
// ────────────────────────────────────────────────────────────

/**
 * Send an RPC request to an agent and wait for the response.
 *


 * @returns {Promise<object>} Result from the agent
 */
export function sendRpc(agentId: string, method: string, params: Record<string, any> = {}): Promise<any> {
  return new Promise<any>((resolve: any, reject: any) => {
    const agent = agents.get(agentId);
    if (!agent) {
      reject(new Error("Agent not found"));
      return;
    }

    if (agent.ws.readyState !== 1 /* OPEN */) {
      reject(new Error("Agent WebSocket not open"));
      return;
    }

    const id = crypto.randomUUID();
    // @ts-expect-error - TS7053: implicit any index
    const timeout = TIMEOUT_MAP[method] || RPC_TIMEOUT_DEFAULT_MS;

    const timer = setTimeout(() => {
      agent.pendingRpc.delete(id);
      reject(new Error(`RPC timeout (${method}, ${timeout}ms)`));
    }, timeout);

    agent.pendingRpc.set(id, { resolve, reject, timer });

    sendJson(agent.ws, {
      jsonrpc: "2.0",
      id,
      method,
      params,
    });
  });
}

/**
 * Send an RPC request to an agent with a streaming callback for notifications.
 * Used for command.stream where stdout/stderr arrive as notifications.
 *


 */
export function sendRpcStreaming(agentId: any, method: any, params: Record<string, any> = {}, onNotification: any) {
  const agent = agents.get(agentId);
  if (!agent) return Promise.reject(new Error("Agent not found"));

  // Set up streaming callback
  agent._streamCallback = onNotification;

  return sendRpc(agentId, method, params).finally(() => {
    agent._streamCallback = null;
  });
}

// ────────────────────────────────────────────────────────────
// Routing — Find agent for a given path
// ────────────────────────────────────────────────────────────

/**
 * Find the agent that serves a given file system path.
 * Returns null if the path should be handled locally.
 *

 * @returns {{ id: string, name: string, roots: string[] } | null}
 */
export function routeForPath(absolutePath: any) {
  if (!absolutePath) return null;

  // Check each registered root
  for (const [root, agentId] of rootToAgent) {
    if (absolutePath.startsWith(root + "/") || absolutePath === root) {
      const agent = agents.get(agentId);
      if (agent && agent.ws.readyState === 1) {
        return { id: agent.id, name: agent.name, roots: agent.roots };
      }
    }
  }

  return null;
}

// ────────────────────────────────────────────────────────────
// Status / Health
// ────────────────────────────────────────────────────────────

/**
 * Get the list of connected agents with metadata.

 */
export function getConnectedAgents() {
  return [...agents.values()].map((a: any) => ({
    id: a.id,
    name: a.name,
    roots: a.roots,
    capabilities: a.capabilities,
    version: a.version,
    clientIp: a.clientIp,
    connectedAt: a.connectedAt.toISOString(),
    lastPong: a.lastPong.toISOString(),
    pendingRpcs: a.pendingRpc.size,
  }));
}

/**
 * Check if a specific path is served by a connected agent.


 */
export function isAgentPath(path: any) {
  return routeForPath(path) !== null;
}

/**
 * Get agent info for a root path (for workspace metadata).

 * @returns {{ agentName: string, agentId: string } | null}
 */
export function getAgentInfoForRoot(rootPath: any) {
  const agentId = rootToAgent.get(rootPath);
  if (!agentId) return null;

  const agent = agents.get(agentId);
  if (!agent || agent.ws.readyState !== 1) return null;

  return { agentName: agent.name, agentId: agent.id };
}

// ────────────────────────────────────────────────────────────
// Health Check
// ────────────────────────────────────────────────────────────

function startHealthCheck(wss: any) {
  if (healthCheckTimer) clearInterval(healthCheckTimer);

  healthCheckTimer = setInterval(() => {
    for (const [agentId, agent] of agents) {
      // Check for stale agents
      const timeSincePong = Date.now() - agent.lastPong.getTime();
      if (timeSincePong > STALE_AGENT_TIMEOUT_MS) {
        logger.warn(`[AgentWS] Agent "${agent.name}" stale (${(timeSincePong / 1000).toFixed(0)}s since last pong) — disconnecting`);
        agent.ws.terminate();
        deregisterAgent(agentId, "stale");
        continue;
      }

      // Send application-level ping
      if (agent.ws.readyState === 1) {
        sendJson(agent.ws, { jsonrpc: "2.0", method: "agent.ping", params: {} });
      }
    }

    // WebSocket-level ping for all connections
    wss.clients.forEach((ws: any) => {
      if (!(ws as any).isAlive) {
        ws.terminate();
        return;
      }
      (ws as any).isAlive = false;
      ws.ping();
    });
  }, HEALTH_CHECK_INTERVAL_MS);
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function sendJson(ws: any, object: any) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(object));
  }
}

/**
 * Rebuild ALLOWED_ROOTS by collecting all connected agent roots and merging
 * them as extra roots alongside the static + user-configured roots.
 * Uses refreshAllowedRoots() which preserves static roots and de-dups.
 *
 * Uses dynamic import() to avoid circular dependency with AgenticFileService
 * (which imports routeForPath/sendRpc from this module).
 */
async function rebuildAllowedRootsFromAgents() {
  try {
    const { ALLOWED_ROOTS, refreshAllowedRoots, getStaticRoots } = await import("./AgenticFileService.ts");

    // Collect all agent roots
    const agentRoots: any[] = [];
    for (const [, agent] of agents) {
      for (const root of agent.roots) {
        if (!agentRoots.includes(root)) {
          agentRoots.push(root);
        }
      }
    }

    // refreshAllowedRoots merges: STATIC_ROOTS + extraRoots (de-duped)
    // We need to also preserve any user-configured roots from MongoDB.
    // Since ALLOWED_ROOTS may contain user roots not in agents or static,
    // collect the non-static, non-agent roots to preserve them.
    const staticRoots = getStaticRoots();
    const staticSet = new Set(staticRoots);
    const agentSet = new Set(agentRoots);
    const userRoots = ALLOWED_ROOTS.filter((r: any) => !staticSet.has(r) && !agentSet.has(r));

    refreshAllowedRoots([...userRoots, ...agentRoots]);
  } catch (error: any) {
    logger.warn(`[AgentWS] Failed to rebuild allowed roots: ${error.message}`);
  }
}

// Default export for convenience
export default {
  initAgentWebSocket,
  sendRpc,
  sendRpcStreaming,
  routeForPath,
  isAgentPath,
  getConnectedAgents,
  getAgentInfoForRoot,
};
