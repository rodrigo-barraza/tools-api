import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import sharp from "sharp";
import {
  parseDetectionJson,
  annotateDetections,
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

describe("parseDetectionJson", () => {
  it("parses a clean JSON array", () => {
    const items = parseDetectionJson(
      '[{"box_2d": [100, 200, 300, 400], "label": "dog"}]',
      20,
    );
    expect(items).toEqual([{ box_2d: [100, 200, 300, 400], label: "dog" }]);
  });

  it("tolerates markdown fences and surrounding prose", () => {
    const items = parseDetectionJson(
      'Here are the results:\n```json\n[{"box_2d": [0, 0, 500, 500], "label": "cat"}]\n```\nDone!',
      20,
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("cat");
  });

  it("drops degenerate and malformed boxes, clamps out-of-range values", () => {
    const items = parseDetectionJson(
      JSON.stringify([
        { box_2d: [300, 300, 100, 400], label: "inverted" },
        { box_2d: [0, 0, "x", 400], label: "non-numeric" },
        { box_2d: [0, 0, 400], label: "short" },
        { label: "boxless" },
        { box_2d: [-50, 0, 500, 1500], label: "clamped" },
      ]),
      20,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ box_2d: [0, 0, 500, 1000], label: "clamped" });
  });

  it("caps results at maxObjects", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      box_2d: [0, 0, 100 + i, 100 + i],
      label: `item-${i}`,
    }));
    expect(parseDetectionJson(JSON.stringify(many), 3)).toHaveLength(3);
  });

  it("returns [] for garbage, empty, and non-array input", () => {
    expect(parseDetectionJson("no json here", 20)).toEqual([]);
    expect(parseDetectionJson("", 20)).toEqual([]);
    expect(parseDetectionJson(null, 20)).toEqual([]);
    expect(parseDetectionJson('{"boxes": []}', 20)).toEqual([]);
  });
});

describe("annotateDetections", () => {
  async function makeImage(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 220, g: 220, b: 220 },
      },
    })
      .png()
      .toBuffer();
  }

  it("scales normalized boxes to pixel space", async () => {
    const image = await makeImage(1000, 500);
    const result = await annotateDetections(
      image,
      [{ box_2d: [100, 200, 500, 600], label: "thing" }],
      { annotate: false },
    );

    expect(result.width).toBe(1000);
    expect(result.height).toBe(500);
    // ymin=100 → top 50 (of 500), xmin=200 → left 200 (of 1000)
    expect(result.objects[0].pixelBox).toEqual({
      left: 200,
      top: 50,
      width: 400,
      height: 200,
    });
    expect(result.annotatedPng).toBeNull();
  });

  it("renders an annotated PNG with the source dimensions", async () => {
    const image = await makeImage(400, 300);
    const result = await annotateDetections(image, [
      { box_2d: [100, 100, 900, 900], label: "big <thing> & co" },
    ]);

    expect(result.annotatedPng).not.toBeNull();
    const meta = await sharp(result.annotatedPng!).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });
});

describe("POST /creative/detect-objects", () => {
  let imageDataUri: string;

  beforeAll(async () => {
    const png = await sharp({
      create: {
        width: 200,
        height: 100,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();
    imageDataUri = `data:image/png;base64,${png.toString("base64")}`;
  });

  it("rejects requests without an image", async () => {
    const res = await request(app).post("/creative/detect-objects").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("image");
  });

  it("returns pixel boxes and an annotated image url", async () => {
    vi.mocked(PrismService.chat).mockResolvedValueOnce({
      text: '[{"box_2d": [0, 0, 500, 500], "label": "square"}]',
    });

    const res = await request(app)
      .post("/creative/detect-objects")
      .send({ image: imageDataUri, instruction: "squares" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(res.body.imageWidth).toBe(200);
    expect(res.body.imageHeight).toBe(100);
    expect(res.body.objects[0]).toMatchObject({
      label: "square",
      pixelBox: { left: 0, top: 0, width: 100, height: 50 },
    });
    expect(res.body.imageUrl).toBeTruthy();
    expect(res.body.display).toMatchObject({ kind: "image" });

    const chatCall = vi.mocked(PrismService.chat).mock.calls.at(-1)?.[0] as {
      messages: { content: string; images?: string[] }[];
      responseMimeType?: string;
    };
    expect(chatCall.messages[0].content).toContain("squares");
    expect(chatCall.messages[0].images).toEqual([imageDataUri]);
    expect(chatCall.responseMimeType).toBe("application/json");
  });

  it("skips annotation when annotate is false", async () => {
    vi.mocked(PrismService.chat).mockResolvedValueOnce({
      text: '[{"box_2d": [0, 0, 500, 500], "label": "square"}]',
    });

    const res = await request(app)
      .post("/creative/detect-objects")
      .send({ image: imageDataUri, annotate: false });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.imageUrl).toBeUndefined();
    expect(res.body.display).toBeUndefined();
  });

  it("reports cleanly when nothing is found", async () => {
    vi.mocked(PrismService.chat).mockResolvedValueOnce({ text: "[]" });

    const res = await request(app)
      .post("/creative/detect-objects")
      .send({ image: imageDataUri, instruction: "unicorns" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(0);
    expect(res.body.objects).toEqual([]);
    expect(res.body.message).toContain("unicorns");
  });
});
