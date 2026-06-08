// ─── Smoke Tests for Agent Tools ────────────────────────────

import { writeFile, unlink, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  agenticReadFile,
  agenticListDirectory,
  agenticGrepSearch,
  agenticGlobFiles,
  agenticMultiFileRead,
  agenticFileInfo,
  agenticWriteFile,
  agenticDeleteFile,
  agenticStringReplace,
  agenticPatchFile,
  agenticFileDiff,
  agenticMoveFile,
} from "./AgenticFileService.ts";
import { agenticFetchUrl, agenticWebSearch } from "./AgenticWebService.ts";
import { readPdfUrl } from "../fetchers/web/PdfFetcher.ts";
import { readDocxUrl } from "../fetchers/web/DocxFetcher.ts";
import { readSpreadsheetUrl } from "../fetchers/web/SpreadsheetFetcher.ts";
import { executeCommand } from "./AgenticCommandService.ts";
import { agenticProjectSummary } from "./AgenticProjectService.ts";
import { agenticToolSearch } from "./AgenticToolSearchService.ts";
import { WORKSPACE_ROOTS } from "../config.ts";
import { errorMessage } from "../utilities.ts";

// ── Test Fixture ─────────────────────────────────────────────
// Lazily resolved — WORKSPACE_ROOTS may be empty at import time
// (e.g. when users configure workspaces via the Settings UI).

export type ToolTestResult =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null
  | undefined
  | object;

export interface TransformedToolTestResult {
  tool: string;
  success: boolean;
  duration: number;
  message: string;
  details?: ToolTestResult;
}

let _fixtureDir: string | undefined;
let _fixtureFile: string | undefined;

function getFixtureDir() {
  if (!_fixtureDir) {
    const root = WORKSPACE_ROOTS[0];
    if (!root)
      throw new Error("Cannot run tool tests — no WORKSPACE_ROOTS configured.");
    _fixtureDir = join(resolve(root), ".tool-test-fixtures");
  }
  return _fixtureDir;
}

function getFixtureFile() {
  if (!_fixtureFile) {
    _fixtureFile = join(getFixtureDir(), "test_fixture.js");
  }
  return _fixtureFile;
}
const FIXTURE_CONTENT = `// Tool test fixture — auto-generated, safe to delete
export function greet(name) {
  return \`Hello, \${name}!\`;
}

export const PI = 3.14159;

export class Calculator {
  add(a, b) { return a + b; }
  subtract(a, b) { return a - b; }
}
`;

async function ensureFixture() {
  await mkdir(getFixtureDir(), { recursive: true });
  await writeFile(getFixtureFile(), FIXTURE_CONTENT, "utf-8");
}

async function cleanupFixture() {
  // Remove any leftover test files
  const candidates = [
    getFixtureFile(),
    join(getFixtureDir(), "write_test.txt"),
    join(getFixtureDir(), "delete_test.txt"),
    join(getFixtureDir(), "move_src.txt"),
    join(getFixtureDir(), "move_dst.txt"),
    join(getFixtureDir(), "str_replace_test.js"),
    join(getFixtureDir(), "patch_test.js"),
    join(getFixtureDir(), "diff_b.js"),
  ];
  for (const fixturePath of candidates) {
    try {
      await unlink(fixturePath);
    } catch {
      /* ignore */
    }
  }
  try {
    const { rmdir } = await import("node:fs/promises");
    await rmdir(getFixtureDir());
  } catch {
    /* ignore — dir might not be empty */
  }
}

// ── Test Runner ──────────────────────────────────────────────

async function runTest(
  name: string,
  testFunction: () => Promise<ToolTestResult> | ToolTestResult,
): Promise<TransformedToolTestResult> {
  const start = performance.now();
  try {
    const result = await testFunction();
    const duration = Math.round(performance.now() - start);

    // Check if the service returned an error object
    if (
      result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      "error" in result
    ) {
      return {
        tool: name,
        success: false,
        duration,
        message: String((result as { error: unknown }).error),
        details: result,
      };
    }

    return {
      tool: name,
      success: true,
      duration,
      message: "OK",
      details: result,
    };
  } catch (error: unknown) {
    const duration = Math.round(performance.now() - start);
    return {
      tool: name,
      success: false,
      duration,
      message: errorMessage(error) || String(error),
    };
  }
}

// ── Test Definitions ─────────────────────────────────────────
// Every tool with label "coding" in TOOL_LABELS gets a test.
// Tests call the actual service functions with correct positional
// argument signatures.
//
// Grouped by domain for readability.

const TESTS = {
  // ── File Operations ──────────────────────────────────────

  read_file: () =>
    runTest("read_file", () => agenticReadFile(getFixtureFile())),

  write_file: () =>
    runTest("write_file", async () => {
      const testFile = join(getFixtureDir(), "write_test.txt");
      const result = await agenticWriteFile(testFile, "smoke test\n");
      try {
        await unlink(testFile);
      } catch {
        /* ignore */
      }
      return result;
    }),

  replace_in_file: () =>
    runTest("replace_in_file", async () => {
      // Create a dedicated copy for this test
      const testFile = join(getFixtureDir(), "str_replace_test.js");
      await writeFile(testFile, FIXTURE_CONTENT, "utf-8");
      const result = await agenticStringReplace(testFile, "3.14159", "3.14");
      try {
        await unlink(testFile);
      } catch {
        /* ignore */
      }
      return result;
    }),

  patch_file: () =>
    runTest("patch_file", async () => {
      const testFile = join(getFixtureDir(), "patch_test.js");
      await writeFile(testFile, "line1\nline2\nline3\n", "utf-8");
      // agenticPatchFile expects a unified diff string
      const unifiedPatch =
        "--- a/patch_test.js\n" +
        "+++ b/patch_test.js\n" +
        "@@ -1,3 +1,3 @@\n" +
        " line1\n" +
        "-line2\n" +
        "+PATCHED\n" +
        " line3\n";
      const result = await agenticPatchFile(testFile, unifiedPatch);
      try {
        await unlink(testFile);
      } catch {
        /* ignore */
      }
      return result;
    }),

  read_files: () =>
    runTest("read_files", () =>
      agenticMultiFileRead([{ path: getFixtureFile() }]),
    ),

  get_file_info: () =>
    runTest("get_file_info", () => agenticFileInfo([getFixtureFile()])),

  diff_files: () =>
    runTest("diff_files", async () => {
      const fileB = join(getFixtureDir(), "diff_b.js");
      await writeFile(
        fileB,
        FIXTURE_CONTENT.replace("3.14159", "2.71828"),
        "utf-8",
      );
      const result = await agenticFileDiff(getFixtureFile(), { pathB: fileB });
      try {
        await unlink(fileB);
      } catch {
        /* ignore */
      }
      return result;
    }),

  move_file: () =>
    runTest("move_file", async () => {
      const sourcePath = join(getFixtureDir(), "move_src.txt");
      const destinationPath = join(getFixtureDir(), "move_dst.txt");
      await writeFile(sourcePath, "move test\n", "utf-8");
      const result = await agenticMoveFile(sourcePath, destinationPath);
      // Cleanup destination
      try {
        await unlink(destinationPath);
      } catch {
        /* ignore */
      }
      try {
        await unlink(sourcePath);
      } catch {
        /* ignore */
      }
      return result;
    }),

  delete_file: () =>
    runTest("delete_file", async () => {
      const tempFile = join(getFixtureDir(), "delete_test.txt");
      await writeFile(tempFile, "to be deleted\n", "utf-8");
      return agenticDeleteFile(tempFile);
    }),

  // ── Search & Discovery ───────────────────────────────────

  list_directory: () =>
    runTest("list_directory", () => agenticListDirectory(getFixtureDir())),

  search_file_contents: () =>
    runTest("search_file_contents", () => agenticGrepSearch("greet", getFixtureDir())),

  find_files: () =>
    runTest("find_files", () => agenticGlobFiles("*.js", getFixtureDir())),

  summarize_project: () =>
    runTest("summarize_project", () =>
      agenticProjectSummary(resolve(WORKSPACE_ROOTS[0] || "")),
    ),

  // ── Web ──────────────────────────────────────────────────

  fetch_url: () =>
    runTest("fetch_url", () => agenticFetchUrl("https://httpbin.org/get")),

  read_pdf: () =>
    runTest("read_pdf", () =>
      readPdfUrl(
        "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
      ),
    ),

  read_docx: () =>
    runTest("read_docx", () =>
      readDocxUrl(
        "https://calibre-ebook.com/downloads/demos/demo.docx",
      ),
    ),

  read_spreadsheet: () =>
    runTest("read_spreadsheet", () =>
      readSpreadsheetUrl(
        "https://raw.githubusercontent.com/datasets/country-list/master/data.csv",
      ),
    ),

  search_web: () =>
    runTest("search_web", () => agenticWebSearch("test", { limit: 1 })),

  // ── Command Execution ────────────────────────────────────

  execute_command: () =>
    runTest("execute_command", () =>
      executeCommand("ls -la", {
        cwd: resolve(WORKSPACE_ROOTS[0] || ""),
        timeout: 5000,
      }),
    ),

  // ── Tool Discovery (meta) ────────────────────────────────

  tool_search: () =>
    runTest("tool_search", async () => {
      // Synchronous — returns directly
      return agenticToolSearch("file", { domain: "Workspace", limit: 5 });
    }),
};

// ── Public API ───────────────────────────────────────────────

/**
 * Run a smoke test for a single tool.
 */
export async function testTool(toolName: string) {
  const testFunction = TESTS[toolName as keyof typeof TESTS];
  if (!testFunction) {
    return {
      tool: toolName,
      success: false,
      duration: 0,
      message: `No smoke test defined for '${toolName}'`,
    };
  }

  try {
    await ensureFixture();
    const result = await testFunction();
    return result;
  } finally {
    await cleanupFixture();
  }
}

/**
 * Run smoke tests for all tools (or a subset).
 */
export async function testAllTools(toolNames?: string[]) {
  const names = toolNames || Object.keys(TESTS);
  try {
    await ensureFixture();

    const results: TransformedToolTestResult[] = [];
    for (const name of names) {
      const testFunction = TESTS[name as keyof typeof TESTS];
      if (!testFunction) {
        results.push({
          tool: name,
          success: false,
          duration: 0,
          message: `No smoke test defined for '${name}'`,
        });
        continue;
      }

      // Re-create fixture between tests in case a previous test mutated it
      await ensureFixture();
      results.push(await testFunction());
    }

    return results;
  } finally {
    await cleanupFixture();
  }
}

/**
 * Get list of tools that have smoke tests.
 */
export function getTestableTools() {
  return Object.keys(TESTS);
}
