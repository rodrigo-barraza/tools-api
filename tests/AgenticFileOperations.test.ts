import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import { ALLOWED_ROOTS } from "../src/services/AgenticFileService.ts";
import fs from "fs";
import path from "path";

describe("Agentic File Operations Router — block-replace and multi-replace", () => {
  let app: any;
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
});
