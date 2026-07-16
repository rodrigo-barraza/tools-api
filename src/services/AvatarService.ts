// ─── Deterministic Avatar Generation ─────────────────────────
// DiceBear (https://github.com/dicebear/dicebear) maps a seed string to an
// SVG avatar assembled from artist-drawn part libraries — same seed + style
// always yields the identical face, fully offline, zero per-call cost.
// v10 API: @dicebear/core (Avatar/Style) + @dicebear/styles JSON packs
// (the legacy @dicebear/collection is gone).

import { Avatar, Style } from "@dicebear/core";
import sharp from "sharp";

// Mirrors @dicebear/styles/dist — validated against the package in tests so
// a version bump that renames styles fails loudly instead of 500ing live.
export const AVATAR_STYLES = [
  "adventurer",
  "adventurer-neutral",
  "avataaars",
  "avataaars-neutral",
  "big-ears",
  "big-ears-neutral",
  "big-smile",
  "bottts",
  "bottts-neutral",
  "croodles",
  "croodles-neutral",
  "disco",
  "dylan",
  "fun-emoji",
  "glass",
  "glyphs",
  "icons",
  "identicon",
  "initial-face",
  "initials",
  "lorelei",
  "lorelei-neutral",
  "micah",
  "miniavs",
  "notionists",
  "notionists-neutral",
  "open-peeps",
  "personas",
  "pixel-art",
  "pixel-art-neutral",
  "rings",
  "shape-grid",
  "shapes",
  "stripes",
  "thumbs",
  "toon-head",
  "triangles",
] as const;
export type AvatarStyleName = (typeof AVATAR_STYLES)[number];

const MIN_SIZE = 32;
const MAX_SIZE = 1024;
const MAX_SEED_LENGTH = 256;

// Style packs are ~50-500KB JSON each — load on demand, cache forever.
const styleCache = new Map<AvatarStyleName, Style<Record<string, unknown>>>();

async function getStyle(name: AvatarStyleName) {
  const cached = styleCache.get(name);
  if (cached) return cached;
  const pack = await import(`@dicebear/styles/${name}.json`, {
    with: { type: "json" },
  });
  const style = new Style(pack.default);
  styleCache.set(name, style);
  return style;
}

export interface GenerateAvatarInput {
  seed: string;
  style?: string;
  size?: number;
  backgroundColor?: string;
  format?: string;
}

export interface GeneratedAvatar {
  buffer: Buffer;
  mimeType: string;
  seed: string;
  style: AvatarStyleName;
  size: number;
  format: "png" | "svg";
}

/**
 * Deterministically generate an avatar. Throws on invalid input; the route
 * maps errors to 400s.
 */
export async function generateAvatar({
  seed,
  style = "adventurer",
  size = 256,
  backgroundColor,
  format = "png",
}: GenerateAvatarInput): Promise<GeneratedAvatar> {
  if (!seed || typeof seed !== "string") {
    throw new Error("'seed' is required (string) — any name or phrase");
  }
  if (seed.length > MAX_SEED_LENGTH) {
    throw new Error(`'seed' exceeds ${MAX_SEED_LENGTH} characters`);
  }
  if (!AVATAR_STYLES.includes(style as AvatarStyleName)) {
    throw new Error(
      `Unknown style '${style}'. Available: ${AVATAR_STYLES.join(", ")}`,
    );
  }
  if (format !== "png" && format !== "svg") {
    throw new Error("'format' must be 'png' or 'svg'");
  }

  let background: string[] | undefined;
  if (backgroundColor !== undefined && backgroundColor !== "") {
    const hex = String(backgroundColor).replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      throw new Error(
        "'backgroundColor' must be a 6-digit hex color (e.g. '#b6e3f4')",
      );
    }
    background = [hex.toLowerCase()];
  }

  const clampedSize = Math.min(
    Math.max(Math.round(size) || 256, MIN_SIZE),
    MAX_SIZE,
  );

  const styleInstance = await getStyle(style as AvatarStyleName);
  const svg = new Avatar(styleInstance, {
    seed,
    size: clampedSize,
    ...(background && { backgroundColor: background }),
  }).toString();

  if (format === "svg") {
    return {
      buffer: Buffer.from(svg, "utf-8"),
      mimeType: "image/svg+xml",
      seed,
      style: style as AvatarStyleName,
      size: clampedSize,
      format,
    };
  }

  // PNG default: Discord embeds render PNG more reliably than SVG.
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return {
    buffer: png,
    mimeType: "image/png",
    seed,
    style: style as AvatarStyleName,
    size: clampedSize,
    format: "png",
  };
}
