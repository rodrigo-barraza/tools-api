import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  agenticGitStatus,
  agenticGitDiff,
  agenticGitLog,
} from "../AgenticGitService.ts";
import { agenticProjectSummary } from "../AgenticProjectService.ts";
import { ALLOWED_ROOTS } from "../AgenticFileService.ts";

// ═══════════════════════════════════════════════════════════════
//  Test helpers
// ═══════════════════════════════════════════════════════════════

function git(cwd: string, args: string[]) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });
}

function initRepo(dir: string) {
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
}

// Track temp dirs so they can be registered as allowed roots and cleaned up.
const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  tempDirs.push(dir);
  // Register so validatePath (used inside the services) accepts paths under it.
  if (!ALLOWED_ROOTS.includes(dir)) ALLOWED_ROOTS.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

// ═══════════════════════════════════════════════════════════════
//  AgenticGitService — ref/file argument injection (P0)
// ═══════════════════════════════════════════════════════════════

describe("AgenticGitService — ref injection guard", () => {
  let repo: string;

  beforeAll(() => {
    repo = makeTempDir("git-inject-");
    initRepo(repo);
    writeFileSync(join(repo, "a.txt"), "hello\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-q", "-m", "init"]);
  });

  it("rejects a ref that starts with '-' and does not write files", async () => {
    const evilPath = join(repo, "pwned.txt");
    const result = await agenticGitDiff(repo, { ref: `--output=${evilPath}` });
    expect(result.error).toMatch(/ref must not start with '-'/);
    expect(existsSync(evilPath)).toBe(false);
  });

  it("rejects a file that starts with '-'", async () => {
    const result = await agenticGitDiff(repo, { path: "--output=/tmp/x" });
    expect(result.error).toMatch(/file must not start with '-'/);
  });

  it("rejects an option-like file in git log too", async () => {
    const result = await agenticGitLog(repo, { path: "--output=/tmp/x" });
    expect(result.error).toMatch(/file must not start with '-'/);
  });

  it("still accepts a legitimate ref", async () => {
    const result = await agenticGitDiff(repo, { ref: "HEAD" });
    expect(result.error).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  AgenticGitService — detached HEAD fallback (P1)
// ═══════════════════════════════════════════════════════════════

describe("AgenticGitService — detached HEAD", () => {
  let repo: string;

  beforeAll(() => {
    repo = makeTempDir("git-detached-");
    initRepo(repo);
    writeFileSync(join(repo, "a.txt"), "one\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-q", "-m", "c1"]);
    writeFileSync(join(repo, "a.txt"), "two\n");
    git(repo, ["commit", "-qam", "c2"]);
  });

  it("reports a short hash and detached:true when HEAD is detached", async () => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo })
      .toString()
      .trim();
    git(repo, ["checkout", "-q", head]);

    const result = await agenticGitStatus(repo);
    expect("error" in result).toBe(false);
    if ("branch" in result) {
      expect(result.detached).toBe(true);
      expect(result.branch).toBeTruthy();
      expect(result.branch).not.toBe("");
      // short hash, not a branch name
      expect(head.startsWith(result.branch)).toBe(true);
    }
  });

  it("reports the branch name and no detached flag on a normal branch", async () => {
    const branchRepo = makeTempDir("git-branch-");
    initRepo(branchRepo);
    writeFileSync(join(branchRepo, "a.txt"), "one\n");
    git(branchRepo, ["add", "."]);
    git(branchRepo, ["commit", "-q", "-m", "c1"]);

    const result = await agenticGitStatus(branchRepo);
    if ("branch" in result) {
      expect(result.branch).toMatch(/^(main|master)$/);
      expect(result.detached).toBeUndefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
//  AgenticGitService — truncation flag (P0/P1)
// ═══════════════════════════════════════════════════════════════

describe("AgenticGitService — output truncation", () => {
  let repo: string;

  beforeAll(() => {
    repo = makeTempDir("git-trunc-");
    initRepo(repo);
    // Commit a large file, then rewrite it, so the diff exceeds 512KB.
    const original = Array.from({ length: 20000 }, (_, i) => `original line ${i}`).join("\n");
    writeFileSync(join(repo, "big.txt"), original + "\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-q", "-m", "big"]);
    const changed = Array.from({ length: 20000 }, (_, i) => `changed line ${i}`).join("\n");
    writeFileSync(join(repo, "big.txt"), changed + "\n");
  });

  it("marks truncated:true and appends a marker for an oversized diff", async () => {
    const result = await agenticGitDiff(repo, {});
    expect(result.truncated).toBe(true);
    expect(result.diff).toContain("[output truncated]");
  });
});

// ═══════════════════════════════════════════════════════════════
//  AgenticGitService — log limit echo + NaN guard (P1)
// ═══════════════════════════════════════════════════════════════

describe("AgenticGitService — log limit handling", () => {
  let repo: string;

  beforeAll(() => {
    repo = makeTempDir("git-log-");
    initRepo(repo);
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(repo, "a.txt"), `v${i}\n`);
      git(repo, ["add", "."]);
      git(repo, ["commit", "-q", "-m", `commit ${i}`]);
    }
  });

  it("echoes the applied limit", async () => {
    const result = await agenticGitLog(repo, { limit: 2 });
    expect(result.appliedLimit).toBe(2);
    expect(result.commits?.length).toBe(2);
  });

  it("falls back to the default when limit is NaN", async () => {
    const result = await agenticGitLog(repo, { limit: NaN });
    expect(result.appliedLimit).toBe(20);
    expect(result.error).toBeUndefined();
    expect(result.commits?.length).toBe(5);
  });

  it("clamps an out-of-range limit and echoes the applied value", async () => {
    const result = await agenticGitLog(repo, { limit: 9999 });
    expect(result.appliedLimit).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════════
//  AgenticProjectService — package manager detection (P1)
// ═══════════════════════════════════════════════════════════════

describe("AgenticProjectService — package manager detection", () => {
  it("detects pnpm from pnpm-lock.yaml", async () => {
    const dir = makeTempDir("proj-pnpm-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "1.0.0" }));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

    const result = await agenticProjectSummary(dir);
    expect(result.packageManager).toBe("pnpm");
  });

  it("detects yarn from yarn.lock", async () => {
    const dir = makeTempDir("proj-yarn-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "yarn.lock"), "# yarn lockfile v1\n");

    const result = await agenticProjectSummary(dir);
    expect(result.packageManager).toBe("yarn");
  });

  it("surfaces a declared packageManager field", async () => {
    const dir = makeTempDir("proj-declared-");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "x", packageManager: "pnpm@9.1.0" }),
    );

    const result = await agenticProjectSummary(dir);
    expect(result.packageManager).toBe("pnpm");
    expect(result.packageManagerDeclared).toBe("pnpm@9.1.0");
  });
});

// ═══════════════════════════════════════════════════════════════
//  AgenticProjectService — malformed package.json (P1)
// ═══════════════════════════════════════════════════════════════

describe("AgenticProjectService — malformed package.json", () => {
  it("reports packageJsonError and does NOT misclassify as python/unknown", async () => {
    const dir = makeTempDir("proj-bad-");
    writeFileSync(join(dir, "package.json"), "{ this is not valid json ");
    // A lockfile present too, so we can confirm it stays a Node project.
    writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

    const result = await agenticProjectSummary(dir);
    expect(result.packageJsonError).toBeTruthy();
    expect(result.packageManager).toBe("pnpm");
    expect(result.packageManager).not.toContain("python");
  });

  it("classifies a missing package.json as python when pyproject exists", async () => {
    const dir = makeTempDir("proj-py-");
    writeFileSync(join(dir, "pyproject.toml"), "[project]\nname='x'\n");

    const result = await agenticProjectSummary(dir);
    expect(result.packageManager).toBe("python (pyproject.toml)");
    expect(result.packageJsonError).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  AgenticProjectService — scan truncation flag (P1)
// ═══════════════════════════════════════════════════════════════

describe("AgenticProjectService — scan truncation", () => {
  it("sets truncated/scanLimitReached when the entry cap is hit", async () => {
    const dir = makeTempDir("proj-trunc-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    // Create well over MAX_SCAN_ENTRIES (200) files.
    for (let i = 0; i < 300; i++) {
      writeFileSync(join(dir, `file-${i}.txt`), "x");
    }

    const result = await agenticProjectSummary(dir);
    expect(result.truncated).toBe(true);
    expect(result.scanLimitReached).toBe(true);
  });

  it("does not set truncated for a small project", async () => {
    const dir = makeTempDir("proj-small-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "index.ts"), "export {};\n");

    const result = await agenticProjectSummary(dir);
    expect(result.truncated).toBeUndefined();
    expect(result.scanLimitReached).toBeUndefined();
  });
});
