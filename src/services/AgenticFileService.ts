import {
  escapeRegex,
  errorMessage,
  BINARY_FILE_EXTENSIONS,
  PREVIEW_IMAGE_FILE_EXTENSIONS,
  WORKSPACE_MAX_READ_BYTES,
  WORKSPACE_MAX_WRITE_BYTES,
  WORKSPACE_MAX_LINES_PER_READ,
  WORKSPACE_MAX_GREP_RESULTS,
  WORKSPACE_MAX_GLOB_RESULTS,
  WORKSPACE_MAX_DIRECTORY_ENTRIES,
  WORKSPACE_MAX_PREVIEW_BYTES,
  globToRegex,
} from "@rodrigo-barraza/utilities-library";
import type {
  DirectoryEntry,
  TreeEntry,
  GlobMatch,
  FileInfoEntry,
} from "@rodrigo-barraza/utilities-library";
export type { DirectoryEntry, TreeEntry, GlobMatch, FileInfoEntry };
import { requestLocalStorage } from "../middleware/HeaderPropagationMiddleware.ts";
import PromptLocaleService from "./PromptLocaleService.ts";
// ─── Sandboxed File Operations ──────────────────────────────

import {
  readFile,
  writeFile,
  stat,
  readdir,
  mkdir,
  rename,
  unlink,
  rm,
} from "node:fs/promises";
import { resolve, relative, extname, dirname } from "node:path";
import { existsSync } from "node:fs";
import { WORKSPACE_ROOTS as WORKSPACE_ROOTS_RAW } from "../config.ts";
import { resolveAndRouteToAgent, sendRpc } from "./AgentConnectionManager.ts";
import logger from "../logger.ts";

// ────────────────────────────────────────────────────────────
// Agent Routing Helper
// ────────────────────────────────────────────────────────────

/**
 * Route a workspace operation to a remote agent if one serves the target path.
 * Returns null if no agent matches (caller falls back to local handling).
 */
async function tryAgentRoute(
  method: string,
  params: Record<string, unknown>,
  targetPath: string,
): Promise<unknown> {
  const agent = resolveAndRouteToAgent(targetPath, ALLOWED_ROOTS[0]);
  if (!agent) return null;
  try {
    return await sendRpc(agent.id, method, params);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { error: `Agent RPC failed: ${errorMessage}` };
  }
}

// ────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────

// Validated from config.js WORKSPACE_ROOTS (array of absolute paths).
// If not configured, the service starts with no static roots — users must
// add workspaces via Settings UI or set the WORKSPACE_ROOTS env var to
// match their Docker volume mounts.
if (!Array.isArray(WORKSPACE_ROOTS_RAW) || WORKSPACE_ROOTS_RAW.length === 0) {
  logger.warn(
    "[AgenticFileService] WORKSPACE_ROOTS is empty — no static workspace roots configured. Users must add workspaces via the Settings UI.",
  );
}

// Static roots — immutable baseline from config.js
const STATIC_ROOTS = Object.freeze(
  (Array.isArray(WORKSPACE_ROOTS_RAW) ? WORKSPACE_ROOTS_RAW : [])
    .filter(Boolean)
    .map((r: string) => resolve(r.trim())),
);

// Dynamic roots — mutable array that includes static + user-configured roots.
// Mutated in-place so all importers automatically see updates.
const ALLOWED_ROOTS = [...STATIC_ROOTS];



// Patterns that are always blocked — even within allowed roots
const BLOCKED_PATTERNS = [
  /node_modules\//,
  /\.git\/objects\//,
  /\.git\/hooks\//,
  /\.env$/,
  /\.env\.(?!example|sample|template|defaults|dist).+$/,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
  /id_ed25519/,
];

// Image extensions eligible for inline base64 preview (avoids /file/raw round-trip)


// ────────────────────────────────────────────────────────────
// Dynamic Security Settings Caching
// ────────────────────────────────────────────────────────────

import { MongoClient } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/mongo";

let settingsClient: MongoClient | null = null;
let cachedAllowEnvFiles = false;
let lastSecuritySettingsCheck = 0;
let settingsFetchPromise: Promise<void> | null = null;

async function getSecuritySettings(): Promise<{ allowEnvFiles: boolean }> {
  try {
    const database = getDatabase();
    const databaseInternal = database as unknown as { client?: { db: (name: string) => import("mongodb").Db }; s?: { client?: { db: (name: string) => import("mongodb").Db } } };
    const client = databaseInternal.client || databaseInternal.s?.client;
    const prismDb = client ? client.db("prism") : null;
    if (prismDb) {
      const collection = prismDb.collection("settings");
      const doc = await collection.findOne({ _key: "global" });
      if (doc && doc.data && doc.data.security) {
        return { allowEnvFiles: !!doc.data.security.allowEnvFiles };
      }
    } else {
      // Fallback: lazily establish a new connection if needed
      if (!settingsClient) {
        const { default: CONFIG } = await import("../config.ts");
        if (CONFIG.MONGODB_URI) {
          settingsClient = new MongoClient(CONFIG.MONGODB_URI);
          await settingsClient.connect();
        }
      }
      if (settingsClient) {
        const doc = await settingsClient
          .db("prism")
          .collection("settings")
          .findOne({ _key: "global" });
        if (doc && doc.data && doc.data.security) {
          return { allowEnvFiles: !!doc.data.security.allowEnvFiles };
        }
      }
    }
  } catch (error) {
    logger.warn(
      `[AgenticFileService] Failed to fetch security settings: ${error}`,
    );
  }
  return { allowEnvFiles: false };
}

function triggerSecuritySettingsRefresh() {
  if (settingsFetchPromise) return;
  const now = Date.now();
  if (now - lastSecuritySettingsCheck < 5000) return; // 5s TTL

  settingsFetchPromise = getSecuritySettings()
    .then((settings) => {
      cachedAllowEnvFiles = settings.allowEnvFiles;
      lastSecuritySettingsCheck = Date.now();
    })
    .finally(() => {
      settingsFetchPromise = null;
    });
}

// ────────────────────────────────────────────────────────────
// Path Validation
// ────────────────────────────────────────────────────────────

/**
 * Validate and resolve a path against the sandbox.
 */
function validatePath(inputPath: string | unknown) {
  if (!inputPath || typeof inputPath !== "string") {
    return { safe: false, resolved: "", error: "Path is required (string)" };
  }

  // Sanitize LLM-generated paths: strip surrounding quotes and whitespace.
  // Models sometimes send path values like `"."` or `'./src'` with literal
  // quote characters embedded in the string, producing invalid filesystem paths.
  const sanitizedPath = inputPath.trim().replace(/^["']+|["']+$/g, "").trim();
  if (!sanitizedPath) {
    return { safe: false, resolved: "", error: "Path is required (string)" };
  }

  // Trigger non-blocking lazy refresh of security settings
  triggerSecuritySettingsRefresh();

  const requestStore = requestLocalStorage.getStore();
  const workspaceOverride = requestStore?.workspaceOverride;
  const workspaceRoot = requestStore?.workspaceRoot;

  // Resolve relative paths against the active workspace context, NOT process.cwd().
  // Priority: workspaceOverride (worktree) > workspaceRoot (user-selected) > ALLOWED_ROOTS[0] (static fallback).
  const isRelative = !sanitizedPath.startsWith("/");
  let baseRoot: string;

  if (workspaceOverride && workspaceOverride.startsWith("/tmp/prism-worktrees/")) {
    // Active worktree takes highest priority
    baseRoot = workspaceOverride;
  } else if (workspaceRoot) {
    // User-selected workspace root — validate it's within an allowed root
    const resolvedWorkspaceRoot = resolve(workspaceRoot);
    const isWorkspaceRootAllowed = ALLOWED_ROOTS.some(
      (root: string) => resolvedWorkspaceRoot.startsWith(root + "/") || resolvedWorkspaceRoot === root,
    );
    baseRoot = isWorkspaceRootAllowed ? resolvedWorkspaceRoot : ALLOWED_ROOTS[0];
  } else {
    baseRoot = ALLOWED_ROOTS[0];
  }

  const resolved = isRelative
    ? resolve(baseRoot, sanitizedPath)
    : resolve(sanitizedPath);

  // Check against allowed roots
  let inAllowedRoot = ALLOWED_ROOTS.some(
    (root: string) => resolved.startsWith(root + "/") || resolved === root,
  );

  // Also check workspaceOverride
  if (!inAllowedRoot && workspaceOverride && workspaceOverride.startsWith("/tmp/prism-worktrees/")) {
    if (resolved.startsWith(workspaceOverride + "/") || resolved === workspaceOverride) {
      inAllowedRoot = true;
    }
  }

  if (!inAllowedRoot) {
    return {
      safe: false,
      resolved,
      error: `Path '${resolved}' is outside allowed roots: ${ALLOWED_ROOTS.join(", ")}`,
    };
  }

  // Check against blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (cachedAllowEnvFiles) {
      const source = pattern.source;
      // Skip environment configurations, keys, and private credentials
      if (
        source === "\\.env$" ||
        source === "\\.env\\.(?!example|sample|template|defaults|dist).+$" ||
        source === "\\.pem$" ||
        source === "\\.key$" ||
        source === "id_rsa" ||
        source === "id_ed25519"
      ) {
        continue;
      }
    }
    if (pattern.test(resolved)) {
      return {
        safe: false,
        resolved,
        error: `Path '${resolved}' matches blocked pattern: ${pattern.source}`,
      };
    }
  }

  return { safe: true, resolved };
}

// ────────────────────────────────────────────────────────────
// File Operations
// ────────────────────────────────────────────────────────────

/**
 * Read file contents with optional line range.
 */
export async function agenticReadFile(
  filePath: string,
  { startLine, endLine }: { startLine?: number; endLine?: number } = {},
) {
  // Agent routing — proxy to remote agent if path is served by one
  const agentResult = await tryAgentRoute(
    "file.read",
    { path: filePath, startLine, endLine },
    filePath,
  );
  if (agentResult) return agentResult;

  const validation = validatePath(filePath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const resolved = validation.resolved;

  try {
    const stats = await stat(resolved);
    if (stats.isDirectory()) {
      return {
        error: `'${resolved}' is a directory, not a file. Use list_directory instead.`,
      };
    }
    if (stats.size > WORKSPACE_MAX_READ_BYTES) {
      return {
        error: `File is ${(stats.size / 1024).toFixed(1)} KB — exceeds max read size of ${(WORKSPACE_MAX_READ_BYTES / 1024).toFixed(0)} KB. Use startLine/endLine to read a portion.`,
      };
    }

    // Binary detection
    const fileExtension = extname(resolved).toLowerCase();
    if (BINARY_FILE_EXTENSIONS.has(fileExtension)) {
      const result: Record<string, unknown> = {
        filePath: resolved,
        isBinary: true,
        extension: fileExtension,
        sizeBytes: stats.size,
      };

      // Auto-include base64 for previewable image files under threshold
      if (
        PREVIEW_IMAGE_FILE_EXTENSIONS.has(fileExtension) &&
        stats.size <= WORKSPACE_MAX_PREVIEW_BYTES
      ) {
        const buffer = await readFile(resolved);
        result.contentBase64 = buffer.toString("base64");
      } else {
        result.message = `Binary file detected (${fileExtension}). Content not returned.`;
      }

      return result;
    }

    const raw = await readFile(resolved, "utf-8");
    const allLines = raw.split("\n");
    const totalLines = allLines.length;

    // Apply line range
    const start = startLine ? Math.max(1, startLine) : 1;
    let end = endLine ? Math.min(totalLines, endLine) : totalLines;

    // Enforce max lines per read
    if (end - start + 1 > WORKSPACE_MAX_LINES_PER_READ) {
      end = start + WORKSPACE_MAX_LINES_PER_READ - 1;
    }

    const selectedLines = allLines.slice(start - 1, end);
    const numberedContent = selectedLines
      .map((line: string, i: number) => `${start + i}: ${line}`)
      .join("\n");

    return {
      filePath: resolved,
      totalLines,
      totalBytes: stats.size,
      startLine: start,
      endLine: Math.min(end, totalLines),
      linesReturned: selectedLines.length,
      truncated: end < totalLines,
      content: numberedContent,
    };
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return { error: `File not found: ${resolved}` };
    }
    return { error: `Read failed: ${errorMessage(error)}` };
  }
}

/**
 * Write (create or overwrite) a file.
 */
export async function agenticWriteFile(
  filePath: string,
  content: string,
  { createDirs = true }: { createDirs?: boolean } = {},
) {
  // Agent routing
  const agentResult = await tryAgentRoute(
    "file.write",
    { path: filePath, content, createDirs },
    filePath,
  );
  if (agentResult) return agentResult;

  const validation = validatePath(filePath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  if (typeof content !== "string") {
    return { error: "'content' must be a string" };
  }

  const bytes = Buffer.byteLength(content, "utf-8");
  if (bytes > WORKSPACE_MAX_WRITE_BYTES) {
    return {
      error: `Content is ${(bytes / 1024).toFixed(1)} KB — exceeds max write size of ${(WORKSPACE_MAX_WRITE_BYTES / 1024).toFixed(0)} KB.`,
    };
  }

  const resolved = validation.resolved;

  try {
    if (createDirs) {
      const dir = dirname(resolved);
      await mkdir(dir, { recursive: true });
    }

    const existed = existsSync(resolved);
    await writeFile(resolved, content, "utf-8");

    const lines = content.split("\n").length;

    return {
      filePath: resolved,
      created: !existed,
      overwritten: existed,
      bytesWritten: bytes,
      linesWritten: lines,
    };
  } catch (error: unknown) {
    return { error: `Write failed: ${errorMessage(error)}` };
  }
}

/**
 * Perform a targeted string replacement in a file.
 * The `oldString` must match exactly (including whitespace).
 */
export async function agenticStringReplace(
  filePath: string,
  oldString: string,
  newString: string,
  { allowMultiple = false }: { allowMultiple?: boolean } = {},
) {
  // Agent routing
  const agentResult = await tryAgentRoute(
    "file.strReplace",
    { path: filePath, oldString, newString, allowMultiple },
    filePath,
  );
  if (agentResult) return agentResult;

  const validation = validatePath(filePath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  if (!oldString || typeof oldString !== "string") {
    return { error: "'oldString' is required and must be a non-empty string" };
  }
  if (typeof newString !== "string") {
    return { error: "'newString' must be a string" };
  }

  const resolved = validation.resolved;

  try {
    const content = await readFile(resolved, "utf-8");

    // Count occurrences
    let count = 0;
    let index = -1;
    while ((index = content.indexOf(oldString, index + 1)) !== -1) {
      count++;
    }

    if (count === 0) {
      return {
        error: PromptLocaleService.get("en", "prompts.file.replace-no-match"),
        filePath: resolved,
        matchCount: 0,
      };
    }

    if (count > 1 && !allowMultiple) {
      return {
        error: `Found ${count} occurrences of 'oldString' but allowMultiple is false. Set allowMultiple=true to replace all, or provide more context to make the match unique.`,
        filePath: resolved,
        matchCount: count,
      };
    }

    // Perform replacement
    let updated: string;
    if (allowMultiple) {
      updated = content.split(oldString).join(newString);
    } else {
      updated = content.replace(oldString, newString);
    }

    await writeFile(resolved, updated, "utf-8");

    // Compute a simple diff summary
    const oldLines = oldString.split("\n").length;
    const newLines = newString.split("\n").length;

    return {
      filePath: resolved,
      matchCount: count,
      replacementsApplied: allowMultiple ? count : 1,
      oldLines,
      newLines,
      lineDelta: newLines - oldLines,
    };
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return { error: `File not found: ${resolved}` };
    }
    return {
      error: `str_replace failed: ${errorMessage(error)}`,
    };
  }
}

/**
 * Apply a unified diff patch to a file.
 */
export async function agenticPatchFile(filePath: string, patch: string) {
  // Agent routing
  const agentResult = await tryAgentRoute(
    "file.patch",
    { path: filePath, patch },
    filePath,
  );
  if (agentResult) return agentResult;

  const validation = validatePath(filePath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  if (!patch || typeof patch !== "string") {
    return {
      error: "'patch' is required and must be a string (unified diff format)",
    };
  }

  const resolved = validation.resolved;

  try {
    const { applyPatch } = await import("diff");
    const content = await readFile(resolved, "utf-8");
    const patched = applyPatch(content, patch);

    if (patched === false) {
      return {
        error: PromptLocaleService.get("en", "prompts.file.patch-context-mismatch"),
        filePath: resolved,
      };
    }

    await writeFile(resolved, patched, "utf-8");

    const oldLines = content.split("\n").length;
    const newLines = patched.split("\n").length;

    return {
      filePath: resolved,
      success: true,
      oldLines,
      newLines,
      lineDelta: newLines - oldLines,
    };
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return { error: `File not found: ${resolved}` };
    }
    return {
      error: `patch_file failed: ${errorMessage(error)}`,
    };
  }
}

/**
 * List directory contents with metadata.
 */


export async function agenticListDirectory(
  dirPath: string,
  {
    recursive = false,
    maxDepth = 3,
  }: { recursive?: boolean; maxDepth?: number } = {},
) {
  // Agent routing
  const agentResult = await tryAgentRoute(
    "directory.list",
    { path: dirPath, recursive, maxDepth },
    dirPath,
  );
  if (agentResult) return agentResult;

  const validation = validatePath(dirPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const resolved = validation.resolved;

  try {
    const stats = await stat(resolved);
    if (!stats.isDirectory()) {
      return {
        error: `'${resolved}' is a file, not a directory. Use read_file instead.`,
      };
    }

    const entries: DirectoryEntry[] = [];

    async function walk(dir: string, depth: number) {
      if (entries.length >= WORKSPACE_MAX_DIRECTORY_ENTRIES) return;
      if (depth > maxDepth) return;

      const dirEntries = await readdir(dir, { withFileTypes: true });

      for (const entry of dirEntries) {
        if (entries.length >= WORKSPACE_MAX_DIRECTORY_ENTRIES) break;

        const fullPath = resolve(dir, entry.name);
        const relativePath = relative(resolved, fullPath);

        // Skip blocked paths
        const pathValidation = validatePath(fullPath);
        if (!pathValidation.safe) continue;

        if (entry.isDirectory()) {
          entries.push({
            name: entry.name,
            path: relativePath,
            isDir: true,
          });
          if (recursive && depth < maxDepth) {
            await walk(fullPath, depth + 1);
          }
        } else {
          try {
            const fileStat = await stat(fullPath);
            entries.push({
              name: entry.name,
              path: relativePath,
              isDir: false,
              sizeBytes: fileStat.size,
            });
          } catch {
            entries.push({
              name: entry.name,
              path: relativePath,
              isDir: false,
            });
          }
        }
      }
    }

    await walk(resolved, 1);

    return {
      directory: resolved,
      totalEntries: entries.length,
      truncated: entries.length >= WORKSPACE_MAX_DIRECTORY_ENTRIES,
      entries,
    };
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return { error: `Directory not found: ${resolved}` };
    }
    return {
      error: `list_directory failed: ${errorMessage(error)}`,
    };
  }
}

/**
 * Get directory tree structure.
 * Returns nested directory tree representation for SystemPromptAssembler.
 */
export async function agenticGetDirectoryTree(
  directoryPath: string,
  maxDepth = 2,
) {
  const agentResult = await tryAgentRoute(
    "directory.tree",
    { path: directoryPath, maxDepth },
    directoryPath,
  );
  if (agentResult) return agentResult as Record<string, unknown>;

  const validation = validatePath(directoryPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const resolved = validation.resolved;

  try {
    const fileStats = await stat(resolved);
    if (!fileStats.isDirectory()) {
      return {
        error: `'${resolved}' is a file, not a directory.`,
      };
    }

    async function buildTree(currentDirectory: string, currentDepth: number): Promise<TreeEntry[]> {
      if (currentDepth > maxDepth) return [];

      const directoryEntries = await readdir(currentDirectory, { withFileTypes: true });
      const treeEntries: TreeEntry[] = [];

      for (const entry of directoryEntries) {
        const fullPath = resolve(currentDirectory, entry.name);
        const relativePath = relative(resolved, fullPath);

        const pathValidation = validatePath(fullPath);
        if (!pathValidation.safe) continue;

        if (entry.isDirectory()) {
          const children = currentDepth < maxDepth ? await buildTree(fullPath, currentDepth + 1) : [];
          treeEntries.push({
            name: entry.name,
            path: relativePath,
            type: "directory",
            children,
          });
        } else {
          treeEntries.push({
            name: entry.name,
            path: relativePath,
            type: "file",
          });
        }
      }

      return treeEntries;
    }

    const entries = await buildTree(resolved, 1);
    return { entries };
  } catch (error: unknown) {
    return {
      error: `Directory tree fetch failed: ${errorMessage(error)}`,
    };
  }
}

/**
 * Search for pattern matches within files (ripgrep-style).
 */
export interface GrepResult {
  file: string;
  line: number;
  content: string;
}

export async function agenticGrepSearch(
  pattern: string,
  searchPath: string,
  {
    isRegex = false,
    includes = [],
    caseInsensitive = false,
    matchPerLine = true,
  }: {
    isRegex?: boolean;
    includes?: string[];
    caseInsensitive?: boolean;
    matchPerLine?: boolean;
  } = {},
) {
  // Agent routing
  const agentResult = await tryAgentRoute(
    "search.grep",
    { pattern, searchPath, isRegex, includes, caseInsensitive, matchPerLine },
    searchPath,
  );
  if (agentResult) return agentResult;

  const validation = validatePath(searchPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  if (!pattern || typeof pattern !== "string") {
    return { error: "'pattern' is required and must be a non-empty string" };
  }

  const resolved = validation.resolved;

  try {
    let regex: RegExp;
    try {
      regex = isRegex
        ? new RegExp(pattern, caseInsensitive ? "gi" : "g")
        : new RegExp(escapeRegex(pattern), caseInsensitive ? "gi" : "g");
    } catch (error: unknown) {
      return {
        error: `Invalid regex pattern: ${errorMessage(error)}`,
      };
    }

    const results: GrepResult[] = [];
    const fileMatches = new Set<string>();

    async function searchFile(filePath: string) {
      if (results.length >= WORKSPACE_MAX_GREP_RESULTS) return;

      const fileExtension = extname(filePath).toLowerCase();
      if (BINARY_FILE_EXTENSIONS.has(fileExtension)) return;

      // Check blocked patterns
      const pathCheck = validatePath(filePath);
      if (!pathCheck.safe) return;

      try {
        const fileStat = await stat(filePath);
        if (fileStat.size > WORKSPACE_MAX_READ_BYTES) return;

        const content = await readFile(filePath, "utf-8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          if (results.length >= WORKSPACE_MAX_GREP_RESULTS) break;

          regex.lastIndex = 0;
          if (regex.test(lines[i])) {
            fileMatches.add(filePath);
            if (matchPerLine) {
              results.push({
                file: filePath,
                line: i + 1,
                content:
                  lines[i].length > 500
                    ? lines[i].slice(0, 500) + "..."
                    : lines[i],
              });
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    async function walkDir(dir: string) {
      if (results.length >= WORKSPACE_MAX_GREP_RESULTS) return;

      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (results.length >= WORKSPACE_MAX_GREP_RESULTS) break;

          const fullPath = resolve(dir, entry.name);

          if (entry.isDirectory()) {
            // Skip node_modules, .git
            if (entry.name === "node_modules" || entry.name === ".git")
              continue;
            await walkDir(fullPath);
          } else {
            // Apply include filters
            if (includes.length > 0) {
              const name = entry.name;
              const matched = includes.some((glob: string) => {
                if (glob.startsWith("*.")) {
                  return name.endsWith(glob.slice(1));
                }
                return name === glob;
              });
              if (!matched) continue;
            }
            await searchFile(fullPath);
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    const stats_ = await stat(resolved);
    if (stats_.isFile()) {
      await searchFile(resolved);
    } else {
      await walkDir(resolved);
    }

    if (!matchPerLine) {
      return {
        pattern,
        searchPath: resolved,
        matchingFiles: [...fileMatches],
        totalFiles: fileMatches.size,
        truncated: fileMatches.size >= WORKSPACE_MAX_GREP_RESULTS,
      };
    }

    return {
      pattern,
      searchPath: resolved,
      totalMatches: results.length,
      truncated: results.length >= WORKSPACE_MAX_GREP_RESULTS,
      results,
    };
  } catch (error: unknown) {
    return {
      error: `search_file_contents failed: ${errorMessage(error)}`,
    };
  }
}

/**
 * Find files by glob pattern.
 */

export async function agenticGlobFiles(pattern: string, searchPath: string) {
  // Agent routing
  const agentResult = await tryAgentRoute(
    "search.glob",
    { pattern, searchPath },
    searchPath,
  );
  if (agentResult) return agentResult;

  const validation = validatePath(searchPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  if (!pattern || typeof pattern !== "string") {
    return { error: "'pattern' is required and must be a non-empty string" };
  }

  const resolved = validation.resolved;
  const matches: GlobMatch[] = [];

  // Convert simple glob to regex
  const globRegex = globToRegex(pattern);

  async function walk(dir: string) {
    if (matches.length >= WORKSPACE_MAX_GLOB_RESULTS) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (matches.length >= WORKSPACE_MAX_GLOB_RESULTS) break;

        const fullPath = resolve(dir, entry.name);
        const relativePath = relative(resolved, fullPath);

        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git") continue;
          await walk(fullPath);
        } else {
          if (globRegex.test(relativePath) || globRegex.test(entry.name)) {
            const pathCheck = validatePath(fullPath);
            if (!pathCheck.safe) continue;

            try {
              const fileStat = await stat(fullPath);
              matches.push({
                path: fullPath,
                relativePath: relativePath,
                name: entry.name,
                sizeBytes: fileStat.size,
              });
            } catch {
              matches.push({
                path: fullPath,
                relativePath: relativePath,
                name: entry.name,
              });
            }
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  try {
    await walk(resolved);

    return {
      pattern,
      searchPath: resolved,
      totalMatches: matches.length,
      truncated: matches.length >= WORKSPACE_MAX_GLOB_RESULTS,
      matches,
    };
  } catch (error: unknown) {
    return {
      error: `find_files failed: ${errorMessage(error)}`,
    };
  }
}

// ────────────────────────────────────────────────────────────
// Multi-File Read
// ────────────────────────────────────────────────────────────

/**
 * Read multiple files in a single call.
 */
export interface MultiFileReadItem {
  absolutePath: string;
  startLine?: number;
  endLine?: number;
}

export async function agenticMultiFileRead(files: MultiFileReadItem[]) {
  if (!Array.isArray(files) || files.length === 0) {
    return {
      error:
        "'files' must be a non-empty array of { absolutePath, startLine?, endLine? }",
    };
  }
  if (files.length > 20) {
    return {
      error: `Maximum 20 files per batch read. Received ${files.length}.`,
    };
  }

  const results = await Promise.all(
    files.map(async (fileItem: MultiFileReadItem) => {
      const result = await agenticReadFile(fileItem.absolutePath, {
        startLine: fileItem.startLine,
        endLine: fileItem.endLine,
      });
      return { absolutePath: fileItem.absolutePath, ...result };
    }),
  );

  const succeeded = results.filter(
    (result) => !('error' in result),
  ).length;
  const failed = results.filter(
    (result) => 'error' in result,
  ).length;

  return {
    totalRequested: files.length,
    succeeded,
    failed,
    results,
  };
}

// ────────────────────────────────────────────────────────────
// File Info (Stat)
// ────────────────────────────────────────────────────────────

/**
 * Get metadata for one or more files without reading content.
 */

export async function agenticFileInfo(paths: string | string[]) {
  const pathList: string[] = Array.isArray(paths) ? paths : [paths];
  // Agent routing — if first path is agent-served, proxy the entire batch
  if (pathList.length > 0) {
    const agentResult = await tryAgentRoute(
      "file.info",
      { paths: pathList },
      pathList[0],
    );
    if (agentResult) return agentResult;
  }

  if (pathList.length === 0) {
    return { error: "'paths' must be a non-empty string or array of strings" };
  }
  if (pathList.length > 20) {
    return {
      error: `Maximum 20 paths per batch. Received ${pathList.length}.`,
    };
  }

  const results = await Promise.all(
    pathList.map(async (filePath: string) => {
      const validation = validatePath(filePath);
      if (!validation.safe) {
        return { path: filePath, exists: false, error: validation.error };
      }

      const resolved = validation.resolved;
      try {
        const stats = await stat(resolved);
        const fileExtension = extname(resolved).toLowerCase();
        const info: FileInfoEntry = {
          path: resolved,
          exists: true,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          sizeBytes: stats.size,
          lastModified: stats.mtime.toISOString(),
          extension: fileExtension || null,
          isBinary: BINARY_FILE_EXTENSIONS.has(fileExtension),
        };

        // Line count for text files
        if (
          stats.isFile() &&
          !BINARY_FILE_EXTENSIONS.has(fileExtension) &&
          stats.size <= WORKSPACE_MAX_READ_BYTES
        ) {
          try {
            const content = await readFile(resolved, "utf-8");
            info.lines = content.split("\n").length;
          } catch {
            // Non-fatal — skip line counting
          }
        }

        return info;
      } catch (error: unknown) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          return { path: resolved, exists: false };
        }
        return {
          path: resolved,
          exists: false,
          error: errorMessage(error),
        };
      }
    }),
  );

  if (pathList.length === 1) {
    return results[0];
  }

  return {
    totalRequested: pathList.length,
    results,
  };
}

// ────────────────────────────────────────────────────────────
// File Diff
// ────────────────────────────────────────────────────────────

/**
 * Generate a unified diff between two files or between a file and provided content.
 */
export async function agenticFileDiff(
  pathA: string,
  {
    pathB,
    content,
    contextLines = 3,
  }: { pathB?: string; content?: string; contextLines?: number } = {},
) {
  // Agent routing
  const agentResult = await tryAgentRoute(
    "file.diff",
    { pathA, pathB, content, contextLines },
    pathA,
  );
  if (agentResult) return agentResult;

  if (!pathA) {
    return { error: "'pathA' is required" };
  }
  if (!pathB && content === undefined) {
    return { error: "Either 'pathB' or 'content' must be provided" };
  }

  const validA = validatePath(pathA);
  if (!validA.safe) {
    return { error: validA.error };
  }

  try {
    const contentA = await readFile(validA.resolved, "utf-8");
    let contentB = "";
    let labelB = "";

    if (pathB) {
      const validB = validatePath(pathB);
      if (!validB.safe) {
        return { error: validB.error };
      }
      contentB = await readFile(validB.resolved, "utf-8");
      labelB = validB.resolved;
    } else {
      contentB = content || "";
      labelB = "(provided content)";
    }

    const { createTwoFilesPatch } = await import("diff");
    const diff = createTwoFilesPatch(
      validA.resolved,
      labelB,
      contentA,
      contentB,
      "",
      "",
      { context: Math.min(contextLines, 10) },
    ) as string;

    const hasChanges = diff.includes("@@");
    const additions = (diff.match(/^\+[^+]/gm) || []).length;
    const deletions = (diff.match(/^-[^-]/gm) || []).length;

    return {
      pathA: validA.resolved,
      pathB: labelB,
      hasChanges,
      additions,
      deletions,
      diff: hasChanges ? diff : "(files are identical)",
    };
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return { error: `File not found: ${String(nodeError.path || pathA)}` };
    }
    return {
      error: `diff_files failed: ${errorMessage(error)}`,
    };
  }
}

// ────────────────────────────────────────────────────────────
// Move / Rename File
// ────────────────────────────────────────────────────────────

/**
 * Move or rename a file within allowed roots.
 */
export async function agenticMoveFile(
  source: string,
  destination: string,
  { createDirs = true }: { createDirs?: boolean } = {},
) {
  // Agent routing
  const agentResult = await tryAgentRoute(
    "file.move",
    { source, destination, createDirs },
    source,
  );
  if (agentResult) return agentResult;

  const validSource = validatePath(source);
  if (!validSource.safe) {
    return { error: validSource.error };
  }
  const validDestination = validatePath(destination);
  if (!validDestination.safe) {
    return { error: validDestination.error };
  }

  try {
    if (!existsSync(validSource.resolved)) {
      return { error: `Source not found: ${validSource.resolved}` };
    }
    if (existsSync(validDestination.resolved)) {
      return {
        error: `Destination already exists: ${validDestination.resolved}. Delete it first or choose a different path.`,
      };
    }

    if (createDirs) {
      await mkdir(dirname(validDestination.resolved), { recursive: true });
    }

    await rename(validSource.resolved, validDestination.resolved);

    return {
      source: validSource.resolved,
      destination: validDestination.resolved,
      success: true,
    };
  } catch (error: unknown) {
    return {
      error: `move_file failed: ${errorMessage(error)}`,
    };
  }
}

// ────────────────────────────────────────────────────────────
// Delete File
// ────────────────────────────────────────────────────────────

/**
 * Delete a file within allowed roots.
 */
export async function agenticDeleteFile(
  filePath: string,
  { recursive = false }: { recursive?: boolean } = {},
) {
  // Agent routing
  const agentResult = await tryAgentRoute(
    "file.delete",
    { path: filePath, recursive },
    filePath,
  );
  if (agentResult) return agentResult;

  const validation = validatePath(filePath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  try {
    const stats = await stat(validation.resolved);
    const sizeBytes = stats.isDirectory() ? 0 : stats.size;

    if (stats.isDirectory()) {
      if (!recursive) {
        return {
          error: `'${validation.resolved}' is a directory. Only files can be deleted with this tool, unless the 'recursive' parameter is set to true.`,
        };
      }
      await rm(validation.resolved, { recursive: true, force: true });
    } else {
      await unlink(validation.resolved);
    }

    return {
      filePath: validation.resolved,
      deleted: true,
      isDirectory: stats.isDirectory(),
      sizeBytes,
    };
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return { error: `File or directory not found: ${validation.resolved}` };
    }
    return {
      error: `delete_file failed: ${errorMessage(error)}`,
    };
  }
}

// ────────────────────────────────────────────────────────────
// Surgical Block & Multi-Block Editing
// ────────────────────────────────────────────────────────────

/**
 * Perform a targeted block replacement in a file bounded by startLine and endLine.
 * Verifies that the targeted range contains the exact 'targetContent', then replaces it.
 */
export async function agenticBlockReplace(
  filePath: string,
  startLine: number,
  endLine: number,
  targetContent: string,
  replacementContent: string,
) {
  // Agent routing
  const agentResult = await tryAgentRoute(
    "file.blockReplace",
    { path: filePath, startLine, endLine, targetContent, replacementContent },
    filePath,
  );
  if (agentResult) return agentResult;

  const validation = validatePath(filePath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  if (typeof startLine !== "number" || startLine <= 0) {
    return { error: "'startLine' must be a positive integer" };
  }
  if (typeof endLine !== "number" || endLine < startLine) {
    return {
      error: "'endLine' must be an integer greater than or equal to startLine",
    };
  }
  if (typeof targetContent !== "string") {
    return { error: "'targetContent' must be a string" };
  }
  if (typeof replacementContent !== "string") {
    return { error: "'replacementContent' must be a string" };
  }

  const resolved = validation.resolved;

  try {
    const raw = await readFile(resolved, "utf-8");
    const lines = raw.split("\n");
    const totalLines = lines.length;

    if (startLine > totalLines || endLine > totalLines) {
      return {
        error: `Line range [${startLine}, ${endLine}] exceeds total file lines (${totalLines})`,
        filePath: resolved,
      };
    }

    // Extract the target segment to match against targetContent
    const segment = lines.slice(startLine - 1, endLine).join("\n");

    // Precise match (including whitespace)
    if (segment !== targetContent) {
      const numberedActual = lines
        .slice(startLine - 1, endLine)
        .map((l: string, i: number) => `${startLine + i}: ${l}`)
        .join("\n");
      return {
        error: `Content in line range [${startLine}, ${endLine}] does not match targetContent.`,
        filePath: resolved,
        actualContentInRange: numberedActual,
      };
    }

    // Replace the segment
    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(endLine);
    const newSegmentLines = replacementContent.split("\n");
    const updatedContent = [...before, ...newSegmentLines, ...after].join("\n");

    await writeFile(resolved, updatedContent, "utf-8");

    const oldLinesCount = endLine - startLine + 1;
    const newLinesCount = newSegmentLines.length;

    return {
      filePath: resolved,
      success: true,
      oldLines: oldLinesCount,
      newLines: newLinesCount,
      lineDelta: newLinesCount - oldLinesCount,
    };
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return { error: `File not found: ${resolved}` };
    }
    return {
      error: `block_replace failed: ${errorMessage(error)}`,
    };
  }
}

export interface MultiReplaceChunk {
  startLine: number;
  endLine: number;
  targetContent: string;
  replacementContent: string;
}

/**
 * Perform multiple non-contiguous block replacements in a single file atomically.

 * Processed from bottom-to-top to ensure subsequent line index stability.
 */
export async function agenticMultiReplace(
  filePath: string,
  chunks: MultiReplaceChunk[],
) {
  // Agent routing
  const agentResult = await tryAgentRoute(
    "file.multiReplace",
    { path: filePath, chunks },
    filePath,
  );
  if (agentResult) return agentResult;

  const validation = validatePath(filePath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  if (!Array.isArray(chunks) || chunks.length === 0) {
    return {
      error: "'chunks' must be a non-empty array of replacement chunks",
    };
  }
  if (chunks.length > 30) {
    return { error: `Maximum 30 chunks per batch. Received ${chunks.length}.` };
  }

  // Validate each chunk parameter type
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (typeof chunk.startLine !== "number" || chunk.startLine <= 0) {
      return { error: `Chunk ${i}: 'startLine' must be a positive integer` };
    }
    if (typeof chunk.endLine !== "number" || chunk.endLine < chunk.startLine) {
      return {
        error: `Chunk ${i}: 'endLine' must be an integer greater than or equal to startLine`,
      };
    }
    if (typeof chunk.targetContent !== "string") {
      return { error: `Chunk ${i}: 'targetContent' must be a string` };
    }
    if (typeof chunk.replacementContent !== "string") {
      return { error: `Chunk ${i}: 'replacementContent' must be a string` };
    }
  }

  const resolved = validation.resolved;

  try {
    const raw = await readFile(resolved, "utf-8");
    let lines = raw.split("\n");

    // Check for overlap between chunks
    const sortedAsc = [...chunks].sort(
      (firstItem, b) => firstItem.startLine - b.startLine,
    );
    for (let i = 0; i < sortedAsc.length - 1; i++) {
      if (sortedAsc[i].endLine >= sortedAsc[i + 1].startLine) {
        return {
          error: `Chunks overlap or touch: Chunk at [${sortedAsc[i].startLine}, ${sortedAsc[i].endLine}] overlaps/touches [${sortedAsc[i + 1].startLine}, ${sortedAsc[i + 1].endLine}]`,
          filePath: resolved,
        };
      }
    }

    // Sort descending by startLine so we replace bottom-to-top without affecting subsequent indices
    const sortedDesc = [...chunks].sort(
      (firstItem, b) => b.startLine - firstItem.startLine,
    );
    const chunkResults = [];
    let overallLineDelta = 0;

    for (let index = 0; index < sortedDesc.length; index++) {
      const chunk = sortedDesc[index];
      const totalLines = lines.length;

      if (chunk.startLine > totalLines || chunk.endLine > totalLines) {
        return {
          error: `Chunk range [${chunk.startLine}, ${chunk.endLine}] exceeds total file lines (${totalLines})`,
          filePath: resolved,
        };
      }

      const segment = lines
        .slice(chunk.startLine - 1, chunk.endLine)
        .join("\n");
      if (segment !== chunk.targetContent) {
        const numberedActual = lines
          .slice(chunk.startLine - 1, chunk.endLine)
          .map((l: string, i: number) => `${chunk.startLine + i}: ${l}`)
          .join("\n");
        return {
          error: `Chunk in range [${chunk.startLine}, ${chunk.endLine}] does not match targetContent.`,
          filePath: resolved,
          actualContentInRange: numberedActual,
        };
      }

      // Perform replace
      const before = lines.slice(0, chunk.startLine - 1);
      const after = lines.slice(chunk.endLine);
      const newSegmentLines = chunk.replacementContent.split("\n");
      lines = [...before, ...newSegmentLines, ...after];

      const oldLinesCount = chunk.endLine - chunk.startLine + 1;
      const newLinesCount = newSegmentLines.length;
      const delta = newLinesCount - oldLinesCount;
      overallLineDelta += delta;

      chunkResults.push({
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        oldLines: oldLinesCount,
        newLines: newLinesCount,
        lineDelta: delta,
      });
    }

    // Write back updated content
    await writeFile(resolved, lines.join("\n"), "utf-8");

    return {
      filePath: resolved,
      success: true,
      chunksProcessed: chunkResults.length,
      overallLineDelta,
      details: chunkResults.reverse(),
    };
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return { error: `File not found: ${resolved}` };
    }
    return {
      error: `multi_replace failed: ${errorMessage(error)}`,
    };
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

// escapeRegex — imported from @rodrigo-barraza/utilities-library



// Export validatePath and ALLOWED_ROOTS for reuse in other agentic services
export { validatePath, ALLOWED_ROOTS };

/**
 * Return only the immutable roots from config.js (for UI "pinned" distinction).
 */
export function getStaticRoots() {
  return [...STATIC_ROOTS];
}

/**
 * Normalize a workspace path for the host OS.
 * Windows-style paths (e.g. C:\Users\foo) are translated to WSL mount
 * paths (/mnt/c/Users/foo) when the server runs on Linux/macOS.
 * All other paths are resolved as POSIX absolute paths.
 */
export function normalizeWorkspacePath(rawPath: string): string | null {
  if (!rawPath || typeof rawPath !== "string") return null;
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  const windowsPathMatch = trimmed.match(/^([A-Za-z]):[/\\](.*)/);
  if (windowsPathMatch) {
    const driveLetter = windowsPathMatch[1].toLowerCase();
    const remainingPath = windowsPathMatch[2].replace(/\\/g, "/");
    return `/mnt/${driveLetter}/${remainingPath}`;
  }

  return resolve(trimmed);
}

/**
 * Merge extra roots (from MongoDB user config) into ALLOWED_ROOTS.
 * Static roots are always preserved. Duplicates are de-duped.
 * Mutates the array in-place so all importers see the update.
 * Windows paths are auto-translated to WSL mount paths on Linux hosts.
 */
export function refreshAllowedRoots(extraRoots: string[] = []) {
  const resolved = extraRoots
    .filter((r: string) => r && typeof r === "string")
    .map((r: string) => normalizeWorkspacePath(r))
    .filter((r): r is string => r !== null);

  const merged = [...STATIC_ROOTS];
  for (const root of resolved) {
    if (!merged.includes(root)) {
      merged.push(root);
    }
  }

  // Mutate in-place so importers see the change
  ALLOWED_ROOTS.length = 0;
  ALLOWED_ROOTS.push(...merged);
}

/**
 * Get the file service metadata (for health checks).
 */
export function getAgenticFileHealth() {
  return {
    allowedRoots: ALLOWED_ROOTS,
    maxReadBytes: WORKSPACE_MAX_READ_BYTES,
    maxWriteBytes: WORKSPACE_MAX_WRITE_BYTES,
    maxLinesPerRead: WORKSPACE_MAX_LINES_PER_READ,
    maxGrepResults: WORKSPACE_MAX_GREP_RESULTS,
    maxGlobResults: WORKSPACE_MAX_GLOB_RESULTS,
    maxDirEntries: WORKSPACE_MAX_DIRECTORY_ENTRIES,
  };
}
