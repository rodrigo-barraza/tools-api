import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam } from "@rodrigo-barraza/utilities-library";
// ─── File System & Web Interaction Endpoints ────────────────
import { Router } from "express";
import CONFIG from "../config.js";
import logger from "../logger.js";
import { agenticHandler } from "../utilities.js";
import { createReadStream } from "node:fs";
import { stat as fsStat } from "node:fs/promises";
import { extname } from "node:path";
import {
  agenticReadFile,
  agenticWriteFile,
  agenticStrReplace,
  agenticPatchFile,
  agenticListDirectory,
  agenticGrepSearch,
  agenticGlobFiles,
  agenticMultiFileRead,
  agenticFileInfo,
  agenticFileDiff,
  agenticMoveFile,
  agenticDeleteFile,
  validatePath,
} from "../services/AgenticFileService.js";
import {
  agenticFetchUrl,
  agenticWebSearch,
} from "../services/AgenticWebService.js";
import {
  executeCommand,
  executeCommandStreaming,
  getAllowedCommands,
  listBackgroundProcesses,
  getBackgroundProcess,
  killProcessTree,
} from "../services/AgenticCommandService.js";
import {
  agenticGitStatus,
  agenticGitDiff,
  agenticGitLog,
  agenticGitWorktreeCreate,
  agenticGitWorktreeRemove,
  agenticGitWorktreeMerge,
  agenticGitWorktreeDiff,
  agenticGitWorktreeCleanup,
} from "../services/AgenticGitService.js";
import { agenticProjectSummary } from "../services/AgenticProjectService.js";
import {
  agenticBrowserAction,
  getBrowserHealth,
} from "../services/AgenticBrowserService.js";
import {
  agenticLspAction,
  agenticLspShutdown,
  agenticLspHealth,
} from "../services/AgenticLspService.js";
import {
  testTool,
  testAllTools,
  getTestableTools,
} from "../services/AgenticToolTestService.js";
import {
  agenticTaskCreate,
  agenticTaskList,
  agenticTaskGet,
  agenticTaskUpdate,
  agenticTaskDelete,
} from "../services/AgenticTaskService.js";
import { agenticToolSearch } from "../services/AgenticToolSearchService.js";
import * as BackgroundProcessRegistry from "../services/BackgroundProcessRegistry.js";
import {
  agenticScheduleCreate,
  agenticScheduleList,
  agenticScheduleDelete,
  agenticTriggerFire,
} from "../services/AgenticSchedulerService.js";
import { agenticNotebookEdit } from "../services/AgenticNotebookService.js";
import { TOOL_DEFINITIONS } from "../services/ToolSchemaService.js";
const router = Router();
// ─── 1. File Operations ─────────────────────────────────────
// ── Read File ─────────────────────────────────────────────────
router.post("/file/read", agenticHandler(async (req) => {
  const { path, startLine, endLine } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string)" };
  }
  return agenticReadFile(path, {
    startLine: startLine ? parseInt(startLine, 10) : undefined,
    endLine: endLine ? parseInt(endLine, 10) : undefined,
  });
}));

// ── Raw File Stream (binary files: images, audio, video) ──────
// Serves file content directly with correct Content-Type.
// Used by the FileViewerPanelComponent for media preview.
const EXT_TO_MIME = {
  // Images
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
  ".ico": "image/x-icon", ".svg": "image/svg+xml", ".avif": "image/avif",
  ".tiff": "image/tiff", ".tif": "image/tiff",
  // Audio
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".flac": "audio/flac", ".aac": "audio/aac", ".m4a": "audio/mp4",
  ".wma": "audio/x-ms-wma", ".webm": "audio/webm", ".opus": "audio/opus",
  // Video
  ".mp4": "video/mp4", ".avi": "video/x-msvideo", ".mov": "video/quicktime",
  ".mkv": "video/x-matroska", ".wmv": "video/x-ms-wmv", ".flv": "video/x-flv",
  ".ts": "video/mp2t",
  // PDF
  ".pdf": "application/pdf",
};

router.get("/file/raw", asyncHandler(async (req, res) => {
  const filePath = req.query.path;
  if (!filePath || typeof filePath !== "string") {
    return res.status(400).json({ error: "Query param 'path' is required" });
  }

  const validation = validatePath(filePath);
  if (!validation.safe) {
    return res.status(403).json({ error: validation.error });
  }

  const resolved = validation.resolved;
  const ext = extname(resolved).toLowerCase();
  const mime = EXT_TO_MIME[ext];
  if (!mime) {
    return res.status(415).json({ error: `Unsupported file type: ${ext}` });
  }

  try {
    const stats = await fsStat(resolved);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: "Path is a directory, not a file" });
    }

    // Set appropriate headers for media streaming
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", stats.size);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=60");

    // Support HTTP Range requests for video/audio seeking
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stats.size}`);
      res.setHeader("Content-Length", chunkSize);

      createReadStream(resolved, { start, end }).pipe(res);
    } else {
      createReadStream(resolved).pipe(res);
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: `File not found: ${resolved}` });
    }
    logger.error(`[file/raw] Stream failed: ${err.message}`);
    res.status(500).json({ error: `Failed to stream file: ${err.message}` });
  }
}));

// ── Write File ────────────────────────────────────────────────
router.post("/file/write", agenticHandler(async (req) => {
  const { path, content, createDirs } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string)" };
  }
  if (typeof content !== "string") {
    return { error: "Request body must include 'content' (string)" };
  }
  return agenticWriteFile(path, content, {
    createDirs: createDirs !== false,
  });
}));
// ── String Replace ────────────────────────────────────────────
router.post("/file/str-replace", agenticHandler(async (req) => {
  const { path, oldStr, newStr, allowMultiple } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string)" };
  }
  if (!oldStr || typeof oldStr !== "string") {
    return { error: "Request body must include 'oldStr' (non-empty string)" };
  }
  if (typeof newStr !== "string") {
    return { error: "Request body must include 'newStr' (string)" };
  }
  return agenticStrReplace(path, oldStr, newStr, {
    allowMultiple: allowMultiple === true,
  });
}));
// ── Patch File (unified diff) ─────────────────────────────────
router.post("/file/patch", agenticHandler(async (req) => {
  const { path, patch } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string)" };
  }
  if (!patch || typeof patch !== "string") {
    return { error: "Request body must include 'patch' (unified diff string)" };
  }
  return agenticPatchFile(path, patch);
}));
// ─── 2. Directory Operations ────────────────────────────────
router.post("/directory/list", agenticHandler(async (req) => {
  const { path, recursive, maxDepth } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string)" };
  }
  return agenticListDirectory(path, {
    recursive: recursive === true,
    maxDepth: maxDepth ? Math.min(parseInt(maxDepth, 10), 5) : 3,
  });
}));
// ─── 3. Search Operations ───────────────────────────────────
// ── Grep Search ───────────────────────────────────────────────
router.post("/search/grep", agenticHandler(async (req) => {
  const { pattern, searchPath, isRegex, includes, caseInsensitive, matchPerLine } = req.body;
  if (!pattern || typeof pattern !== "string") {
    return { error: "Request body must include 'pattern' (string)" };
  }
  if (!searchPath || typeof searchPath !== "string") {
    return { error: "Request body must include 'searchPath' (string)" };
  }
  return agenticGrepSearch(pattern, searchPath, {
    isRegex: isRegex === true,
    includes: Array.isArray(includes) ? includes : [],
    caseInsensitive: caseInsensitive === true,
    matchPerLine: matchPerLine !== false,
  });
}));
// ── Glob Files ────────────────────────────────────────────────
router.post("/search/glob", agenticHandler(async (req) => {
  const { pattern, searchPath } = req.body;
  if (!pattern || typeof pattern !== "string") {
    return { error: "Request body must include 'pattern' (string)" };
  }
  if (!searchPath || typeof searchPath !== "string") {
    return { error: "Request body must include 'searchPath' (string)" };
  }
  return agenticGlobFiles(pattern, searchPath);
}));
// ─── 4. Web Operations ──────────────────────────────────────
// ── Fetch URL ─────────────────────────────────────────────────
router.post("/web/fetch", agenticHandler(async (req) => {
  const { url, selector } = req.body;
  if (!url || typeof url !== "string") {
    return { error: "Request body must include 'url' (string)" };
  }
  return agenticFetchUrl(url, { selector });
}));
// ── Web Search ────────────────────────────────────────────────
router.post("/web/search", agenticHandler(async (req) => {
  const { query, limit, dateRestrict, siteSearch } = req.body;
  if (!query || typeof query !== "string") {
    return { error: "Request body must include 'query' (string)" };
  }
  return agenticWebSearch(query, {
    limit: parseIntParam(limit, 5, 10),
    dateRestrict,
    siteSearch,
  });
}));
// ─── 5. Extended File Operations ────────────────────────────
// ── Multi-File Read ───────────────────────────────────────────
router.post("/file/read-multi", agenticHandler(async (req) => {
  const { files } = req.body;
  if (!Array.isArray(files) || files.length === 0) {
    return { error: "Request body must include 'files' (array of { path, startLine?, endLine? })" };
  }
  return agenticMultiFileRead(files);
}));
// ── File Info ─────────────────────────────────────────────────
router.post("/file/info", agenticHandler(async (req) => {
  const { paths, path } = req.body;
  const targetPaths = paths || (path ? [path] : null);
  if (!targetPaths) {
    return { error: "Request body must include 'path' (string) or 'paths' (array of strings)" };
  }
  return agenticFileInfo(targetPaths.length === 1 ? targetPaths[0] : targetPaths);
}));
// ── File Diff ─────────────────────────────────────────────────
router.post("/file/diff", agenticHandler(async (req) => {
  const { pathA, pathB, content, contextLines } = req.body;
  if (!pathA || typeof pathA !== "string") {
    return { error: "Request body must include 'pathA' (string)" };
  }
  if (!pathB && content === undefined) {
    return { error: "Request body must include either 'pathB' (string) or 'content' (string)" };
  }
  return agenticFileDiff(pathA, { pathB, content, contextLines });
}));
// ── Move File ─────────────────────────────────────────────────
router.post("/file/move", agenticHandler(async (req) => {
  const { source, destination, createDirs } = req.body;
  if (!source || typeof source !== "string") {
    return { error: "Request body must include 'source' (string)" };
  }
  if (!destination || typeof destination !== "string") {
    return { error: "Request body must include 'destination' (string)" };
  }
  return agenticMoveFile(source, destination, { createDirs: createDirs !== false });
}));
// ── Delete File ───────────────────────────────────────────────
router.post("/file/delete", agenticHandler(async (req) => {
  const { path } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string)" };
  }
  return agenticDeleteFile(path);
}));
// ─── 6. Command Execution ───────────────────────────────────
router.post("/command/run", asyncHandler(async (req, res) => {
  const { command, cwd, timeout, run_in_background } = req.body;
  if (!command || typeof command !== "string") {
    return res.status(400).json({ error: "Request body must include 'command' (string)" });
  }
  // Create an AbortController so we can kill the child process if the
  // upstream client disconnects (e.g. user pressed Stop in the UI).
  const ac = new AbortController();
  req.on("close", () => ac.abort());
  const result = await executeCommand(command, {
    cwd: cwd || undefined,
    timeout: timeout ? Math.min(parseInt(timeout, 10), 120_000) : undefined,
    signal: ac.signal,
    runInBackground: run_in_background === true,
  });
  // Guard: response may already be closed if the client disconnected
  if (res.headersSent || res.writableEnded) return;
  if (result.error && !result.stdout && !result.stderr) {
    return res.status(400).json(result);
  }
  res.json(result);
}));
router.post("/command/stream", asyncHandler(async (req, res) => {
  const { command, cwd, timeout } = req.body;
  if (!command || typeof command !== "string") {
    return res.status(400).json({ error: "Request body must include 'command' (string)" });
  }
  const { setupStreamingSSE } = await import("@rodrigo-barraza/utilities-library/express");
  const send = setupStreamingSSE(res);
  send({ event: "start", command });
  // Create an AbortController so we can kill the child process if the
  // upstream client disconnects (e.g. user pressed Stop in the UI).
  const ac = new AbortController();
  req.on("close", () => ac.abort());
  const result = await executeCommandStreaming(command, {
    cwd: cwd || undefined,
    timeout: timeout ? Math.min(parseInt(timeout, 10), 120_000) : undefined,
    onChunk: (event, data) => send({ event, data }),
    signal: ac.signal,
  });
  // Guard: response may already be closed if the client disconnected
  if (!res.writableEnded) {
    send({ event: "exit", exitCode: result.exitCode, executionTimeMs: result.executionTimeMs, success: result.success, timedOut: result.timedOut, aborted: result.aborted || undefined, error: result.error || undefined });
    res.end();
  }
}));
router.get("/command/allowed", (_req, res) => {
  res.json({ commands: getAllowedCommands() });
});
// ── Kill Process ───────────────────────────────────────────
router.post("/command/kill", asyncHandler(async (req, res) => {
  const { pid } = req.body;
  if (!pid || typeof pid !== "number") {
    return res.status(400).json({ error: "Request body must include 'pid' (positive integer)" });
  }
  const result = await killProcessTree(pid);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
}));
// ── Background Process Management ─────────────────────────
router.get("/command/background/list", (_req, res) => {
  res.json({ processes: listBackgroundProcesses() });
});
router.get("/command/background/:pid", (req, res) => {
  const pid = parseInt(req.params.pid, 10);
  if (isNaN(pid)) return res.status(400).json({ error: "Invalid PID" });
  const proc = getBackgroundProcess(pid);
  if (!proc) return res.status(404).json({ error: `PID ${pid} not found in background registry` });
  res.json(proc);
});
// ─── 7. Git Operations ──────────────────────────────────────
router.post("/git/status", agenticHandler(async (req) => {
  const { path } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string) — path to a directory inside a git repo" };
  }
  return agenticGitStatus(path);
}));
router.post("/git/diff", agenticHandler(async (req) => {
  const { path, staged, file, ref } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string)" };
  }
  return agenticGitDiff(path, { staged, path: file, ref });
}));
router.post("/git/log", agenticHandler(async (req) => {
  const { path, limit, author, since, file } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string)" };
  }
  return agenticGitLog(path, { limit, author, since, path: file });
}));
// ── Git Worktree (Coordinator Mode) ───────────────────────────
router.post("/git/worktree/create", agenticHandler(async (req) => {
  const { path, branch } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string) — path to the main git repo" };
  }
  if (!branch || typeof branch !== "string") {
    return { error: "Request body must include 'branch' (string) — name for the new worktree branch" };
  }
  return agenticGitWorktreeCreate(path, branch);
}));
router.post("/git/worktree/remove", agenticHandler(async (req) => {
  const { path, worktreePath, deleteBranch } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string) — path to the main git repo" };
  }
  if (!worktreePath || typeof worktreePath !== "string") {
    return { error: "Request body must include 'worktreePath' (string) — path to the worktree to remove" };
  }
  return agenticGitWorktreeRemove(path, worktreePath, { deleteBranch: deleteBranch !== false });
}));
router.post("/git/worktree/merge", agenticHandler(async (req) => {
  const { path, branch, message } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string) — path to the main git repo" };
  }
  if (!branch || typeof branch !== "string") {
    return { error: "Request body must include 'branch' (string) — branch to merge" };
  }
  return agenticGitWorktreeMerge(path, branch, { message });
}));
router.post("/git/worktree/diff", agenticHandler(async (req) => {
  const { path, branch } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string) — path to the main git repo" };
  }
  if (!branch || typeof branch !== "string") {
    return { error: "Request body must include 'branch' (string) — branch to diff against" };
  }
  return agenticGitWorktreeDiff(path, branch);
}));
router.post("/git/worktree/cleanup", agenticHandler(async (req) => {
  const { path } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string) — path to the main git repo" };
  }
  return agenticGitWorktreeCleanup(path);
}));
// ─── 8. Project Intelligence ────────────────────────────────
router.post("/project/summary", agenticHandler(async (req) => {
  const { path } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string) — the project root directory" };
  }
  return agenticProjectSummary(path);
}));
// ─── 9. Browser Automation ──────────────────────────────────
router.post("/browser/action", agenticHandler(async (req) => {
  const { action } = req.body;
  if (!action || typeof action !== "string") {
    return { error: "Request body must include 'action' (string)" };
  }
  return agenticBrowserAction(req.body);
}));
// ── Browser Script Execution ──────────────────────────────────
router.post("/browser/script", agenticHandler(async (req) => {
  const { script, sessionId, timeout } = req.body;
  if (!script || typeof script !== "string") {
    return { error: "Request body must include 'script' (string)" };
  }
  return agenticBrowserAction({
    action: "run_script",
    sessionId,
    script,
    timeout,
  });
}));
// ─── 10. LSP Code Intelligence ──────────────────────────────
// ── LSP Action ────────────────────────────────────────────────
router.post("/lsp/action", agenticHandler(async (req) => {
  const { operation, filePath, line, character, workspacePath } = req.body;
  if (!operation || typeof operation !== "string") {
    return { error: "Request body must include 'operation' (string)" };
  }
  if (!filePath || typeof filePath !== "string") {
    return { error: "Request body must include 'filePath' (string)" };
  }
  return agenticLspAction({
    operation,
    filePath,
    line: line != null ? parseInt(line, 10) : undefined,
    character: character != null ? parseInt(character, 10) : undefined,
    workspacePath,
  });
}));
// ── LSP Health ────────────────────────────────────────────────
router.get("/lsp/health", (_req, res) => {
  res.json(agenticLspHealth());
});
// ── LSP Shutdown ──────────────────────────────────────────────
router.post("/lsp/shutdown", asyncHandler(async (_req, res) => {
  try {
    await agenticLspShutdown();
    res.json({ success: true, message: "All LSP servers shut down" });
  } catch (error) {
    logger.error(`LSP shutdown failed: ${error.message}`);
    res.status(500).json({ error: "LSP shutdown failed" });
  }
}));
// ─── Health ─────────────────────────────────────────────────
export function getAgenticHealth() {
  return {
    readFile: "on-demand (sandboxed fs)",
    writeFile: "on-demand (sandboxed fs)",
    strReplace: "on-demand (sandboxed fs)",
    patchFile: "on-demand (sandboxed fs + diff)",
    listDirectory: "on-demand (sandboxed fs)",
    grepSearch: "on-demand (sandboxed fs)",
    globFiles: "on-demand (sandboxed fs)",
    fetchUrl: "on-demand (cheerio HTML→markdown)",
    webSearch: "brave (primary) + google_cse (fallback)",
    multiFileRead: "on-demand (batched sandboxed fs)",
    fileInfo: "on-demand (sandboxed fs stat)",
    fileDiff: "on-demand (sandboxed fs + diff)",
    moveFile: "on-demand (sandboxed fs)",
    deleteFile: "on-demand (sandboxed fs)",
    runCommand: "on-demand (sandboxed subprocess)",
    backgroundProcesses: BackgroundProcessRegistry.activeCount(),
    gitStatus: "on-demand (git subprocess)",
    gitDiff: "on-demand (git subprocess)",
    gitLog: "on-demand (git subprocess)",
    gitWorktreeCreate: "on-demand (git worktree)",
    gitWorktreeRemove: "on-demand (git worktree)",
    gitWorktreeMerge: "on-demand (git merge)",
    gitWorktreeDiff: "on-demand (git diff)",
    gitWorktreeCleanup: "on-demand (git prune)",
    projectSummary: "on-demand (fs scan)",
    browserAction: getBrowserHealth(),
    browserScript: "on-demand (Playwright subprocess)",
    lspAction: "on-demand (LSP stdio JSON-RPC)",
    lspServers: agenticLspHealth(),
    taskManagement: "on-demand (MongoDB agent_tasks)",
    memoryUpsert: "on-demand (Prism MemoryService post-processing)",
    customAgentCreate: "on-demand (Prism CustomAgentService)",
    customAgentList: "on-demand (Prism CustomAgentService)",
    customToolCreate: "on-demand (Prism custom_tools collection)",
    customToolList: "on-demand (Prism custom_tools collection)",
    customToolUpdate: "on-demand (Prism custom_tools collection)",
    customToolDelete: "on-demand (Prism custom_tools collection)",
    toolSearch: "on-demand (ToolSchemaService keyword search)",
    scheduling: "on-demand (MongoDB agent_schedules + 60s poller)",
    notebookEdit: "on-demand (sandboxed ipynb JSON editing)",
  };
}
// ── Unified Git Dispatcher ─────────────────────────────────────────
router.post("/git", asyncHandler(async (req, res) => {
  const { action, ...params } = req.body;
  if (!action) return res.status(400).json({ error: "'action' is required", actions: ["status", "diff", "log"] });
  const pathMap = { status: "/git/status", diff: "/git/diff", log: "/git/log" };
  if (!pathMap[action]) return res.status(400).json({ error: `Unknown action: ${action}`, actions: Object.keys(pathMap) });
  req.url = pathMap[action];
  req.body = params;
  return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
}));
// ─── 12. Task Management ────────────────────────────────────
// ── Create Task ───────────────────────────────────────────────
router.post("/task/create", asyncHandler(async (req, res) => {
  const { project, subject, description, status, activeForm, metadata } = req.body;
  if (!project || typeof project !== "string") {
    return res.status(400).json({ error: "Request body must include 'project' (string)" });
  }
  if (!subject || typeof subject !== "string") {
    return res.status(400).json({ error: "Request body must include 'subject' (string)" });
  }
  if (!description || typeof description !== "string") {
    return res.status(400).json({ error: "Request body must include 'description' (string)" });
  }
  // Auto-inject agentSessionId from Prism telemetry header
  const agentSessionId = req.headers["x-agent-session-id"] || null;
  const result = await agenticTaskCreate(project, { subject, description, status, activeForm, metadata, agentSessionId });
  if (result.error) return res.status(400).json(result);
  res.json(result);
}));
// ── List Tasks ────────────────────────────────────────────────
router.post("/task/list", agenticHandler(async (req) => {
  const { project, status, limit } = req.body;
  if (!project || typeof project !== "string") {
    return { error: "Request body must include 'project' (string)" };
  }
  return agenticTaskList(project, {
    status: status || undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
}));
router.get("/task/list-all", asyncHandler(async (req) => {
  const { status, limit, agentSessionId } = req.query;
  const db = (await import("../db.js")).getDB();
  const col = db.collection("agent_tasks");
  const filter = {};
  if (status) filter.status = status;
  if (agentSessionId) filter.agentSessionId = agentSessionId;
  const tasks = await col
    .find(filter)
    .sort({ taskId: 1 })
    .limit(parseIntParam(limit, 100, 500))
    .toArray();
  // Summary counts (scoped to same filter base)
  const summaryFilter = agentSessionId ? { agentSessionId } : {};
  const allTasks = await col.find(summaryFilter).toArray();
  const summary = {
    total: allTasks.length,
    pending: allTasks.filter((t) => t.status === "pending").length,
    in_progress: allTasks.filter((t) => t.status === "in_progress").length,
    completed: allTasks.filter((t) => t.status === "completed").length,
  };
  // Sanitize _id
  const sanitized = tasks.map(({ _id, ...rest }) => rest);
  return { tasks: sanitized, summary };
}, "Task list-all", 500));
// ── Get Task ──────────────────────────────────────────────────
router.post("/task/get", agenticHandler(async (req) => {
  const { project, taskId } = req.body;
  if (!project || typeof project !== "string") {
    return { error: "Request body must include 'project' (string)" };
  }
  if (taskId == null) {
    return { error: "Request body must include 'taskId' (number)" };
  }
  return agenticTaskGet(project, taskId);
}));
// ── Update Task ───────────────────────────────────────────────
router.post("/task/update", agenticHandler(async (req) => {
  const { project, taskId, status, subject, description, activeForm, metadata } = req.body;
  if (!project || typeof project !== "string") {
    return { error: "Request body must include 'project' (string)" };
  }
  if (taskId == null) {
    return { error: "Request body must include 'taskId' (number)" };
  }
  const updates = {};
  if (status) updates.status = status;
  if (subject) updates.subject = subject;
  if (description) updates.description = description;
  if (activeForm !== undefined) updates.activeForm = activeForm;
  if (metadata) updates.metadata = metadata;
  // Auto-inject agentSessionId from Prism telemetry header
  const agentSessionId = req.headers["x-agent-session-id"];
  if (agentSessionId) updates.agentSessionId = agentSessionId;
  return agenticTaskUpdate(project, taskId, updates);
}));
// ── Delete Task ───────────────────────────────────────────────
router.post("/task/delete", agenticHandler(async (req) => {
  const { project, taskId } = req.body;
  if (!project || typeof project !== "string") {
    return { error: "Request body must include 'project' (string)" };
  }
  if (taskId == null) {
    return { error: "Request body must include 'taskId' (number)" };
  }
  return agenticTaskDelete(project, taskId);
}));
// ─── 13. Tool Smoke Tests ───────────────────────────────────
// ── Single tool test ──────────────────────────────────────────
router.post("/test-tool", asyncHandler(async (req, res) => {
  const { toolName } = req.body;
  if (!toolName || typeof toolName !== "string") {
    return res.status(400).json({
      error: "'toolName' is required",
      available: getTestableTools(),
    });
  }
  const result = await testTool(toolName);
  res.json(result);
}));
// ── Test all tools ────────────────────────────────────────────
router.post("/test-all-tools", asyncHandler(async (req, res) => {
  const { toolNames } = req.body;
  const results = await testAllTools(toolNames || undefined);
  const passed = results.filter((r) => r.success).length;
  res.json({
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  });
}));
// ── List testable tools ───────────────────────────────────────
router.get("/testable-tools", (_req, res) => {
  res.json(getTestableTools());
});
// ─── 14. Memory Persistence ─────────────────────────────────
/**
 * POST /agentic/memory/upsert
 *
 * Forwards upsert_memory calls to Prism's MemoryService via
 * POST /agent-memories. Prism handles embedding generation,
 * cosine-similarity deduplication, and MongoDB persistence.
 * Same cross-service pattern as generate_image → Prism.
 */
router.post("/memory/upsert", asyncHandler(async (req, res) => {
  const { content, type, title } = req.body;
  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "Request body must include 'content' (string)" });
  }
  // Trusted context: arrives via X-headers (telemetry) and body injection
  // (ToolOrchestratorService injects project/agent/username from session ctx).
  // The model never provides these — they're stripped from the tool schema.
  const project = req.headers["x-project"] || req.body.project || "default";
  const agent = req.headers["x-agent"] || req.body.agent || "CODING";
  const username = req.headers["x-username"] || req.body.username || null;
  const agentSessionId = req.headers["x-agent-session-id"] || null;
  try {
    const prismRes = await fetch(`${CONFIG.PRISM_SERVICE_URL}/agent-memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent,
        project: project || "default",
        username,
        agentSessionId,
        content,
        type: type || "project",
        title: title || null,
      }),
    });
    if (!prismRes.ok) {
      const err = await prismRes.json().catch(() => ({}));
      return res.status(prismRes.status).json({ error: err.error || `Prism returned ${prismRes.status}` });
    }
    const result = await prismRes.json();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Memory storage failed: ${err.message}` });
  }
}));
// ─── 15. Custom Agent Creation ──────────────────────────────
/**
 * POST /agentic/custom-agent/create
 *
 * Creates a new custom agent persona by proxying to Prism's
 * POST /custom-agents. The agent is persisted to MongoDB and
 * registered into the live AgentPersonaRegistry.
 *
 * Same cross-service pattern as memory/upsert → Prism.
 */
router.post("/custom-agent/create", asyncHandler(async (req, res) => {
  const {
    name,
    description,
    project,
    icon,
    color,
    backgroundImage,
    identity,
    guidelines,
    toolPolicy,
    enabledTools,
    usesDirectoryTree,
    usesCodingGuidelines,
  } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Request body must include 'name' (non-empty string)" });
  }
  // ── Validate enabledTools against the tool registry ──────────
  if (Array.isArray(enabledTools) && enabledTools.length > 0) {
    const knownToolNames = new Set(TOOL_DEFINITIONS.map((t) => t.name));
    const unknownTools = enabledTools.filter((t) => !knownToolNames.has(t));
    if (unknownTools.length > 0) {
      return res.status(400).json({
        error: `Unknown tool(s) in enabledTools: ${unknownTools.join(", ")}. ` +
          `Use the tool_search tool or list_custom_agents to discover valid tool names.`,
        unknownTools,
      });
    }
  }
  try {
    const prismRes = await fetch(`${CONFIG.PRISM_SERVICE_URL}/custom-agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description || "",
        project: project || "coding",
        icon: icon || "",
        color: color || "",
        backgroundImage: backgroundImage || "",
        identity: identity || "",
        guidelines: guidelines || "",
        toolPolicy: toolPolicy || "",
        enabledTools: Array.isArray(enabledTools) ? enabledTools : [],
        usesDirectoryTree: usesDirectoryTree === true,
        usesCodingGuidelines: usesCodingGuidelines === true,
      }),
    });
    if (!prismRes.ok) {
      const err = await prismRes.json().catch(() => ({}));
      return res.status(prismRes.status).json({ error: err.error || `Prism returned ${prismRes.status}` });
    }
    const created = await prismRes.json();
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: `Custom agent creation failed: ${err.message}` });
  }
}));
// ── List Custom Agents ────────────────────────────────────────
/**
 * GET /agentic/custom-agent/list
 *
 * Returns all custom agent personas by proxying to Prism's
 * GET /custom-agents. Read-only discovery for the agentic loop.
 */
router.get("/custom-agent/list", asyncHandler(async (_req, res) => {
  try {
    const prismRes = await fetch(`${CONFIG.PRISM_SERVICE_URL}/custom-agents`);
    if (!prismRes.ok) {
      const err = await prismRes.json().catch(() => ({}));
      return res.status(prismRes.status).json({ error: err.error || `Prism returned ${prismRes.status}` });
    }
    const agents = await prismRes.json();
    res.json({ agents, count: agents.length });
  } catch (err) {
    res.status(500).json({ error: `Custom agent list failed: ${err.message}` });
  }
}));
// ─── 16. Tool Search (Meta-Tool) ────────────────────────────
router.post("/tool/search", agenticHandler(async (req) => {
  const { query, domain, label, limit } = req.body;
  if (!query && !domain && !label) {
    return { error: "At least one of 'query', 'domain', or 'label' is required" };
  }
  return agenticToolSearch(query, {
    domain: domain || undefined,
    label: label || undefined,
    limit: limit ? Math.min(parseInt(limit, 10), 50) : 20,
  });
}));
// ─── 17. Scheduling (Cron + Remote Trigger) ─────────────────
// ── Create Schedule ───────────────────────────────────────────
router.post("/schedule/create", agenticHandler(async (req) => {
  const { project, name, schedule, prompt, type, agent, model } = req.body;
  if (!project || typeof project !== "string") {
    return { error: "Request body must include 'project' (string)" };
  }
  if (!name || typeof name !== "string") {
    return { error: "Request body must include 'name' (string)" };
  }
  if (!prompt || typeof prompt !== "string") {
    return { error: "Request body must include 'prompt' (string)" };
  }
  return agenticScheduleCreate({ project, name, schedule, prompt, type, agent, model });
}));
// ── List Schedules ────────────────────────────────────────────
router.post("/schedule/list", agenticHandler(async (req) => {
  const { project, type, limit } = req.body;
  if (!project || typeof project !== "string") {
    return { error: "Request body must include 'project' (string)" };
  }
  return agenticScheduleList(project, {
    type: type || undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
  });
}));
// ── Delete Schedule ───────────────────────────────────────────
router.post("/schedule/delete", agenticHandler(async (req) => {
  const { project, scheduleId } = req.body;
  if (!project || typeof project !== "string") {
    return { error: "Request body must include 'project' (string)" };
  }
  if (scheduleId == null) {
    return { error: "Request body must include 'scheduleId' (number)" };
  }
  return agenticScheduleDelete(project, scheduleId);
}));
// ── Fire Remote Trigger ───────────────────────────────────────
router.post("/trigger/fire", agenticHandler(async (req) => {
  const { project, triggerName, payload } = req.body;
  if (!project || typeof project !== "string") {
    return { error: "Request body must include 'project' (string)" };
  }
  if (!triggerName || typeof triggerName !== "string") {
    return { error: "Request body must include 'triggerName' (string)" };
  }
  return agenticTriggerFire(project, triggerName, payload || {});
}));
// ─── 18. Notebook Editing ───────────────────────────────────
router.post("/notebook/edit", agenticHandler(async (req) => {
  const { path, action, cellIndex, content, cellType } = req.body;
  if (!path || typeof path !== "string") {
    return { error: "Request body must include 'path' (string) — path to .ipynb file" };
  }
  if (!action || typeof action !== "string") {
    return { error: "Request body must include 'action' (string)" };
  }
  return agenticNotebookEdit(path, {
    action,
    cellIndex: cellIndex != null ? parseInt(cellIndex, 10) : undefined,
    content,
    cellType,
  });
}));
// ─── 19. Custom Tool Management ─────────────────────────────
/**
 * POST /agentic/custom-tool/create
 *
 * Creates a new custom tool definition by proxying to Prism's
 * POST /custom-tools. Custom tools are user-defined HTTP endpoints
 * that the agent can invoke like built-in tools. Each tool specifies
 * a name, description, endpoint URL, HTTP method, and parameter schema.
 *
 * Same cross-service proxy pattern as custom-agent/create → Prism.
 */
router.post("/custom-tool/create", asyncHandler(async (req, res) => {
  const {
    name,
    description,
    endpoint,
    method,
    parameters,
    enabled,
  } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Request body must include 'name' (non-empty string)" });
  }
  if (!endpoint || typeof endpoint !== "string" || !endpoint.trim()) {
    return res.status(400).json({ error: "Request body must include 'endpoint' (non-empty string — the URL the tool calls)" });
  }
  // Inject trusted context from session headers
  const project = req.headers["x-project"] || req.body.project || "default";
  const username = req.headers["x-username"] || req.body.username || null;
  try {
    const prismRes = await fetch(`${CONFIG.PRISM_SERVICE_URL}/custom-tools`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(project && { "x-project": project }),
        ...(username && { "x-username": username }),
      },
      body: JSON.stringify({
        name: name.trim(),
        description: description || "",
        endpoint: endpoint.trim(),
        method: method || "GET",
        parameters: Array.isArray(parameters) ? parameters : [],
        enabled: enabled !== false,
      }),
    });
    if (!prismRes.ok) {
      const err = await prismRes.json().catch(() => ({}));
      return res.status(prismRes.status).json({ error: err.error || `Prism returned ${prismRes.status}` });
    }
    const created = await prismRes.json();
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: `Custom tool creation failed: ${err.message}` });
  }
}));
// ── List Custom Tools ─────────────────────────────────────────
/**
 * GET /agentic/custom-tool/list
 *
 * Returns all custom tools for the current project + username
 * by proxying to Prism's GET /custom-tools.
 */
router.get("/custom-tool/list", asyncHandler(async (req, res) => {
  const project = req.headers["x-project"] || req.query.project || "default";
  const username = req.headers["x-username"] || req.query.username || null;
  try {
    const prismRes = await fetch(`${CONFIG.PRISM_SERVICE_URL}/custom-tools`, {
      headers: {
        ...(project && { "x-project": project }),
        ...(username && { "x-username": username }),
      },
    });
    if (!prismRes.ok) {
      const err = await prismRes.json().catch(() => ({}));
      return res.status(prismRes.status).json({ error: err.error || `Prism returned ${prismRes.status}` });
    }
    const tools = await prismRes.json();
    res.json({ tools, count: tools.length });
  } catch (err) {
    res.status(500).json({ error: `Custom tool list failed: ${err.message}` });
  }
}));
// ── Update Custom Tool ────────────────────────────────────────
/**
 * POST /agentic/custom-tool/update
 *
 * Updates an existing custom tool by proxying to Prism's
 * PUT /custom-tools/:id. Accepts partial updates.
 */
router.post("/custom-tool/update", asyncHandler(async (req, res) => {
  const { id, name, description, endpoint, method, parameters, enabled } = req.body;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Request body must include 'id' (string — the tool's MongoDB ObjectId)" });
  }
  try {
    const prismRes = await fetch(`${CONFIG.PRISM_SERVICE_URL}/custom-tools/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(endpoint !== undefined && { endpoint }),
        ...(method !== undefined && { method }),
        ...(parameters !== undefined && { parameters }),
        ...(enabled !== undefined && { enabled }),
      }),
    });
    if (!prismRes.ok) {
      const err = await prismRes.json().catch(() => ({}));
      return res.status(prismRes.status).json({ error: err.error || `Prism returned ${prismRes.status}` });
    }
    const updated = await prismRes.json();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: `Custom tool update failed: ${err.message}` });
  }
}));
// ── Delete Custom Tool ────────────────────────────────────────
/**
 * POST /agentic/custom-tool/delete
 *
 * Deletes a custom tool by proxying to Prism's
 * DELETE /custom-tools/:id.
 */
router.post("/custom-tool/delete", asyncHandler(async (req, res) => {
  const { id } = req.body;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "Request body must include 'id' (string — the tool's MongoDB ObjectId)" });
  }
  try {
    const prismRes = await fetch(`${CONFIG.PRISM_SERVICE_URL}/custom-tools/${id}`, {
      method: "DELETE",
    });
    if (!prismRes.ok) {
      const err = await prismRes.json().catch(() => ({}));
      return res.status(prismRes.status).json({ error: err.error || `Prism returned ${prismRes.status}` });
    }
    const result = await prismRes.json();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Custom tool deletion failed: ${err.message}` });
  }
}));
export default router;
