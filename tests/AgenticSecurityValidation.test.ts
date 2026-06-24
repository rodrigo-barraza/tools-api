import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import { ALLOWED_ROOTS } from "../src/services/AgenticFileService.ts";
import { Express } from "express";
import fs from "fs";

describe("Agentic Security and Worktree Validation", () => {
  let app: Express;
  const workspaceRoot = "/home/rodrigo/development";

  beforeAll(async () => {
    // Ensure the tools-service root exists in ALLOWED_ROOTS for standard tests
    if (!ALLOWED_ROOTS.includes(workspaceRoot)) {
      ALLOWED_ROOTS.push(workspaceRoot);
    }

    const { default: router } = await import("../src/routes/AgenticRoutes.ts");
    app = createTestApp("/agentic", router);
  });

  describe("Workspace Override and Path Sandbox", () => {
    it("rejects path outside ALLOWED_ROOTS when no override is present", async () => {
      const res = await request(app)
        .post("/agentic/file/write")
        .send({
          path: "/tmp/prism-worktrees/some-non-existent-file-xyz.txt",
          content: "hello world"
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain("is outside allowed roots");
    });

    it("permits access inside /tmp/prism-worktrees when matching X-Workspace-Override header is provided", async () => {
      const mockWorktree = "/tmp/prism-worktrees/subagent-test-worktree";
      const filePath = `${mockWorktree}/test.txt`;

      // Clean up previous files if any exist
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (fs.existsSync(mockWorktree)) {
        fs.rmdirSync(mockWorktree);
      }

      const res = await request(app)
        .post("/agentic/file/write")
        .set("X-Workspace-Override", mockWorktree)
        .send({
          path: filePath,
          content: "isolated worktree write"
        });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(true);

      // Clean up the written file
      const readRes = await request(app)
        .post("/agentic/file/read")
        .set("X-Workspace-Override", mockWorktree)
        .send({
          path: filePath
        });
      expect(readRes.status).toBe(200);
      expect(readRes.body.content).toBe("1: isolated worktree write");

      // Verify that access without override header is rejected
      const noHeaderRes = await request(app)
        .post("/agentic/file/read")
        .send({
          path: filePath
        });
      expect(noHeaderRes.status).toBe(403);
      expect(noHeaderRes.body.error).toContain("is outside allowed roots");

      // Cleanup
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (fs.existsSync(mockWorktree)) {
        fs.rmdirSync(mockWorktree);
      }
    });

    it("blocks writing to .env.local but allows .env.sample", async () => {
      const mockWorktree = "/tmp/prism-worktrees/subagent-test-worktree";
      const envLocalPath = `${mockWorktree}/.env.local`;
      const envSamplePath = `${mockWorktree}/.env.sample`;

      if (!fs.existsSync(mockWorktree)) {
        fs.mkdirSync(mockWorktree, { recursive: true });
      }

      // 1. Verify writing .env.local is rejected due to blocked pattern
      const blockRes = await request(app)
        .post("/agentic/file/write")
        .set("X-Workspace-Override", mockWorktree)
        .send({
          path: envLocalPath,
          content: "MY_SECRET=123"
        });
      expect(blockRes.status).toBe(403);
      expect(blockRes.body.error).toContain("matches blocked pattern");

      // 2. Verify writing .env.sample is allowed
      const allowRes = await request(app)
        .post("/agentic/file/write")
        .set("X-Workspace-Override", mockWorktree)
        .send({
          path: envSamplePath,
          content: "MY_SECRET=placeholder"
        });
      expect(allowRes.status).toBe(200);
      expect(allowRes.body.created).toBe(true);

      // Cleanup
      if (fs.existsSync(envSamplePath)) {
        fs.unlinkSync(envSamplePath);
      }
      if (fs.existsSync(envLocalPath)) {
        fs.unlinkSync(envLocalPath);
      }
      if (fs.existsSync(mockWorktree)) {
        fs.rmdirSync(mockWorktree);
      }
    });
  });

  describe("Command Blocklist Validation", () => {
    it("allows execution of npm / git commands", async () => {
      const res = await request(app)
        .post("/agentic/command/run")
        .send({
          command: "git --version",
          cwd: workspaceRoot
        });
      if (res.status !== 200) console.log("BODY ERROR:", res.body);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("rejects unauthorized commands", async () => {
      const res = await request(app)
        .post("/agentic/command/run")
        .send({
          command: "rm -rf /",
          cwd: workspaceRoot
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("is not in the allowed command list");
    });

    it("rejects chained unauthorized commands", async () => {
      const res = await request(app)
        .post("/agentic/command/run")
        .send({
          command: "git status; rm -rf /",
          cwd: workspaceRoot
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("is not in the allowed command list");
    });

    it("allows environment variable prefixes on allowed commands", async () => {
      const res = await request(app)
        .post("/agentic/command/run")
        .send({
          command: "CI=true git --version",
          cwd: workspaceRoot
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
