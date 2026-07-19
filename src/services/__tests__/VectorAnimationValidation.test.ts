import { describe, it, expect } from "vitest";
import {
  normalizeEasing,
  validateVectorAnimationInput,
  validateMergedAnimation,
  type VectorLayer,
} from "../VectorAnimationValidation.ts";

describe("VectorAnimationValidation", () => {
  describe("normalizeEasing presets", () => {
    it("canonicalizes the Flash-style preset aliases", () => {
      expect(normalizeEasing("bounce")).toBe("bounce");
      expect(normalizeEasing("easeOutBounce")).toBe("bounce");
      expect(normalizeEasing("easeInBounce")).toBe("bounce-in");
      expect(normalizeEasing("elastic")).toBe("elastic");
      expect(normalizeEasing("ease-out-elastic")).toBe("elastic");
      expect(normalizeEasing("back")).toBe("back");
      expect(normalizeEasing("overshoot")).toBe("back");
      expect(normalizeEasing("spring")).toBe("spring");
      expect(normalizeEasing("wobble")).toBeNull();
    });
  });

  describe("validateVectorAnimationInput — new layer fields", () => {
    it("accepts the new easing presets on keyframes", () => {
      const error = validateVectorAnimationInput({
        layers: [
          {
            id: "ball",
            shapeType: "circle",
            keyframes: [{ time: 0, easing: "bounce", properties: { y: 10 } }],
          },
        ],
      });
      expect(error).toBeNull();
    });

    it("requires 'symbol' on instance layers", () => {
      const error = validateVectorAnimationInput({
        layers: [{ id: "walker", shapeType: "instance" }],
      });
      expect(error).toContain("symbol");
    });

    it("accepts group and instance shape types", () => {
      const error = validateVectorAnimationInput({
        layers: [
          { id: "rig", shapeType: "group" },
          { id: "walker", shapeType: "instance", symbol: "walk" },
        ],
      });
      expect(error).toBeNull();
    });

    it("rejects malformed symbols maps and validates symbol layers", () => {
      expect(
        validateVectorAnimationInput({
          layers: [],
          symbols: { walk: { layers: "nope" } as never },
        }),
      ).toContain("Symbol 'walk'");

      expect(
        validateVectorAnimationInput({
          layers: [],
          symbols: { walk: { layers: [{ id: "leg", shapeType: "hexagon" }] } },
        }),
      ).toContain("Symbol 'walk'");

      expect(
        validateVectorAnimationInput({
          layers: [],
          symbols: { walk: { layers: [{ id: "leg", shapeType: "rectangle" }], duration: 0.6 } },
        }),
      ).toBeNull();
    });

    it("rejects invalid timeScale and blur", () => {
      expect(
        validateVectorAnimationInput({
          layers: [{ id: "w", shapeType: "instance", symbol: "s", timeScale: 0 }],
        }),
      ).toContain("timeScale");
      expect(
        validateVectorAnimationInput({
          layers: [{ id: "b", shapeType: "circle", blur: -1 }],
        }),
      ).toContain("blur");
    });
  });

  describe("validateMergedAnimation", () => {
    const layer = (overrides: Partial<VectorLayer> & { id: string }): VectorLayer => ({
      shapeType: "rectangle",
      ...overrides,
    });

    it("passes a valid rig with parenting, masks, and symbols", () => {
      const error = validateMergedAnimation({
        layers: [
          layer({ id: "rig", shapeType: "group" }),
          layer({ id: "arm", parent: "rig" }),
          layer({ id: "maskShape", shapeType: "circle", isMask: true }),
          layer({ id: "spot", maskedBy: "maskShape" }),
          layer({ id: "walker", shapeType: "instance", symbol: "walk" }),
        ],
        symbols: {
          walk: { layers: [layer({ id: "leg" })] },
        },
      });
      expect(error).toBeNull();
    });

    it("rejects missing and cyclic parents", () => {
      expect(
        validateMergedAnimation({ layers: [layer({ id: "a", parent: "ghost" })] }),
      ).toContain("does not exist");
      expect(
        validateMergedAnimation({ layers: [layer({ id: "a", parent: "a" })] }),
      ).toContain("own parent");
      expect(
        validateMergedAnimation({
          layers: [layer({ id: "a", parent: "b" }), layer({ id: "b", parent: "a" })],
        }),
      ).toContain("cycle");
    });

    it("rejects bad mask references", () => {
      expect(
        validateMergedAnimation({ layers: [layer({ id: "a", maskedBy: "ghost" })] }),
      ).toContain("does not exist");
      expect(
        validateMergedAnimation({
          layers: [
            layer({ id: "label", shapeType: "text", isMask: true }),
            layer({ id: "a", maskedBy: "label" }),
          ],
        }),
      ).toContain("cannot clip");
    });

    it("rejects instances of unknown symbols", () => {
      expect(
        validateMergedAnimation({
          layers: [layer({ id: "w", shapeType: "instance", symbol: "ghost" })],
          symbols: {},
        }),
      ).toContain("not defined");
    });

    it("rejects symbol nesting cycles but allows acyclic nesting", () => {
      expect(
        validateMergedAnimation({
          layers: [],
          symbols: {
            a: { layers: [layer({ id: "x", shapeType: "instance", symbol: "b" })] },
            b: { layers: [layer({ id: "y", shapeType: "instance", symbol: "a" })] },
          },
        }),
      ).toContain("cycle");

      expect(
        validateMergedAnimation({
          layers: [],
          symbols: {
            a: { layers: [layer({ id: "x", shapeType: "instance", symbol: "b" })] },
            b: { layers: [layer({ id: "y" })] },
          },
        }),
      ).toBeNull();
    });
  });
});
