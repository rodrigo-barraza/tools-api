import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import sharp from "sharp";
import {
  parseSegmentationJson,
  applySegmentationMasks,
  toVisionDataUri,
} from "../src/services/ImageService.ts";

vi.mock("../src/services/PrismService.ts", () => ({
  default: {
    getSettings: vi.fn().mockResolvedValue({}),
    chat: vi.fn(),
  },
}));

import PrismService from "../src/services/PrismService.ts";
import creativeRoutes from "../src/routes/CreativeRoutes.ts";
import { createTestApp } from "./testApp.ts";

const app = createTestApp("/creative", creativeRoutes);

let whiteMaskBase64: string;

beforeAll(async () => {
  const whiteMask = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .png()
    .toBuffer();
  whiteMaskBase64 = whiteMask.toString("base64");
});

describe("parseSegmentationJson", () => {
  it("parses masks given as raw base64 and as data URIs", () => {
    const items = parseSegmentationJson(
      JSON.stringify([
        { box_2d: [0, 0, 500, 500], label: "raw", mask: whiteMaskBase64 },
        {
          box_2d: [500, 500, 1000, 1000],
          label: "uri",
          mask: `data:image/png;base64,${whiteMaskBase64}`,
        },
      ]),
      10,
    );

    expect(items).toHaveLength(2);
    expect(items[0].maskPng.length).toBeGreaterThan(0);
    expect(items[1].maskPng.equals(items[0].maskPng)).toBe(true);
  });

  it("drops entries with missing or empty masks and bad boxes", () => {
    const items = parseSegmentationJson(
      JSON.stringify([
        { box_2d: [0, 0, 500, 500], label: "no-mask" },
        { box_2d: [0, 0, 500, 500], label: "empty-mask", mask: "" },
        { box_2d: [500, 0, 100, 500], label: "inverted", mask: whiteMaskBase64 },
        { box_2d: [0, 0, 500, 500], label: "good", mask: whiteMaskBase64 },
      ]),
      10,
    );

    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("good");
  });
});

describe("applySegmentationMasks", () => {
  it("keeps only the masked region of the original pixels", async () => {
    const image = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 180, g: 40, b: 40 },
      },
    })
      .png()
      .toBuffer();

    const whiteMask = Buffer.from(whiteMaskBase64, "base64");
    const result = await applySegmentationMasks(image, [
      { box_2d: [0, 500, 1000, 1000], label: "right half", maskPng: whiteMask },
    ]);

    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(result.coverage).toBeGreaterThan(0.45);
    expect(result.coverage).toBeLessThan(0.55);
    expect(result.labels).toEqual(["right half"]);

    const { data, info } = await sharp(result.buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alphaAt = (x: number, y: number) =>
      data[(y * info.width + x) * info.channels + 3];
    expect(alphaAt(10, 50)).toBe(0); // left half removed
    expect(alphaAt(90, 50)).toBe(255); // right half kept
    // Original pixel color preserved (no re-render)
    const redAt = (x: number, y: number) =>
      data[(y * info.width + x) * info.channels];
    expect(redAt(90, 50)).toBe(180);
  });
});

describe("toVisionDataUri", () => {
  it("downscales to a bounded edge and returns a png data URI", async () => {
    const large = await sharp({
      create: {
        width: 2048,
        height: 1024,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const uri = await toVisionDataUri(large);
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    const meta = await sharp(
      Buffer.from(uri.slice("data:image/png;base64,".length), "base64"),
    ).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(512);
  });

  it("does not enlarge small images", async () => {
    const small = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const uri = await toVisionDataUri(small);
    const meta = await sharp(
      Buffer.from(uri.slice("data:image/png;base64,".length), "base64"),
    ).metadata();
    expect(meta.width).toBe(64);
  });
});

describe("POST /creative/remove-background", () => {
  let imageDataUri: string;

  beforeAll(async () => {
    const png = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 30, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer();
    imageDataUri = `data:image/png;base64,${png.toString("base64")}`;
  });

  it("rejects requests without an image", async () => {
    const res = await request(app)
      .post("/creative/remove-background")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("image");
  });

  it("cuts out the segmented subject and returns a display url", async () => {
    vi.mocked(PrismService.chat).mockResolvedValueOnce({
      text: JSON.stringify([
        { box_2d: [0, 0, 1000, 500], label: "person", mask: whiteMaskBase64 },
      ]),
    });

    const res = await request(app)
      .post("/creative/remove-background")
      .send({ image: imageDataUri, subject: "the person" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.subjects).toEqual(["person"]);
    expect(res.body.coverage).toBeGreaterThan(0.4);
    expect(res.body.imageWidth).toBe(200);
    expect(res.body.imageHeight).toBe(100);
    expect(res.body.imageUrl).toBeTruthy();
    expect(res.body.display).toMatchObject({ kind: "image" });

    const chatCall = vi.mocked(PrismService.chat).mock.calls.at(-1)?.[0] as {
      messages: { content: string; images?: string[] }[];
      responseMimeType?: string;
      thinkingEnabled?: boolean;
    };
    expect(chatCall.messages[0].content).toContain("the person");
    expect(chatCall.messages[0].images?.[0]).toMatch(/^data:image\/png;base64,/);
    expect(chatCall.responseMimeType).toBe("application/json");
    expect(chatCall.thinkingEnabled).toBe(false);
  });

  it("returns 422 with guidance when segmentation finds nothing", async () => {
    vi.mocked(PrismService.chat).mockResolvedValueOnce({ text: "[]" });

    const res = await request(app)
      .post("/creative/remove-background")
      .send({ image: imageDataUri, subject: "a unicorn" });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("unicorn");
  });
});
