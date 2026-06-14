import { describe, it, expect } from "vitest";
import { processImage, convertToAscii } from "../ImageService.ts";

describe("processImage validation", () => {
  const DUMMY_INPUT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAGklEQVQYlWNgYGD4DwUMIEwMZGBkGFVAMwAAl30BC0H+t3IAAAAASUVORK5CYII=";

  it("rejects empty operations array", async () => {
    await expect(
      processImage({ input: DUMMY_INPUT, operations: [] }),
    ).rejects.toThrow("'operations' must be a non-empty array");
  });

  it("rejects operation without type field", async () => {
    await expect(
      processImage({
        input: DUMMY_INPUT,
        operations: [{ width: 100 } as never],
      }),
    ).rejects.toThrow("Each operation must have a 'type' field");
  });

  it("rejects unknown operation type", async () => {
    await expect(
      processImage({
        input: DUMMY_INPUT,
        operations: [{ type: "emboss" as any }],
      }),
    ).rejects.toThrow("Unknown operation type: 'emboss'");
  });

  it("rejects invalid outputFormat", async () => {
    await expect(
      processImage({
        input: DUMMY_INPUT,
        operations: [{ type: "resize", width: 100 }],
        outputFormat: "bmp",
      }),
    ).rejects.toThrow("Invalid outputFormat 'bmp'");
  });

  it("rejects outputQuality below range", async () => {
    await expect(
      processImage({
        input: DUMMY_INPUT,
        operations: [{ type: "resize", width: 100 }],
        outputQuality: 0,
      }),
    ).rejects.toThrow("Invalid outputQuality 0");
  });

  it("rejects outputQuality above range", async () => {
    await expect(
      processImage({
        input: DUMMY_INPUT,
        operations: [{ type: "resize", width: 100 }],
        outputQuality: 150,
      }),
    ).rejects.toThrow("Invalid outputQuality 150");
  });

  it("accepts valid operation types without throwing validation errors", async () => {
    const result = await processImage({
      input: DUMMY_INPUT,
      operations: [{ type: "resize", width: 1 }],
      outputFormat: "png",
    });
    expect(result).toBeDefined();
  });
});

describe("convertToAscii validation", () => {
  const DUMMY_INPUT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAGklEQVQYlWNgYGD4DwUMIEwMZGBkGFVAMwAAl30BC0H+t3IAAAAASUVORK5CYII=";

  it("rejects width below range", async () => {
    await expect(
      convertToAscii({ input: DUMMY_INPUT, width: 5 }),
    ).rejects.toThrow("Invalid width 5");
  });

  it("rejects width above range", async () => {
    await expect(
      convertToAscii({ input: DUMMY_INPUT, width: 300 }),
    ).rejects.toThrow("Invalid width 300");
  });

  it("rejects contrast below range", async () => {
    await expect(
      convertToAscii({ input: DUMMY_INPUT, contrast: 0.05 }),
    ).rejects.toThrow("Invalid contrast 0.05");
  });

  it("rejects contrast above range", async () => {
    await expect(
      convertToAscii({ input: DUMMY_INPUT, contrast: 15.0 }),
    ).rejects.toThrow("Invalid contrast 15");
  });
});
