// ─── Voxel Mesh 3D Builder ─────────────────────────────────────
// Generates self-contained HTML embeds with Three.js rendering
// utilizing optimized GPU-based InstancedMesh for voxel grid rendering.

import { buildEmbedHtml, escapeHtml, sanitizeCssColor, toEmbedScriptJson } from "../utilities.ts";
import { THREE_JS_CDN, DEFAULT_VIEWPORT_BACKGROUND } from "./ThreeDimensionalBaseService.ts";

// ─── Constants ─────────────────────────────────────────────────

export const MAX_RENDERABLE_VOXELS = 100_000;
const MAX_VOXEL_COUNT = MAX_RENDERABLE_VOXELS;
const MAX_SHAPE_EXTENT = 64;

const VALID_VOXEL_SHAPE_TYPES = new Set([
  "box",
  "sphere",
  "cylinder",
  "cone",
  "pyramid",
  "ellipsoid",
  "torus",
]);

// ─── Types ─────────────────────────────────────────────────────

export interface Voxel {
  position: [number, number, number];
  color?: string;
  opacity?: number;
}

export interface VoxelShape {
  type: "box" | "sphere" | "cylinder" | "cone" | "pyramid" | "ellipsoid" | "torus";
  center: [number, number, number];
  color?: string;
  opacity?: number;
  hollow?: boolean;
  size?: [number, number, number] | number; // array for box; pyramid accepts a scalar base width too
  radius?: number; // for sphere, cylinder, cone
  height?: number; // for cylinder, cone, pyramid
  radii?: [number, number, number]; // for ellipsoid
  majorRadius?: number; // for torus
  minorRadius?: number; // for torus
  axis?: "x" | "y" | "z"; // for oriented shapes (default: 'y')
}

export interface VoxelOptions {
  wireframe?: boolean;
  flatShading?: boolean;
  showGrid?: boolean;
  showAxes?: boolean;
  background?: string;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  voxelSize?: number;
  voxelSpacing?: number;
  cameraPosition?: [number, number, number];
  title?: string;
  outlineColor?: string;
  outlineOpacity?: number;
}

interface VoxelBuildInput {
  voxels?: Voxel[];
  shapes?: VoxelShape[];
  options?: VoxelOptions;
}

export interface VoxelSlice {
  y?: number;
  rows: string[];
}

// ─── Slice-Grid Expansion ──────────────────────────────────────
// Palette + text-grid layers are the agentic-native way to author voxel
// art: one character per voxel instead of ~30 JSON tokens per voxel.

export function expandVoxelSlices(
  palette: unknown,
  slices: unknown,
): { voxels: Voxel[] } | { error: string } {
  if (!Array.isArray(slices) || slices.length === 0) {
    return { error: "'slices' must be a non-empty array of {y, rows} layer objects" };
  }
  if (slices.length > MAX_SHAPE_EXTENT) {
    return { error: `Too many slices (${slices.length}) — the voxel grid is limited to ${MAX_SHAPE_EXTENT} layers` };
  }
  if (!palette || typeof palette !== "object" || Array.isArray(palette)) {
    return {
      error:
        "'palette' is required when using 'slices' — an object mapping single characters " +
        `to CSS colors, e.g. {"r": "#ef4444", "g": "green"}`,
    };
  }
  const paletteMap = palette as Record<string, unknown>;
  for (const [character, color] of Object.entries(paletteMap)) {
    if (character.length !== 1 || character === "." || character === " ") {
      return { error: `Palette key ${JSON.stringify(character)} is invalid — keys must be a single character, and '.'/' ' are reserved for empty cells` };
    }
    if (typeof color !== "string" || color.trim().length === 0) {
      return { error: `Palette entry '${character}' must map to a CSS color string (got: ${JSON.stringify(color)})` };
    }
  }

  const voxels: Voxel[] = [];
  for (let sliceIndex = 0; sliceIndex < slices.length; sliceIndex++) {
    const slice = slices[sliceIndex] as VoxelSlice | null;
    if (!slice || typeof slice !== "object" || !Array.isArray(slice.rows)) {
      return { error: `Slice at index ${sliceIndex} must be an object with a 'rows' array of strings` };
    }
    const layerY = slice.y !== undefined && slice.y !== null ? Number(slice.y) : sliceIndex;
    if (!Number.isInteger(layerY) || Math.abs(layerY) > MAX_SHAPE_EXTENT) {
      return { error: `Slice at index ${sliceIndex} has invalid 'y' ${JSON.stringify(slice.y)} — must be an integer between -${MAX_SHAPE_EXTENT} and ${MAX_SHAPE_EXTENT} (or omitted to stack from 0 upward)` };
    }
    if (slice.rows.length > MAX_SHAPE_EXTENT) {
      return { error: `Slice at y=${layerY} has ${slice.rows.length} rows — the voxel grid is limited to ${MAX_SHAPE_EXTENT} per dimension` };
    }
    for (let rowIndex = 0; rowIndex < slice.rows.length; rowIndex++) {
      const row = slice.rows[rowIndex];
      if (typeof row !== "string") {
        return { error: `Slice at y=${layerY}, row ${rowIndex} must be a string (one character per voxel)` };
      }
      if (row.length > MAX_SHAPE_EXTENT) {
        return { error: `Slice at y=${layerY}, row ${rowIndex} is ${row.length} characters wide — the voxel grid is limited to ${MAX_SHAPE_EXTENT} per dimension` };
      }
      for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
        const character = row[columnIndex];
        if (character === "." || character === " ") continue;
        const color = paletteMap[character];
        if (typeof color !== "string") {
          return {
            error:
              `Unknown character '${character}' at slice y=${layerY}, row ${rowIndex}, column ${columnIndex} — ` +
              `not in the palette. Palette characters: ${Object.keys(paletteMap).map((key) => `'${key}'`).join(", ")} ` +
              `('.' or ' ' for empty cells)`,
          };
        }
        voxels.push({ position: [columnIndex, layerY, rowIndex], color });
      }
    }
  }

  if (voxels.length === 0) {
    return { error: "The provided slices paint no voxels — every cell is '.' or ' '. Use palette characters to paint at least one cell" };
  }
  return { voxels };
}

// ─── Validation ────────────────────────────────────────────────

export function validateVoxelInput(input: VoxelBuildInput): string | null {
  if (
    (!input.voxels || !Array.isArray(input.voxels) || input.voxels.length === 0) &&
    (!input.shapes || !Array.isArray(input.shapes) || input.shapes.length === 0)
  ) {
    return "Either 'voxels' (array of voxel coordinate specifications) or 'shapes' (array of declarative primitive shapes) must be provided and non-empty";
  }

  if (input.voxels && Array.isArray(input.voxels)) {
    for (let index = 0; index < input.voxels.length; index++) {
      const voxel = input.voxels[index];
      if (!voxel || !voxel.position || !Array.isArray(voxel.position) || voxel.position.length !== 3) {
        return `Voxel at index ${index} must have a valid 'position' array of exactly 3 numbers [x, y, z]`;
      }
      if (voxel.position.some((coordinate: number) => typeof coordinate !== "number" || !isFinite(coordinate))) {
        return `Voxel position at index ${index} contains non-finite or non-numeric values`;
      }
      if (voxel.opacity !== undefined && (typeof voxel.opacity !== "number" || voxel.opacity < 0 || voxel.opacity > 1)) {
        return `Voxel opacity at index ${index} must be a number between 0 and 1`;
      }
    }
  }

  if (input.shapes && Array.isArray(input.shapes)) {
    for (let index = 0; index < input.shapes.length; index++) {
      const shape = input.shapes[index];
      if (!shape || !shape.type) {
        return `Shape at index ${index} is missing its 'type' property`;
      }
      if (!VALID_VOXEL_SHAPE_TYPES.has(shape.type)) {
        return `Shape at index ${index} has unknown type '${shape.type}'. Valid: ${[...VALID_VOXEL_SHAPE_TYPES].join(", ")}`;
      }
      if (!shape.center || !Array.isArray(shape.center) || shape.center.length !== 3) {
        return `Shape at index ${index} must have a valid 'center' array of exactly 3 numbers [x, y, z]`;
      }
      if (shape.center.some((coordinate: number) => typeof coordinate !== "number" || !isFinite(coordinate))) {
        return `Shape center at index ${index} contains non-finite or non-numeric values`;
      }
      if (shape.opacity !== undefined && (typeof shape.opacity !== "number" || shape.opacity < 0 || shape.opacity > 1)) {
        return `Shape opacity at index ${index} must be a number between 0 and 1`;
      }

      // Each extent is bounded: rasterization iterates the shape's bounding
      // box, so an unbounded radius would synchronously lock up the service.
      const extentError = (label: string, value: number) =>
        `${label} of shape at index ${index} is ${value}, over the maximum of ${MAX_SHAPE_EXTENT} voxel units — voxel builds operate on a small integer grid`;

      // Check type-specific parameters
      if (shape.type === "box") {
        if (!shape.size || !Array.isArray(shape.size) || shape.size.length !== 3) {
          return `Box shape at index ${index} requires a 'size' array of exactly 3 numbers [width, height, depth]`;
        }
        for (const dimension of shape.size) {
          if (typeof dimension !== "number" || !isFinite(dimension) || dimension <= 0) {
            return `Box shape at index ${index} has a non-positive or non-numeric 'size' dimension`;
          }
          if (dimension > MAX_SHAPE_EXTENT) return extentError("'size' dimension", dimension);
        }
      } else if (shape.type === "sphere") {
        if (shape.radius === undefined || typeof shape.radius !== "number" || shape.radius <= 0) {
          return `Sphere shape at index ${index} requires a positive 'radius' number`;
        }
        if (shape.radius > MAX_SHAPE_EXTENT) return extentError("'radius'", shape.radius);
      } else if (shape.type === "cylinder") {
        if (shape.radius === undefined || typeof shape.radius !== "number" || shape.radius <= 0) {
          return `Cylinder shape at index ${index} requires a positive 'radius' number`;
        }
        if (shape.height === undefined || typeof shape.height !== "number" || shape.height <= 0) {
          return `Cylinder shape at index ${index} requires a positive 'height' number`;
        }
        if (shape.radius > MAX_SHAPE_EXTENT) return extentError("'radius'", shape.radius);
        if (shape.height > MAX_SHAPE_EXTENT) return extentError("'height'", shape.height);
      } else if (shape.type === "cone") {
        if (shape.radius === undefined || typeof shape.radius !== "number" || shape.radius <= 0) {
          return `Cone shape at index ${index} requires a positive 'radius' number`;
        }
        if (shape.height === undefined || typeof shape.height !== "number" || shape.height <= 0) {
          return `Cone shape at index ${index} requires a positive 'height' number`;
        }
        if (shape.radius > MAX_SHAPE_EXTENT) return extentError("'radius'", shape.radius);
        if (shape.height > MAX_SHAPE_EXTENT) return extentError("'height'", shape.height);
      } else if (shape.type === "pyramid") {
        // The published schema declares 'size' as an array; accept both the
        // scalar base width and a [width, height, depth] array.
        const baseWidth = Array.isArray(shape.size) ? shape.size[0] : shape.size;
        if (baseWidth === undefined || typeof baseWidth !== "number" || baseWidth <= 0) {
          return `Pyramid shape at index ${index} requires a positive 'size' (base width number, or [width, height, depth] array)`;
        }
        if (shape.height === undefined || typeof shape.height !== "number" || shape.height <= 0) {
          return `Pyramid shape at index ${index} requires a positive 'height' number`;
        }
        if (baseWidth > MAX_SHAPE_EXTENT) return extentError("'size'", baseWidth);
        if (shape.height > MAX_SHAPE_EXTENT) return extentError("'height'", shape.height);
      } else if (shape.type === "ellipsoid") {
        if (!shape.radii || !Array.isArray(shape.radii) || shape.radii.length !== 3) {
          return `Ellipsoid shape at index ${index} requires a 'radii' array of exactly 3 positive numbers [rx, ry, rz]`;
        }
        for (const radiusComponent of shape.radii) {
          if (typeof radiusComponent !== "number" || !isFinite(radiusComponent) || radiusComponent <= 0) {
            return `Ellipsoid shape at index ${index} has a non-positive or non-numeric 'radii' component`;
          }
          if (radiusComponent > MAX_SHAPE_EXTENT) return extentError("'radii' component", radiusComponent);
        }
      } else if (shape.type === "torus") {
        if (shape.majorRadius === undefined || typeof shape.majorRadius !== "number" || shape.majorRadius <= 0) {
          return `Torus shape at index ${index} requires a positive 'majorRadius' number`;
        }
        if (shape.minorRadius === undefined || typeof shape.minorRadius !== "number" || shape.minorRadius <= 0) {
          return `Torus shape at index ${index} requires a positive 'minorRadius' number`;
        }
        if (shape.majorRadius + shape.minorRadius > MAX_SHAPE_EXTENT) {
          return extentError("'majorRadius' + 'minorRadius'", shape.majorRadius + shape.minorRadius);
        }
      }
    }
  }

  return null;
}

// ─── Shape Voxelizer Engine ────────────────────────────────────

export function resolveVoxels(input: VoxelBuildInput): Voxel[] {
  const voxelMap = new Map<string, Voxel>();

  const addVoxel = (x: number, y: number, z: number, colorString?: string, opacityValue?: number) => {
    const key = `${x},${y},${z}`;
    voxelMap.set(key, {
      position: [x, y, z],
      color: colorString || "#38bdf8",
      opacity: opacityValue !== undefined ? opacityValue : 1.0,
    });
  };

  // 1. Process explicit voxels
  if (input.voxels && Array.isArray(input.voxels)) {
    for (const voxel of input.voxels) {
      const x = Math.round(voxel.position[0]);
      const y = Math.round(voxel.position[1]);
      const z = Math.round(voxel.position[2]);
      addVoxel(x, y, z, voxel.color, voxel.opacity);
    }
  }

  // 2. Process declarative shapes
  if (input.shapes && Array.isArray(input.shapes)) {
    for (const shape of input.shapes) {
      const color = shape.color || "#38bdf8";
      const opacity = shape.opacity !== undefined ? shape.opacity : 1.0;
      const hollow = shape.hollow || false;
      const [centerX, centerY, centerZ] = shape.center;

      if (shape.type === "box") {
        const [width, height, depth] = shape.size as [number, number, number];
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const halfDepth = depth / 2;

        const startX = Math.floor(centerX - halfWidth);
        const endX = Math.ceil(centerX + halfWidth);
        const startY = Math.floor(centerY - halfHeight);
        const endY = Math.ceil(centerY + halfHeight);
        const startZ = Math.floor(centerZ - halfDepth);
        const endZ = Math.ceil(centerZ + halfDepth);

        const isInside = (voxelX: number, voxelY: number, voxelZ: number): boolean => {
          return (
            voxelX >= centerX - halfWidth &&
            voxelX <= centerX + halfWidth &&
            voxelY >= centerY - halfHeight &&
            voxelY <= centerY + halfHeight &&
            voxelZ >= centerZ - halfDepth &&
            voxelZ <= centerZ + halfDepth
          );
        };

        for (let x = startX; x <= endX; x++) {
          for (let y = startY; y <= endY; y++) {
            for (let z = startZ; z <= endZ; z++) {
              if (isInside(x, y, z)) {
                if (hollow) {
                  const hasNeighborOutside =
                    !isInside(x + 1, y, z) ||
                    !isInside(x - 1, y, z) ||
                    !isInside(x, y + 1, z) ||
                    !isInside(x, y - 1, z) ||
                    !isInside(x, y, z + 1) ||
                    !isInside(x, y, z - 1);
                  if (hasNeighborOutside) {
                    addVoxel(x, y, z, color, opacity);
                  }
                } else {
                  addVoxel(x, y, z, color, opacity);
                }
              }
            }
          }
        }
      } else if (shape.type === "sphere") {
        const radius = shape.radius!;
        const startX = Math.floor(centerX - radius);
        const endX = Math.ceil(centerX + radius);
        const startY = Math.floor(centerY - radius);
        const endY = Math.ceil(centerY + radius);
        const startZ = Math.floor(centerZ - radius);
        const endZ = Math.ceil(centerZ + radius);

        const isInside = (voxelX: number, voxelY: number, voxelZ: number): boolean => {
          const distanceX = voxelX - centerX;
          const distanceY = voxelY - centerY;
          const distanceZ = voxelZ - centerZ;
          return distanceX * distanceX + distanceY * distanceY + distanceZ * distanceZ <= radius * radius;
        };

        for (let x = startX; x <= endX; x++) {
          for (let y = startY; y <= endY; y++) {
            for (let z = startZ; z <= endZ; z++) {
              if (isInside(x, y, z)) {
                if (hollow) {
                  const hasNeighborOutside =
                    !isInside(x + 1, y, z) ||
                    !isInside(x - 1, y, z) ||
                    !isInside(x, y + 1, z) ||
                    !isInside(x, y - 1, z) ||
                    !isInside(x, y, z + 1) ||
                    !isInside(x, y, z - 1);
                  if (hasNeighborOutside) {
                    addVoxel(x, y, z, color, opacity);
                  }
                } else {
                  addVoxel(x, y, z, color, opacity);
                }
              }
            }
          }
        }
      } else if (shape.type === "ellipsoid") {
        const [radiusX, radiusY, radiusZ] = shape.radii!;
        const startX = Math.floor(centerX - radiusX);
        const endX = Math.ceil(centerX + radiusX);
        const startY = Math.floor(centerY - radiusY);
        const endY = Math.ceil(centerY + radiusY);
        const startZ = Math.floor(centerZ - radiusZ);
        const endZ = Math.ceil(centerZ + radiusZ);

        const isInside = (voxelX: number, voxelY: number, voxelZ: number): boolean => {
          const distanceX = voxelX - centerX;
          const distanceY = voxelY - centerY;
          const distanceZ = voxelZ - centerZ;
          return (
            (distanceX * distanceX) / (radiusX * radiusX) +
              (distanceY * distanceY) / (radiusY * radiusY) +
              (distanceZ * distanceZ) / (radiusZ * radiusZ) <=
            1.0
          );
        };

        for (let x = startX; x <= endX; x++) {
          for (let y = startY; y <= endY; y++) {
            for (let z = startZ; z <= endZ; z++) {
              if (isInside(x, y, z)) {
                if (hollow) {
                  const hasNeighborOutside =
                    !isInside(x + 1, y, z) ||
                    !isInside(x - 1, y, z) ||
                    !isInside(x, y + 1, z) ||
                    !isInside(x, y - 1, z) ||
                    !isInside(x, y, z + 1) ||
                    !isInside(x, y, z - 1);
                  if (hasNeighborOutside) {
                    addVoxel(x, y, z, color, opacity);
                  }
                } else {
                  addVoxel(x, y, z, color, opacity);
                }
              }
            }
          }
        }
      } else if (shape.type === "cylinder") {
        const radius = shape.radius!;
        const height = shape.height!;
        const axis = shape.axis || "y";
        const halfHeight = height / 2;

        let startX = Math.floor(centerX - radius);
        let endX = Math.ceil(centerX + radius);
        let startY = Math.floor(centerY - radius);
        let endY = Math.ceil(centerY + radius);
        let startZ = Math.floor(centerZ - radius);
        let endZ = Math.ceil(centerZ + radius);

        if (axis === "x") {
          startX = Math.floor(centerX - halfHeight);
          endX = Math.ceil(centerX + halfHeight);
        } else if (axis === "y") {
          startY = Math.floor(centerY - halfHeight);
          endY = Math.ceil(centerY + halfHeight);
        } else if (axis === "z") {
          startZ = Math.floor(centerZ - halfHeight);
          endZ = Math.ceil(centerZ + halfHeight);
        }

        const isInside = (voxelX: number, voxelY: number, voxelZ: number): boolean => {
          const distanceX = voxelX - centerX;
          const distanceY = voxelY - centerY;
          const distanceZ = voxelZ - centerZ;

          if (axis === "x") {
            const radiusSquare = distanceY * distanceY + distanceZ * distanceZ;
            return radiusSquare <= radius * radius && Math.abs(distanceX) <= halfHeight;
          } else if (axis === "y") {
            const radiusSquare = distanceX * distanceX + distanceZ * distanceZ;
            return radiusSquare <= radius * radius && Math.abs(distanceY) <= halfHeight;
          } else {
            const radiusSquare = distanceX * distanceX + distanceY * distanceY;
            return radiusSquare <= radius * radius && Math.abs(distanceZ) <= halfHeight;
          }
        };

        for (let x = startX; x <= endX; x++) {
          for (let y = startY; y <= endY; y++) {
            for (let z = startZ; z <= endZ; z++) {
              if (isInside(x, y, z)) {
                if (hollow) {
                  const hasNeighborOutside =
                    !isInside(x + 1, y, z) ||
                    !isInside(x - 1, y, z) ||
                    !isInside(x, y + 1, z) ||
                    !isInside(x, y - 1, z) ||
                    !isInside(x, y, z + 1) ||
                    !isInside(x, y, z - 1);
                  if (hasNeighborOutside) {
                    addVoxel(x, y, z, color, opacity);
                  }
                } else {
                  addVoxel(x, y, z, color, opacity);
                }
              }
            }
          }
        }
      } else if (shape.type === "cone") {
        const radius = shape.radius!;
        const height = shape.height!;
        const axis = shape.axis || "y";
        const halfHeight = height / 2;

        let startX = Math.floor(centerX - radius);
        let endX = Math.ceil(centerX + radius);
        let startY = Math.floor(centerY - radius);
        let endY = Math.ceil(centerY + radius);
        let startZ = Math.floor(centerZ - radius);
        let endZ = Math.ceil(centerZ + radius);

        if (axis === "x") {
          startX = Math.floor(centerX - halfHeight);
          endX = Math.ceil(centerX + halfHeight);
        } else if (axis === "y") {
          startY = Math.floor(centerY - halfHeight);
          endY = Math.ceil(centerY + halfHeight);
        } else if (axis === "z") {
          startZ = Math.floor(centerZ - halfHeight);
          endZ = Math.ceil(centerZ + halfHeight);
        }

        const isInside = (voxelX: number, voxelY: number, voxelZ: number): boolean => {
          const distanceX = voxelX - centerX;
          const distanceY = voxelY - centerY;
          const distanceZ = voxelZ - centerZ;

          if (axis === "x") {
            const offset = distanceX + halfHeight;
            if (offset < 0 || offset > height) return false;
            const currentRadius = radius * (1.0 - offset / height);
            return distanceY * distanceY + distanceZ * distanceZ <= currentRadius * currentRadius;
          } else if (axis === "y") {
            const offset = distanceY + halfHeight;
            if (offset < 0 || offset > height) return false;
            const currentRadius = radius * (1.0 - offset / height);
            return distanceX * distanceX + distanceZ * distanceZ <= currentRadius * currentRadius;
          } else {
            const offset = distanceZ + halfHeight;
            if (offset < 0 || offset > height) return false;
            const currentRadius = radius * (1.0 - offset / height);
            return distanceX * distanceX + distanceY * distanceY <= currentRadius * currentRadius;
          }
        };

        for (let x = startX; x <= endX; x++) {
          for (let y = startY; y <= endY; y++) {
            for (let z = startZ; z <= endZ; z++) {
              if (isInside(x, y, z)) {
                if (hollow) {
                  const hasNeighborOutside =
                    !isInside(x + 1, y, z) ||
                    !isInside(x - 1, y, z) ||
                    !isInside(x, y + 1, z) ||
                    !isInside(x, y - 1, z) ||
                    !isInside(x, y, z + 1) ||
                    !isInside(x, y, z - 1);
                  if (hasNeighborOutside) {
                    addVoxel(x, y, z, color, opacity);
                  }
                } else {
                  addVoxel(x, y, z, color, opacity);
                }
              }
            }
          }
        }
      } else if (shape.type === "pyramid") {
        const size = Array.isArray(shape.size) ? shape.size[0] : (shape.size as unknown as number);
        const height = shape.height!;
        const halfSize = size / 2;
        const halfHeight = height / 2;

        const startX = Math.floor(centerX - halfSize);
        const endX = Math.ceil(centerX + halfSize);
        const startY = Math.floor(centerY - halfHeight);
        const endY = Math.ceil(centerY + halfHeight);
        const startZ = Math.floor(centerZ - halfSize);
        const endZ = Math.ceil(centerZ + halfSize);

        const isInside = (voxelX: number, voxelY: number, voxelZ: number): boolean => {
          const distanceX = voxelX - centerX;
          const distanceY = voxelY - centerY;
          const distanceZ = voxelZ - centerZ;

          const offset = distanceY + halfHeight;
          if (offset < 0 || offset > height) return false;
          const currentHalfSize = halfSize * (1.0 - offset / height);
          return (
            Math.abs(distanceX) <= currentHalfSize &&
            Math.abs(distanceZ) <= currentHalfSize
          );
        };

        for (let x = startX; x <= endX; x++) {
          for (let y = startY; y <= endY; y++) {
            for (let z = startZ; z <= endZ; z++) {
              if (isInside(x, y, z)) {
                if (hollow) {
                  const hasNeighborOutside =
                    !isInside(x + 1, y, z) ||
                    !isInside(x - 1, y, z) ||
                    !isInside(x, y + 1, z) ||
                    !isInside(x, y - 1, z) ||
                    !isInside(x, y, z + 1) ||
                    !isInside(x, y, z - 1);
                  if (hasNeighborOutside) {
                    addVoxel(x, y, z, color, opacity);
                  }
                } else {
                  addVoxel(x, y, z, color, opacity);
                }
              }
            }
          }
        }
      } else if (shape.type === "torus") {
        const majorRadius = shape.majorRadius!;
        const minorRadius = shape.minorRadius!;
        const axis = shape.axis || "y";
        const boundingRadius = majorRadius + minorRadius;

        const startX = Math.floor(centerX - boundingRadius);
        const endX = Math.ceil(centerX + boundingRadius);
        const startY = Math.floor(centerY - boundingRadius);
        const endY = Math.ceil(centerY + boundingRadius);
        const startZ = Math.floor(centerZ - boundingRadius);
        const endZ = Math.ceil(centerZ + boundingRadius);

        const isInside = (voxelX: number, voxelY: number, voxelZ: number): boolean => {
          const distanceX = voxelX - centerX;
          const distanceY = voxelY - centerY;
          const distanceZ = voxelZ - centerZ;

          if (axis === "x") {
            const planeRadius = Math.sqrt(distanceY * distanceY + distanceZ * distanceZ);
            const ringDistance = planeRadius - majorRadius;
            return ringDistance * ringDistance + distanceX * distanceX <= minorRadius * minorRadius;
          } else if (axis === "y") {
            const planeRadius = Math.sqrt(distanceX * distanceX + distanceZ * distanceZ);
            const ringDistance = planeRadius - majorRadius;
            return ringDistance * ringDistance + distanceY * distanceY <= minorRadius * minorRadius;
          } else {
            const planeRadius = Math.sqrt(distanceX * distanceX + distanceY * distanceY);
            const ringDistance = planeRadius - majorRadius;
            return ringDistance * ringDistance + distanceZ * distanceZ <= minorRadius * minorRadius;
          }
        };

        for (let x = startX; x <= endX; x++) {
          for (let y = startY; y <= endY; y++) {
            for (let z = startZ; z <= endZ; z++) {
              if (isInside(x, y, z)) {
                if (hollow) {
                  const hasNeighborOutside =
                    !isInside(x + 1, y, z) ||
                    !isInside(x - 1, y, z) ||
                    !isInside(x, y + 1, z) ||
                    !isInside(x, y - 1, z) ||
                    !isInside(x, y, z + 1) ||
                    !isInside(x, y, z - 1);
                  if (hasNeighborOutside) {
                    addVoxel(x, y, z, color, opacity);
                  }
                } else {
                  addVoxel(x, y, z, color, opacity);
                }
              }
            }
          }
        }
      }
    }
  }

  // 3. Convert voxelMap values to array, cap count to prevent server crashes
  const voxels = Array.from(voxelMap.values());
  if (voxels.length > MAX_VOXEL_COUNT) {
    return voxels.slice(0, MAX_VOXEL_COUNT);
  }
  return voxels;
}

// ─── HTML Embed Builder ────────────────────────────────────────

export function buildVoxelEmbedHtml(input: VoxelBuildInput): string {
  const voxels = resolveVoxels(input);
  const options = input.options || {};

  const {
    wireframe = false,
    flatShading = true,
    showGrid = true,
    showAxes = false,
    background = DEFAULT_VIEWPORT_BACKGROUND,
    autoRotate = true,
    autoRotateSpeed = 1.0,
    voxelSize = 0.95, // leave small margin default to make individual voxels visible
    voxelSpacing = 0.0,
    cameraPosition,
    title = "",
    outlineColor = "#000000",
    outlineOpacity = 0.35,
  } = options;

  const voxelDataJson = toEmbedScriptJson(voxels);
  const optionsJson = toEmbedScriptJson({
    wireframe,
    flatShading,
    showGrid,
    showAxes,
    background,
    autoRotate,
    autoRotateSpeed,
    voxelSize,
    voxelSpacing,
    cameraPosition: cameraPosition || null,
    outlineColor,
    outlineOpacity,
  });

  return buildEmbedHtml({
    headExtra: "",
    styles: `
  html, body {
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: ${sanitizeCssColor(background, DEFAULT_VIEWPORT_BACKGROUND)};
  }
  #scene-container {
    width: 100%;
    height: 100%;
    position: relative;
  }
  canvas {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }
  #scene-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: linear-gradient(transparent, rgba(0,0,0,0.6));
    pointer-events: none;
  }
  #scene-title {
    color: #94a3b8;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  #scene-status {
    color: #64748b;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
  }`,
    bodyContent: `<div id="scene-container">
  <div id="scene-overlay">
    <div id="scene-title">${escapeHtml(title)}</div>
    <div id="scene-status">initializing…</div>
  </div>
</div>`,
    scripts: `<script type="importmap">
{
  "imports": {
    "three": "${THREE_JS_CDN}",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
  }
}
</${"script"}>
<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const VOXEL_DATA = ${voxelDataJson};
const OPTIONS = ${optionsJson};
const statusElement = document.getElementById("scene-status");

const scene = new THREE.Scene();
scene.background = new THREE.Color(OPTIONS.background);

const container = document.getElementById("scene-container");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.prepend(renderer.domElement);

const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = OPTIONS.autoRotate;
controls.autoRotateSpeed = OPTIONS.autoRotateSpeed;

// ── Lighting ──
const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
directionalLight.position.set(25, 40, 20);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.bias = -0.0005;
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
fillLight.position.set(-25, 15, -20);
scene.add(fillLight);

// ── Build Geometry ──
const size = OPTIONS.voxelSize;
const spacing = OPTIONS.voxelSpacing;
const geometry = new THREE.BoxGeometry(size, size, size);

// Compute bounding box of all voxels to center the scene and fit camera
let minX = Infinity, maxX = -Infinity;
let minY = Infinity, maxY = -Infinity;
let minZ = Infinity, maxZ = -Infinity;

for (let i = 0; i < VOXEL_DATA.length; i++) {
  const pos = VOXEL_DATA[i].position;
  const px = pos[0] * (1.0 + spacing);
  const py = pos[1] * (1.0 + spacing);
  const pz = pos[2] * (1.0 + spacing);
  if (px < minX) minX = px;
  if (px > maxX) maxX = px;
  if (py < minY) minY = py;
  if (py > maxY) maxY = py;
  if (pz < minZ) minZ = pz;
  if (pz > maxZ) maxZ = pz;
}

const centerX = VOXEL_DATA.length > 0 ? (minX + maxX) / 2 : 0;
const centerY = VOXEL_DATA.length > 0 ? (minY + maxY) / 2 : 0;
const centerZ = VOXEL_DATA.length > 0 ? (minZ + maxZ) / 2 : 0;

const radiusX = VOXEL_DATA.length > 0 ? (maxX - minX) / 2 + size : 1;
const radiusY = VOXEL_DATA.length > 0 ? (maxY - minY) / 2 + size : 1;
const radiusZ = VOXEL_DATA.length > 0 ? (maxZ - minZ) / 2 + size : 1;
const boundingRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY + radiusZ * radiusZ);

// Create InstancedMesh for maximum rendering performance on the GPU
if (VOXEL_DATA.length > 0) {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.5,
    metalness: 0.15,
    flatShading: OPTIONS.flatShading,
    wireframe: OPTIONS.wireframe,
  });

  const instancedMesh = new THREE.InstancedMesh(geometry, material, VOXEL_DATA.length);
  instancedMesh.castShadow = true;
  instancedMesh.receiveShadow = true;

  const dummyObject = new THREE.Object3D();
  const tempColor = new THREE.Color();

  for (let i = 0; i < VOXEL_DATA.length; i++) {
    const voxel = VOXEL_DATA[i];
    const px = voxel.position[0] * (1.0 + spacing);
    const py = voxel.position[1] * (1.0 + spacing);
    const pz = voxel.position[2] * (1.0 + spacing);

    dummyObject.position.set(px, py, pz);
    dummyObject.updateMatrix();
    instancedMesh.setMatrixAt(i, dummyObject.matrix);

    tempColor.set(voxel.color || "#38bdf8");
    instancedMesh.setColorAt(i, tempColor);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor) {
    instancedMesh.instanceColor.needsUpdate = true;
  }
  scene.add(instancedMesh);

  // Voxel contours / edge outlines for voxel aesthetic
  if (OPTIONS.outlineColor && OPTIONS.outlineOpacity > 0 && !OPTIONS.wireframe) {
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(OPTIONS.outlineColor),
      transparent: true,
      opacity: OPTIONS.outlineOpacity,
    });

    // Create a group of outline segments using instanced lines if possible, or simple group
    // Since LineSegments are light, a combined buffer or individual meshes is perfectly fine for up to 10k voxels
    // For extreme counts we only render outlines if below 15,000 to keep 60fps stable.
    if (VOXEL_DATA.length <= 15000) {
      const outlinesGroup = new THREE.Group();
      for (let i = 0; i < VOXEL_DATA.length; i++) {
        const voxel = VOXEL_DATA[i];
        const px = voxel.position[0] * (1.0 + spacing);
        const py = voxel.position[1] * (1.0 + spacing);
        const pz = voxel.position[2] * (1.0 + spacing);

        const segments = new THREE.LineSegments(edgesGeometry, lineMaterial);
        segments.position.set(px, py, pz);
        outlinesGroup.add(segments);
      }
      scene.add(outlinesGroup);
    }
  }
}

// ── Camera setup ──
if (OPTIONS.cameraPosition) {
  camera.position.set(...OPTIONS.cameraPosition);
} else {
  const distance = boundingRadius * 2.2;
  camera.position.set(centerX + distance, centerY + distance * 0.8, centerZ + distance);
}
controls.target.set(centerX, centerY, centerZ);
controls.update();

// ── Grid & Axes ──
if (OPTIONS.showGrid) {
  const gridSize = Math.ceil(boundingRadius * 3.5);
  const grid = new THREE.GridHelper(gridSize, gridSize, 0x8a8a8a, 0x606060);
  grid.position.set(centerX, minY - size / 2, centerZ);
  scene.add(grid);
}
if (OPTIONS.showAxes) {
  const axisSize = boundingRadius * 1.3;
  const axes = new THREE.AxesHelper(axisSize);
  axes.position.set(centerX, centerY, centerZ);
  scene.add(axes);
}

// ── Status ──
const dimensionsString = VOXEL_DATA.length > 0
  ? \`\${(maxX - minX + size).toFixed(1)} × \${(maxY - minY + size).toFixed(1)} × \${(maxZ - minZ + size).toFixed(1)}\`
  : "?";
statusElement.textContent = \`\${VOXEL_DATA.length.toLocaleString()} voxels · size \${dimensionsString}\`;

// ── Render Loop ──
function onResize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ── Report size to parent iframe ──
function reportSize() {
  window.parent.postMessage({
    type: "embed-resize",
    width: container.clientWidth,
    height: container.clientHeight
  }, "*");
}
requestAnimationFrame(() => setTimeout(reportSize, 300));
</${"script"}>`,
  });
}
