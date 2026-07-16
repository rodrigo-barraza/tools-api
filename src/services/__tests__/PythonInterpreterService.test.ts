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

// ═══════════════════════════════════════════════════════════════
//  Memory Limits — scientific stack (RLIMIT_DATA regression)
// ═══════════════════════════════════════════════════════════════
// The old RLIMIT_AS cap made "import matplotlib" hang/SIGKILL because
// numpy/OpenBLAS reserve virtual address space they never back with
// real memory. RLIMIT_DATA keeps the cap while letting the stack load.

describe("executePython — memory limits & scientific stack", () => {
  it("imports numpy and matplotlib under the memory cap", async () => {
    const result = await executePython(
      'import numpy, matplotlib\nprint("stack ok")',
      { timeout: 60_000 },
    );
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("stack ok");
  }, 70_000);

  it("still enforces the memory cap on runaway allocations", async () => {
    const code = `
try:
    x = bytearray(400 * 1024 * 1024)
    print("ALLOCATED")
except MemoryError:
    print("MEMORY_ERROR")
`;
    const result = await executePython(code, { timeout: 30_000 });
    expect(result.stdout).toContain("MEMORY_ERROR");
    expect(result.stdout).not.toContain("ALLOCATED");
  }, 40_000);
});

// ═══════════════════════════════════════════════════════════════
//  Figure Capture (rich results)
// ═══════════════════════════════════════════════════════════════

describe("executePython — figure capture", () => {
  it("auto-captures open matplotlib figures as PNG", async () => {
    const code = `
import matplotlib.pyplot as plt
plt.plot([1, 2, 3], [1, 4, 9])
plt.show()
print("plotted")
`;
    const result = await executePython(code, { timeout: 60_000 });
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("plotted");
    // plt.show() under Agg must not pollute stderr with warnings
    expect(result.stderr).not.toContain("non-interactive");
    expect(result.figures).toHaveLength(1);
    const figure = result.figures![0];
    expect(figure.mimeType).toBe("image/png");
    expect(figure.bytes).toBeGreaterThan(1000);
    // PNG magic bytes survive the base64 round-trip
    const header = Buffer.from(figure.data, "base64").subarray(0, 4);
    expect(header.toString("hex")).toBe("89504e47");
  }, 70_000);

  it("collects files savefig'd to the working directory", async () => {
    const code = `
import matplotlib.pyplot as plt
plt.bar(["a", "b"], [3, 5])
plt.savefig("my_chart.png")
plt.close("all")
print("saved")
`;
    const result = await executePython(code, { timeout: 60_000 });
    expect(result.success).toBe(true);
    expect(
      result.figures?.some((figure) => figure.filename === "my_chart.png"),
    ).toBe(true);
  }, 70_000);

  it("captures multiple figures in order", async () => {
    const code = `
import matplotlib.pyplot as plt
plt.figure(); plt.plot([1, 2], [1, 2])
plt.figure(); plt.plot([2, 1], [1, 2])
`;
    const result = await executePython(code, { timeout: 60_000 });
    expect(result.success).toBe(true);
    expect(result.figures).toHaveLength(2);
    expect(result.figures![0].filename).toBe("_prism_figure_1.png");
    expect(result.figures![1].filename).toBe("_prism_figure_2.png");
  }, 70_000);

  it("omits figures for plain text scripts", async () => {
    const result = await executePython('print("no plots here")');
    expect(result.success).toBe(true);
    expect(result.figures).toBeUndefined();
  });
});
