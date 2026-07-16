import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { Express } from "express";
import { createTestApp } from "./testApp.ts";

// ─── OCR — POST /agentic/web/image-text ─────────────────────────

let app: Express;

beforeAll(async () => {
  const { default: router } = await import("../src/routes/AgenticRoutes.ts");
  app = createTestApp("/agentic", router);
});

async function textImage(text: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="90">` +
    `<rect width="520" height="90" fill="white"/>` +
    `<text x="20" y="58" font-family="DejaVu Sans" font-size="36" fill="black">${text}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("POST /agentic/web/image-text", () => {
  it("returns 400 when input is missing", async () => {
    const res = await request(app).post("/agentic/web/image-text").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("input");
  });

  it("rejects malformed language codes", async () => {
    const png = await textImage("hi");
    const res = await request(app)
      .post("/agentic/web/image-text")
      .send({
        input: `data:image/png;base64,${png.toString("base64")}`,
        lang: "../evil",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("lang");
  });

  it("extracts verbatim text with a confidence score", async () => {
    const png = await textImage("Prism reads 42 words");
    const res = await request(app)
      .post("/agentic/web/image-text")
      .send({ input: `data:image/png;base64,${png.toString("base64")}` });

    expect(res.status).toBe(200);
    expect(res.body.text).toContain("Prism");
    expect(res.body.text).toContain("42");
    expect(res.body.confidence).toBeGreaterThan(60);
    expect(res.body.wordCount).toBe(4);
  }, 60_000);
});
