import { describe, it, expect } from "vitest";
import {
  executeJavaScript,
  getJsInterpreterInfo,
} from "../JavaScriptInterpreterService.ts";

// ═══════════════════════════════════════════════════════════════
//  Sandboxed Execution — Success Cases
// ═══════════════════════════════════════════════════════════════

describe("executeJavaScript — sandboxed execution", () => {
  it("executes simple arithmetic and captures console.log output", () => {
    const result = executeJavaScript("console.log(2 + 2)");
    expect(result.success).toBe(true);
    expect(result.output).toContain("4");
    expect(result.timedOut).toBe(false);
    expect(result.execution).toBe("sandboxed");
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns the last expression as result", () => {
    const result = executeJavaScript("3 * 7");
    expect(result.success).toBe(true);
    expect(result.result).toBe(21);
  });

  it("captures multi-line console output", () => {
    const result = executeJavaScript(
      'console.log("line1"); console.log("line2"); console.log("line3")',
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe("line1\nline2\nline3");
  });

  it("handles console.warn, console.error, console.info", () => {
    const result = executeJavaScript(
      'console.warn("warning"); console.error("error"); console.info("info")',
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("warning");
    expect(result.output).toContain("error");
    expect(result.output).toContain("info");
  });

  it("supports JSON operations", () => {
    const result = executeJavaScript(
      'const data = JSON.parse(\'{"name":"test"}\'); console.log(data.name)',
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("test");
  });

  it("supports Map and Set", () => {
    const result = executeJavaScript(
      "const mapInstance = new Map(); mapInstance.set('key', 42); console.log(mapInstance.get('key'))",
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("42");
  });

  it("supports typed arrays", () => {
    const result = executeJavaScript(
      "const buffer = new Uint8Array([1, 2, 3]); console.log(buffer.length)",
    );
    expect(result.success).toBe(true);
    expect(result.output).toContain("3");
  });

  it("serializes BigInt results as strings", () => {
    const result = executeJavaScript("BigInt(9007199254740991)");
    expect(result.success).toBe(true);
    expect(result.result).toBe("9007199254740991");
  });

  it("serializes non-JSON-safe results via String()", () => {
    const result = executeJavaScript(
      "const circular = {}; circular.self = circular; circular",
    );
    expect(result.success).toBe(true);
    expect(typeof result.result).toBe("string");
  });

  it("handles undefined result", () => {
    const result = executeJavaScript("undefined");
    expect(result.success).toBe(true);
    expect(result.result).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  Sandboxed Execution — Security Enforcement
// ═══════════════════════════════════════════════════════════════

describe("executeJavaScript — sandbox security", () => {
  it("blocks require() in sandboxed mode", () => {
    const result = executeJavaScript('require("fs")');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("blocks process access in sandboxed mode", () => {
    const result = executeJavaScript("process.exit(1)");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("blocks globalThis access in sandboxed mode", () => {
    const result = executeJavaScript("globalThis.constructor");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("blocks fetch in sandboxed mode", () => {
    const result = executeJavaScript('fetch("https://evil.com")');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("blocks setTimeout in sandboxed mode", () => {
    const result = executeJavaScript("setTimeout(() => {}, 0)");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("blocks setInterval in sandboxed mode", () => {
    const result = executeJavaScript("setInterval(() => {}, 100)");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
//  Privileged Execution
// ═══════════════════════════════════════════════════════════════

describe("executeJavaScript — privileged execution", () => {
  it("allows require() in privileged mode", () => {
    const result = executeJavaScript('const path = require("path"); console.log(typeof path.join)', {
      execution: "privileged",
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain("function");
    expect(result.execution).toBe("privileged");
  });

  it("allows process access in privileged mode", () => {
    const result = executeJavaScript("console.log(process.version)", {
      execution: "privileged",
    });
    expect(result.success).toBe(true);
    expect(result.output).toContain("v");
  });

  it("allows Buffer in privileged mode", () => {
    const result = executeJavaScript(
      'console.log(Buffer.from("hello").toString("hex"))',
      { execution: "privileged" },
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe("68656c6c6f");
  });
});

// ═══════════════════════════════════════════════════════════════
//  Error Handling & Timeouts
// ═══════════════════════════════════════════════════════════════

describe("executeJavaScript — error handling", () => {
  it("reports syntax errors", () => {
    const result = executeJavaScript("function(");
    expect(result.success).toBe(false);
    expect(result.error).toContain("SyntaxError");
  });

  it("reports runtime errors", () => {
    const result = executeJavaScript("nonExistentVariable.doSomething()");
    expect(result.success).toBe(false);
    expect(result.error).toContain("ReferenceError");
  });

  it("reports type errors", () => {
    const result = executeJavaScript("null.toString()");
    expect(result.success).toBe(false);
    expect(result.error).toContain("TypeError");
  });

  it("detects timeout on infinite loop", () => {
    const result = executeJavaScript("while(true) {}", { timeout: 200 });
    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.error).toContain("timed out");
  });

  it("clamps timeout to minimum of 100ms", () => {
    const result = executeJavaScript("1 + 1", { timeout: 10 });
    expect(result.success).toBe(true);
  });

  it("clamps timeout to maximum of 30000ms", () => {
    const result = executeJavaScript("1 + 1", { timeout: 999999 });
    expect(result.success).toBe(true);
  });

  it("preserves console output even on error", () => {
    const result = executeJavaScript(
      'console.log("before"); throw new Error("boom")',
    );
    expect(result.success).toBe(false);
    expect(result.output).toContain("before");
    expect(result.error).toContain("boom");
  });
});

// ═══════════════════════════════════════════════════════════════
//  getJsInterpreterInfo
// ═══════════════════════════════════════════════════════════════

describe("getJsInterpreterInfo", () => {
  it("returns interpreter metadata", () => {
    const info = getJsInterpreterInfo();
    expect(info.available).toBe(true);
    expect(info.runtime).toBe("Node.js vm");
    expect(info.nodeVersion).toMatch(/^v\d+/);
    expect(info.maxTimeoutMs).toBe(30_000);
    expect(info.maxOutputBytes).toBe(512 * 1024);
  });
});
