import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import { ALLOWED_ROOTS } from "../src/services/AgenticFileService.ts";
import { coerceInt, coerceBool } from "../src/utilities/agenticCoercion.ts";
import fs from "fs";
import path from "path";
import { Express } from "express";

// Pins the workspace-tool hardening fixes against the exact bad inputs real
// models sent in production (see docs/CORE_WORKSPACE_TOOLS_AUDIT_2026-07-14.md).

describe("agenticCoercion helpers", () => {
  it("coerceInt accepts integer-like strings but rejects junk and floats", () => {
    expect(coerceInt("10", { name: "n" })).toMatchObject({ ok: true, value: 10 });
    expect(coerceInt(5, { name: "n" })).toMatchObject({ ok: true, value: 5 });
    expect(coerceInt("60s", { name: "n" }).ok).toBe(false);
    expect(coerceInt("abc", { name: "n" }).ok).toBe(false);
    expect(coerceInt(2.5, { name: "n" }).ok).toBe(false);
    expect(coerceInt(NaN, { name: "n" }).ok).toBe(false);
  });
  it("coerceInt clamps to range with a note, and defaults on empty", () => {
    expect(coerceInt(9, { name: "n", min: 1, max: 5 })).toMatchObject({ ok: true, value: 5 });
    expect(coerceInt(undefined, { name: "n", default: 3 })).toMatchObject({ ok: true, value: 3 });
    expect(coerceInt(undefined, { name: "n" }).ok).toBe(false);
  });
  it("coerceBool accepts real and string booleans, rejects other strings", () => {
    expect(coerceBool("true", "b", false)).toMatchObject({ ok: true, value: true });
    expect(coerceBool("false", "b", true)).toMatchObject({ ok: true, value: false });
    expect(coerceBool(true, "b", false)).toMatchObject({ ok: true, value: true });
    expect(coerceBool(undefined, "b", true)).toMatchObject({ ok: true, value: true });
    expect(coerceBool("yes", "b", false).ok).toBe(false);
  });
});

describe("Agentic workspace router hardening", () => {
  let app: Express;
  const testRoot = "/tmp/agentic-hardening-test";

  beforeAll(async () => {
    if (!ALLOWED_ROOTS.includes(testRoot)) ALLOWED_ROOTS.push(testRoot);
    fs.mkdirSync(testRoot, { recursive: true });
    const { default: router } = await import("../src/routes/AgenticRoutes.ts");
    app = createTestApp("/agentic", router);
  });

  afterAll(() => {
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  it("read_file accepts `path` alias and coerces string line numbers", async () => {
    const file = path.join(testRoot, "alias.txt");
    fs.writeFileSync(file, "one\ntwo\nthree\nfour\n");
    const res = await request(app)
      .post("/agentic/file/read")
      .send({ path: file, startLine: "2", endLine: "3" });
    expect(res.status).toBe(200);
    expect(res.body.startLine).toBe(2);
    expect(res.body.endLine).toBe(3);
    expect(res.body.content).toContain("2: two");
  });

  it("read_file rejects a degenerate range instead of returning 0 lines", async () => {
    const file = path.join(testRoot, "degenerate.txt");
    fs.writeFileSync(file, "a\nb\nc\n");
    const res = await request(app)
      .post("/agentic/file/read")
      .send({ absolutePath: file, startLine: 50, endLine: 10 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds the file length|greater than endLine/);
  });

  it("read_file rejects an uninterpretable startLine with a teaching error", async () => {
    const file = path.join(testRoot, "badline.txt");
    fs.writeFileSync(file, "a\nb\n");
    const res = await request(app)
      .post("/agentic/file/read")
      .send({ absolutePath: file, startLine: "abc" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/startLine/);
  });

  it("list_directory rejects a string boolean instead of silently ignoring it", async () => {
    const res = await request(app)
      .post("/agentic/directory/list")
      .send({ path: testRoot, recursive: "yes" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/recursive/);
  });

  it("grep includes globs like **/*.ts actually match nested files", async () => {
    const nested = path.join(testRoot, "src", "deep");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "widget.ts"), "export const NEEDLE = 1;\n");
    fs.writeFileSync(path.join(testRoot, "readme.md"), "NEEDLE here too\n");
    const res = await request(app)
      .post("/agentic/search/grep")
      .send({ pattern: "NEEDLE", searchPath: testRoot, includes: ["**/*.ts"] });
    expect(res.status).toBe(200);
    expect(res.body.totalMatches).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(res.body.results)).toContain("widget.ts");
    expect(JSON.stringify(res.body.results)).not.toContain("readme.md");
  });

  it("replace_in_file does not spuriously reject a single overlapping-run match", async () => {
    const file = path.join(testRoot, "overlap.txt");
    // "\n\n\n" contains overlapping "\n\n" — old code counted 2 and rejected.
    fs.writeFileSync(file, "x\n\n\ny");
    const res = await request(app)
      .post("/agentic/file/str-replace")
      .send({ path: file, oldString: "\n\n", newString: "\n" });
    expect(res.status).toBe(200);
    expect(res.body.matchCount).toBe(1);
  });

  it("execute_command rejects a sub-second numeric timeout as probable seconds", async () => {
    const res = await request(app)
      .post("/agentic/command/run")
      .send({ command: "echo hi", cwd: testRoot, timeout: 30 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/millisecond/i);
  });

  it("kill_process refuses a PID that is not a tracked background process", async () => {
    const res = await request(app)
      .post("/agentic/command/kill")
      .send({ pid: 999999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a tracked background process/);
  });

  it("notebook edit rejects a non-integer cellIndex instead of splicing cell 0", async () => {
    const nb = path.join(testRoot, "nb.ipynb");
    fs.writeFileSync(
      nb,
      JSON.stringify({
        nbformat: 4,
        nbformat_minor: 5,
        metadata: {},
        cells: [
          { cell_type: "code", source: ["print(1)"], metadata: {}, outputs: [], execution_count: null },
          { cell_type: "code", source: ["print(2)"], metadata: {}, outputs: [], execution_count: null },
        ],
      }),
    );
    const res = await request(app)
      .post("/agentic/notebook/edit")
      .send({ path: nb, action: "delete_cell", cellIndex: "last" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cellIndex/);
    // Cell 0 must still be present.
    const after = JSON.parse(fs.readFileSync(nb, "utf-8"));
    expect(after.cells.length).toBe(2);
  });
});
