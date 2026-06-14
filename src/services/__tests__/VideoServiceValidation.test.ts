import { describe, it, expect } from "vitest";
import { convertVideoToGif } from "../VideoService.ts";

describe("convertVideoToGif validation", () => {
  it("rejects missing input", async () => {
    await expect(
      convertVideoToGif({ input: "" }),
    ).rejects.toThrow("'input' is required");
  });

  it("rejects non-string input", async () => {
    await expect(
      convertVideoToGif({ input: 123 as never }),
    ).rejects.toThrow("'input' is required");
  });

  it("rejects invalid quality value", async () => {
    await expect(
      convertVideoToGif({ input: "/some/path/video.mp4", quality: "medium" as never }),
    ).rejects.toThrow("Invalid quality 'medium'");
  });

  it("accepts valid quality 'high'", async () => {
    // This will fail at the file resolution step, not at validation
    await expect(
      convertVideoToGif({ input: "/nonexistent/video.mp4", quality: "high" }),
    ).rejects.not.toThrow("Invalid quality");
  });

  it("accepts valid quality 'low'", async () => {
    await expect(
      convertVideoToGif({ input: "/nonexistent/video.mp4", quality: "low" }),
    ).rejects.not.toThrow("Invalid quality");
  });

  it("rejects fps below range", async () => {
    await expect(
      convertVideoToGif({ input: "/some/path/video.mp4", fps: 0 }),
    ).rejects.toThrow("Invalid fps 0");
  });

  it("rejects fps above range", async () => {
    await expect(
      convertVideoToGif({ input: "/some/path/video.mp4", fps: 60 }),
    ).rejects.toThrow("Invalid fps 60");
  });

  it("rejects width below range", async () => {
    await expect(
      convertVideoToGif({ input: "/some/path/video.mp4", width: 32 }),
    ).rejects.toThrow("Invalid width 32");
  });

  it("rejects width above range", async () => {
    await expect(
      convertVideoToGif({ input: "/some/path/video.mp4", width: 4096 }),
    ).rejects.toThrow("Invalid width 4096");
  });
});
