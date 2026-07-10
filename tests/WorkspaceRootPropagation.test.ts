import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import { ALLOWED_ROOTS } from "../src/services/AgenticFileService.ts";
import { Express } from "express";
import fs from "fs";
import path from "node:path";

/**
 * WorkspaceRootPropagation — regression tests for the X-Workspace-Root header
 * flowing from prism-service → tools-service → AgenticFileService.validatePath.
 *
 * These tests verify:
 * 1. X-Workspace-Root header is read and used as the base for relative paths
 * 2. Priority chain: X-Workspace-Override > X-Workspace-Root > ALLOWED_ROOTS[0]
 * 3. X-Workspace-Root outside ALLOWED_ROOTS is rejected (path traversal prevention)
 * 4. Relative paths (e.g. ".") resolve against the user-selected workspace root
 * 5. Absolute paths still work regardless of workspace root
 */
describe("Workspace Root Propagation", () => {
  let app: Express;

  // Two workspace directories within the same ALLOWED_ROOT parent
  const testParentRoot = "/tmp/workspace-root-test";
  const workspaceAlpha = path.join(testParentRoot, "project-alpha");
  const workspaceBeta = path.join(testParentRoot, "project-beta");
  const worktreePath = "/tmp/prism-worktrees/worktree-propagation-test";

  beforeAll(async () => {
    // Register the parent as an allowed root
    if (!ALLOWED_ROOTS.includes(testParentRoot)) {
      ALLOWED_ROOTS.push(testParentRoot);
    }

    // Create both workspace directories with marker files
    for (const workspace of [workspaceAlpha, workspaceBeta, worktreePath]) {
      if (!fs.existsSync(workspace)) {
        fs.mkdirSync(workspace, { recursive: true });
      }
    }

    fs.writeFileSync(
      path.join(workspaceAlpha, "alpha-marker.txt"),
      "This is project alpha",
      "utf8",
    );
    fs.writeFileSync(
      path.join(workspaceBeta, "beta-marker.txt"),
      "This is project beta",
      "utf8",
    );
    fs.writeFileSync(
      path.join(worktreePath, "worktree-marker.txt"),
      "This is a worktree",
      "utf8",
    );

    const { default: router } = await import("../src/routes/AgenticRoutes.ts");
    app = createTestApp("/agentic", router);
  });

  afterAll(() => {
    // Clean up all test artifacts
    for (const directory of [workspaceAlpha, workspaceBeta, worktreePath]) {
      if (fs.existsSync(directory)) {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
    if (fs.existsSync(testParentRoot)) {
      fs.rmSync(testParentRoot, { recursive: true, force: true });
    }
    // Remove the test root from ALLOWED_ROOTS
    const rootIndex = ALLOWED_ROOTS.indexOf(testParentRoot);
    if (rootIndex !== -1) {
      ALLOWED_ROOTS.splice(rootIndex, 1);
    }
  });

  // ─── Relative Path Resolution ─────────────────────────────────

  describe("Relative path resolution with X-Workspace-Root", () => {
    it("resolves relative path '.' against the X-Workspace-Root header value", async () => {
      const response = await request(app)
        .post("/agentic/directory/list")
        .set("X-Workspace-Root", workspaceAlpha)
        .send({ path: "." });

      expect(response.status).toBe(200);
      expect(response.body.directory).toBe(workspaceAlpha);
      const entryNames = response.body.entries.map(
        (entry: { name: string }) => entry.name,
      );
      expect(entryNames).toContain("alpha-marker.txt");
    });

    it("resolves relative path '.' against a different X-Workspace-Root", async () => {
      const response = await request(app)
        .post("/agentic/directory/list")
        .set("X-Workspace-Root", workspaceBeta)
        .send({ path: "." });

      expect(response.status).toBe(200);
      expect(response.body.directory).toBe(workspaceBeta);
      const entryNames = response.body.entries.map(
        (entry: { name: string }) => entry.name,
      );
      expect(entryNames).toContain("beta-marker.txt");
    });

    it("resolves a relative filename against X-Workspace-Root", async () => {
      const response = await request(app)
        .post("/agentic/file/read")
        .set("X-Workspace-Root", workspaceAlpha)
        .send({ absolutePath: "alpha-marker.txt" });

      expect(response.status).toBe(200);
      expect(response.body.filePath).toBe(
        path.join(workspaceAlpha, "alpha-marker.txt"),
      );
      expect(response.body.content).toContain("This is project alpha");
    });

    it("writes a file using a relative path resolved against X-Workspace-Root", async () => {
      const response = await request(app)
        .post("/agentic/file/write")
        .set("X-Workspace-Root", workspaceBeta)
        .send({
          path: "new-relative-file.txt",
          content: "Created via workspace root",
        });

      expect(response.status).toBe(200);
      expect(response.body.created).toBe(true);
      expect(response.body.filePath).toBe(
        path.join(workspaceBeta, "new-relative-file.txt"),
      );

      // Verify the file was written to the correct workspace
      const fileContent = fs.readFileSync(
        path.join(workspaceBeta, "new-relative-file.txt"),
        "utf8",
      );
      expect(fileContent).toBe("Created via workspace root");

      // Clean up
      fs.unlinkSync(path.join(workspaceBeta, "new-relative-file.txt"));
    });
  });

  // ─── Absolute Path Handling ───────────────────────────────────

  describe("Absolute paths are unaffected by X-Workspace-Root", () => {
    it("uses the absolute path directly regardless of X-Workspace-Root", async () => {
      const absoluteFilePath = path.join(workspaceAlpha, "alpha-marker.txt");
      const response = await request(app)
        .post("/agentic/file/read")
        .set("X-Workspace-Root", workspaceBeta) // Different workspace, shouldn't matter
        .send({ absolutePath: absoluteFilePath });

      expect(response.status).toBe(200);
      expect(response.body.filePath).toBe(absoluteFilePath);
      expect(response.body.content).toContain("This is project alpha");
    });
  });

  // ─── Priority Chain ───────────────────────────────────────────

  describe("Priority: X-Workspace-Override > X-Workspace-Root > ALLOWED_ROOTS[0]", () => {
    it("X-Workspace-Override takes precedence over X-Workspace-Root for relative paths", async () => {
      const response = await request(app)
        .post("/agentic/directory/list")
        .set("X-Workspace-Root", workspaceAlpha)
        .set("X-Workspace-Override", worktreePath)
        .send({ path: "." });

      expect(response.status).toBe(200);
      // Should resolve to the worktree, not the workspace root
      expect(response.body.directory).toBe(worktreePath);
      const entryNames = response.body.entries.map(
        (entry: { name: string }) => entry.name,
      );
      expect(entryNames).toContain("worktree-marker.txt");
    });

    it("falls back to ALLOWED_ROOTS[0] when no workspace headers are provided", async () => {
      // This test verifies the fallback behavior — without any workspace header,
      // relative paths resolve against ALLOWED_ROOTS[0].
      const response = await request(app)
        .post("/agentic/directory/list")
        .send({ path: "." });

      expect(response.status).toBe(200);
      // Should resolve against ALLOWED_ROOTS[0] (the first static root)
      expect(response.body.directory).toBe(ALLOWED_ROOTS[0]);
    });
  });

  // ─── Security: Path Traversal Prevention ──────────────────────

  describe("Security: X-Workspace-Root outside ALLOWED_ROOTS is rejected", () => {
    it("rejects relative path resolution when X-Workspace-Root is outside all allowed roots", async () => {
      const response = await request(app)
        .post("/agentic/directory/list")
        .set("X-Workspace-Root", "/etc")
        .send({ path: "." });

      // When workspaceRoot is outside ALLOWED_ROOTS, validatePath falls back
      // to ALLOWED_ROOTS[0] — the relative path resolves there, not /etc
      expect(response.status).toBe(200);
      expect(response.body.directory).not.toBe("/etc");
      expect(response.body.directory).toBe(ALLOWED_ROOTS[0]);
    });

    it("rejects a workspace root that attempts directory traversal", async () => {
      const response = await request(app)
        .post("/agentic/directory/list")
        .set("X-Workspace-Root", `${testParentRoot}/../../../etc`)
        .send({ path: "." });

      // The traversal should resolve to /etc which is outside ALLOWED_ROOTS,
      // causing a fallback to ALLOWED_ROOTS[0]
      expect(response.status).toBe(200);
      expect(response.body.directory).not.toContain("/etc");
    });

    it("allows workspace root that is a valid subdirectory of an allowed root", async () => {
      const nestedWorkspace = path.join(
        workspaceAlpha,
        "src",
      );
      if (!fs.existsSync(nestedWorkspace)) {
        fs.mkdirSync(nestedWorkspace, { recursive: true });
      }
      fs.writeFileSync(
        path.join(nestedWorkspace, "index.ts"),
        "export default {};",
        "utf8",
      );

      const response = await request(app)
        .post("/agentic/directory/list")
        .set("X-Workspace-Root", nestedWorkspace)
        .send({ path: "." });

      expect(response.status).toBe(200);
      expect(response.body.directory).toBe(nestedWorkspace);
      const entryNames = response.body.entries.map(
        (entry: { name: string }) => entry.name,
      );
      expect(entryNames).toContain("index.ts");

      // Clean up
      fs.unlinkSync(path.join(nestedWorkspace, "index.ts"));
      fs.rmdirSync(nestedWorkspace);
    });
  });

  // ─── Workspace Switching ──────────────────────────────────────

  describe("Workspace switching — sequential requests with different roots", () => {
    it("correctly switches context between workspaces across requests", async () => {
      // First request: workspace alpha
      const responseAlpha = await request(app)
        .post("/agentic/file/read")
        .set("X-Workspace-Root", workspaceAlpha)
        .send({ absolutePath: "alpha-marker.txt" });

      expect(responseAlpha.status).toBe(200);
      expect(responseAlpha.body.content).toContain("This is project alpha");

      // Second request: workspace beta (different root)
      const responseBeta = await request(app)
        .post("/agentic/file/read")
        .set("X-Workspace-Root", workspaceBeta)
        .send({ absolutePath: "beta-marker.txt" });

      expect(responseBeta.status).toBe(200);
      expect(responseBeta.body.content).toContain("This is project beta");

      // Third request: back to alpha (ensures no stale state)
      const responseAlphaAgain = await request(app)
        .post("/agentic/file/read")
        .set("X-Workspace-Root", workspaceAlpha)
        .send({ absolutePath: "alpha-marker.txt" });

      expect(responseAlphaAgain.status).toBe(200);
      expect(responseAlphaAgain.body.content).toContain("This is project alpha");
    });

    it("file from workspace alpha is not found when workspace root points to beta", async () => {
      const response = await request(app)
        .post("/agentic/file/read")
        .set("X-Workspace-Root", workspaceBeta)
        .send({ absolutePath: "alpha-marker.txt" });

      // alpha-marker.txt does not exist in workspace beta — agenticHandler returns 400 with error body
      expect(response.status).toBe(400);
      expect(response.body.error).toContain("File not found");
    });
  });
});
