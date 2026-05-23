// ─── VCS Introspection for AI Coding Loops ──────────────────

import { spawn } from "node:child_process";
import { validatePath } from "./AgenticFileService.ts";
import { WORKTREE_DIR } from "../config.ts";
import { routeForPath, sendRpc } from "./AgentConnectionManager.ts";

export interface GitFileStatus {
  status: string;
  file: string;
}

export interface GitStatusResult {
  path: string;
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  untracked: string[];
  totalChanges: number;
  clean: boolean;
  error?: string;
}

export interface GitDiffResult {
  path?: string;
  staged?: boolean;
  file?: string;
  ref?: string;
  hasChanges?: boolean;
  additions?: number;
  deletions?: number;
  diff?: string;
  error?: string;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export interface GitLogResult {
  path?: string;
  totalCommits?: number;
  author?: string;
  since?: string;
  commits?: GitCommit[];
  error?: string;
}

export interface GitWorktreeCreateResult {
  worktreePath?: string;
  branch?: string;
  repoPath?: string;
  error?: string;
}

export interface GitWorktreeRemoveResult {
  removed?: string;
  branch?: string | null;
  branchDeleted?: boolean;
  error?: string;
}

export interface GitWorktreeMergeResult {
  merged?: string;
  output?: string;
  error?: string;
}

export interface GitWorktreeDiffResult {
  branch?: string;
  baseBranch?: string;
  hasChanges?: boolean;
  additions?: number;
  deletions?: number;
  diff?: string;
  error?: string;
}

export interface GitWorktreeCleanupResult {
  pruned?: boolean;
  cleanedDirs?: number;
  error?: string;
}

// Agent routing helper
async function tryAgentRoute(
  method: string,
  params: Record<string, unknown>,
  targetPath: string,
): Promise<unknown> {
  const agent = routeForPath(targetPath);
  if (!agent) return null;
  try {
    return await sendRpc(agent.id, method, params);
  } catch (error: unknown) {
    return { error: `Agent RPC failed: ${errorMessage(error)}` };
  }
}

import {
  AGENT_GIT_TIMEOUT_MS as GIT_TIMEOUT_MS,
  AGENT_GIT_MAX_OUTPUT_BYTES as MAX_OUTPUT_BYTES,
} from "../constants.ts";
import { errorMessage } from "../utilities.ts";

interface GitRunResult {
  stdout: string;
  stderr: string;
  error?: string;
  exitCode?: number | null;
}

// ────────────────────────────────────────────────────────────
// Internal Git Runner
// ────────────────────────────────────────────────────────────

async function runGit(args: string[], cwd: string): Promise<GitRunResult> {
  return new Promise<GitRunResult>((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let settled = false;

    const child = spawn("git", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "echo",
        LANG: "C.UTF-8",
      },
      detached: false,
    });

    if (child.stdin) {
      child.stdin.end();
    }

    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer) => {
        if (stdoutLen < MAX_OUTPUT_BYTES) {
          stdoutChunks.push(chunk);
          stdoutLen += chunk.length;
        }
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderrLen < MAX_OUTPUT_BYTES) {
          stderrChunks.push(chunk);
          stderrLen += chunk.length;
        }
      });
    }

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        resolve({ stdout: "", stderr: "", error: `Git command timed out after ${GIT_TIMEOUT_MS}ms` });
      }
    }, GIT_TIMEOUT_MS);

    child.on("close", (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");

      if (code !== 0) {
        resolve({ stdout, stderr, error: stderr.trim() || `Git exited with code ${code}`, exitCode: code });
        return;
      }

      resolve({ stdout, stderr: stderr.trim() });
    });

    child.on("error", (error: Error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ stdout: "", stderr: "", error: `Git process error: ${error.message}` });
      }
    });
  });
}

// ────────────────────────────────────────────────────────────
// Git Status
// ────────────────────────────────────────────────────────────

/**
 * Get git status for a repository.
 */
export async function agenticGitStatus(repoPath: string): Promise<GitStatusResult | { error: string; path?: string }> {
  // Agent routing
  const agentResult = await tryAgentRoute("git.status", { path: repoPath }, repoPath);
  if (agentResult) return agentResult as GitStatusResult;

  const validation = validatePath(repoPath);
  if (!validation.safe) {
    return { error: validation.error || "Invalid path" };
  }

  const cwd = validation.resolved;

  // Get branch info
  const branchResult = await runGit(
    ["branch", "--show-current"],
    cwd,
  );
  if (branchResult.error) {
    return { error: branchResult.error, path: cwd };
  }

  const branch = branchResult.stdout.trim();

  // Get status
  const statusResult = await runGit(
    ["status", "--short", "--branch", "--untracked-files=all"],
    cwd,
  );
  if (statusResult.error) {
    return { error: statusResult.error, path: cwd };
  }

  const lines = statusResult.stdout.trim().split("\n").filter(Boolean);
  const branchLine = lines[0] || "";
  const fileLines = lines.slice(1);

  // Parse ahead/behind from branch line (## main...origin/main [ahead 2, behind 1])
  const aheadMatch = branchLine.match(/ahead (\d+)/);
  const behindMatch = branchLine.match(/behind (\d+)/);

  // Parse file changes
  const staged: GitFileStatus[] = [];
  const unstaged: GitFileStatus[] = [];
  const untracked: string[] = [];

  for (const line of fileLines) {
    const x = line[0]; // staging area
    const y = line[1]; // working tree
    const file = line.slice(3);

    if (x === "?" && y === "?") {
      untracked.push(file);
    } else {
      if (x !== " " && x !== "?") {
        staged.push({ status: x, file });
      }
      if (y !== " " && y !== "?") {
        unstaged.push({ status: y, file });
      }
    }
  }

  return {
    path: cwd,
    branch,
    ahead: aheadMatch ? parseInt(aheadMatch[1]) : 0,
    behind: behindMatch ? parseInt(behindMatch[1]) : 0,
    staged,
    unstaged,
    untracked,
    totalChanges: staged.length + unstaged.length + untracked.length,
    clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
  };
}

// ────────────────────────────────────────────────────────────
// Git Diff
// ────────────────────────────────────────────────────────────

interface DiffOptions {
  staged?: boolean;
  path?: string;
  ref?: string;
}

/**
 * Get git diff output.
 */
export async function agenticGitDiff(
  repoPath: string,
  { staged = false, path: filePath, ref }: DiffOptions = {},
): Promise<GitDiffResult> {
  // Agent routing
  const agentResult = await tryAgentRoute("git.diff", { path: repoPath, staged, filePath, ref }, repoPath);
  if (agentResult) return agentResult as GitDiffResult;

  const validation = validatePath(repoPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const cwd = validation.resolved;
  const args = ["diff", "--stat", "--patch"];

  if (staged) args.push("--cached");
  if (ref) args.push(ref);
  args.push("--");
  if (filePath) {
    // Validate the file path too
    const fileValidation = validatePath(filePath);
    if (!fileValidation.safe) {
      return { error: fileValidation.error };
    }
    args.push(fileValidation.resolved);
  }

  const result = await runGit(args, cwd);
  if (result.error) {
    return { error: result.error, path: cwd };
  }

  const diff = result.stdout;
  const hasChanges = diff.trim().length > 0;

  // Parse stat summary from beginning of output
  const additions = (diff.match(/^\+[^+]/gm) || []).length;
  const deletions = (diff.match(/^-[^-]/gm) || []).length;

  return {
    path: cwd,
    staged,
    ...(filePath && { file: filePath }),
    ...(ref && { ref }),
    hasChanges,
    additions,
    deletions,
    diff: hasChanges ? diff : "(no changes)",
  };
}

// ────────────────────────────────────────────────────────────
// Git Log
// ────────────────────────────────────────────────────────────

interface LogOptions {
  limit?: number;
  author?: string;
  since?: string;
  path?: string;
}

/**
 * Get git log.
 */
export async function agenticGitLog(
  repoPath: string,
  { limit = 20, author, since, path: filePath }: LogOptions = {},
): Promise<GitLogResult> {
  // Agent routing
  const agentResult = await tryAgentRoute("git.log", { path: repoPath, limit, author, since, filePath }, repoPath);
  if (agentResult) return agentResult as GitLogResult;

  const validation = validatePath(repoPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const cwd = validation.resolved;
  const clampedLimit = Math.min(Math.max(limit, 1), 100);

  // Use a structured format for reliable parsing
  const separator = "<<<COMMIT>>>";
  const formatStr = `${separator}%H|%h|%an|%ae|%ai|%s`;
  const args = [
    "log",
    `--format=${formatStr}`,
    `-n`, String(clampedLimit),
  ];

  if (author) args.push(`--author=${author}`);
  if (since) args.push(`--since=${since}`);

  if (filePath) {
    const fileValidation = validatePath(filePath);
    if (!fileValidation.safe) {
      return { error: fileValidation.error };
    }
    args.push("--", fileValidation.resolved);
  }

  const result = await runGit(args, cwd);
  if (result.error) {
    return { error: result.error, path: cwd };
  }

  const commits: GitCommit[] = result.stdout
    .split(separator)
    .filter((s: string) => s.trim())
    .map((entry: string) => {
      const parts = entry.trim().split("|");
      return {
        hash: parts[0] || "",
        shortHash: parts[1] || "",
        author: parts[2] || "",
        email: parts[3] || "",
        date: parts[4] || "",
        message: parts.slice(5).join("|") || "",
      };
    });

  return {
    path: cwd,
    totalCommits: commits.length,
    ...(author && { author }),
    ...(since && { since }),
    commits,
  };
}

// ────────────────────────────────────────────────────────────
// Git Worktree Operations (for Coordinator Mode)
// ────────────────────────────────────────────────────────────

const WORKTREE_BASE = WORKTREE_DIR?.trim() || "/tmp/prism-worktrees";

/**
 * Create a git worktree with its own branch.
 */
export async function agenticGitWorktreeCreate(repoPath: string, branchName: string): Promise<GitWorktreeCreateResult> {
  const validation = validatePath(repoPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const cwd = validation.resolved;
  const sanitized = branchName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const worktreePath = `${WORKTREE_BASE}/${sanitized}-${Date.now()}`;

  // Ensure base directory exists
  const { mkdirSync } = await import("node:fs");
  try {
    mkdirSync(WORKTREE_BASE, { recursive: true });
  } catch {
    // ignore if it exists
  }

  const result = await runGit(
    ["worktree", "add", worktreePath, "-b", sanitized],
    cwd,
  );

  if (result.error) {
    return { error: result.error, repoPath: cwd };
  }

  return {
    worktreePath,
    branch: sanitized,
    repoPath: cwd,
  };
}

interface WorktreeRemoveOptions {
  deleteBranch?: boolean;
}

/**
 * Remove a git worktree and optionally delete the branch.
 */
export async function agenticGitWorktreeRemove(
  repoPath: string,
  worktreePath: string,
  { deleteBranch = true }: WorktreeRemoveOptions = {},
): Promise<GitWorktreeRemoveResult> {
  const validation = validatePath(repoPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const cwd = validation.resolved;

  // Get branch name from worktree before removing
  let branchName: string | null = null;
  if (deleteBranch) {
    const branchResult = await runGit(["branch", "--show-current"], worktreePath);
    if (!branchResult.error) {
      branchName = branchResult.stdout.trim();
    }
  }

  // Remove worktree
  const result = await runGit(
    ["worktree", "remove", worktreePath, "--force"],
    cwd,
  );

  if (result.error) {
    return { error: result.error };
  }

  // Delete the branch
  if (deleteBranch && branchName) {
    await runGit(["branch", "-D", branchName], cwd);
  }

  return {
    removed: worktreePath,
    branch: branchName,
    branchDeleted: deleteBranch && !!branchName,
  };
}

interface WorktreeMergeOptions {
  message?: string;
}

/**
 * Merge a worktree branch back into the current branch.
 */
export async function agenticGitWorktreeMerge(
  repoPath: string,
  branch: string,
  { message }: WorktreeMergeOptions = {},
): Promise<GitWorktreeMergeResult> {
  const validation = validatePath(repoPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const cwd = validation.resolved;

  const args = ["merge", "--no-ff", branch];
  if (message) {
    args.push("-m", message);
  }

  const result = await runGit(args, cwd);
  if (result.error) {
    return { error: result.error };
  }

  return {
    merged: branch,
    output: result.stdout.trim(),
  };
}

/**
 * Get the diff between a worktree branch and the main branch.
 */
export async function agenticGitWorktreeDiff(repoPath: string, branch: string): Promise<GitWorktreeDiffResult> {
  const validation = validatePath(repoPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const cwd = validation.resolved;

  // Get current branch name
  const currentResult = await runGit(["branch", "--show-current"], cwd);
  const currentBranch = currentResult.error ? "HEAD" : currentResult.stdout.trim();

  const result = await runGit(
    ["diff", `${currentBranch}...${branch}`, "--stat", "--patch"],
    cwd,
  );

  if (result.error) {
    return { error: result.error };
  }

  const diff = result.stdout;
  const hasChanges = diff.trim().length > 0;
  const additions = (diff.match(/^\+[^+]/gm) || []).length;
  const deletions = (diff.match(/^-[^-]/gm) || []).length;

  return {
    branch,
    baseBranch: currentBranch,
    hasChanges,
    additions,
    deletions,
    diff: hasChanges ? diff : "(no changes)",
  };
}

/**
 * Clean up any orphaned worktrees from previous runs.
 * Should be called on server startup.
 */
export async function agenticGitWorktreeCleanup(repoPath: string): Promise<GitWorktreeCleanupResult> {
  const validation = validatePath(repoPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const cwd = validation.resolved;
  const result = await runGit(["worktree", "prune"], cwd);

  if (result.error) {
    return { error: result.error };
  }

  // Also clean up temp directory
  const { rmSync, existsSync } = await import("node:fs");
  let cleaned = 0;
  if (existsSync(WORKTREE_BASE)) {
    const { readdirSync } = await import("node:fs");
    const entries = readdirSync(WORKTREE_BASE);
    for (const entry of entries) {
      try {
        rmSync(`${WORKTREE_BASE}/${entry}`, { recursive: true, force: true });
        cleaned++;
      } catch {
        // best-effort cleanup
      }
    }
  }

  return { pruned: true, cleanedDirs: cleaned };
}
