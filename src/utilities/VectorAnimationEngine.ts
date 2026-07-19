export interface GradientStop {
  offset: number;
  color: string;
}

export interface LinearGradient {
  type: "linear";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  stops?: GradientStop[];
}

export interface RadialGradient {
  type: "radial";
  x0?: number;
  y0?: number;
  r0?: number;
  x1?: number;
  y1?: number;
  r1?: number;
  stops?: GradientStop[];
}

export type GradientDefinition = LinearGradient | RadialGradient;

export type ColorValue = string | GradientDefinition;

export type InterpolatableValue = number | string | GradientDefinition | Array<[number, number]> | null | undefined;

export interface KeyframeProperty {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  opacity?: number;
  fillColor?: ColorValue;
  strokeColor?: ColorValue;
  strokeWidth?: number;
  width?: number;
  height?: number;
  radius?: number;
  rx?: number;
  ry?: number;
  points?: Array<[number, number]>;
  text?: string;
  fontSize?: number;
  path?: string;
  imageUrl?: string;
  [key: string]: InterpolatableValue | string | undefined;
}

export interface MotionPath {
  path: string;
  orientToPath?: boolean;
}

export interface Keyframe {
  time: number;
  easing?: string;
  motionPath?: MotionPath;
  properties: KeyframeProperty;
}

export interface ShapeData {
  width?: number;
  height?: number;
  radius?: number;
  rx?: number;
  ry?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  points?: Array<[number, number]>;
  path?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: string;
  textBaseline?: string;
  [key: string]: InterpolatableValue | string | undefined;
}

export interface VectorLayer {
  id: string;
  shapeType: "rectangle" | "circle" | "ellipse" | "line" | "polygon" | "path" | "text" | "group" | "instance";
  shapeData?: ShapeData;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  opacity?: number;
  fillColor?: ColorValue;
  strokeColor?: ColorValue;
  strokeWidth?: number;
  imageUrl?: string;
  keyframes?: Keyframe[];
  /** Layer id this layer's transform is parented to (same scope only). */
  parent?: string;
  /** Draw order within a scope; higher draws on top. Ties keep array order. */
  zIndex?: number;
  /** Mask-source layers are never drawn; other layers clip to them via maskedBy. */
  isMask?: boolean;
  /** Id of an isMask layer in the same scope whose shape clips this layer. */
  maskedBy?: string;
  /** For shapeType "instance": the symbol name this layer stamps. */
  symbol?: string;
  /** Instance playback-rate multiplier over the symbol's own timeline. */
  timeScale?: number;
  /** Instance timeline offset in seconds. */
  timeOffset?: number;
  /** Instance timeline looping (default true). */
  symbolLoop?: boolean;
  blur?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

/** A reusable, independently-timed set of layers ("movie clip"). */
export interface VectorSymbol {
  layers: VectorLayer[];
  /** Symbol timeline length in seconds; defaults to the last keyframe time. */
  duration?: number;
}

export type SymbolMap = Record<string, VectorSymbol>;

export interface LayerTreeIndex {
  byId: Record<string, VectorLayer>;
  childrenOf: Record<string, VectorLayer[]>;
  roots: VectorLayer[];
}

export interface ColorRgba {
  r: number;
  g: number;
  b: number;
  "a": number;
}

const NAMED_COLORS: Record<string, ColorRgba> = {
  transparent: { r: 0, g: 0, b: 0, "a": 0 },
  black: { r: 0, g: 0, b: 0, "a": 1 },
  white: { r: 255, g: 255, b: 255, "a": 1 },
  red: { r: 255, g: 0, b: 0, "a": 1 },
  green: { r: 0, g: 255, b: 0, "a": 1 },
  blue: { r: 0, g: 0, b: 255, "a": 1 },
  yellow: { r: 255, g: 255, b: 0, "a": 1 },
  magenta: { r: 255, g: 0, b: 255, "a": 1 },
  cyan: { r: 0, g: 255, b: 255, "a": 1 },
  gray: { r: 128, g: 128, b: 128, "a": 1 },
  grey: { r: 128, g: 128, b: 128, "a": 1 },
};

export function hueToRgbComponent(pValue: number, qValue: number, colorPercent: number): number {
  let normalizedPercent = colorPercent;
  if (normalizedPercent < 0) normalizedPercent += 1;
  if (normalizedPercent > 1) normalizedPercent -= 1;
  if (normalizedPercent < 1 / 6) return pValue + (qValue - pValue) * 6 * normalizedPercent;
  if (normalizedPercent < 1 / 2) return qValue;
  if (normalizedPercent < 2 / 3) return pValue + (qValue - pValue) * (2 / 3 - normalizedPercent) * 6;
  return pValue;
}

export function hslToRgb(hue: number, saturation: number, lightness: number) {
  const normalizedHue = (hue % 360) / 360;
  let red = lightness;
  let green = lightness;
  let blue = lightness;

  if (saturation !== 0) {
    const qValue = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const pValue = 2 * lightness - qValue;
    red = hueToRgbComponent(pValue, qValue, normalizedHue + 1 / 3);
    green = hueToRgbComponent(pValue, qValue, normalizedHue);
    blue = hueToRgbComponent(pValue, qValue, normalizedHue - 1 / 3);
  }

  return {
    r: Math.round(red * 255),
    g: Math.round(green * 255),
    b: Math.round(blue * 255),
  };
}

export function parseColorToRgba(colorString: string): ColorRgba {
  const normalizedColorString = colorString.trim().toLowerCase();

  if (NAMED_COLORS[normalizedColorString]) {
    return NAMED_COLORS[normalizedColorString];
  }

  if (normalizedColorString.startsWith("#")) {
    const hexDigits = normalizedColorString.slice(1);
    if (hexDigits.length === 3 || hexDigits.length === 4) {
      const red = parseInt(hexDigits[0] + hexDigits[0], 16);
      const green = parseInt(hexDigits[1] + hexDigits[1], 16);
      const blue = parseInt(hexDigits[2] + hexDigits[2], 16);
      const alpha = hexDigits.length === 4 ? parseInt(hexDigits[3] + hexDigits[3], 16) / 255 : 1;
      return { r: red, g: green, b: blue, "a": alpha };
    }
    if (hexDigits.length === 6 || hexDigits.length === 8) {
      const red = parseInt(hexDigits.slice(0, 2), 16);
      const green = parseInt(hexDigits.slice(2, 4), 16);
      const blue = parseInt(hexDigits.slice(4, 6), 16);
      const alpha = hexDigits.length === 8 ? parseInt(hexDigits.slice(6, 8), 16) / 255 : 1;
      return { r: red, g: green, b: blue, "a": alpha };
    }
  }

  const rgbMatch = normalizedColorString.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      "a": rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  const hslMatch = normalizedColorString.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (hslMatch) {
    const hue = parseFloat(hslMatch[1]);
    const saturation = parseFloat(hslMatch[2]) / 100;
    const lightness = parseFloat(hslMatch[3]) / 100;
    const alpha = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;

    const { r, g, b } = hslToRgb(hue, saturation, lightness);
    return { r, g, b, "a": alpha };
  }

  return { r: 0, g: 0, b: 0, "a": 0 };
}

export function parseColor(colorString: string): ColorRgba {
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    const divElement = document.createElement("div");
    divElement.style.color = colorString;
    document.body.appendChild(divElement);
    const rgbString = window.getComputedStyle(divElement).color;
    document.body.removeChild(divElement);
    const match = rgbString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
        "a": match[4] !== undefined ? parseFloat(match[4]) : 1,
      };
    }
  }
  return parseColorToRgba(colorString);
}

export function interpolateColor(color1: string, color2: string, progress: number): string {
  const parsedColor1 = parseColor(color1);
  const parsedColor2 = parseColor(color2);
  const red = Math.round(parsedColor1.r + (parsedColor2.r - parsedColor1.r) * progress);
  const green = Math.round(parsedColor1.g + (parsedColor2.g - parsedColor1.g) * progress);
  const blue = Math.round(parsedColor1.b + (parsedColor2.b - parsedColor1.b) * progress);
  const alpha = parsedColor1['a'] + (parsedColor2['a'] - parsedColor1['a']) * progress;
  return "rgba(" + red + ", " + green + ", " + blue + ", " + alpha + ")";
}

export function isGradient(value: InterpolatableValue | ColorValue): value is GradientDefinition {
  return !!value && typeof value === "object" && !Array.isArray(value) && (value.type === "linear" || value.type === "radial");
}

export function interpolateGradient(gradientA: GradientDefinition, gradientB: GradientDefinition, progress: number): GradientDefinition {
  if (gradientA.type !== gradientB.type) return progress < 0.5 ? gradientA : gradientB;

  const stopsA = gradientA.stops || [];
  const stopsB = gradientB.stops || [];
  const interpolatedStops: GradientStop[] = [];
  const maxStops = Math.max(stopsA.length, stopsB.length);
  for (let index = 0; index < maxStops; index++) {
    const stopA = stopsA[index] || stopsA[stopsA.length - 1] || { offset: 0, color: "transparent" };
    const stopB = stopsB[index] || stopsB[stopsB.length - 1] || { offset: 1, color: "transparent" };
    interpolatedStops.push({
      offset: interpolateNumber(stopA.offset ?? 0, stopB.offset ?? 0, progress),
      color: interpolateColor(stopA.color || "transparent", stopB.color || "transparent", progress),
    });
  }

  if (gradientA.type === "linear" && gradientB.type === "linear") {
    return {
      type: "linear",
      x1: interpolateNumber(gradientA.x1 ?? 0, gradientB.x1 ?? 0, progress),
      y1: interpolateNumber(gradientA.y1 ?? 0, gradientB.y1 ?? 0, progress),
      x2: interpolateNumber(gradientA.x2 ?? 0, gradientB.x2 ?? 0, progress),
      y2: interpolateNumber(gradientA.y2 ?? 0, gradientB.y2 ?? 0, progress),
      stops: interpolatedStops,
    };
  }

  const radialA = gradientA as RadialGradient;
  const radialB = gradientB as RadialGradient;
  return {
    type: "radial",
    x0: interpolateNumber(radialA.x0 ?? 0, radialB.x0 ?? 0, progress),
    y0: interpolateNumber(radialA.y0 ?? 0, radialB.y0 ?? 0, progress),
    r0: interpolateNumber(radialA.r0 ?? 0, radialB.r0 ?? 0, progress),
    x1: interpolateNumber(radialA.x1 ?? 0, radialB.x1 ?? 0, progress),
    y1: interpolateNumber(radialA.y1 ?? 0, radialB.y1 ?? 0, progress),
    r1: interpolateNumber(radialA.r1 ?? 0, radialB.r1 ?? 0, progress),
    stops: interpolatedStops,
  };
}

function interpolateNumber(valueA: number, valueB: number, progress: number): number {
  return valueA + (valueB - valueA) * progress;
}

export function isSvgPathString(value: unknown): value is string {
  return typeof value === "string" && /^[Mm]\s*[-.\d]/.test(value.trim());
}

export function samplePathPoints(pathString: string, sampleCount: number): Array<[number, number]> | null {
  if (typeof document === "undefined") return null;
  let pathObject = pathCache[pathString];
  if (!pathObject) {
    const svgPath = document.createElementNS("http://www.w3.org/2000/svg", "path") as SVGPathElement;
    svgPath.setAttribute("d", pathString);
    const totalLength = typeof svgPath.getTotalLength === "function" ? svgPath.getTotalLength() : 100;
    pathObject = { svgPath, totalLength };
    pathCache[pathString] = pathObject;
  }
  if (typeof pathObject.svgPath.getPointAtLength !== "function") return null;
  const points: Array<[number, number]> = [];
  for (let index = 0; index < sampleCount; index++) {
    const length = (index / (sampleCount - 1)) * pathObject.totalLength;
    const point = pathObject.svgPath.getPointAtLength(length);
    points.push([point.x, point.y]);
  }
  return points;
}

/**
 * Flash-style shape tween between two arbitrary SVG paths: both are sampled
 * to the same point count and the polyline between them is interpolated.
 * Falls back to a discrete midpoint swap where path measurement is
 * unavailable (no DOM).
 */
export function interpolatePath(pathA: string, pathB: string, progress: number): string {
  const SAMPLE_COUNT = 64;
  const pointsA = samplePathPoints(pathA, SAMPLE_COUNT);
  const pointsB = samplePathPoints(pathB, SAMPLE_COUNT);
  if (!pointsA || !pointsB) return progress < 0.5 ? pathA : pathB;
  let pathString = "";
  for (let index = 0; index < SAMPLE_COUNT; index++) {
    const x = pointsA[index][0] + (pointsB[index][0] - pointsA[index][0]) * progress;
    const y = pointsA[index][1] + (pointsB[index][1] - pointsA[index][1]) * progress;
    pathString += (index === 0 ? "M " : " L ") + x.toFixed(2) + " " + y.toFixed(2);
  }
  if (/z\s*$/i.test(pathA.trim()) || /z\s*$/i.test(pathB.trim())) pathString += " Z";
  return pathString;
}

export function interpolate(valueA: InterpolatableValue, valueB: InterpolatableValue, progress: number): InterpolatableValue {
  if (typeof valueA === "number" && typeof valueB === "number") {
    return interpolateNumber(valueA, valueB, progress);
  }
  if (isGradient(valueA) && isGradient(valueB)) {
    return interpolateGradient(valueA, valueB, progress);
  }
  if (typeof valueA === "string" && typeof valueB === "string") {
    if (valueA.startsWith("#") || valueA.startsWith("rgb") || valueA.startsWith("hsl") || valueA.startsWith("rgba")) {
      return interpolateColor(valueA, valueB, progress);
    }
    if (isSvgPathString(valueA) && isSvgPathString(valueB) && valueA !== valueB) {
      return interpolatePath(valueA, valueB, progress);
    }
  }
  if (Array.isArray(valueA) && Array.isArray(valueB)) {
    return valueA.map((item, index) => {
      const counterpart = valueB[index] || item;
      return [interpolateNumber(item[0], counterpart[0], progress), interpolateNumber(item[1], counterpart[1], progress)] as [number, number];
    });
  }
  return progress < 0.5 ? valueA : valueB;
}

export function solveCubicBezier(time: number, x1: number, y1: number, x2: number, y2: number): number {
  function getX(tValue: number): number {
    return 3 * (1 - tValue) * (1 - tValue) * tValue * x1 + 3 * (1 - tValue) * tValue * tValue * x2 + tValue * tValue * tValue;
  }
  function getY(tValue: number): number {
    return 3 * (1 - tValue) * (1 - tValue) * tValue * y1 + 3 * (1 - tValue) * tValue * tValue * y2 + tValue * tValue * tValue;
  }
  function getDerivativeX(tValue: number): number {
    return 3 * (1 - tValue) * (1 - tValue) * x1 + 6 * (1 - tValue) * tValue * (x2 - x1) + 3 * tValue * tValue * (1 - x2);
  }
  let estimatedTime = time;
  for (let iteration = 0; iteration < 8; iteration++) {
    const currentX = getX(estimatedTime) - time;
    if (Math.abs(currentX) < 1e-5) break;
    const derivativeX = getDerivativeX(estimatedTime);
    if (Math.abs(derivativeX) < 1e-5) break;
    estimatedTime -= currentX / derivativeX;
  }
  return getY(estimatedTime);
}

export function easeOutBounce(progress: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  let t = progress;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    t -= 1.5 / d1;
    return n1 * t * t + 0.75;
  }
  if (t < 2.5 / d1) {
    t -= 2.25 / d1;
    return n1 * t * t + 0.9375;
  }
  t -= 2.625 / d1;
  return n1 * t * t + 0.984375;
}

export function ease(progress: number, easing: string | undefined): number {
  if (!easing) return progress;
  if (easing === "linear") return progress;
  if (easing === "ease-in") return progress * progress;
  if (easing === "ease-out") return progress * (2 - progress);
  if (easing === "ease-in-out") return progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
  if (easing === "step" || easing === "discrete") return Math.floor(progress);
  if (easing === "bounce" || easing === "bounce-out") return easeOutBounce(progress);
  if (easing === "bounce-in") return 1 - easeOutBounce(1 - progress);
  if (easing === "elastic" || easing === "elastic-out") {
    if (progress === 0 || progress === 1) return progress;
    return Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  }
  if (easing === "elastic-in") {
    if (progress === 0 || progress === 1) return progress;
    return -Math.pow(2, 10 * progress - 10) * Math.sin((progress * 10 - 10.75) * ((2 * Math.PI) / 3));
  }
  if (easing === "back" || easing === "back-out") {
    return 1 + 2.70158 * Math.pow(progress - 1, 3) + 1.70158 * Math.pow(progress - 1, 2);
  }
  if (easing === "back-in") {
    return 2.70158 * progress * progress * progress - 1.70158 * progress * progress;
  }
  if (easing === "spring") {
    if (progress >= 1) return 1;
    return 1 - Math.exp(-6 * progress) * Math.cos(12 * progress);
  }
  if (easing.startsWith("cubic-bezier")) {
    const match = easing.match(/cubic-bezier\(([^,]+),([^,]+),([^,]+),([^)]+)\)/);
    if (match) {
      return solveCubicBezier(progress, parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]), parseFloat(match[4]));
    }
  }
  return progress;
}

const pathCache: Record<string, { svgPath: SVGPathElement; totalLength: number }> = {};

export function getPathPointAt(pathString: string, progress: number, orientToPath?: boolean): { x: number; y: number; rotation: number } {
  if (typeof document !== "undefined") {
    let pathObject = pathCache[pathString];
    if (!pathObject) {
      const svgPath = document.createElementNS("http://www.w3.org/2000/svg", "path") as SVGPathElement;
      svgPath.setAttribute("d", pathString);
      const totalLength = typeof svgPath.getTotalLength === "function" ? svgPath.getTotalLength() : 100;
      pathObject = { svgPath, totalLength };
      pathCache[pathString] = pathObject;
    }
    const length = progress * pathObject.totalLength;
    const point = typeof pathObject.svgPath.getPointAtLength === "function"
      ? pathObject.svgPath.getPointAtLength(length)
      : { x: length, y: length };
    
    let angle = 0;
    if (orientToPath) {
      const delta = 0.5;
      const nextPoint = typeof pathObject.svgPath.getPointAtLength === "function"
        ? pathObject.svgPath.getPointAtLength(Math.min(pathObject.totalLength, length + delta))
        : { x: length + delta, y: length + delta };
      angle = (Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180) / Math.PI;
    }
    return { x: point.x, y: point.y, rotation: angle };
  }
  return { x: progress * 100, y: progress * 100, rotation: 0 };
}

export function getDefaultValue(key: string, layer: VectorLayer): InterpolatableValue {
  if (key in layer) return (layer as unknown as Record<string, InterpolatableValue>)[key];
  if (key === "scaleX" || key === "scaleY" || key === "opacity") return 1;
  if (key === "x" || key === "y" || key === "rotation" || key === "strokeWidth") return 0;
  if (key === "fillColor" || key === "strokeColor") return "transparent";
  return null;
}

export function resolveAnimatedProperties(layer: VectorLayer, time: number): KeyframeProperty {
  const keyframes = layer.keyframes || [];
  if (keyframes.length === 0) {
    return {
      x: layer.x || 0,
      y: layer.y || 0,
      scaleX: layer.scaleX ?? 1,
      scaleY: layer.scaleY ?? 1,
      rotation: layer.rotation || 0,
      opacity: layer.opacity ?? 1,
      fillColor: layer.fillColor,
      strokeColor: layer.strokeColor,
      strokeWidth: layer.strokeWidth,
      imageUrl: layer.imageUrl,
    };
  }

  let previousKeyframe: Keyframe | null = null;
  let nextKeyframe: Keyframe | null = null;

  for (const keyframe of keyframes) {
    if (keyframe.time <= time) {
      previousKeyframe = keyframe;
    } else {
      nextKeyframe = keyframe;
      break;
    }
  }

  const interpolatedProperties: KeyframeProperty = {};
  if (!previousKeyframe) {
    return { ...keyframes[0].properties };
  } else if (!nextKeyframe) {
    return { ...previousKeyframe.properties };
  } else {
    const progress = (time - previousKeyframe.time) / (nextKeyframe.time - previousKeyframe.time);
    const easedProgress = ease(progress, previousKeyframe.easing);
    
    const propKeys = new Set([
      ...Object.keys(previousKeyframe.properties || {}),
      ...Object.keys(nextKeyframe.properties || {})
    ]);

    if (previousKeyframe.motionPath && previousKeyframe.motionPath.path) {
      const pathPoint = getPathPointAt(previousKeyframe.motionPath.path, easedProgress, previousKeyframe.motionPath.orientToPath);
      interpolatedProperties.x = pathPoint.x;
      interpolatedProperties.y = pathPoint.y;
      if (previousKeyframe.motionPath.orientToPath) {
        interpolatedProperties.rotation = (previousKeyframe.properties.rotation || 0) + pathPoint.rotation;
      }
    }

    for (const key of propKeys) {
      if (previousKeyframe.motionPath && previousKeyframe.motionPath.path && (key === "x" || key === "y" || (key === "rotation" && previousKeyframe.motionPath.orientToPath))) {
        continue;
      }
      const valueA = previousKeyframe.properties[key] !== undefined ? previousKeyframe.properties[key] : getDefaultValue(key, layer);
      const valueB = nextKeyframe.properties[key] !== undefined ? nextKeyframe.properties[key] : getDefaultValue(key, layer);
      interpolatedProperties[key] = interpolate(valueA, valueB, easedProgress);
    }
  }

  return interpolatedProperties;
}

/** Stable draw-order sort: higher zIndex on top, ties keep array order. */
export function sortLayersForRender(layers: VectorLayer[]): VectorLayer[] {
  return layers.slice().sort((layerA, layerB) => (layerA.zIndex || 0) - (layerB.zIndex || 0));
}

/**
 * Build the render tree for one scope (the top-level layer list or one
 * symbol's layer list). Mask-source layers are indexed but never enter the
 * draw tree; layers whose parent is missing or self-referential render as
 * roots so a bad reference degrades visibly instead of hiding the layer.
 */
export function buildTreeIndex(layers: VectorLayer[]): LayerTreeIndex {
  const byId: Record<string, VectorLayer> = {};
  for (const layer of layers || []) byId[layer.id] = layer;
  const childrenOf: Record<string, VectorLayer[]> = {};
  const roots: VectorLayer[] = [];
  for (const layer of layers || []) {
    if (layer.isMask) continue;
    const parentId =
      layer.parent && layer.parent !== layer.id && byId[layer.parent] && !byId[layer.parent].isMask
        ? layer.parent
        : null;
    if (parentId) {
      if (!childrenOf[parentId]) childrenOf[parentId] = [];
      childrenOf[parentId].push(layer);
    } else {
      roots.push(layer);
    }
  }
  for (const parentId in childrenOf) childrenOf[parentId] = sortLayersForRender(childrenOf[parentId]);
  return { byId, childrenOf, roots: sortLayersForRender(roots) };
}

export function getSymbolDuration(symbol: VectorSymbol | undefined, fallbackDuration: number): number {
  if (symbol && typeof symbol.duration === "number" && symbol.duration > 0) return symbol.duration;
  let maxKeyframeTime = 0;
  for (const layer of (symbol && symbol.layers) || []) {
    for (const keyframe of layer.keyframes || []) {
      const time = Number(keyframe.time) || 0;
      if (time > maxKeyframeTime) maxKeyframeTime = time;
    }
  }
  return maxKeyframeTime > 0 ? maxKeyframeTime : fallbackDuration || 1;
}

/** Map scene time onto an instance's symbol timeline (loop by default). */
export function getInstanceLocalTime(layer: VectorLayer, time: number, symbolDuration: number): number {
  const timeScale = typeof layer.timeScale === "number" ? layer.timeScale : 1;
  const timeOffset = typeof layer.timeOffset === "number" ? layer.timeOffset : 0;
  const localTime = time * timeScale + timeOffset;
  if (layer.symbolLoop === false) return Math.max(0, Math.min(localTime, symbolDuration));
  if (!(symbolDuration > 0)) return 0;
  const wrapped = localTime % symbolDuration;
  return wrapped < 0 ? wrapped + symbolDuration : wrapped;
}

/**
 * Serialized engine source for the browser embed player. Function.toString()
 * does not carry closures, so every module-level symbol these functions
 * reference (NAMED_COLORS, pathCache, interpolateNumber, each other) must be
 * re-declared in the script explicitly — one missing symbol throws a
 * ReferenceError on the first rendered frame and blanks the player.
 */
export function buildEngineEmbedScript(): string {
  return `
    const NAMED_COLORS = ${JSON.stringify(NAMED_COLORS)};
    const pathCache = {};
    const interpolateNumber = ${interpolateNumber.toString()};
    const hueToRgbComponent = ${hueToRgbComponent.toString()};
    const hslToRgb = ${hslToRgb.toString()};
    const parseColorToRgba = ${parseColorToRgba.toString()};
    const parseColor = ${parseColor.toString()};
    const interpolateColor = ${interpolateColor.toString()};
    const isGradient = ${isGradient.toString()};
    const interpolateGradient = ${interpolateGradient.toString()};
    const isSvgPathString = ${isSvgPathString.toString()};
    const samplePathPoints = ${samplePathPoints.toString()};
    const interpolatePath = ${interpolatePath.toString()};
    const interpolate = ${interpolate.toString()};
    const solveCubicBezier = ${solveCubicBezier.toString()};
    const easeOutBounce = ${easeOutBounce.toString()};
    const ease = ${ease.toString()};
    const getPathPointAt = ${getPathPointAt.toString()};
    const getDefaultValue = ${getDefaultValue.toString()};
    const resolveAnimatedProperties = ${resolveAnimatedProperties.toString()};
    const sortLayersForRender = ${sortLayersForRender.toString()};
    const buildTreeIndex = ${buildTreeIndex.toString()};
    const getSymbolDuration = ${getSymbolDuration.toString()};
    const getInstanceLocalTime = ${getInstanceLocalTime.toString()};
  `;
}
