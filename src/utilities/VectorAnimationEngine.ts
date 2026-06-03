export interface KeyframeProperty {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  opacity?: number;
  fillColor?: string | any;
  strokeColor?: string | any;
  strokeWidth?: number;
  width?: number;
  height?: number;
  radius?: number;
  points?: Array<[number, number]>;
  text?: string;
  fontSize?: number;
  [key: string]: any;
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

export interface VectorLayer {
  id: string;
  shapeType: "rectangle" | "circle" | "ellipse" | "line" | "polygon" | "path" | "text";
  shapeData?: Record<string, any>;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  opacity?: number;
  fillColor?: string | any;
  strokeColor?: string | any;
  strokeWidth?: number;
  keyframes?: Keyframe[];
}

export interface ColorRgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED_COLORS: Record<string, ColorRgba> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 255, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
  magenta: { r: 255, g: 0, b: 255, a: 1 },
  cyan: { r: 0, g: 255, b: 255, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
};

export function hueToRgbComponent(pVal: number, qVal: number, colorPercent: number): number {
  let normalizedPercent = colorPercent;
  if (normalizedPercent < 0) normalizedPercent += 1;
  if (normalizedPercent > 1) normalizedPercent -= 1;
  if (normalizedPercent < 1 / 6) return pVal + (qVal - pVal) * 6 * normalizedPercent;
  if (normalizedPercent < 1 / 2) return qVal;
  if (normalizedPercent < 2 / 3) return pVal + (qVal - pVal) * (2 / 3 - normalizedPercent) * 6;
  return pVal;
}

export function hslToRgb(hue: number, saturation: number, lightness: number) {
  const normalizedHue = (hue % 360) / 360;
  let red = lightness;
  let green = lightness;
  let blue = lightness;

  if (saturation !== 0) {
    const qVal = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
    const pVal = 2 * lightness - qVal;
    red = hueToRgbComponent(pVal, qVal, normalizedHue + 1 / 3);
    green = hueToRgbComponent(pVal, qVal, normalizedHue);
    blue = hueToRgbComponent(pVal, qVal, normalizedHue - 1 / 3);
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
      return { r: red, g: green, b: blue, a: alpha };
    }
    if (hexDigits.length === 6 || hexDigits.length === 8) {
      const red = parseInt(hexDigits.slice(0, 2), 16);
      const green = parseInt(hexDigits.slice(2, 4), 16);
      const blue = parseInt(hexDigits.slice(4, 6), 16);
      const alpha = hexDigits.length === 8 ? parseInt(hexDigits.slice(6, 8), 16) / 255 : 1;
      return { r: red, g: green, b: blue, a: alpha };
    }
  }

  const rgbMatch = normalizedColorString.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  const hslMatch = normalizedColorString.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (hslMatch) {
    const hue = parseFloat(hslMatch[1]);
    const saturation = parseFloat(hslMatch[2]) / 100;
    const lightness = parseFloat(hslMatch[3]) / 100;
    const alpha = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;

    const { r, g, b } = hslToRgb(hue, saturation, lightness);
    return { r, g, b, a: alpha };
  }

  return { r: 0, g: 0, b: 0, a: 0 };
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
        a: match[4] !== undefined ? parseFloat(match[4]) : 1,
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
  const alpha = parsedColor1.a + (parsedColor2.a - parsedColor1.a) * progress;
  return "rgba(" + red + ", " + green + ", " + blue + ", " + alpha + ")";
}

export function isGradient(value: any): boolean {
  return value && typeof value === "object" && (value.type === "linear" || value.type === "radial");
}

export function interpolateGradient(gradientA: any, gradientB: any, progress: number): any {
  if (gradientA.type !== gradientB.type) return progress < 0.5 ? gradientA : gradientB;
  const result: any = { type: gradientA.type };
  if (gradientA.type === "linear") {
    result.x1 = interpolate(gradientA.x1 ?? 0, gradientB.x1 ?? 0, progress);
    result.y1 = interpolate(gradientA.y1 ?? 0, gradientB.y1 ?? 0, progress);
    result.x2 = interpolate(gradientA.x2 ?? 0, gradientB.x2 ?? 0, progress);
    result.y2 = interpolate(gradientA.y2 ?? 0, gradientB.y2 ?? 0, progress);
  } else if (gradientA.type === "radial") {
    result.x0 = interpolate(gradientA.x0 ?? 0, gradientB.x0 ?? 0, progress);
    result.y0 = interpolate(gradientA.y0 ?? 0, gradientB.y0 ?? 0, progress);
    result.r0 = interpolate(gradientA.r0 ?? 0, gradientB.r0 ?? 0, progress);
    result.x1 = interpolate(gradientA.x1 ?? 0, gradientB.x1 ?? 0, progress);
    result.y1 = interpolate(gradientA.y1 ?? 0, gradientB.y1 ?? 0, progress);
    result.r1 = interpolate(gradientA.r1 ?? 0, gradientB.r1 ?? 0, progress);
  }
  
  const stopsA = gradientA.stops || [];
  const stopsB = gradientB.stops || [];
  const stops = [];
  const maxStops = Math.max(stopsA.length, stopsB.length);
  for (let index = 0; index < maxStops; index++) {
    const stopA = stopsA[index] || stopsA[stopsA.length - 1] || { offset: 0, color: "transparent" };
    const stopB = stopsB[index] || stopsB[stopsB.length - 1] || { offset: 1, color: "transparent" };
    stops.push({
      offset: interpolate(stopA.offset ?? 0, stopB.offset ?? 0, progress),
      color: interpolateColor(stopA.color || "transparent", stopB.color || "transparent", progress),
    });
  }
  result.stops = stops;
  return result;
}

export function interpolate(valueA: any, valueB: any, progress: number): any {
  if (typeof valueA === "number" && typeof valueB === "number") {
    return valueA + (valueB - valueA) * progress;
  }
  if (isGradient(valueA) && isGradient(valueB)) {
    return interpolateGradient(valueA, valueB, progress);
  }
  if (typeof valueA === "string" && typeof valueB === "string") {
    if (valueA.startsWith("#") || valueA.startsWith("rgb") || valueA.startsWith("hsl") || valueA.startsWith("rgba")) {
      return interpolateColor(valueA, valueB, progress);
    }
  }
  if (Array.isArray(valueA) && Array.isArray(valueB)) {
    return valueA.map((item, index) => interpolate(item, valueB[index] || item, progress));
  }
  return progress < 0.5 ? valueA : valueB;
}

export function solveCubicBezier(time: number, x1: number, y1: number, x2: number, y2: number): number {
  function getX(tVal: number): number {
    return 3 * (1 - tVal) * (1 - tVal) * tVal * x1 + 3 * (1 - tVal) * tVal * tVal * x2 + tVal * tVal * tVal;
  }
  function getY(tVal: number): number {
    return 3 * (1 - tVal) * (1 - tVal) * tVal * y1 + 3 * (1 - tVal) * tVal * tVal * y2 + tVal * tVal * tVal;
  }
  function getDerivativeX(tVal: number): number {
    return 3 * (1 - tVal) * (1 - tVal) * x1 + 6 * (1 - tVal) * tVal * (x2 - x1) + 3 * tVal * tVal * (1 - x2);
  }
  let guessT = time;
  for (let iteration = 0; iteration < 8; iteration++) {
    const currentX = getX(guessT) - time;
    if (Math.abs(currentX) < 1e-5) break;
    const dX = getDerivativeX(guessT);
    if (Math.abs(dX) < 1e-5) break;
    guessT -= currentX / dX;
  }
  return getY(guessT);
}

export function ease(progress: number, easing: string | undefined): number {
  if (!easing) return progress;
  if (easing === "linear") return progress;
  if (easing === "ease-in") return progress * progress;
  if (easing === "ease-out") return progress * (2 - progress);
  if (easing === "ease-in-out") return progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
  if (easing === "step" || easing === "discrete") return Math.floor(progress);
  if (easing.startsWith("cubic-bezier")) {
    const match = easing.match(/cubic-bezier\(([^,]+),([^,]+),([^,]+),([^)]+)\)/);
    if (match) {
      return solveCubicBezier(progress, parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]), parseFloat(match[4]));
    }
  }
  return progress;
}

const pathCache: Record<string, { svgPath: any; totalLength: number }> = {};

export function getPathPointAt(pathString: string, progress: number, orientToPath?: boolean): { x: number; y: number; rotation: number } {
  if (typeof document !== "undefined") {
    let pathObj = pathCache[pathString];
    if (!pathObj) {
      const svgPath = document.createElementNS("http://www.w3.org/2000/svg", "path") as any;
      svgPath.setAttribute("d", pathString);
      const totalLength = typeof svgPath.getTotalLength === "function" ? svgPath.getTotalLength() : 100;
      pathObj = { svgPath, totalLength };
      pathCache[pathString] = pathObj;
    }
    const length = progress * pathObj.totalLength;
    const point = typeof pathObj.svgPath.getPointAtLength === "function"
      ? pathObj.svgPath.getPointAtLength(length)
      : { x: length, y: length };
    
    let angle = 0;
    if (orientToPath) {
      const delta = 0.5;
      const nextPoint = typeof pathObj.svgPath.getPointAtLength === "function"
        ? pathObj.svgPath.getPointAtLength(Math.min(pathObj.totalLength, length + delta))
        : { x: length + delta, y: length + delta };
      angle = (Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * 180) / Math.PI;
    }
    return { x: point.x, y: point.y, rotation: angle };
  }
  return { x: progress * 100, y: progress * 100, rotation: 0 };
}

export function getDefaultValue(key: string, layer: VectorLayer): any {
  if ((layer as any)[key] !== undefined) return (layer as any)[key];
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
