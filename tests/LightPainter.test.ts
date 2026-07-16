import { describe, it, expect } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { createTestApp } from "./testApp.ts";
import lightsRoutes from "../src/routes/LightsRoutes.ts";
import {
  extractImagePalette,
  renderPaletteStrip,
} from "../src/services/LightPainterService.ts";

// ─── Palette extraction (pure, no LIFX) ────────────────────────

async function twoToneImage() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">' +
    '<rect width="100" height="100" fill="#e03131"/>' +
    '<rect x="100" width="100" height="100" fill="#1971c2"/></svg>';
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("extractImagePalette", () => {
  it("finds the dominant colors of a two-tone image, most-present first", async () => {
    const colors = await extractImagePalette(await twoToneImage());

    expect(colors.length).toBeGreaterThanOrEqual(2);
    // Both halves are equally present; vibrant quantization shifts hues
    // slightly, so assert on channel dominance rather than exact hex.
    const hasRed = colors.some(
      (color) => color.rgb[0] > 150 && color.rgb[2] < 100,
    );
    const hasBlue = colors.some(
      (color) => color.rgb[2] > 150 && color.rgb[0] < 100,
    );
    expect(hasRed).toBe(true);
    expect(hasBlue).toBe(true);
    // Sorted by population descending
    const populations = colors.map((color) => color.population);
    expect([...populations].sort((a, b) => b - a)).toEqual(populations);
  });

  it("respects the maxColors cap", async () => {
    const colors = await extractImagePalette(await twoToneImage(), 1);
    expect(colors).toHaveLength(1);
  });
});

describe("renderPaletteStrip", () => {
  it("renders one 120px swatch per color as a PNG", async () => {
    const colors = await extractImagePalette(await twoToneImage(), 3);
    const strip = await renderPaletteStrip(colors);
    expect(strip.subarray(0, 4).toString("hex")).toBe("89504e47");
    const metadata = await sharp(strip).metadata();
    expect(metadata.width).toBe(colors.length * 120);
    expect(metadata.height).toBe(120);
  });
});

// ─── Route validation (no LIFX service in tests) ───────────────

const app = createTestApp("/lights", lightsRoutes);

describe("POST /lights/paint-from-image", () => {
  it("returns 400 when input is missing", async () => {
    const res = await request(app).post("/lights/paint-from-image").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("input");
  });

  it("returns 400 for out-of-range brightness", async () => {
    const res = await request(app)
      .post("/lights/paint-from-image")
      .send({ input: "data:image/png;base64,AAAA", brightness: 2 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("brightness");
  });

  it("extracts the palette then fails on the unreachable lights service (200 or 502)", async () => {
    const png = await twoToneImage();
    const res = await request(app)
      .post("/lights/paint-from-image")
      .send({ input: `data:image/png;base64,${png.toString("base64")}` });
    // No LIFX service in the test environment — palette extraction succeeds,
    // the lights call 502s. With a live service this returns 200.
    expect([200, 502]).toContain(res.status);
  }, 30_000);
});
