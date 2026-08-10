// ─── Code Intelligence Operations ───────────────────────────

import { readFile, stat } from "node:fs/promises";
import { resolve, extname, relative, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  getLspManager,
  shutdownAllLspManagers,
  getAllLspHealth,
} from "./lsp/LspServerManager.ts";
import type {
  FileDiagnostics,
  LspRawDiagnostic,
} from "./lsp/LspServerManager.ts";
import type { LspParams } from "./lsp/LspClient.ts";
import { ALLOWED_ROOTS, validatePath } from "./AgenticFileService.ts";
import { errorMessage } from "../utilities.ts";
import PromptLocaleService from "./PromptLocaleService.ts";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface LspOperation {
  method: string;
  needsPosition: boolean;
  description: string;
}

interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface LspLocation {
  uri?: string;
  targetUri?: string;
  range?: LspRange;
  targetRange?: LspRange;
  targetSelectionRange?: LspRange;
}

interface LspHoverResult {
  contents:
    | string
    | { kind?: string; value?: string; language?: string }
    | Array<string | { value?: string; language?: string }>;
}

interface LspSymbol {
  name: string;
  kind: number;
  detail?: string;
  containerName?: string;
  location?: { range?: LspRange };
  selectionRange?: LspRange;
  range?: LspRange;
  children?: LspSymbol[];
}

interface LspActionParams {
  operation: string;
  filePath: string;
  line?: number;
  character?: number;
  workspacePath?: string;
  /** New symbol name — required by (and only used by) the 'rename' operation. */
  newName?: string;
  // Optional locale for error/hint prompts. Defaults to "en" when absent, so
  // this is backward compatible with callers that never pass it.
  locale?: string;
}

// LSP WorkspaceEdit (subset) — result shape of textDocument/rename
interface LspTextEdit {
  range: LspRange;
  newText: string;
}

interface LspWorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: Array<{
    textDocument?: { uri: string; version?: number | null };
    edits?: LspTextEdit[];
  }>;
}

// ────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_FOR_OPEN = 1_048_576; // 1 MB — don't send huge files to LSP
const MAX_LOCATIONS_RETURNED = 30; // Cap locations in results
const MAX_SYMBOLS_RETURNED = 100; // Cap symbols for documentSymbol
const MAX_DIAGNOSTICS_RETURNED = 100; // Cap diagnostics for a single file
const DIAGNOSTICS_TIMEOUT_MS = 8_000; // Max wait for a fresh publish

// Extension whitelist — only open files we can actually process
const SUPPORTED_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".pyi",
  ".rs",
  ".go",
  ".mod",
  ".sum",
  ".c",
  ".h",
  ".cpp",
  ".cxx",
  ".cc",
  ".hpp",
  ".hxx",
  ".hh",
  ".lua",
]);

// ── Supported operations ─────────────────────────────────────

const OPERATIONS: Record<string, LspOperation> = {
  diagnostics: {
    // Push-based (textDocument/publishDiagnostics) — handled specially in
    // agenticLspAction rather than via sendRequest. Closes the edit-verify
    // loop; pattern follows https://github.com/isaacphi/mcp-language-server
    // and https://github.com/oraios/serena
    method: "textDocument/publishDiagnostics",
    needsPosition: false,
    description: "Get errors and warnings for a file",
  },
  goToDefinition: {
    method: "textDocument/definition",
    needsPosition: true,
    description: "Jump to where a symbol is defined",
  },
  findReferences: {
    method: "textDocument/references",
    needsPosition: true,
    description: "Find all usages of a symbol across the workspace",
  },
  hover: {
    method: "textDocument/hover",
    needsPosition: true,
    description: "Get type information and documentation for a symbol",
  },
  documentSymbol: {
    method: "textDocument/documentSymbol",
    needsPosition: false,
    description: "Get all symbols (functions, classes, variables) in a file",
  },
  goToImplementation: {
    method: "textDocument/implementation",
    needsPosition: true,
    description: PromptLocaleService.get("en", "prompts.lsp.implementations-label"),
  },
  rename: {
    // Returns the workspace edit set — applying it is the CALLER's choice.
    method: "textDocument/rename",
    needsPosition: true,
    description: "Compute the edit set for renaming a symbol everywhere",
  },
};

// ────────────────────────────────────────────────────────────
// Path Validation (lightweight — reuses logic from FileService)
// ────────────────────────────────────────────────────────────

function validateLspPath(inputPath: string | undefined) {
  if (!inputPath || typeof inputPath !== "string") {
    return { safe: false as const, error: "'filePath' is required (string)" };
  }

  // Same sandbox rules as every other file tool — including the
  // request-scoped X-Workspace-Override (worktree) that the plain
  // ALLOWED_ROOTS check used to ignore, denying LSP requests for files the
  // file tools could freely read and edit.
  const validation = validatePath(inputPath);
  if (!validation.safe) {
    return { safe: false as const, error: validation.error! };
  }
  return { safe: true as const, resolved: validation.resolved };
}

// ────────────────────────────────────────────────────────────
// Core: agenticLspAction
// ────────────────────────────────────────────────────────────

/**
 * Execute an LSP code intelligence operation.
 */
export async function agenticLspAction({
  operation,
  filePath,
  line,
  character,
  workspacePath,
  newName,
  locale = "en",
}: LspActionParams) {
  // ── 1. Validate operation ──────────────────────────────────
  if (!operation || !OPERATIONS[operation]) {
    return {
      error: `Unknown operation '${operation}'. Supported: ${Object.keys(OPERATIONS).join(", ")}`,
    };
  }

  const opDef = OPERATIONS[operation];

  // ── 2. Validate file path ─────────────────────────────────
  const validation = validateLspPath(filePath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const resolvedPath = validation.resolved;
  const fileExtension = extname(resolvedPath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(fileExtension)) {
    return {
      error: `LSP does not support '${fileExtension}' files. Supported: ${[...SUPPORTED_EXTENSIONS].join(", ")}`,
    };
  }

  // ── 3. Validate position (if needed) ──────────────────────
  if (opDef.needsPosition) {
    if (line == null || character == null) {
      return {
        error: `Operation '${operation}' requires 'line' and 'character' (1-based)`,
      };
    }
    if (typeof line !== "number" || line < 1) {
      return { error: "'line' must be a positive integer (1-based)" };
    }
    if (typeof character !== "number" || character < 1) {
      return { error: "'character' must be a positive integer (1-based)" };
    }
  }

  // ── 3b. Validate newName (rename only) ────────────────────
  if (operation === "rename") {
    if (!newName || typeof newName !== "string" || !newName.trim()) {
      return {
        error: "Operation 'rename' requires 'newName' (non-empty string)",
      };
    }
  }

  // ── 4. Read file content ──────────────────────────────────
  let fileContent: string;
  try {
    const stats = await stat(resolvedPath);
    if (stats.isDirectory()) {
      return { error: `'${resolvedPath}' is a directory, not a file` };
    }
    if (stats.size > MAX_FILE_SIZE_FOR_OPEN) {
      return {
        error: `File is too large (${(stats.size / 1024).toFixed(0)} KB). Maximum: ${MAX_FILE_SIZE_FOR_OPEN / 1024} KB`,
      };
    }
    fileContent = await readFile(resolvedPath, "utf-8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { error: `File not found: ${resolvedPath}` };
    }
    return { error: `Cannot read file: ${errorMessage(error)}` };
  }

  // ── 5. Determine & validate workspace root ─────────────────
  // An explicit workspacePath must live inside an allowed root — otherwise a
  // varying/attacker-controlled path both escapes the sandbox and spawns a new
  // language-server keyed by that raw string.
  let workspaceRoot: string;
  if (workspacePath != null) {
    if (typeof workspacePath !== "string") {
      return { error: "'workspacePath' must be a string" };
    }
    const workspaceValidation = validatePath(workspacePath);
    if (!workspaceValidation.safe) {
      return {
        error: `workspacePath: ${workspaceValidation.error}`,
      };
    }
    // Normalized (resolved) path is used as the manager key downstream.
    workspaceRoot = workspaceValidation.resolved;
  } else {
    workspaceRoot = resolvedWorkspace(resolvedPath, undefined);
  }

  // ── 6. Get manager & ensure file is open ───────────────────
  // Timestamp taken BEFORE didOpen/didChange: only diagnostics published in
  // response to this sync (or later) count as fresh.
  const diagnosticsSince = Date.now();
  let manager: ReturnType<typeof getLspManager>;
  try {
    manager = getLspManager(workspaceRoot);
    // If the document is already open on the server, push the current file
    // content via didChange (incremented version) so queries reflect edits
    // made since it was first opened. openFile() skips already-open URIs, so
    // without this the server would answer about stale text.
    if (manager.isFileOpen(resolvedPath)) {
      await manager.changeFile(resolvedPath, fileContent);
    } else {
      await manager.openFile(resolvedPath, fileContent);
    }
  } catch (error: unknown) {
    return {
      error: `LSP server failed to start for '${fileExtension}' files: ${errorMessage(error)}`,
      hint: PromptLocaleService.get(locale, "prompts.lsp.server-not-installed-hint"),
    };
  }

  // ── 6b. Diagnostics are pushed, not requested — wait for the publish ──
  if (operation === "diagnostics") {
    const entry = await manager.waitForDiagnostics(resolvedPath, {
      since: diagnosticsSince,
      timeoutMs: DIAGNOSTICS_TIMEOUT_MS,
    });
    return formatDiagnostics(entry, resolvedPath, diagnosticsSince);
  }

  // ── 7. Build LSP params ────────────────────────────────────
  const fileUri = pathToFileURL(resolvedPath).href;
  let lspParams: Record<string, unknown>;

  if (opDef.needsPosition) {
    // Convert 1-based (user) → 0-based (LSP)
    lspParams = {
      textDocument: { uri: fileUri },
      position: {
        line: line! - 1,
        character: character! - 1,
      },
    };

    // findReferences needs 'context' param
    if (operation === "findReferences") {
      lspParams.context = { includeDeclaration: true };
    }

    // rename carries the new symbol name
    if (operation === "rename") {
      lspParams.newName = newName!.trim();
    }
  } else {
    // documentSymbol — no position needed
    lspParams = {
      textDocument: { uri: fileUri },
    };
  }

  // ── 8. Send request ────────────────────────────────────────
  let result: unknown;
  try {
    result = await manager.sendRequest(
      resolvedPath,
      opDef.method,
      lspParams as LspParams,
    );
  } catch (error: unknown) {
    return {
      error: `LSP request '${opDef.method}' failed: ${errorMessage(error)}`,
    };
  }

  // ── 9. Format & return ─────────────────────────────────────
  try {
    return formatResult(operation, result, resolvedPath, workspaceRoot, locale);
  } catch (error: unknown) {
    return { error: `Failed to format result: ${errorMessage(error)}` };
  }
}

// ────────────────────────────────────────────────────────────
// Result Formatters
// ────────────────────────────────────────────────────────────

function formatResult(
  operation: string,
  result: unknown,
  filePath: string,
  workspaceRoot: string,
  locale: string = "en",
) {
  if (result === null || result === undefined) {
    return {
      operation,
      filePath,
      result: null,
      message: PromptLocaleService.get(locale, "prompts.lsp.no-results-hint"),
    };
  }

  switch (operation) {
    case "goToDefinition":
    case "goToImplementation":
      return formatLocations(
        operation,
        result as LspLocation | LspLocation[],
        filePath,
        workspaceRoot,
      );
    case "findReferences":
      return formatLocations(
        operation,
        result as LspLocation | LspLocation[],
        filePath,
        workspaceRoot,
      );
    case "hover":
      return formatHover(result as LspHoverResult, filePath);
    case "documentSymbol":
      return formatSymbols(result as LspSymbol[], filePath, workspaceRoot);
    case "rename":
      return formatRenameEdits(
        result as LspWorkspaceEdit,
        filePath,
        workspaceRoot,
        locale,
      );
    default:
      return { operation, filePath, result };
  }
}

function formatLocations(
  operation: string,
  result: LspLocation | LspLocation[],
  filePath: string,
  workspaceRoot: string,
) {
  // Normalize to array (some servers return single Location)
  const locations = Array.isArray(result) ? result : result ? [result] : [];

  if (locations.length === 0) {
    return {
      operation,
      filePath,
      result: null,
      count: 0,
      message: "No locations found.",
    };
  }

  const formatted = locations
    .slice(0, MAX_LOCATIONS_RETURNED)
    .map((loc) => {
      // Handle both Location and LocationLink
      const uri = loc.targetUri || loc.uri;
      const range = loc.targetRange || loc.targetSelectionRange || loc.range;

      if (!uri || !range) return null;

      let targetPath: string;
      try {
        targetPath = fileURLToPath(uri);
      } catch {
        targetPath = uri;
      }

      const relativePath = workspaceRoot ? relative(workspaceRoot, targetPath) : targetPath;

      return {
        file: targetPath,
        relativePath,
        line: range.start.line + 1, // 0-based → 1-based
        character: range.start.character + 1,
        endLine: range.end.line + 1,
        endCharacter: range.end.character + 1,
      };
    })
    .filter(Boolean);

  return {
    operation,
    filePath,
    count: formatted.length,
    totalFound: locations.length,
    truncated: locations.length > MAX_LOCATIONS_RETURNED,
    locations: formatted,
  };
}

function formatHover(result: LspHoverResult, filePath: string) {
  if (!result || !result.contents) {
    return {
      operation: "hover",
      filePath,
      result: null,
      message: "No hover information available.",
    };
  }

  // MarkupContent
  if (
    typeof result.contents === "object" &&
    !Array.isArray(result.contents) &&
    "kind" in result.contents &&
    result.contents.kind
  ) {
    return {
      operation: "hover",
      filePath,
      content: result.contents.value,
      contentKind: result.contents.kind,
    };
  }

  // String
  if (typeof result.contents === "string") {
    return {
      operation: "hover",
      filePath,
      content: result.contents,
      contentKind: "plaintext",
    };
  }

  // MarkedString[] (deprecated, some servers still use it)
  if (Array.isArray(result.contents)) {
    const parts = result.contents
      .map((content) => {
        if (typeof content === "string") return content;
        if (content.value)
          return `\`\`\`${content.language || ""}\n${content.value}\n\`\`\``;
        return "";
      })
      .filter(Boolean);

    return {
      operation: "hover",
      filePath,
      content: parts.join("\n\n"),
      contentKind: "markdown",
    };
  }

  // Single MarkedString
  if (
    typeof result.contents === "object" &&
    "value" in result.contents &&
    result.contents.value
  ) {
    return {
      operation: "hover",
      filePath,
      content: result.contents.value,
      contentKind: result.contents.language ? "markdown" : "plaintext",
    };
  }

  return {
    operation: "hover",
    filePath,
    result: result.contents,
    contentKind: "unknown",
  };
}

/**
 * Format a textDocument/rename WorkspaceEdit into a per-file edit set.
 * Edits are RETURNED, never applied — the caller decides whether to apply
 * them (e.g. via replace_in_file / write_file), keeping rename side-effect
 * free on the server.
 */
function formatRenameEdits(
  result: LspWorkspaceEdit,
  filePath: string,
  workspaceRoot: string,
  locale: string,
) {
  // Normalize both WorkspaceEdit encodings into uri → TextEdit[]
  const editsByUri = new Map<string, LspTextEdit[]>();

  for (const [uri, edits] of Object.entries(result?.changes ?? {})) {
    if (Array.isArray(edits) && edits.length > 0) {
      editsByUri.set(uri, [...(editsByUri.get(uri) ?? []), ...edits]);
    }
  }
  for (const documentChange of result?.documentChanges ?? []) {
    const uri = documentChange?.textDocument?.uri;
    const edits = documentChange?.edits;
    if (uri && Array.isArray(edits) && edits.length > 0) {
      editsByUri.set(uri, [...(editsByUri.get(uri) ?? []), ...edits]);
    }
  }

  if (editsByUri.size === 0) {
    return {
      operation: "rename",
      filePath,
      result: null,
      message: PromptLocaleService.get(locale, "prompts.lsp.no-results-hint"),
    };
  }

  let totalEdits = 0;
  const files = [...editsByUri.entries()].map(([uri, edits]) => {
    let targetPath: string;
    try {
      targetPath = fileURLToPath(uri);
    } catch {
      targetPath = uri;
    }
    const formattedEdits = edits
      .map((edit) => ({
        line: (edit.range?.start?.line ?? 0) + 1, // 0-based → 1-based
        character: (edit.range?.start?.character ?? 0) + 1,
        endLine: (edit.range?.end?.line ?? 0) + 1,
        endCharacter: (edit.range?.end?.character ?? 0) + 1,
        newText: edit.newText,
      }))
      .sort((a, b) => a.line - b.line || a.character - b.character);
    totalEdits += formattedEdits.length;
    return {
      file: targetPath,
      relativePath: workspaceRoot
        ? relative(workspaceRoot, targetPath)
        : targetPath,
      editCount: formattedEdits.length,
      edits: formattedEdits,
    };
  });

  return {
    operation: "rename",
    filePath,
    applied: false,
    fileCount: files.length,
    totalEdits,
    files,
    message: PromptLocaleService.get(locale, "prompts.lsp.rename-not-applied"),
  };
}

const DIAGNOSTIC_SEVERITY_MAP: Record<number, string> = {
  1: "error",
  2: "warning",
  3: "info",
  4: "hint",
};

function formatDiagnostics(
  entry: FileDiagnostics | undefined,
  filePath: string,
  since: number,
) {
  if (!entry) {
    return {
      operation: "diagnostics",
      filePath,
      status: "unavailable",
      message:
        "The language server did not report diagnostics in time. Retry once — " +
        "after a cold start the server may still be analyzing the project.",
    };
  }

  // A publish older than this request's file sync survived the wait timeout —
  // results describe an earlier version of the file.
  const stale = entry.receivedAt < since;

  const sorted = [...entry.diagnostics].sort((a, b) => {
    const lineDelta = (a.range?.start?.line ?? 0) - (b.range?.start?.line ?? 0);
    if (lineDelta !== 0) return lineDelta;
    return (a.range?.start?.character ?? 0) - (b.range?.start?.character ?? 0);
  });

  const formatted = sorted
    .slice(0, MAX_DIAGNOSTICS_RETURNED)
    .map((diagnostic: LspRawDiagnostic) => ({
      severity:
        DIAGNOSTIC_SEVERITY_MAP[diagnostic.severity ?? 3] ?? "info",
      line: (diagnostic.range?.start?.line ?? 0) + 1, // 0-based → 1-based
      character: (diagnostic.range?.start?.character ?? 0) + 1,
      endLine: (diagnostic.range?.end?.line ?? 0) + 1,
      endCharacter: (diagnostic.range?.end?.character ?? 0) + 1,
      message: diagnostic.message,
      ...(diagnostic.code != null && { code: diagnostic.code }),
      ...(diagnostic.source && { source: diagnostic.source }),
    }));

  const counts: Record<string, number> = {};
  for (const diagnostic of formatted) {
    counts[diagnostic.severity] = (counts[diagnostic.severity] ?? 0) + 1;
  }

  return {
    operation: "diagnostics",
    filePath,
    count: formatted.length,
    totalFound: sorted.length,
    truncated: sorted.length > MAX_DIAGNOSTICS_RETURNED,
    counts,
    diagnostics: formatted,
    ...(stale && {
      stale: true,
      message:
        "The server did not re-analyze in time; these diagnostics may describe " +
        "an earlier version of the file. Retry to refresh.",
    }),
    ...(!stale &&
      sorted.length === 0 && {
        message: "No problems reported — the file is clean.",
      }),
  };
}

function formatSymbols(result: LspSymbol[], filePath: string, _workspaceRoot: string) {
  if (!result || !Array.isArray(result) || result.length === 0) {
    return {
      operation: "documentSymbol",
      filePath,
      count: 0,
      symbols: [],
      message: "No symbols found in file.",
    };
  }

  // Truncation must be judged against the FLATTENED list (what we actually
  // slice), not the top-level array — a file with few top-level symbols but
  // many nested members would otherwise report truncated:false while dropping
  // members.
  const flattened = flattenSymbols(result);
  const symbols = flattened.slice(0, MAX_SYMBOLS_RETURNED);

  return {
    operation: "documentSymbol",
    filePath,
    count: symbols.length,
    totalFound: flattened.length,
    truncated: flattened.length > MAX_SYMBOLS_RETURNED,
    symbols,
  };
}

/**
 * Flatten hierarchical DocumentSymbol[] into a flat list with depth info.
 */
function flattenSymbols(symbols: LspSymbol[], depth: number = 0) {
  const result: Array<Record<string, unknown>> = [];

  for (const symbol of symbols) {
    // SymbolInformation (flat — used by some servers)
    if (symbol.location) {
      result.push({
        name: symbol.name,
        kind: symbolKindToString(symbol.kind),
        line:
          symbol.location.range?.start?.line != null
            ? symbol.location.range.start.line + 1
            : null,
        container: symbol.containerName || null,
        depth,
      });
      continue;
    }

    // DocumentSymbol (hierarchical)
    const range = symbol.selectionRange || symbol.range;
    result.push({
      name: symbol.name,
      kind: symbolKindToString(symbol.kind),
      detail: symbol.detail || null,
      line: range?.start?.line != null ? range.start.line + 1 : null,
      endLine: range?.end?.line != null ? range.end.line + 1 : null,
      depth,
    });

    // Recurse into children
    if (symbol.children && symbol.children.length > 0) {
      result.push(...flattenSymbols(symbol.children, depth + 1));
    }
  }

  return result;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const SYMBOL_KIND_MAP: Record<number, string> = {
  1: "File",
  2: "Module",
  3: "Namespace",
  4: "Package",
  5: "Class",
  6: "Method",
  7: "Property",
  8: "Field",
  9: "Constructor",
  10: "Enum",
  11: "Interface",
  12: "Function",
  13: "Variable",
  14: "Constant",
  15: "String",
  16: "Number",
  17: "Boolean",
  18: "Array",
  19: "Object",
  20: "Key",
  21: "Null",
  22: "EnumMember",
  23: "Struct",
  24: "Event",
  25: "Operator",
  26: "TypeParameter",
};

function symbolKindToString(kind: number) {
  return SYMBOL_KIND_MAP[kind] || `Unknown(${kind})`;
}

/**
 * Determine the workspace root for a file.
 * Tries: explicit override → ALLOWED_ROOTS match → dirname fallback.
 */
function resolvedWorkspace(
  filePath: string,
  explicitWorkspace: string | undefined,
) {
  if (explicitWorkspace) return resolve(explicitWorkspace);

  // Find the allowed root that contains this file
  for (const root of ALLOWED_ROOTS) {
    if (filePath.startsWith(root + "/") || filePath === root) {
      return root;
    }
  }

  return dirname(filePath);
}

// ────────────────────────────────────────────────────────────
// Batch Diagnostics
// ────────────────────────────────────────────────────────────

const MAX_FILES_PER_DIAGNOSTICS_BATCH = 20;

interface LspDiagnosticsBatchParams {
  files: string[];
  workspacePath?: string;
  locale?: string;
}

/**
 * Diagnostics for a batch of files in ONE call. Files are synced and awaited
 * concurrently; the per-workspace manager dedupe means all files sharing a
 * workspace root reuse a single language-server process. This is the endpoint
 * post-edit validation loops should hit instead of running a whole-project
 * compiler once per edited file.
 */
export async function agenticLspDiagnosticsBatch({
  files,
  workspacePath,
  locale = "en",
}: LspDiagnosticsBatchParams) {
  if (!Array.isArray(files) || files.length === 0) {
    return { error: "'files' must be a non-empty array of absolute paths" };
  }
  if (files.length > MAX_FILES_PER_DIAGNOSTICS_BATCH) {
    return {
      error: `Maximum ${MAX_FILES_PER_DIAGNOSTICS_BATCH} files per diagnostics batch. Received ${files.length}.`,
    };
  }

  // De-dupe while preserving order so a repeated path is analyzed once.
  const uniqueFiles = [...new Set(files.filter((f) => typeof f === "string"))];

  const results = await Promise.all(
    uniqueFiles.map(async (filePath) => {
      const result = await agenticLspAction({
        operation: "diagnostics",
        filePath,
        workspacePath,
        locale,
      });
      return { filePath, ...result };
    }),
  );

  const counts: Record<string, number> = {};
  for (const fileResult of results) {
    const fileCounts = (fileResult as { counts?: Record<string, number> })
      .counts;
    for (const [severity, count] of Object.entries(fileCounts ?? {})) {
      counts[severity] = (counts[severity] ?? 0) + count;
    }
  }

  return {
    operation: "diagnostics",
    fileCount: results.length,
    counts,
    files: results,
  };
}

// ────────────────────────────────────────────────────────────
// Re-exports for routes
// ────────────────────────────────────────────────────────────

export { shutdownAllLspManagers as agenticLspShutdown };
export { getAllLspHealth as agenticLspHealth };

// Exposed for unit testing only (truncation-flag correctness).
export { formatSymbols as __formatSymbolsForTest };
export { formatDiagnostics as __formatDiagnosticsForTest };
