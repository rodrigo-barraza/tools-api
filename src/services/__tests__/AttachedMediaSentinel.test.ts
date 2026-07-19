import { describe, it, expect } from "vitest";
import {
  ATTACHED_MEDIA_SENTINEL,
  isUnresolvedAttachedSentinel,
  buildAttachedSentinelError,
  assertNoUnresolvedAttachedSentinel,
} from "../AttachedMediaSentinel.ts";

// ═══════════════════════════════════════════════════════════════
// AttachedMediaSentinel — Shared "attached" Sentinel Tests
//
// prism-service substitutes the literal "attached" string with the
// conversation's uploaded media. This module is the single source of
// truth for detecting the UNRESOLVED sentinel and producing the
// standard "please re-attach" error across every media-input tool.
// ═══════════════════════════════════════════════════════════════

describe("isUnresolvedAttachedSentinel", () => {
  it.each(["attached", "Attached", "ATTACHED", "  attached  ", "\tattached\n"])(
    "detects %j as the unresolved sentinel",
    (input) => {
      expect(isUnresolvedAttachedSentinel(input)).toBe(true);
    },
  );

  it.each([
    "https://example.com/image.png",
    "data:image/png;base64,AAAA",
    "attached.png",
    "not attached",
    "img-attached",
    "",
    null,
    undefined,
    42,
    { input: "attached" },
  ])("does not flag %j", (input) => {
    expect(isUnresolvedAttachedSentinel(input)).toBe(false);
  });
});

describe("buildAttachedSentinelError", () => {
  it("mentions the media kind, the sentinel, and the alternatives", () => {
    const message = buildAttachedSentinelError(
      "image",
      "an explicit URL, data URI, or imageId",
    );
    expect(message).toContain("No attached image was found");
    expect(message).toContain(`'${ATTACHED_MEDIA_SENTINEL}'`);
    expect(message).toContain("(re-)upload the image");
    expect(message).toContain("an explicit URL, data URI, or imageId");
  });

  it("varies by media kind", () => {
    expect(buildAttachedSentinelError("audio", "a URL")).toContain(
      "No attached audio was found",
    );
    expect(buildAttachedSentinelError("video", "a URL")).toContain(
      "No attached video was found",
    );
    expect(buildAttachedSentinelError("document", "a URL")).toContain(
      "No attached document was found",
    );
  });
});

describe("assertNoUnresolvedAttachedSentinel", () => {
  it("throws the standard error for the raw sentinel", () => {
    expect(() =>
      assertNoUnresolvedAttachedSentinel("attached", "audio", "a URL"),
    ).toThrow(/No attached audio was found/);
  });

  it("passes through real inputs untouched", () => {
    expect(() =>
      assertNoUnresolvedAttachedSentinel(
        "https://example.com/a.mp3",
        "audio",
        "a URL",
      ),
    ).not.toThrow();
  });
});

// Guards against the shared resolvers drifting away from this module —
// both must surface the exact standard error copy.
describe("shared resolvers use the sentinel module", () => {
  it("ImageService.resolveInput throws the standard image error", async () => {
    const { resolveInput } = await import("../ImageService.ts");
    await expect(resolveInput("attached")).rejects.toThrow(
      /No attached image was found in the conversation to substitute for 'attached'/,
    );
  });

  it("AudioInputService.resolveAudioInput throws the standard audio error", async () => {
    const { resolveAudioInput } = await import("../AudioInputService.ts");
    await expect(resolveAudioInput("attached")).rejects.toThrow(
      /No attached audio was found in the conversation to substitute for 'attached'/,
    );
  });

  it("PdfFetcher.readPdfUrl returns the standard document error", async () => {
    const { readPdfUrl } = await import("../../fetchers/web/PdfFetcher.ts");
    const result = await readPdfUrl("attached");
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("No attached document was found"),
    );
  });

  it("DocxFetcher.readDocxUrl returns the standard document error", async () => {
    const { readDocxUrl } = await import("../../fetchers/web/DocxFetcher.ts");
    const result = await readDocxUrl("attached");
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("No attached document was found"),
    );
  });

  it("CsvFetcher.readCsvSource returns the standard document error", async () => {
    const { readCsvSource } = await import("../../fetchers/web/CsvFetcher.ts");
    const result = await readCsvSource("attached");
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("No attached document was found"),
    );
  });
});
