/**
 * Image Processing TypeScript Definitions
 */

import type { EphemeralStore } from "../utilities.ts";

// ─── Image Operations (Discriminated Union) ─────────────────────

export interface ResizeOp {
  type: "resize";
  width?: number;
  height?: number;
  fit?: string;
  background?: string;
  withoutEnlargement?: boolean;
}

export interface CropOp {
  type: "crop";
  left?: number;
  top?: number;
  width: number;
  height: number;
}

export interface RotateOp {
  type: "rotate";
  angle?: number;
  background?: string | { r: number; g: number; b: number; alpha: number };
}

export interface FlipOp {
  type: "flip";
  direction?: "horizontal" | "vertical";
}

export interface BlurOp {
  type: "blur";
  sigma?: number;
}

export interface SharpenOp {
  type: "sharpen";
  sigma?: number;
  flat?: number;
  jagged?: number;
}

export interface GrayscaleOp {
  type: "grayscale";
}
export interface NegateOp {
  type: "negate";
}

export interface TintOp {
  type: "tint";
  color?: string;
}

export interface AdjustOp {
  type: "adjust";
  brightness?: number;
  saturation?: number;
  hue?: number;
  lightness?: number;
}

export interface GammaOp {
  type: "gamma";
  value?: number;
}

export interface TrimOp {
  type: "trim";
  threshold?: number;
}

export interface ExtendOp {
  type: "extend";
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  background?: string;
}

export interface CompositeOp {
  type: "composite";
  overlayUrl: string;
  gravity?: string;
  blend?: string;
  left?: number;
  top?: number;
}

export interface MetadataOp {
  type: "metadata";
}

export interface TextOp {
  type: "text";
  content: string;
  gravity?: string;
  font?: string;
  fontSize?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  x?: number;
  y?: number;
}

export interface DistortOp {
  type: "distort";
  effect: "swirl" | "wave" | "implode" | "barrel";
  degrees?: number;
  amplitude?: number;
  wavelength?: number;
  factor?: number;
  params?: string;
}

export interface BorderOp {
  type: "border";
  color?: string;
  width?: number;
}

export interface IcoOp {
  type: "ico";
}

export type ImageOperation =
  | ResizeOp
  | CropOp
  | RotateOp
  | FlipOp
  | BlurOp
  | SharpenOp
  | GrayscaleOp
  | NegateOp
  | TintOp
  | AdjustOp
  | GammaOp
  | TrimOp
  | ExtendOp
  | CompositeOp
  | MetadataOp
  | TextOp
  | DistortOp
  | BorderOp
  | IcoOp;

// ─── Image Store Entry ──────────────────────────────────────────

export interface ImageStoreEntry {
  buffer: Buffer;
  mimeType: string;
}

// ─── Process Options ────────────────────────────────────────────

export interface ProcessImageOptions {
  input: string;
  operations: ImageOperation[];
  outputFormat?: string;
  outputQuality?: number;
  store?: EphemeralStore<ImageStoreEntry> | null;
}

// ─── Process Result ─────────────────────────────────────────────

export interface ImageProcessResult {
  buffer: Buffer | null;
  mimeType: string | null;
  metadata?: Record<string, unknown>;
}
