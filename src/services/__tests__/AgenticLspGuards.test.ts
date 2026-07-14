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
