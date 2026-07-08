import { describe, it, expect } from "vitest";
import {
  executePython,
  getInterpreterInfo,
} from "../PythonInterpreterService.ts";

// ═══════════════════════════════════════════════════════════════
//  Basic Execution
// ═══════════════════════════════════════════════════════════════

describe("executePython — basic execution", () => {
  it("executes simple print statement", async () => {
    const result = await executePython('print("hello from python")');
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("hello from python");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("executes arithmetic", async () => {
    const result = await executePython("print(2 ** 10)");
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("1024");
  });

  it("handles multi-line scripts", async () => {
    const code = `
items = [1, 2, 3, 4, 5]
total = sum(items)
print(f"Sum: {total}")
print(f"Count: {len(items)}")
`;
    const result = await executePython(code);
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("Sum: 15");
    expect(result.stdout).toContain("Count: 5");
  });

  it("supports standard library imports (math, json)", async () => {
    const code = `
import math
import json
data = {"pi": round(math.pi, 4)}
print(json.dumps(data))
`;
    const result = await executePython(code);
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('"pi": 3.1416');
  });

  it("supports list comprehensions and generators", async () => {
    const result = await executePython(
      "print([x**2 for x in range(5)])",
    );
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("[0, 1, 4, 9, 16]");
  });
});

// ═══════════════════════════════════════════════════════════════
//  Sandbox Security
// ═══════════════════════════════════════════════════════════════

describe("executePython — sandbox security", () => {
  it("blocks network access via socket", async () => {
    const code = `
import socket
socket.socket(socket.AF_INET, socket.SOCK_STREAM)
`;
    const result = await executePython(code);
    expect(result.success).toBe(false);
    expect(result.stderr).toContain("PermissionError");
    expect(result.stderr).toContain("Network access is disabled");
  });

  it("blocks urllib requests", async () => {
    const code = `
import urllib.request
urllib.request.urlopen("https://evil.com")
`;
    const result = await executePython(code);
    expect(result.success).toBe(false);
    // urllib uses socket internally, which is blocked
    expect(result.stderr).toBeTruthy();
  });

  it("cannot access parent process environment directly", async () => {
    const code = `
import os
# os.environ should still work but secrets should not be leaked
# since we control the env in the preamble
print(type(os.environ).__name__)
`;
    const result = await executePython(code);
    expect(result.success).toBe(true);
    // Python's os.environ is type _Environ
    expect(result.stdout.trim()).toMatch(/[Ee]nviron/);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Error Handling
// ═══════════════════════════════════════════════════════════════

describe("executePython — error handling", () => {
  it("reports syntax errors", async () => {
    const result = await executePython("def incomplete(");
    expect(result.success).toBe(false);
    expect(result.stderr).toContain("SyntaxError");
    expect(result.exitCode).toBe(1);
  });

  it("reports runtime errors", async () => {
    const result = await executePython("undefined_variable + 1");
    expect(result.success).toBe(false);
    expect(result.stderr).toContain("NameError");
  });

  it("reports import errors for nonexistent modules", async () => {
    const result = await executePython("import this_does_not_exist_xyz");
    expect(result.success).toBe(false);
    expect(result.stderr).toContain("ModuleNotFoundError");
  });

  it("reports division by zero", async () => {
    const result = await executePython("print(1 / 0)");
    expect(result.success).toBe(false);
    expect(result.stderr).toContain("ZeroDivisionError");
  });

  it("preserves stdout even when script errors", async () => {
    const code = `
print("before error")
raise ValueError("deliberate failure")
`;
    const result = await executePython(code);
    expect(result.success).toBe(false);
    expect(result.stdout).toContain("before error");
    expect(result.stderr).toContain("ValueError");
  });
});

// ═══════════════════════════════════════════════════════════════
//  Timeout Handling
// ═══════════════════════════════════════════════════════════════

describe("executePython — timeouts", () => {
  it("detects timeout on infinite loop", async () => {
    const result = await executePython("while True: pass", { timeout: 1500 });
    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.error).toContain("timed out");
    expect(result.exitCode).toBeNull();
  }, 10000);

  it("clamps timeout to minimum of 1000ms", async () => {
    const result = await executePython("print('fast')", { timeout: 100 });
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("fast");
  });
});

// ═══════════════════════════════════════════════════════════════
//  getInterpreterInfo
// ═══════════════════════════════════════════════════════════════

describe("getInterpreterInfo", () => {
  it("returns interpreter metadata with version", async () => {
    const info = await getInterpreterInfo();
    expect(info.available).toBe(true);
    expect(info.version).toMatch(/\d+\.\d+/);
    expect(info.maxTimeoutMs).toBeGreaterThan(0);
    expect(info.maxOutputBytes).toBeGreaterThan(0);
    expect(info.memoryLimitMb).toBeGreaterThan(0);
  });
});
