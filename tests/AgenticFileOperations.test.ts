import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import { ALLOWED_ROOTS } from "../src/services/AgenticFileService.ts";
import fs from "fs";
import path from "path";
import { Express } from "express";

describe("Agentic File Operations Router — block-replace and multi-replace", () => {
  let app: Express;
  const testRoot = "/tmp/agentic-file-test";
  const testFilePath = path.join(testRoot, "mock-file.txt");

  beforeAll(async () => {
    // 1. Ensure test root is in ALLOWED_ROOTS for testing validation bypass
    if (!ALLOWED_ROOTS.includes(testRoot)) {
      ALLOWED_ROOTS.push(testRoot);
    }

    // 2. Create test folder and mock file
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }

    // 3. Import router dynamically to match setup patterns
    const { default: router } = await import("../src/routes/AgenticRoutes.ts");
    app = createTestApp("/agentic", router);
  });

  afterAll(() => {
    // Clean up test file and directory
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    if (fs.existsSync(testRoot)) {
      fs.rmdirSync(testRoot);
    }
  });

  // Helper to reset file content
  const resetFileContent = (content: string) => {
    fs.writeFileSync(testFilePath, content, "utf8");
  };

  describe("POST /agentic/file/block-replace", () => {
    it("successfully replaces a single contiguous block of lines matching the targetContent", async () => {
      resetFileContent([
        "line 1",
        "line 2: TARGET TO REPLACE",
        "line 3: TARGET TO REPLACE",
        "line 4",
      ].join("\n"));

      const res = await request(app)
        .post("/agentic/file/block-replace")
        .send({
          path: testFilePath,
          startLine: 2,
          endLine: 3,
          targetContent: "line 2: TARGET TO REPLACE\nline 3: TARGET TO REPLACE",
          replacementContent: "replaced block line A\nreplaced block line B",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.oldLines).toBe(2);
      expect(res.body.newLines).toBe(2);
      expect(res.body.lineDelta).toBe(0);

      const finalContent = fs.readFileSync(testFilePath, "utf8");
      expect(finalContent).toBe([
        "line 1",
        "replaced block line A",
        "replaced block line B",
        "line 4",
      ].join("\n"));
    });

    it("returns 400 error and numbered context preview when the targetContent does not match exactly", async () => {
      resetFileContent([
        "line 1",
        "line 2: TARGET TO REPLACE",
        "line 3",
      ].join("\n"));

      const res = await request(app)
        .post("/agentic/file/block-replace")
        .send({
          path: testFilePath,
          startLine: 2,
          endLine: 2,
          targetContent: "mismatch content",
          replacementContent: "new content",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBeFalsy();
      expect(res.body.error).toContain("does not match targetContent");
      expect(res.body.actualContentInRange).toContain("2: line 2: TARGET TO REPLACE");
    });

    it("returns 400 when required parameters are missing", async () => {
      const res = await request(app)
        .post("/agentic/file/block-replace")
        .send({
          path: testFilePath,
          startLine: 2,
          endLine: 2,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("must include 'targetContent'");
    });
  });

  describe("POST /agentic/file/multi-replace", () => {
    it("successfully applies multiple non-contiguous block replacements bottom-to-top", async () => {
      resetFileContent([
        "line 1",
        "line 2: AAA",
        "line 3",
        "line 4: BBB",
        "line 5",
      ].join("\n"));

      const res = await request(app)
        .post("/agentic/file/multi-replace")
        .send({
          path: testFilePath,
          chunks: [
            {
              startLine: 2,
              endLine: 2,
              targetContent: "line 2: AAA",
              replacementContent: "replaced AAA",
            },
            {
              startLine: 4,
              endLine: 4,
              targetContent: "line 4: BBB",
              replacementContent: "replaced BBB\nsecond line of BBB",
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.chunksProcessed).toBe(2);

      const finalContent = fs.readFileSync(testFilePath, "utf8");
      expect(finalContent).toBe([
        "line 1",
        "replaced AAA",
        "line 3",
        "replaced BBB",
        "second line of BBB",
        "line 5",
      ].join("\n"));
    });

    it("returns 400 error if any chunk targetContent fails validation", async () => {
      resetFileContent([
        "line 1",
        "line 2: AAA",
        "line 3",
      ].join("\n"));

      const res = await request(app)
        .post("/agentic/file/multi-replace")
        .send({
          path: testFilePath,
          chunks: [
            {
              startLine: 2,
              endLine: 2,
              targetContent: "mismatch",
              replacementContent: "replaced AAA",
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBeFalsy();
      expect(res.body.error).toContain("does not match targetContent");
    });
  });

  describe("POST /agentic/file/str-replace with edits[] (atomic multi-edit)", () => {
    it("applies an ordered batch where later edits see earlier output", async () => {
      resetFileContent("const a = 1;\nconst b = 2;\n");
      const res = await request(app)
        .post("/agentic/file/str-replace")
        .send({
          path: testFilePath,
          edits: [
            { oldString: "const a = 1;", newString: "const a = 10;" },
            // Only matches AFTER the first edit ran
            { oldString: "const a = 10;\nconst b = 2;", newString: "const a = 10;\nconst b = 20;" },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.editsApplied).toBe(2);
      expect(fs.readFileSync(testFilePath, "utf8")).toBe(
        "const a = 10;\nconst b = 20;\n",
      );
    });

    it("aborts the WHOLE batch when any edit fails to match", async () => {
      resetFileContent("alpha\nbeta\ngamma\n");
      const res = await request(app)
        .post("/agentic/file/str-replace")
        .send({
          path: testFilePath,
          edits: [
            { oldString: "alpha", newString: "ALPHA" },
            { oldString: "does-not-exist", newString: "x" },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.failedEditIndex).toBe(2);
      // First edit must NOT have been written
      expect(fs.readFileSync(testFilePath, "utf8")).toBe("alpha\nbeta\ngamma\n");
    });

    it("rejects ambiguous matches without allowMultiple, atomically", async () => {
      resetFileContent("x\nx\n");
      const res = await request(app)
        .post("/agentic/file/str-replace")
        .send({
          path: testFilePath,
          edits: [{ oldString: "x", newString: "y" }],
        });
      expect(res.status).toBe(400);
      expect(res.body.matchCount).toBe(2);
      expect(fs.readFileSync(testFilePath, "utf8")).toBe("x\nx\n");
    });

    it("supports allowMultiple per edit", async () => {
      resetFileContent("x x x\n");
      const res = await request(app)
        .post("/agentic/file/str-replace")
        .send({
          path: testFilePath,
          edits: [{ oldString: "x", newString: "y", allowMultiple: true }],
        });
      expect(res.status).toBe(200);
      expect(res.body.totalReplacements).toBe(3);
      expect(fs.readFileSync(testFilePath, "utf8")).toBe("y y y\n");
    });

    it("rejects mixing edits[] with top-level oldString/newString", async () => {
      const res = await request(app)
        .post("/agentic/file/str-replace")
        .send({
          path: testFilePath,
          oldString: "a",
          newString: "b",
          edits: [{ oldString: "a", newString: "b" }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("not both");
    });
  });

  describe("POST /agentic/file/patch (apply_patch tool)", () => {
    it("applies a unified diff to the file", async () => {
      resetFileContent("line one\nline two\nline three\n");
      const patch = [
        "--- a/mock-file.txt",
        "+++ b/mock-file.txt",
        "@@ -1,3 +1,3 @@",
        " line one",
        "-line two",
        "+line 2",
        " line three",
        "",
      ].join("\n");

      const res = await request(app)
        .post("/agentic/file/patch")
        .send({ path: testFilePath, patch });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fs.readFileSync(testFilePath, "utf8")).toBe(
        "line one\nline 2\nline three\n",
      );
    });

    it("rejects a patch whose context does not match, leaving the file untouched", async () => {
      resetFileContent("alpha\nbeta\n");
      const patch = [
        "--- a/mock-file.txt",
        "+++ b/mock-file.txt",
        "@@ -1,2 +1,2 @@",
        " gamma",
        "-delta",
        "+epsilon",
        "",
      ].join("\n");

      const res = await request(app)
        .post("/agentic/file/patch")
        .send({ path: testFilePath, patch });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
      expect(fs.readFileSync(testFilePath, "utf8")).toBe("alpha\nbeta\n");
    });

    it("requires the patch body field", async () => {
      const res = await request(app)
        .post("/agentic/file/patch")
        .send({ path: testFilePath });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("patch");
    });
  });

  describe("POST /agentic/file/delete", () => {
    const subFolder = path.join(testRoot, "sub-folder-to-delete");
    const subFile = path.join(subFolder, "temp-file.txt");

    it("successfully deletes a file", async () => {
      const tempDelFile = path.join(testRoot, "delete-temp.txt");
      fs.writeFileSync(tempDelFile, "to delete", "utf8");

      const res = await request(app)
        .post("/agentic/file/delete")
        .send({ path: tempDelFile });

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
      expect(fs.existsSync(tempDelFile)).toBe(false);
    });

    it("fails to delete a directory when recursive is false", async () => {
      if (!fs.existsSync(subFolder)) {
        fs.mkdirSync(subFolder, { recursive: true });
      }
      fs.writeFileSync(subFile, "data", "utf8");

      const res = await request(app)
        .post("/agentic/file/delete")
        .send({ path: subFolder });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("is a directory");
      expect(fs.existsSync(subFolder)).toBe(true);
    });

    it("successfully deletes a directory recursively when recursive is true", async () => {
      if (!fs.existsSync(subFolder)) {
        fs.mkdirSync(subFolder, { recursive: true });
      }
      fs.writeFileSync(subFile, "data", "utf8");

      const res = await request(app)
        .post("/agentic/file/delete")
        .send({ path: subFolder, recursive: true });

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
      expect(fs.existsSync(subFolder)).toBe(false);
    });
  });
});
