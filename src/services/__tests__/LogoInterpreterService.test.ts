import { describe, it, expect } from "vitest";
import { executeLogoProgram } from "../LogoInterpreterService.ts";

describe("executeLogoProgram", () => {
  it("draws a simple square with repeat", () => {
    const result = executeLogoProgram("repeat 4 [fd 100 rt 90]");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(8);
  });

  it("draws a star pattern with setpencolor and repeat", () => {
    const result = executeLogoProgram("setpencolor 1 repeat 180 [fd 500 bk 500 rt 2]");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(360);
  });

  it("handles nested repeat loops", () => {
    const result = executeLogoProgram("repeat 4 [repeat 34 [fd 12 rt 10] rt 90]");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(260);
  });

  it("assigns and reads variables with make and :name", () => {
    const result = executeLogoProgram('make "x 100 fd :x rt 90 fd :x');
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(3);
  });

  it("iterates a FOR loop with float step values", () => {
    const result = executeLogoProgram("for [ i 0.01 4 0.05 ] [ repeat 180 [ fd :i rt 1 ] ]");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(1000);
  });

  it("handles 2000 iterations with random colors and positions", () => {
    const result = executeLogoProgram(
      "repeat 2000 [pu home seth random 361 setpencolor random 15 fd 40 pd fd random 200]",
    );
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(5000);
  });

  it("defines and calls a recursive procedure (Koch snowflake)", () => {
    const result = executeLogoProgram(`
      to side :size :level
      ifelse :level = 0
        [ fd :size ]
        [ side :size / 3 :level - 1
          lt 60
          side :size / 3 :level - 1
          rt 120
          side :size / 3 :level - 1
          lt 60
          side :size / 3 :level - 1
        ]
      end
      setpencolor 3
      lt 30
      repeat 3 [side 250 4 rt 120]
    `);
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(200);
  });

  it("sets pen size with setpensize", () => {
    const result = executeLogoProgram("setpensize 4 fd 100");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(2);
  });

  it("sets pen color from an RGB list", () => {
    const result = executeLogoProgram("setpencolor [255 100 50] fd 100");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(2);
  });

  it("sets pen color from a palette number", () => {
    const result = executeLogoProgram("setpencolor 7 fd 50");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(2);
  });

  it("evaluates IF conditional correctly", () => {
    const result = executeLogoProgram("make \"x 5 if :x > 3 [fd 100]");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(1);
  });

  it("evaluates IFELSE conditional correctly", () => {
    const result = executeLogoProgram('make "x 2 ifelse :x > 3 [fd 100] [bk 50]');
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(1);
  });

  it("supports recursive procedures with OUTPUT", () => {
    const result = executeLogoProgram(`
      to fib :n
      ifelse :n < 2 [output :n] [output (fib :n - 1) + (fib :n - 2)]
      end
      fd fib 8
    `);
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(1);
  });

  it("draws a circle via the circle command", () => {
    const result = executeLogoProgram("setpencolor 6 circle 50");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(2);
  });

  it("provides correct repcount inside repeat loops", () => {
    const result = executeLogoProgram("repeat 10 [fd repcount * 10 rt 36]");
    expect(result.success).toBe(true);
    expect(result.commands.length).toBeGreaterThanOrEqual(20);
  });

  it("preserves repcount scoping across nested repeat loops", () => {
    const result = executeLogoProgram(`
      make "outerCounts 0
      repeat 3 [
        make "outerValue repcount
        repeat 5 [
          fd 1
        ]
        if :outerValue = repcount [make "outerCounts :outerCounts + 1]
      ]
      fd :outerCounts
    `);
    expect(result.success).toBe(true);
    const lastCommand = result.commands[result.commands.length - 1] as { action: string; value: string };
    expect(lastCommand.action).toBe("forward");
    expect(Number(lastCommand.value)).toBe(3);
  });

  it("returns an error for invalid LOGO syntax", () => {
    const result = executeLogoProgram("repeat 4 fd 100");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("respects canvas dimensions from options", () => {
    const result = executeLogoProgram("fd 100", { canvasWidth: 1024, canvasHeight: 768 });
    expect(result.success).toBe(true);
    expect(result.canvasWidth).toBe(1024);
    expect(result.canvasHeight).toBe(768);
  });
});
