import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import computeRoutes from "../src/routes/ComputeRoutes.ts";

const app = createTestApp("/compute", computeRoutes);

// A simple 1x1 black pixel PNG data URI for lightweight test execution
const TEST_PNG_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("POST /compute/image/ascii", () => {
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
