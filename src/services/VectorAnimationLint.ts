// ─── VectorAnimationLint ─────────────────────────────────────
// Static sanity analysis of a merged animation. Agents' most common
// animation failures are silent: a layer that never enters the canvas, a
// layer that is invisible the whole timeline, an instance of an empty
// symbol, float-precision keyframe near-duplicates. None of these error at
// render time — the player just draws nothing — so the tool response warns
// about them on every call, no vision required.

import {
  resolveAnimatedProperties,
  type VectorLayer,
  type SymbolMap,
  type KeyframeProperty,
} from "../utilities/VectorAnimationEngine.ts";

interface AnimationForLint {
  width?: number;
  height?: number;
  duration?: number;
  layers: VectorLayer[];
  symbols?: SymbolMap;
}

/** Row-major 2D affine matrix [a c e; b d f]. */
type Matrix2D = { a: number; b: number; c: number; d: number; e: number; f: number };

const IDENTITY: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function multiply(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

function transformFor(props: KeyframeProperty): Matrix2D {
  const radians = ((props.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const scaleX = props.scaleX ?? 1;
  const scaleY = props.scaleY ?? 1;
  // translate(x,y) · rotate(r) · scale(sx,sy) — same order as the player.
  return {
    a: cos * scaleX,
    b: sin * scaleX,
    c: -sin * scaleY,
    d: cos * scaleY,
    e: props.x || 0,
    f: props.y || 0,
  };
}

function applyPoint(m: Matrix2D, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Rough local-space bounds for a drawable layer at the given resolved
 * properties. Returns null when bounds cannot be estimated (the caller then
 * skips coverage checks for that layer — never warn on a guess).
 */
function estimateLocalBounds(layer: VectorLayer, props: KeyframeProperty): Bounds | null {
  const shapeData = layer.shapeData || {};
  const type = layer.shapeType;

  if (type === "rectangle") {
    const width = Number(props.width ?? shapeData.width ?? 100);
    const height = Number(props.height ?? shapeData.height ?? 100);
    return { minX: -width / 2, minY: -height / 2, maxX: width / 2, maxY: height / 2 };
  }
  if (type === "circle") {
    const radius = Number(props.radius ?? shapeData.radius ?? 50);
    return { minX: -radius, minY: -radius, maxX: radius, maxY: radius };
  }
  if (type === "ellipse") {
    const rx = Number(props.rx ?? shapeData.rx ?? 50);
    const ry = Number(props.ry ?? shapeData.ry ?? 30);
    return { minX: -rx, minY: -ry, maxX: rx, maxY: ry };
  }
  if (type === "line") {
    const x1 = Number(shapeData.x1 ?? 0);
    const y1 = Number(shapeData.y1 ?? 0);
    const x2 = Number(shapeData.x2 ?? 100);
    const y2 = Number(shapeData.y2 ?? 100);
    return {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2),
    };
  }
  if (type === "polygon") {
    const points = (props.points || shapeData.points || []) as Array<[number, number]>;
    if (!Array.isArray(points) || points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
  }
  if (type === "path") {
    const pathString = String(props.path || shapeData.path || "");
    if (!pathString) return null;
    // Crude coordinate scan. Arc flags can skew the estimate toward the
    // origin, which errs toward "intersects" (i.e. no warning) — safe.
    const numbers = (pathString.match(/-?\d*\.?\d+/g) || []).map(Number);
    if (numbers.length < 4) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      minX = Math.min(minX, numbers[index]); maxX = Math.max(maxX, numbers[index]);
      minY = Math.min(minY, numbers[index + 1]); maxY = Math.max(maxY, numbers[index + 1]);
    }
    return { minX, minY, maxX, maxY };
  }
  if (type === "text") {
    const text = String(props.text ?? shapeData.text ?? "");
    const fontSize = Number(props.fontSize ?? shapeData.fontSize ?? 20);
    const width = Math.max(fontSize, text.length * fontSize * 0.6);
    return { minX: -width / 2, minY: -fontSize / 2, maxX: width / 2, maxY: fontSize / 2 };
  }
  return null; // group / instance / unknown — skip coverage analysis
}

function isTransparentColor(value: unknown): boolean {
  return value === undefined || value === null || value === "transparent" || value === "";
}

/** True if no keyframe ever sets `key` to a value passing `test`. */
function noKeyframeSets(
  layer: VectorLayer,
  key: string,
  test: (value: unknown) => boolean,
): boolean {
  for (const keyframe of layer.keyframes || []) {
    const value = (keyframe.properties as Record<string, unknown> | undefined)?.[key];
    if (value !== undefined && test(value)) return false;
  }
  return true;
}

const COVERAGE_SAMPLES = 9;

/**
 * Lint a merged animation. Returns human/agent-readable warning strings —
 * never errors; the animation still renders.
 */
export function lintAnimation(animation: AnimationForLint): string[] {
  const warnings: string[] = [];
  const width = Number(animation.width) || 800;
  const height = Number(animation.height) || 600;
  const duration = Number(animation.duration) || 5;
  const symbols = animation.symbols || {};
  const layers = animation.layers || [];
  const byId = new Map(layers.map((layer) => [layer.id, layer]));

  for (const layer of layers) {
    if (layer.isMask) continue;

    // ── Off-canvas for the entire timeline ──
    if (layer.shapeType !== "group" && layer.shapeType !== "instance") {
      let everIntersects = false;
      let boundsKnown = true;
      for (let sample = 0; sample < COVERAGE_SAMPLES && !everIntersects; sample++) {
        const time = (sample / (COVERAGE_SAMPLES - 1)) * duration;

        // World matrix from the parent chain (root → layer), cycle-guarded.
        const chain: VectorLayer[] = [];
        const seen = new Set<string>();
        let current: VectorLayer | undefined = layer;
        while (current && !seen.has(current.id)) {
          seen.add(current.id);
          chain.unshift(current);
          current = current.parent ? byId.get(current.parent) : undefined;
        }
        let matrix = IDENTITY;
        let props: KeyframeProperty = {};
        for (const chainLayer of chain) {
          props = resolveAnimatedProperties(chainLayer, time);
          matrix = multiply(matrix, transformFor(props));
        }

        const bounds = estimateLocalBounds(layer, props);
        if (!bounds) {
          boundsKnown = false;
          break;
        }
        const corners = [
          applyPoint(matrix, bounds.minX, bounds.minY),
          applyPoint(matrix, bounds.maxX, bounds.minY),
          applyPoint(matrix, bounds.minX, bounds.maxY),
          applyPoint(matrix, bounds.maxX, bounds.maxY),
        ];
        const worldMinX = Math.min(...corners.map((corner) => corner[0]));
        const worldMaxX = Math.max(...corners.map((corner) => corner[0]));
        const worldMinY = Math.min(...corners.map((corner) => corner[1]));
        const worldMaxY = Math.max(...corners.map((corner) => corner[1]));
        everIntersects = worldMaxX >= 0 && worldMinX <= width && worldMaxY >= 0 && worldMinY <= height;
      }
      if (boundsKnown && !everIntersects) {
        warnings.push(
          `Layer '${layer.id}' never intersects the ${width}x${height} canvas at any sampled time — it will not be visible. Check its x/y (and its parent chain).`,
        );
      }
    }

    // ── Invisible the whole timeline ──
    if (layer.shapeType !== "group" && layer.shapeType !== "instance") {
      if (layer.opacity === 0 && noKeyframeSets(layer, "opacity", (value) => Number(value) > 0)) {
        warnings.push(`Layer '${layer.id}' has opacity 0 and no keyframe ever raises it — it will never be visible.`);
      } else if (
        layer.shapeType !== "line" &&
        isTransparentColor(layer.fillColor) &&
        isTransparentColor(layer.strokeColor) &&
        !layer.imageUrl &&
        noKeyframeSets(layer, "fillColor", (value) => !isTransparentColor(value)) &&
        noKeyframeSets(layer, "strokeColor", (value) => !isTransparentColor(value)) &&
        noKeyframeSets(layer, "imageUrl", (value) => typeof value === "string" && value.length > 0)
      ) {
        warnings.push(
          `Layer '${layer.id}' has no fillColor, strokeColor, or imageUrl (and no keyframe sets one) — it will render nothing. Set fillColor or strokeColor.`,
        );
      }
    }

    // ── Instance of an empty/undrawable symbol ──
    if (layer.shapeType === "instance" && layer.symbol) {
      const symbolDefinition = symbols[layer.symbol];
      if (symbolDefinition && (symbolDefinition.layers || []).length === 0) {
        warnings.push(`Layer '${layer.id}' instances symbol '${layer.symbol}' which has no layers — nothing will render.`);
      }
    }

    // ── Float-precision keyframe near-duplicates ──
    const keyframes = layer.keyframes || [];
    for (let index = 1; index < keyframes.length; index++) {
      const previousTime = Number(keyframes[index - 1].time);
      const currentTime = Number(keyframes[index].time);
      const delta = Math.abs(currentTime - previousTime);
      if (delta > 0 && delta < 0.005) {
        warnings.push(
          `Layer '${layer.id}' has keyframes at ${previousTime} and ${currentTime} — ${delta.toFixed(4)}s apart, which looks like a float-precision duplicate. Reuse the exact stored time to update a keyframe.`,
        );
      }
    }
  }

  for (const [symbolName, symbolDefinition] of Object.entries(symbols)) {
    if ((symbolDefinition.layers || []).length === 0) {
      warnings.push(`Symbol '${symbolName}' has no layers — instances of it render nothing.`);
    }
  }

  return warnings;
}
