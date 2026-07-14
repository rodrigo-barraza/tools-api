import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { agenticNotebookEdit } from "../AgenticNotebookService.ts";
import { ALLOWED_ROOTS } from "../AgenticFileService.ts";

// ── Fixtures ──────────────────────────────────────────────────
let tempRoot: string;
let rootPushed = false;

function makeNotebook(cellCount: number): string {
  const cells = Array.from({ length: cellCount }, (_, i) => ({
    cell_type: "code",
    execution_count: null,
    metadata: {},
    outputs: [],
    source: [`cell-${i}\n`, `print(${i})`],
  }));
  return JSON.stringify(
    { nbformat: 4, nbformat_minor: 5, metadata: {}, cells },
    null,
    1,
  );
}

function writeNb(name: string, cellCount: number): string {
  const p = join(tempRoot, name);
  writeFileSync(p, makeNotebook(cellCount), "utf-8");
  return p;
}

function cellSources(path: string): string[] {
  const nb = JSON.parse(readFileSync(path, "utf-8"));
  return nb.cells.map((c: { source: string[] | string }) =>
    Array.isArray(c.source) ? c.source.join("") : c.source,
  );
}

beforeAll(() => {
  tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "nb-guard-")));
  ALLOWED_ROOTS.push(tempRoot);
  rootPushed = true;
});

afterAll(() => {
  if (rootPushed) {
    const idx = ALLOWED_ROOTS.indexOf(tempRoot);
    if (idx >= 0) ALLOWED_ROOTS.splice(idx, 1);
  }
  rmSync(tempRoot, { recursive: true, force: true });
});

// ── P0: NaN / non-integer cellIndex must NOT mutate cell 0 ─────
describe("Notebook cellIndex integer guard (P0)", () => {
  it("delete_cell with NaN cellIndex is rejected and does NOT delete cell 0", async () => {
    const path = writeNb("delete-nan.ipynb", 3);
    const before = cellSources(path);

    const result = await agenticNotebookEdit(path, {
      action: "delete_cell",
      cellIndex: Number.NaN, // simulates parseInt("last", 10)
    });

    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/integer/i);
    // Critical: file untouched, cell 0 still present.
    expect(cellSources(path)).toEqual(before);
  });

  it("get_cell with a float cellIndex is rejected", async () => {
    const path = writeNb("get-float.ipynb", 3);
    const result = await agenticNotebookEdit(path, {
      action: "get_cell",
      cellIndex: 1.9,
    });
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/integer/i);
  });

  it("replace_cell with NaN cellIndex is rejected and does not write", async () => {
    const path = writeNb("replace-nan.ipynb", 3);
    const before = cellSources(path);
    const result = await agenticNotebookEdit(path, {
      action: "replace_cell",
      cellIndex: Number.NaN,
      content: "should-not-apply",
    });
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/integer/i);
    expect(cellSources(path)).toEqual(before);
  });

  it("delete_cell with a valid integer still works", async () => {
    const path = writeNb("delete-ok.ipynb", 3);
    const result = await agenticNotebookEdit(path, {
      action: "delete_cell",
      cellIndex: 1,
    });
    expect(result.error).toBeUndefined();
    expect(cellSources(path)).toEqual(["cell-0\nprint(0)", "cell-2\nprint(2)"]);
  });
});

// ── P1: replace_cell no-op rejection ──────────────────────────
describe("Notebook replace_cell no-op guard (P1)", () => {
  it("rejects replace_cell with neither content nor cellType", async () => {
    const path = writeNb("replace-noop.ipynb", 2);
    const before = cellSources(path);
    const result = await agenticNotebookEdit(path, {
      action: "replace_cell",
      cellIndex: 0,
    });
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/provide content and\/or cellType/i);
    expect(cellSources(path)).toEqual(before);
  });

  it("allows replace_cell with only content", async () => {
    const path = writeNb("replace-content.ipynb", 2);
    const result = await agenticNotebookEdit(path, {
      action: "replace_cell",
      cellIndex: 0,
      content: "changed",
    });
    expect(result.error).toBeUndefined();
    expect(cellSources(path)[0]).toBe("changed");
  });
});

// ── P1: insert_cell created flag on nonexistent path ──────────
describe("Notebook insert_cell created flag (P1)", () => {
  it("sets created:true and mentions new notebook when path did not exist", async () => {
    const path = join(tempRoot, "brand-new.ipynb");
    const result = await agenticNotebookEdit(path, {
      action: "insert_cell",
      content: "print('hi')",
    });
    expect(result.error).toBeUndefined();
    expect(result.created).toBe(true);
    expect(result.message).toMatch(/new blank notebook was created/i);
  });

  it("sets created:false when inserting into an existing notebook", async () => {
    const path = writeNb("existing-insert.ipynb", 1);
    const result = await agenticNotebookEdit(path, {
      action: "insert_cell",
      content: "print('hi')",
    });
    expect(result.error).toBeUndefined();
    expect(result.created).toBe(false);
  });
});

// ── P?: append affordance ─────────────────────────────────────
describe("Notebook insert_cell append affordance", () => {
  it("treats cellIndex === -1 as append", async () => {
    const path = writeNb("append-neg.ipynb", 2);
    const result = await agenticNotebookEdit(path, {
      action: "insert_cell",
      cellIndex: -1,
      content: "APPENDED",
    });
    expect(result.error).toBeUndefined();
    expect(result.cellIndex).toBe(2);
    expect(result.appended).toBe(true);
    expect(cellSources(path)[2]).toBe("APPENDED");
  });

  it("treats omitted cellIndex as append", async () => {
    const path = writeNb("append-omit.ipynb", 2);
    const result = await agenticNotebookEdit(path, {
      action: "insert_cell",
      content: "APPENDED2",
    });
    expect(result.error).toBeUndefined();
    expect(result.cellIndex).toBe(2);
    expect(cellSources(path)[2]).toBe("APPENDED2");
  });

  it("rejects a NaN insert cellIndex (not -1 / not omitted)", async () => {
    const path = writeNb("insert-nan.ipynb", 2);
    const before = cellSources(path);
    const result = await agenticNotebookEdit(path, {
      action: "insert_cell",
      cellIndex: Number.NaN,
      content: "nope",
    });
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/integer/i);
    expect(cellSources(path)).toEqual(before);
  });
});
