import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  agenticReadFile,
  agenticHashlineEdit,
  ALLOWED_ROOTS,
} from "../AgenticFileService.ts";
import { lineHash, formatHashline, parseAnchor } from "../../utilities/hashline.ts";

let tempRoot: string;
let filePath: string;

const FILE_LINES = [
  "import { a } from './a';",
  "",
  "export function greet(name: string) {",
  "  return `Hello, ${name}!`;",
  "}",
  "",
  "export const PI = 3.14159;",
];

beforeAll(() => {
  tempRoot = realpathSync(mkdtempSync(join(tmpdir(), "hashline-test-")));
  ALLOWED_ROOTS.push(tempRoot);
  filePath = join(tempRoot, "sample.ts");
});

beforeEach(() => {
  writeFileSync(filePath, FILE_LINES.join("\n"), "utf-8");
});

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
  const index = ALLOWED_ROOTS.indexOf(tempRoot);
  if (index !== -1) ALLOWED_ROOTS.splice(index, 1);
});

/** Anchor for a 1-based line of the CURRENT fixture content. */
function anchorFor(line: number, text?: string): string {
  const lineText = text ?? FILE_LINES[line - 1];
  return `${line}:${lineHash(lineText)}`;
}

// ── Hashline reads ───────────────────────────────────────────

describe("hashline read format", () => {
  it("prefixes every line with line#:hash| and the prefix parses as an anchor", async () => {
    const result = (await agenticReadFile(filePath)) as {
      content: string;
      lineFormat: string;
    };
    expect(result.lineFormat).toBe("hashline");

    const lines = result.content.split("\n");
    expect(lines).toHaveLength(FILE_LINES.length);
    for (let index = 0; index < lines.length; index++) {
      const expected = formatHashline(index + 1, FILE_LINES[index]);
      expect(lines[index]).toBe(expected);
      const prefix = lines[index].split("|")[0];
      const parsed = parseAnchor(prefix);
      expect(parsed.ok).toBe(true);
    }
  });

  it("is deterministic: two reads of unchanged content return identical hashlines", async () => {
    const first = (await agenticReadFile(filePath)) as { content: string };
    const second = (await agenticReadFile(filePath)) as { content: string };
    expect(first.content).toBe(second.content);
  });
});

// ── Anchored edits: happy path ───────────────────────────────

describe("hash-anchored edit happy path", () => {
  it("replaces a single anchored line", async () => {
    const result = (await agenticHashlineEdit(filePath, [
      { anchor: anchorFor(7), content: "export const PI = 3.14;" },
    ])) as { editsApplied: number; lineDelta: number };

    expect(result.editsApplied).toBe(1);
    expect(result.lineDelta).toBe(0);
    expect(readFileSync(filePath, "utf-8")).toContain("PI = 3.14;");
    expect(readFileSync(filePath, "utf-8")).not.toContain("3.14159");
  });

  it("replaces a multi-line range via endAnchor, inserts after an anchor, and deletes", async () => {
    const result = (await agenticHashlineEdit(filePath, [
      {
        anchor: anchorFor(3),
        endAnchor: anchorFor(5),
        content: "export const greet = (name: string) => `Hi, ${name}`;",
      },
      { anchor: "0", op: "insert_after", content: "// header" },
      { anchor: anchorFor(7), op: "delete" },
    ])) as { editsApplied: number };

    expect(result.editsApplied).toBe(3);
    const written = readFileSync(filePath, "utf-8").split("\n");
    expect(written[0]).toBe("// header");
    expect(written).toContain(
      "export const greet = (name: string) => `Hi, ${name}`;",
    );
    expect(written.join("\n")).not.toContain("3.14159");
  });

  it("applies bottom-up so line numbers refer to the file as read", async () => {
    const result = (await agenticHashlineEdit(filePath, [
      { anchor: anchorFor(1), op: "insert_after", content: "// after imports" },
      { anchor: anchorFor(7), content: "export const PI = 3;" },
    ])) as { editsApplied: number };

    expect(result.editsApplied).toBe(2);
    const written = readFileSync(filePath, "utf-8").split("\n");
    expect(written[1]).toBe("// after imports");
    expect(written[written.length - 1]).toBe("export const PI = 3;");
  });
});

// ── Anchored edits: rejection paths ──────────────────────────

describe("hash-anchored edit rejection", () => {
  it("rejects a stale anchor with the fresh hashline window and applies nothing", async () => {
    // File drifts after the (simulated) read
    const drifted = [...FILE_LINES];
    drifted[6] = "export const PI = Math.PI;";
    writeFileSync(filePath, drifted.join("\n"), "utf-8");

    const result = (await agenticHashlineEdit(filePath, [
      // Anchor computed from the ORIGINAL line 7 content — now stale
      { anchor: anchorFor(7), content: "export const PI = 3;" },
    ])) as {
      error?: string;
      code?: string;
      staleAnchors?: Array<{
        line: number;
        expectedHash: string;
        actualHash: string;
        currentWindow: string;
      }>;
    };

    expect(result.code).toBe("stale_anchor");
    expect(result.error).toBeTruthy();
    expect(result.staleAnchors).toHaveLength(1);
    const stale = result.staleAnchors![0];
    expect(stale.line).toBe(7);
    expect(stale.actualHash).toBe(lineHash("export const PI = Math.PI;"));
    expect(stale.expectedHash).toBe(lineHash(FILE_LINES[6]));
    // The window carries the CURRENT hashline so the model can re-anchor
    expect(stale.currentWindow).toContain(
      formatHashline(7, "export const PI = Math.PI;"),
    );
    // Nothing was applied
    expect(readFileSync(filePath, "utf-8")).toContain("Math.PI");
  });

  it("rejects anchors past the end of the file", async () => {
    const result = (await agenticHashlineEdit(filePath, [
      { anchor: `99:${lineHash("nope")}`, content: "x" },
    ])) as { code?: string; totalLines?: number };

    expect(result.code).toBe("line_out_of_range");
    expect(result.totalLines).toBe(FILE_LINES.length);
  });

  it("rejects overlapping edits", async () => {
    const result = (await agenticHashlineEdit(filePath, [
      { anchor: anchorFor(3), endAnchor: anchorFor(5), content: "a" },
      { anchor: anchorFor(4), op: "delete" },
    ])) as { code?: string };

    expect(result.code).toBe("overlapping_edits");
  });

  it("rejects an anchor without its content hash", async () => {
    const result = (await agenticHashlineEdit(filePath, [
      { anchor: "7", content: "x" },
    ])) as { error?: string };

    expect(result.error).toContain("hash");
  });
});

// ── Summarized reads ─────────────────────────────────────────

describe("summarized read for large files", () => {
  let largePath: string;
  const TOTAL = 900;

  beforeAll(() => {
    const lines: string[] = [];
    for (let index = 1; index <= TOTAL; index++) {
      if (index === 450) {
        lines.push("export function middleMarker() {");
      } else if (index === 451) {
        lines.push("}");
      } else {
        lines.push(`  line ${index}`);
      }
    }
    largePath = join(tempRoot, "large.ts");
    writeFileSync(largePath, lines.join("\n"), "utf-8");
  });

  it("returns a deterministic summarized read with head, outline, and tail", async () => {
    const first = (await agenticReadFile(largePath)) as {
      summarized: boolean;
      totalLines: number;
      omitted: { startLine: number; endLine: number };
      content: string;
      outlineLines: number;
    };

    expect(first.summarized).toBe(true);
    expect(first.totalLines).toBe(TOTAL);
    expect(first.omitted).toEqual({ startLine: 201, endLine: 800 });

    const contentLines = first.content.split("\n");
    // Head starts at line 1, tail ends at the last line
    expect(contentLines[0]).toBe(formatHashline(1, "  line 1"));
    expect(contentLines[contentLines.length - 1]).toBe(
      formatHashline(TOTAL, `  line ${TOTAL}`),
    );
    // The structural line in the omitted middle appears in the outline
    expect(first.content).toContain(
      formatHashline(450, "export function middleMarker() {"),
    );
    expect(first.outlineLines).toBeGreaterThan(0);

    // Determinism
    const second = (await agenticReadFile(largePath)) as { content: string };
    expect(second.content).toBe(first.content);
  });

  it("serves explicit ranges exactly (no summarization)", async () => {
    const result = (await agenticReadFile(largePath, {
      startLine: 449,
      endLine: 452,
    })) as { content: string; summarized?: boolean };

    expect(result.summarized).toBeUndefined();
    const lines = result.content.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe(
      formatHashline(450, "export function middleMarker() {"),
    );
  });
});
