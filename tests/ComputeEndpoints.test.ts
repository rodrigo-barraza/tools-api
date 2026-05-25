import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import computeRoutes from "../src/routes/ComputeRoutes.ts";
import { ALLOWED_ROOTS } from "../src/services/AgenticFileService.ts";
import fs from "node:fs";
import path from "node:path";

const app = createTestApp("/compute", computeRoutes);

// A simple 1x1 black pixel PNG data URI for lightweight test execution
const TEST_PNG_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const TEST_PNG_BUFFER = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

describe("POST /compute/image/ascii", () => {
  const testRoot = "/tmp/image-ascii-test";
  const testFilePath = path.join(testRoot, "test-pixel.png");

  beforeAll(() => {
    if (!ALLOWED_ROOTS.includes(testRoot)) {
      ALLOWED_ROOTS.push(testRoot);
    }
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }
    fs.writeFileSync(testFilePath, TEST_PNG_BUFFER);
  });

  afterAll(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    if (fs.existsSync(testRoot)) {
      fs.rmdirSync(testRoot);
    }
  });

  it("returns 400 when input is missing", async () => {
    const res = await request(app)
      .post("/compute/image/ascii")
      .send({ width: 50 });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("input");
  });

  it("successfully converts a base64 image to ASCII and returns details", async () => {
    const res = await request(app)
      .post("/compute/image/ascii")
      .send({
        input: TEST_PNG_BASE64,
        width: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.ascii).toBe("string");
    expect(typeof res.body.ansi).toBe("string");
    expect(typeof res.body.asciiEmbedUrl).toBe("string");
    expect(res.body.asciiId).toBeTruthy();
    expect(res.body.width).toBeLessThanOrEqual(10);
    expect(res.body.height).toBeGreaterThan(0);
  });

  it("successfully converts a local file image path to ASCII", async () => {
    const res = await request(app)
      .post("/compute/image/ascii")
      .send({
        input: testFilePath,
        width: 8,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.ascii).toBe("string");
    expect(res.body.asciiId).toBeTruthy();
  });

  it("successfully converts a file:// URL to ASCII", async () => {
    const res = await request(app)
      .post("/compute/image/ascii")
      .send({
        input: `file://${testFilePath}`,
        width: 8,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.ascii).toBe("string");
    expect(res.body.asciiId).toBeTruthy();
  });
});

describe("GET /compute/image/ascii/embed", () => {
  it("returns 400 when id is missing", async () => {
    const res = await request(app).get("/compute/image/ascii/embed");
    expect(res.status).toBe(400);
  });

  it("returns 404 for nonexistent id", async () => {
    const res = await request(app).get("/compute/image/ascii/embed?id=nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 200 and interactive HTML page for a valid stored ascii id", async () => {
    // 1. Generate stored ASCII
    const postRes = await request(app)
      .post("/compute/image/ascii")
      .send({
        input: TEST_PNG_BASE64,
        width: 10,
      });
    
    expect(postRes.status).toBe(200);
    const asciiId = postRes.body.asciiId;

    // 2. Fetch the embed
    const embedRes = await request(app)
      .get(`/compute/image/ascii/embed?id=${asciiId}`);
    
    expect(embedRes.status).toBe(200);
    expect(embedRes.headers["content-type"]).toContain("text/html");
    expect(embedRes.text).toContain("High-Fidelity ASCII Art Generator");
    expect(embedRes.text).toContain("ascii-pre");
  });
});
