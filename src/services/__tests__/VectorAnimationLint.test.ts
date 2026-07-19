import { describe, it, expect } from "vitest";
import { lintAnimation } from "../VectorAnimationLint.ts";
import type { VectorLayer } from "../../utilities/VectorAnimationEngine.ts";

const CANVAS = { width: 800, height: 600, duration: 4 };

describe("VectorAnimationLint", () => {
  it("passes a healthy animation with no warnings", () => {
    const warnings = lintAnimation({
      ...CANVAS,
      layers: [
        {
          id: "ball",
          shapeType: "circle",
          shapeData: { radius: 30 },
          fillColor: "#38bdf8",
          keyframes: [
            { time: 0, properties: { x: 100, y: 100 } },
            { time: 4, properties: { x: 700, y: 500 } },
          ],
        },
      ],
    });
    expect(warnings).toEqual([]);
  });

  it("warns when a layer never intersects the canvas", () => {
    const warnings = lintAnimation({
      ...CANVAS,
      layers: [
        {
          id: "lost",
          shapeType: "circle",
          shapeData: { radius: 20 },
          fillColor: "#fff",
          x: -500,
          y: -500,
        } as VectorLayer,
      ],
    });
    expect(warnings.some((warning) => warning.includes("'lost'") && warning.includes("never intersects"))).toBe(true);
  });

  it("accounts for the parent chain when checking coverage", () => {
    const warnings = lintAnimation({
      ...CANVAS,
      layers: [
        { id: "rig", shapeType: "group", x: 400, y: 300 } as VectorLayer,
        // Locally at -450,-450 but parented into the canvas center → visible
        { id: "part", shapeType: "circle", shapeData: { radius: 30 }, fillColor: "#fff", parent: "rig", x: -50, y: -50 } as VectorLayer,
      ],
    });
    expect(warnings).toEqual([]);
  });

  it("warns on always-invisible layers (opacity 0, or no fill/stroke/image)", () => {
    const zeroOpacity = lintAnimation({
      ...CANVAS,
      layers: [
        { id: "ghost", shapeType: "circle", shapeData: { radius: 30 }, fillColor: "#fff", opacity: 0, x: 400, y: 300 } as VectorLayer,
      ],
    });
    expect(zeroOpacity.some((warning) => warning.includes("'ghost'") && warning.includes("opacity 0"))).toBe(true);

    const noPaint = lintAnimation({
      ...CANVAS,
      layers: [{ id: "unpainted", shapeType: "circle", shapeData: { radius: 30 }, x: 400, y: 300 } as VectorLayer],
    });
    expect(noPaint.some((warning) => warning.includes("'unpainted'") && warning.includes("render nothing"))).toBe(true);

    // A keyframe that raises opacity or sets a fill silences each warning
    const recovers = lintAnimation({
      ...CANVAS,
      layers: [
        {
          id: "fades-in",
          shapeType: "circle",
          shapeData: { radius: 30 },
          fillColor: "#fff",
          opacity: 0,
          x: 400,
          y: 300,
          keyframes: [
            { time: 0, properties: { opacity: 0 } },
            { time: 1, properties: { opacity: 1 } },
          ],
        } as VectorLayer,
      ],
    });
    expect(recovers).toEqual([]);
  });

  it("warns on empty symbols and instances of them", () => {
    const warnings = lintAnimation({
      ...CANVAS,
      layers: [{ id: "walker", shapeType: "instance", symbol: "walk", x: 400, y: 300 } as VectorLayer],
      symbols: { walk: { layers: [] } },
    });
    expect(warnings.some((warning) => warning.includes("'walker'") && warning.includes("no layers"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("Symbol 'walk'"))).toBe(true);
  });

  it("warns on float-precision keyframe near-duplicates", () => {
    const warnings = lintAnimation({
      ...CANVAS,
      layers: [
        {
          id: "jitter",
          shapeType: "circle",
          shapeData: { radius: 30 },
          fillColor: "#fff",
          x: 400,
          y: 300,
          keyframes: [
            { time: 0.333, properties: { x: 100 } },
            { time: 0.3333, properties: { x: 105 } },
          ],
        } as VectorLayer,
      ],
    });
    expect(warnings.some((warning) => warning.includes("float-precision"))).toBe(true);
  });
});
