import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  agenticLspAction,
  __formatSymbolsForTest as formatSymbols,
} from "../AgenticLspService.ts";
import { ALLOWED_ROOTS } from "../AgenticFileService.ts";

// ── documentSymbol truncation flag correctness ────────────────
describe("LSP formatSymbols truncation flag", () => {
  it("reports truncated:true when the FLATTENED list exceeds the cap even with one top-level symbol", () => {
    // 1 top-level DocumentSymbol containing 150 children.
    // Old (buggy) code judged truncation on top-level length (1) -> false.
    // Correct behavior: flattened length is 151 > 100 -> true.
    const children = Array.from({ length: 150 }, (_, i) => ({
      name: `member_${i}`,
      kind: 6,
      range: { start: { line: i, character: 0 }, end: { line: i, character: 5 } },
      selectionRange: {
        start: { line: i, character: 0 },
        end: { line: i, character: 5 },
      },
    }));
    const symbols = [
      {
        name: "BigClass",
        kind: 5,
        range: { start: { line: 0, character: 0 }, end: { line: 200, character: 0 } },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 8 },
        },
        children,
      },
    ];

    const result = formatSymbols(symbols, "/x/file.ts", "/x") as Record<
      string,
      unknown
    >;

    expect(result.truncated).toBe(true);
    expect(result.count).toBe(100); // capped at MAX_SYMBOLS_RETURNED
    expect(result.totalFound).toBe(151);
  });

  it("reports truncated:false when the flattened list fits under the cap", () => {
    const symbols = Array.from({ length: 5 }, (_, i) => ({
      name: `fn_${i}`,
      kind: 12,
      range: { start: { line: i, character: 0 }, end: { line: i, character: 3 } },
      selectionRange: {
        start: { line: i, character: 0 },
        end: { line: i, character: 3 },
      },
    }));

    const result = formatSymbols(symbols, "/x/file.ts", "/x") as Record<
      string,
      unknown
    >;

    expect(result.truncated).toBe(false);
    expect(result.count).toBe(5);
  });
});

// ── workspacePath validation ──────────────────────────────────
describe("LSP workspacePath validation", () => {
  let tempRoot: string;
  let filePath: string;
  let rootPushed = false;

  beforeAll(() => {
    tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "lsp-guard-")));
    ALLOWED_ROOTS.push(tempRoot);
    rootPushed = true;
    filePath = join(tempRoot, "sample.ts");
    writeFileSync(filePath, "export const x = 1;\n", "utf-8");
  });

  afterAll(() => {
    if (rootPushed) {
      const idx = ALLOWED_ROOTS.indexOf(tempRoot);
      if (idx >= 0) ALLOWED_ROOTS.splice(idx, 1);
    }
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("rejects a workspacePath outside allowed roots before touching any LSP server", async () => {
    const result = (await agenticLspAction({
      operation: "documentSymbol",
      filePath,
      workspacePath: "/etc",
    })) as Record<string, unknown>;

    expect(result.error).toBeDefined();
    expect(String(result.error)).toMatch(/outside allowed roots/i);
  });

  it("rejects a non-string workspacePath", async () => {
    const result = (await agenticLspAction({
      operation: "documentSymbol",
      filePath,
      // @ts-expect-error deliberately wrong type
      workspacePath: 123,
    })) as Record<string, unknown>;

    expect(result.error).toBeDefined();
    expect(String(result.error)).toMatch(/must be a string/i);
  });
});

// ── diagnostics formatting ────────────────────────────────────
import { __formatDiagnosticsForTest as formatDiagnostics } from "../AgenticLspService.ts";
import type { FileDiagnostics } from "../lsp/LspServerManager.ts";

describe("LSP formatDiagnostics", () => {
  const makeDiagnostic = (
    line: number,
    severity: number,
    message: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    range: {
      start: { line, character: 4 },
      end: { line, character: 10 },
    },
    severity,
    message,
    ...overrides,
  });

  it("reports unavailable when no publish ever arrived", () => {
    const result = formatDiagnostics(undefined, "/x/file.ts", 100) as Record<
      string,
      unknown
    >;
    expect(result.status).toBe("unavailable");
    expect(String(result.message)).toMatch(/did not report/i);
  });

  it("converts to 1-based positions, maps severities, counts and sorts", () => {
    const entry: FileDiagnostics = {
      uri: "file:///x/file.ts",
      diagnostics: [
        makeDiagnostic(9, 2, "unused variable", {
          source: "eslint",
          code: "no-unused-vars",
        }),
        makeDiagnostic(2, 1, "type mismatch", { source: "ts", code: 2322 }),
      ],
      receivedAt: 100,
    };
    const result = formatDiagnostics(entry, "/x/file.ts", 50) as Record<
      string,
      unknown
    >;
    const diagnostics = result.diagnostics as Array<Record<string, unknown>>;

    expect(result.count).toBe(2);
    expect(result.stale).toBeUndefined();
    // Sorted by line; 0-based → 1-based
    expect(diagnostics[0]).toMatchObject({
      severity: "error",
      line: 3,
      character: 5,
      message: "type mismatch",
      code: 2322,
      source: "ts",
    });
    expect(diagnostics[1]).toMatchObject({ severity: "warning", line: 10 });
    expect(result.counts).toEqual({ error: 1, warning: 1 });
  });

  it("flags entries older than the request as stale", () => {
    const entry: FileDiagnostics = {
      uri: "file:///x/file.ts",
      diagnostics: [],
      receivedAt: 100,
    };
    const result = formatDiagnostics(entry, "/x/file.ts", 200) as Record<
      string,
      unknown
    >;
    expect(result.stale).toBe(true);
    expect(String(result.message)).toMatch(/earlier version/i);
  });

  it("reports clean files with an explicit message", () => {
    const entry: FileDiagnostics = {
      uri: "file:///x/file.ts",
      diagnostics: [],
      receivedAt: 300,
    };
    const result = formatDiagnostics(entry, "/x/file.ts", 200) as Record<
      string,
      unknown
    >;
    expect(result.diagnostics).toEqual([]);
    expect(String(result.message)).toMatch(/no problems/i);
  });

  it("caps results at 100 and reports truncation against the full total", () => {
    const entry: FileDiagnostics = {
      uri: "file:///x/file.ts",
      diagnostics: Array.from({ length: 150 }, (_, index) =>
        makeDiagnostic(index, 1, `error ${index}`),
      ),
      receivedAt: 300,
    };
    const result = formatDiagnostics(entry, "/x/file.ts", 200) as Record<
      string,
      unknown
    >;
    expect(result.count).toBe(100);
    expect(result.totalFound).toBe(150);
    expect(result.truncated).toBe(true);
  });
});

// ── diagnostics end-to-end (real pyright language server) ──
// Uses pyright rather than typescript-language-server because pyright
// bundles its own analyzer — tsserver requires a tsserver-compatible
// `typescript` package in the target workspace, and this repo pins the
// TS 7 native preview which typescript-language-server cannot load.
import { agenticLspShutdown } from "../AgenticLspService.ts";

describe("LSP diagnostics integration", () => {
  let tempRoot: string;
  let rootPushed = false;

  beforeAll(() => {
    tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "lsp-diag-")));
    ALLOWED_ROOTS.push(tempRoot);
    rootPushed = true;
  });

  afterAll(async () => {
    await agenticLspShutdown();
    if (rootPushed) {
      const idx = ALLOWED_ROOTS.indexOf(tempRoot);
      if (idx >= 0) ALLOWED_ROOTS.splice(idx, 1);
    }
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it("reports a type error, then a clean bill after the fix", async () => {
    const filePath = join(tempRoot, "broken.py");
    writeFileSync(
      filePath,
      'def add(a: int, b: int) -> int:\n    return a + b\n\nresult: str = add(1, 2)\nprint(result)\n',
      "utf-8",
    );

    const broken = (await agenticLspAction({
      operation: "diagnostics",
      filePath,
      workspacePath: tempRoot,
    })) as Record<string, unknown>;

    expect(broken.error).toBeUndefined();
    const diagnostics = broken.diagnostics as Array<Record<string, unknown>>;
    expect(diagnostics?.length).toBeGreaterThan(0);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === "error" &&
          diagnostic.line === 4 &&
          /not assignable|assign/i.test(String(diagnostic.message)),
      ),
    ).toBe(true);

    // Fix the file — diagnostics must reflect the NEW content (didChange)
    writeFileSync(
      filePath,
      'def add(a: int, b: int) -> int:\n    return a + b\n\nresult: int = add(1, 2)\nprint(result)\n',
      "utf-8",
    );

    const clean = (await agenticLspAction({
      operation: "diagnostics",
      filePath,
      workspacePath: tempRoot,
    })) as Record<string, unknown>;

    expect(clean.error).toBeUndefined();
    expect(clean.stale).toBeUndefined();
    expect(clean.diagnostics).toEqual([]);
  }, 90_000);

  it("reports TypeScript errors in a bare workspace via the tsserver fallbackPath", async () => {
    // No node_modules here at all — tsserver must come from the aliased
    // typescript5 fallback wired in LspConfig, not workspace resolution.
    const filePath = join(tempRoot, "broken.ts");
    writeFileSync(
      filePath,
      'const answer: number = "not a number";\nconsole.log(answer);\n',
      "utf-8",
    );

    const broken = (await agenticLspAction({
      operation: "diagnostics",
      filePath,
      workspacePath: tempRoot,
    })) as Record<string, unknown>;

    expect(broken.error).toBeUndefined();
    const diagnostics = broken.diagnostics as Array<Record<string, unknown>>;
    expect(diagnostics?.length).toBeGreaterThan(0);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === "error" &&
          diagnostic.line === 1 &&
          /not assignable/i.test(String(diagnostic.message)),
      ),
    ).toBe(true);
  }, 90_000);
});
