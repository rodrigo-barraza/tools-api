import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import filesystemRoutes from "../src/routes/FilesystemRoutes.ts";
import { ALLOWED_ROOTS } from "../src/services/AgenticFileService.ts";
import fs from "node:fs";
import path from "node:path";

// ─── Test fixtures ──────────────────────────────────────────

const TEST_ROOT = "/tmp/filesystem-test";
const SUB_DIRECTORY = path.join(TEST_ROOT, "subdir");
const NESTED_DIRECTORY = path.join(SUB_DIRECTORY, "nested");

beforeAll(() => {
  if (!ALLOWED_ROOTS.includes(TEST_ROOT)) {
    ALLOWED_ROOTS.push(TEST_ROOT);
  }
  fs.mkdirSync(NESTED_DIRECTORY, { recursive: true });
  fs.writeFileSync(path.join(TEST_ROOT, "readme.md"), "# Hello");
  fs.writeFileSync(path.join(TEST_ROOT, "index.ts"), "export default {}");
  fs.writeFileSync(path.join(SUB_DIRECTORY, "data.json"), "{}");
  fs.writeFileSync(path.join(NESTED_DIRECTORY, "deep.txt"), "deep content");
});

afterAll(() => {
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
});

const app = createTestApp("/filesystem", filesystemRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════
//  GET /filesystem/list
// ═══════════════════════════════════════════════════════════════

describe("GET /filesystem/list", () => {
  it("returns 400 when path is missing", async () => {
    const response = await request(app).get("/filesystem/list");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("path");
  });

  it("lists directory contents at default depth", async () => {
    const response = await request(app).get(
      `/filesystem/list?path=${encodeURIComponent(TEST_ROOT)}`,
    );
    expect(response.status).toBe(200);
    // agenticGetDirectoryTree returns { entries: [...] }
    expect(response.body.entries).toBeTruthy();
    expect(Array.isArray(response.body.entries)).toBe(true);
    const entryNames = response.body.entries.map(
      (entry: { name: string }) => entry.name,
    );
    expect(entryNames).toContain("readme.md");
    expect(entryNames).toContain("index.ts");
    expect(entryNames).toContain("subdir");
  });

  it("respects depth parameter", async () => {
    const response = await request(app).get(
      `/filesystem/list?path=${encodeURIComponent(TEST_ROOT)}&depth=1`,
    );
    expect(response.status).toBe(200);
    const subdirEntry = response.body.entries.find(
      (entry: { name: string }) => entry.name === "subdir",
    );
    expect(subdirEntry).toBeTruthy();
    expect(subdirEntry.type).toBe("directory");
  });

  it("returns error for a path outside allowed roots", async () => {
    const response = await request(app).get(
      "/filesystem/list?path=/etc/shadow",
    );
    // agenticHandler returns 403 for "outside allowed" errors
    expect(response.status).toBe(403);
    expect(response.body.error).toBeTruthy();
  });
});
