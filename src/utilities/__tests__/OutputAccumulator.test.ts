import { describe, it, expect } from "vitest";
import { OutputAccumulator } from "../OutputAccumulator.ts";

describe("OutputAccumulator", () => {
  it("returns output verbatim when under budget", () => {
    const acc = new OutputAccumulator(1000);
    acc.append("hello ");
    acc.append("world");
    expect(acc.toString()).toBe("hello world");
    expect(acc.truncated).toBe(false);
    expect(acc.totalBytes).toBe(11);
  });

  it("keeps head and tail, drops the middle, when over budget", () => {
    const acc = new OutputAccumulator(100, 0.2); // 20 head / 80 tail
    // 30 chunks of 10 bytes = 300 bytes total
    for (let i = 0; i < 30; i++) {
      acc.append(`chunk-${String(i).padStart(2, "0")}\n`);
    }
    const result = acc.toString();
    expect(acc.truncated).toBe(true);
    // Head preserved
    expect(result.startsWith("chunk-00\nchunk-01\n")).toBe(true);
    // Tail preserved — the LAST chunk must survive
    expect(result.endsWith("chunk-29\n")).toBe(true);
    // Middle dropped, marker present with counts
    expect(result).toContain("output truncated");
    expect(result).toContain("omitted from the middle");
  });

  it("survives a single chunk larger than the whole budget", () => {
    const acc = new OutputAccumulator(100, 0.1);
    const big = "x".repeat(50) + "END-OF-LOG\n" + "y".repeat(500) + "FINAL";
    acc.append(big);
    const result = acc.toString();
    expect(acc.truncated).toBe(true);
    expect(result.endsWith("FINAL")).toBe(true);
    expect(result.startsWith("xxxxxxxxxx")).toBe(true);
  });

  it("counts dropped lines in the marker", () => {
    const acc = new OutputAccumulator(50, 0.2);
    for (let i = 0; i < 100; i++) acc.append("0123456789\n"); // 1100 bytes
    const result = acc.toString();
    expect(result).toMatch(/~\d+ lines/);
  });

  it("handles Buffer input identically to string input", () => {
    const a = new OutputAccumulator(1000);
    const b = new OutputAccumulator(1000);
    a.append("ünïcödé test");
    b.append(Buffer.from("ünïcödé test", "utf-8"));
    expect(a.toString()).toBe(b.toString());
  });
});
