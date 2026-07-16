// ─── Photo → Lighting Scene ──────────────────────────────────
// node-vibrant (https://github.com/Vibrant-Colors/node-vibrant) extracts
// the dominant semantic swatches from an image (Vibrant/Muted/Dark/Light,
// weighted by pixel population); the top colors are distributed round-robin
// across the connected LIFX lights via the existing batch states endpoint.
// "Set the room to match this photo."

import { Vibrant } from "node-vibrant/node";
import sharp from "sharp";
import { resolveInput, type ImageStore } from "./ImageService.ts";
import LightsDataService from "./LightsDataService.ts";

const MAX_PALETTE_COLORS = 6;

export interface PaletteColor {
  /** Vibrant's semantic swatch name (Vibrant, Muted, DarkVibrant, …). */
  name: string;
  hex: string;
  rgb: [number, number, number];
  /** Pixel population — how much of the image this color covers. */
  population: number;
}

/**
 * Extract the dominant colors of an image, most-present first.
 * Swatches with zero population are derived rather than actually present —
 * they're only used when the image is too flat to yield real ones.
 */
export async function extractImagePalette(
  imageBuffer: Buffer,
  maxColors: number = MAX_PALETTE_COLORS,
): Promise<PaletteColor[]> {
  const palette = await Vibrant.from(imageBuffer).getPalette();

  const swatches: PaletteColor[] = [];
  for (const [name, swatch] of Object.entries(palette)) {
    if (!swatch) continue;
    const [r, g, b] = swatch.rgb;
    swatches.push({
      name,
      hex: swatch.hex,
      rgb: [Math.round(r), Math.round(g), Math.round(b)],
      population: swatch.population,
    });
  }

  const present = swatches.filter((swatch) => swatch.population > 0);
  const chosen = present.length >= 2 ? present : swatches;
  return chosen
    .sort((a, b) => b.population - a.population)
    .slice(0, Math.max(1, maxColors));
}

/** Render the extracted palette as a horizontal strip PNG (visual receipt). */
export async function renderPaletteStrip(
  colors: PaletteColor[],
): Promise<Buffer> {
  const swatchWidth = 120;
  const height = 120;
  const rects = colors
    .map(
      (color, index) =>
        `<rect x="${index * swatchWidth}" width="${swatchWidth}" height="${height}" fill="${color.hex}"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${colors.length * swatchWidth}" height="${height}">${rects}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export interface PaintLightsInput {
  input: string;
  selector?: string;
  brightness?: number;
  duration?: number;
  store?: ImageStore;
}

interface TargetLight {
  id?: string;
  label?: string;
  connected?: boolean;
}

/**
 * Paint the lights matched by `selector` with the image's dominant colors.
 * Colors are assigned round-robin per individual light so a multi-bulb room
 * becomes the photo's palette rather than one averaged color.
 */
export async function paintLightsFromImage({
  input,
  selector = "all",
  brightness,
  duration = 1,
  store,
}: PaintLightsInput) {
  if (brightness !== undefined && (brightness < 0 || brightness > 1)) {
    throw new Error("'brightness' must be between 0 and 1");
  }

  const imageBuffer = await resolveInput(input, store);
  const colors = await extractImagePalette(imageBuffer);
  if (colors.length === 0) {
    throw new Error("Could not extract any colors from the image");
  }

  const lights = (await LightsDataService.listLights(
    selector,
  )) as TargetLight[];
  if (!Array.isArray(lights)) {
    throw new Error("Unexpected response from the lights service");
  }
  const targets = lights.filter(
    (light) => light.id && light.connected !== false,
  );
  if (targets.length === 0) {
    throw new Error(`No connected lights matched selector '${selector}'`);
  }

  const states = targets.map((light, index) => {
    const color = colors[index % colors.length];
    return {
      selector: `id:${light.id}`,
      color: `rgb:${color.rgb.join(",")}`,
      power: "on",
      duration,
      ...(brightness !== undefined && { brightness }),
    };
  });

  const lightStatus = await LightsDataService.setStates(states);

  const assignments = targets.map((light, index) => ({
    light: light.label ?? light.id,
    color: colors[index % colors.length].hex,
  }));

  return { colors, assignments, lights: lightStatus };
}
