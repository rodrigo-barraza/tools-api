// ─── Code Intelligence Operations ───────────────────────────

import { readFile, stat } from "node:fs/promises";
import { resolve, extname, relative, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  getLspManager,
  shutdownAllLspManagers,
  getAllLspHealth,
} from "./lsp/LspServerManager.ts";
import type { LspParams } from "./lsp/LspClient.ts";
import { ALLOWED_ROOTS } from "./AgenticFileService.ts";
import { errorMessage } from "../utilities.ts";

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
}

// ────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_FOR_OPEN = 1_048_576; // 1 MB — don't send huge files to LSP
const MAX_LOCATIONS_RETURNED = 30; // Cap locations in results
const MAX_SYMBOLS_RETURNED = 100; // Cap symbols for documentSymbol

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
    description:
      "Find concrete implementations of an interface or abstract class",
  },
};

// ────────────────────────────────────────────────────────────
// Path Validation (lightweight — reuses logic from FileService)
// ────────────────────────────────────────────────────────────

function validateLspPath(inputPath: string | undefined) {
  if (!inputPath || typeof inputPath !== "string") {
    return { safe: false as const, error: "'filePath' is required (string)" };
  }

  const resolved = resolve(inputPath);
  const inAllowedRoot = ALLOWED_ROOTS.some(
    (root: string) => resolved.startsWith(root + "/") || resolved === root,
  );

  if (!inAllowedRoot) {
    return {
      safe: false as const,
      error: `Path '${resolved}' is outside allowed roots`,
    };
  }

  return { safe: true as const, resolved };
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

  // ── 5. Determine workspace root ────────────────────────────
  const wsRoot = resolvedWorkspace(resolvedPath, workspacePath);

  // ── 6. Get manager & ensure file is open ───────────────────
  let manager: ReturnType<typeof getLspManager>;
  try {
    manager = getLspManager(wsRoot);
    await manager.openFile(resolvedPath, fileContent);
  } catch (error: unknown) {
    return {
      error: `LSP server failed to start for '${fileExtension}' files: ${errorMessage(error)}`,
      hint: "The language server may not be installed. Check that npx can find the server binary.",
    };
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
    return formatResult(operation, result, resolvedPath, wsRoot);
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
  wsRoot: string,
) {
  if (result === null || result === undefined) {
    return {
      operation,
      filePath,
      result: null,
      message:
        "No results found — the symbol may be external, unresolvable, or the server hasn't finished indexing. Try again in a few seconds.",
    };
  }

  switch (operation) {
    case "goToDefinition":
    case "goToImplementation":
      return formatLocations(
        operation,
        result as LspLocation | LspLocation[],
        filePath,
        wsRoot,
      );
    case "findReferences":
      return formatLocations(
        operation,
        result as LspLocation | LspLocation[],
        filePath,
        wsRoot,
      );
    case "hover":
      return formatHover(result as LspHoverResult, filePath);
    case "documentSymbol":
      return formatSymbols(result as LspSymbol[], filePath, wsRoot);
    default:
      return { operation, filePath, result };
  }
}

function formatLocations(
  operation: string,
  result: LspLocation | LspLocation[],
  filePath: string,
  wsRoot: string,
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

      const relativePath = wsRoot ? relative(wsRoot, targetPath) : targetPath;

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

function formatSymbols(result: LspSymbol[], filePath: string, _wsRoot: string) {
  if (!result || !Array.isArray(result) || result.length === 0) {
    return {
      operation: "documentSymbol",
      filePath,
      count: 0,
      symbols: [],
      message: "No symbols found in file.",
    };
  }

  const symbols = flattenSymbols(result).slice(0, MAX_SYMBOLS_RETURNED);

  return {
    operation: "documentSymbol",
    filePath,
    count: symbols.length,
    truncated: result.length > MAX_SYMBOLS_RETURNED,
    symbols,
  };
}

/**
 * Flatten hierarchical DocumentSymbol[] into a flat list with depth info.
 */
function flattenSymbols(symbols: LspSymbol[], depth: number = 0) {
  const result: Array<Record<string, unknown>> = [];

  for (const sym of symbols) {
    // SymbolInformation (flat — used by some servers)
    if (sym.location) {
      result.push({
        name: sym.name,
        kind: symbolKindToString(sym.kind),
        line:
          sym.location.range?.start?.line != null
            ? sym.location.range.start.line + 1
            : null,
        container: sym.containerName || null,
        depth,
      });
      continue;
    }

    // DocumentSymbol (hierarchical)
    const range = sym.selectionRange || sym.range;
    result.push({
      name: sym.name,
      kind: symbolKindToString(sym.kind),
      detail: sym.detail || null,
      line: range?.start?.line != null ? range.start.line + 1 : null,
      endLine: range?.end?.line != null ? range.end.line + 1 : null,
      depth,
    });

    // Recurse into children
    if (sym.children && sym.children.length > 0) {
      result.push(...flattenSymbols(sym.children, depth + 1));
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
// Re-exports for routes
// ────────────────────────────────────────────────────────────

export { shutdownAllLspManagers as agenticLspShutdown };
export { getAllLspHealth as agenticLspHealth };
