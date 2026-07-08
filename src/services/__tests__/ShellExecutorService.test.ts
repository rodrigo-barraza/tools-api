import { describe, it, expect } from "vitest";
import {
  executeShell,
  executeShellStreaming,
  getAllowedBinaries,
} from "../ShellExecutorService.ts";

// ═══════════════════════════════════════════════════════════════
//  Allowlist Enforcement
// ═══════════════════════════════════════════════════════════════

describe("executeShell — allowlist enforcement", () => {
  it("rejects binaries not in the allowlist", async () => {
    const result = await executeShell("rm -rf /");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not in the allowlist");
    expect(result.error).toContain("rm");
  });

  it("rejects curl", async () => {
    const result = await executeShell("curl https://evil.com");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not in the allowlist");
  });

  it("rejects wget", async () => {
    const result = await executeShell("wget https://evil.com");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not in the allowlist");
  });

  it("rejects python/node/bash execution", async () => {
    for (const binary of ["python3", "node", "bash", "sh", "zsh"]) {
      const result = await executeShell(`${binary} -c 'echo hacked'`);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not in the allowlist");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  Blocked Patterns (Metacharacter Injection)
// ═══════════════════════════════════════════════════════════════

describe("executeShell — blocked patterns", () => {
  it("blocks shell metacharacters (semicolon)", async () => {
    const result = await executeShell("echo hello; rm -rf /");
    expect(result.success).toBe(false);
    expect(result.error).toContain("blocked pattern");
  });

  it("blocks shell metacharacters (backtick)", async () => {
    const result = await executeShell("echo `whoami`");
    expect(result.success).toBe(false);
    expect(result.error).toContain("blocked pattern");
  });

  it("blocks shell metacharacters (dollar sign)", async () => {
    const result = await executeShell("echo $HOME");
    expect(result.success).toBe(false);
    expect(result.error).toContain("blocked pattern");
  });

  it("blocks path traversal", async () => {
    const result = await executeShell("cat ../../etc/passwd");
    expect(result.success).toBe(false);
    expect(result.error).toContain("blocked pattern");
  });

  it("blocks /dev/ access", async () => {
    const result = await executeShell("cat /dev/urandom");
    expect(result.success).toBe(false);
    expect(result.error).toContain("blocked pattern");
  });

  it("blocks /proc/ access", async () => {
    const result = await executeShell("cat /proc/self/environ");
    expect(result.success).toBe(false);
    expect(result.error).toContain("blocked pattern");
  });

  it("blocks /etc/ access", async () => {
    const result = await executeShell("cat /etc/passwd");
    expect(result.success).toBe(false);
    expect(result.error).toContain("blocked pattern");
  });

  it("blocks redirect to absolute path", async () => {
    const result = await executeShell("echo hack > /tmp/hacked");
    expect(result.success).toBe(false);
    expect(result.error).toContain("blocked pattern");
  });

  it("blocks empty pipe segments", async () => {
    const result = await executeShell("echo hello | | wc");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Empty pipe segment");
  });
});

// ═══════════════════════════════════════════════════════════════
//  Allowed Commands — Success
// ═══════════════════════════════════════════════════════════════

describe("executeShell — allowed commands", () => {
  it("executes echo", async () => {
    const result = await executeShell("echo hello world");
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("hello world");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it("executes date", async () => {
    const result = await executeShell("date --iso-8601");
    expect(result.success).toBe(true);
    expect(result.stdout).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("executes piped commands", async () => {
    const result = await executeShell("echo alpha beta gamma | wc -w");
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("3");
  });

  it("executes jq for JSON processing (requires jq)", async () => {
    const jqCheck = await executeShell("jq --version");
    if (!jqCheck.success) {
      // jq not installed — skip assertion
      return;
    }
    const result = await executeShell("jq .name", {
      stdin: '{"name":"test","value":42}',
    });
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe('"test"');
  });

  it("executes bc for math", async () => {
    const result = await executeShell("echo '2 + 3 * 4' | bc");
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("14");
  });

  it("supports stdin input", async () => {
    const result = await executeShell("wc -l", { stdin: "line1\nline2\nline3\n" });
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("3");
  });

  it("executes sort", async () => {
    const result = await executeShell("sort", { stdin: "cherry\napple\nbanana\n" });
    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe("apple\nbanana\ncherry");
  });

  it("executes grep", async () => {
    const result = await executeShell("grep apple", {
      stdin: "apple\nbanana\napple pie\n",
    });
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("apple");
    expect(result.stdout).not.toContain("banana");
  });
});

// ═══════════════════════════════════════════════════════════════
//  Error Handling
// ═══════════════════════════════════════════════════════════════

describe("executeShell — error handling", () => {
  it("reports non-zero exit codes", async () => {
    const result = await executeShell("false");
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.timedOut).toBe(false);
  });

  it("reports grep with no matches as exit code 1", async () => {
    const result = await executeShell("grep NEVER_MATCHES", {
      stdin: "some text",
    });
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Streaming Execution
// ═══════════════════════════════════════════════════════════════

describe("executeShellStreaming", () => {
  it("streams output via onChunk callback", async () => {
    const chunks: Array<{ stream: string; data: string }> = [];
    const result = await executeShellStreaming("echo streaming test", {
      onChunk: (stream, data) => chunks.push({ stream, data }),
    });
    expect(result.success).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((chunk) => chunk.stream === "stdout")).toBe(true);
    expect(result.stdout).toContain("streaming test");
  });

  it("enforces allowlist identically to executeShell", async () => {
    const result = await executeShellStreaming("rm -rf /");
    expect(result.success).toBe(false);
    expect(result.error).toContain("not in the allowlist");
  });
});

// ═══════════════════════════════════════════════════════════════
//  getAllowedBinaries
// ═══════════════════════════════════════════════════════════════

describe("getAllowedBinaries", () => {
  it("returns a sorted list of allowed binaries", () => {
    const binaries = getAllowedBinaries();
    expect(Array.isArray(binaries)).toBe(true);
    expect(binaries.length).toBeGreaterThan(20);
    expect(binaries).toContain("echo");
    expect(binaries).toContain("jq");
    expect(binaries).toContain("sort");
    expect(binaries).not.toContain("rm");
    expect(binaries).not.toContain("curl");

    const sorted = [...binaries].sort();
    expect(binaries).toEqual(sorted);
  });
});
