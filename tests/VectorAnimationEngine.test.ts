import { describe, it, expect } from "vitest";
import {
  solveCubicBezier,
  ease,
  parseColorToRgba,
  parseColor,
  interpolateColor,
  isGradient,
  interpolateGradient,
  interpolate,
  getDefaultValue,
  resolveAnimatedProperties,
  getPathPointAt,
  VectorLayer,
} from "../src/utilities/VectorAnimationEngine.ts";

describe("VectorAnimationEngine Calculations", () => {
  describe("Cubic Bezier Solver", () => {
    it("correctly evaluates coordinates along a standard cubic-bezier curve", () => {
      const midpoint = solveCubicBezier(0.5, 0.25, 0.1, 0.25, 1.0);
      expect(midpoint).toBeGreaterThan(0.0);
      expect(midpoint).toBeLessThan(1.0);
      expect(solveCubicBezier(0.0, 0.25, 0.1, 0.25, 1.0)).toBe(0.0);
      expect(solveCubicBezier(1.0, 0.25, 0.1, 0.25, 1.0)).toBe(1.0);
    });
  });

  describe("Easing Calculations", () => {
    it("verifies built-in easing curves", () => {
      expect(ease(0.5, "linear")).toBe(0.5);
      expect(ease(0.5, "ease-in")).toBe(0.25); // 0.5 * 0.5
      expect(ease(0.5, "ease-out")).toBe(0.75); // 0.5 * (2 - 0.5)
      expect(ease(0.25, "ease-in-out")).toBe(0.125); // 2 * 0.25 * 0.25
      expect(ease(0.5, "discrete")).toBe(0);
      expect(ease(1.5, "step")).toBe(1);
    });

    it("verifies cubic-bezier parsing and solver mapping", () => {
      const easeResult = ease(0.5, "cubic-bezier(0.25, 0.1, 0.25, 1.0)");
      const directResult = solveCubicBezier(0.5, 0.25, 0.1, 0.25, 1.0);
      expect(easeResult).toBe(directResult);
    });
  });

  describe("Color Parsing & Conversion", () => {
    it("parses named colors", () => {
      expect(parseColorToRgba("red")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColorToRgba("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
      expect(parseColorToRgba("black")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
    });

    it("parses hex colors (short and long, with/without alpha)", () => {
      expect(parseColorToRgba("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColorToRgba("#0000ff")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
      expect(parseColorToRgba("#00ff0080")).toEqual({ r: 0, g: 255, b: 0, a: 128 / 255 });
    });

    it("parses rgb and rgba functions", () => {
      expect(parseColorToRgba("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
      expect(parseColorToRgba("rgba(255, 255, 255, 0.5)")).toEqual({ r: 255, g: 255, b: 255, a: 0.5 });
    });

    it("parses hsl and hsla functions", () => {
      // hsl(120, 100%, 50%) is pure green
      const greenParsed = parseColorToRgba("hsl(120, 100%, 50%)");
      expect(greenParsed.r).toBe(0);
      expect(greenParsed.g).toBe(255);
      expect(greenParsed.b).toBe(0);
      expect(greenParsed.a).toBe(1);

      // hsla(240, 100%, 50%, 0.4) is semi-transparent blue
      const blueParsed = parseColorToRgba("hsla(240, 100%, 50%, 0.4)");
      expect(blueParsed.r).toBe(0);
      expect(blueParsed.g).toBe(0);
      expect(blueParsed.b).toBe(255);
      expect(blueParsed.a).toBeCloseTo(0.4, 2);
    });

    it("uses the DOM parser if document is defined, else falls back", () => {
      // Since we run in Node and document is undefined, it should fallback to parseColorToRgba
      const parsedColor = parseColor("#ff00ff");
      expect(parsedColor).toEqual({ r: 255, g: 0, b: 255, a: 1 });
    });
  });

  describe("Color & Gradient Interpolation", () => {
    it("interpolates colors linearly", () => {
      const colorResult = interpolateColor("red", "blue", 0.5);
      expect(colorResult).toBe("rgba(128, 0, 128, 1)");

      const colorAlphaResult = interpolateColor("rgba(0,0,0,0)", "rgba(255,255,255,1)", 0.25);
      expect(colorAlphaResult).toBe("rgba(64, 64, 64, 0.25)");
    });

    it("correctly identifies gradient definitions", () => {
      expect(isGradient("red")).toBe(false);
      expect(isGradient({ type: "linear", stops: [] })).toBe(true);
      expect(isGradient({ type: "radial", stops: [] })).toBe(true);
    });

    it("interpolates linear gradients coordinates and stops", () => {
      const gradientStart = {
        type: "linear",
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
        stops: [
          { offset: 0, color: "red" },
          { offset: 1, color: "black" }
        ]
      };

      const gradientEnd = {
        type: "linear",
        x1: 50,
        y1: 50,
        x2: 150,
        y2: 50,
        stops: [
          { offset: 0, color: "blue" },
          { offset: 1, color: "white" }
        ]
      };

      const interpolatedGradientResult = interpolateGradient(gradientStart, gradientEnd, 0.5);
      expect(interpolatedGradientResult.type).toBe("linear");
      expect(interpolatedGradientResult.x1).toBe(25);
      expect(interpolatedGradientResult.y1).toBe(25);
      expect(interpolatedGradientResult.x2).toBe(125);
      expect(interpolatedGradientResult.y2).toBe(25);
      expect(interpolatedGradientResult.stops.length).toBe(2);
      expect(interpolatedGradientResult.stops[0].offset).toBe(0);
      expect(interpolatedGradientResult.stops[0].color).toBe("rgba(128, 0, 128, 1)"); // red to blue
      expect(interpolatedGradientResult.stops[1].offset).toBe(1);
      expect(interpolatedGradientResult.stops[1].color).toBe("rgba(128, 128, 128, 1)"); // black to white
    });
  });

  describe("Properties Resolving & Movement", () => {
    it("returns default values when no keyframes are defined", () => {
      const layer: VectorLayer = {
        id: "rect",
        shapeType: "rectangle",
        x: 10,
        y: 20,
        fillColor: "red",
        strokeColor: "black",
        strokeWidth: 3
      };

      const resolved = resolveAnimatedProperties(layer, 5.0);
      expect(resolved.x).toBe(10);
      expect(resolved.y).toBe(20);
      expect(resolved.scaleX).toBe(1);
      expect(resolved.fillColor).toBe("red");
      expect(resolved.strokeColor).toBe("black");
      expect(resolved.strokeWidth).toBe(3);
    });

    it("interpolates properties between two keyframes", () => {
      const layer: VectorLayer = {
        id: "ball",
        shapeType: "circle",
        keyframes: [
          { time: 0, properties: { x: 0, y: 100, radius: 10, strokeWidth: 1 } },
          { time: 4, properties: { x: 200, y: 300, radius: 50, strokeWidth: 5 }, easing: "linear" }
        ]
      };

      // Exactly at time 0
      const propertiesTime0 = resolveAnimatedProperties(layer, 0);
      expect(propertiesTime0.x).toBe(0);
      expect(propertiesTime0.y).toBe(100);
      expect(propertiesTime0.radius).toBe(10);
      expect(propertiesTime0.strokeWidth).toBe(1);

      // At time 2 (midpoint)
      const propertiesTime2 = resolveAnimatedProperties(layer, 2);
      expect(propertiesTime2.x).toBe(100);
      expect(propertiesTime2.y).toBe(200);
      expect(propertiesTime2.radius).toBe(30);
      expect(propertiesTime2.strokeWidth).toBe(3);

      // Exactly at time 4
      const propertiesTime4 = resolveAnimatedProperties(layer, 4);
      expect(propertiesTime4.x).toBe(200);
      expect(propertiesTime4.y).toBe(300);
      expect(propertiesTime4.radius).toBe(50);
      expect(propertiesTime4.strokeWidth).toBe(5);
    });

    it("resolves keyframe bounds correctly for times outside timeline range", () => {
      const layer: VectorLayer = {
        id: "box",
        shapeType: "rectangle",
        keyframes: [
          { time: 1, properties: { x: 50 } },
          { time: 3, properties: { x: 150 } }
        ]
      };

      // Before first keyframe
      expect(resolveAnimatedProperties(layer, 0).x).toBe(50);

      // After last keyframe
      expect(resolveAnimatedProperties(layer, 4).x).toBe(150);
    });
  });

  describe("Motion Path & Tangent Rotation", () => {
    it("uses linear fallback coordinates in pure Node environment", () => {
      const point = getPathPointAt("M 0 0 L 100 100", 0.5, false);
      expect(point.x).toBe(50);
      expect(point.y).toBe(50);
      expect(point.rotation).toBe(0);
    });

    it("correctly computes position and rotation when document is mocked", () => {
      const originalDocument = globalThis.document;

      // Mock SVG path methods
      globalThis.document = {
        createElementNS: () => {
          return {
            setAttribute: () => {},
            getTotalLength: () => 100,
            getPointAtLength: (len: number) => {
              // Simulating line y = 2x
              return { x: len, y: len * 2 };
            }
          };
        }
      } as any;

      try {
        const point = getPathPointAt("M 0 0 L 100 200", 0.5, true);
        expect(point.x).toBe(50);
        expect(point.y).toBe(100);
        // Tangent rotation: Math.atan2(2 * delta, delta) = Math.atan2(1.0, 0.5) * 180 / Math.PI
        expect(point.rotation).toBeCloseTo((Math.atan2(1.0, 0.5) * 180) / Math.PI, 1);
      } finally {
        globalThis.document = originalDocument;
      }
    });
  });
});
