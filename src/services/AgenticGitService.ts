// ─── VCS Introspection for AI Coding Loops ──────────────────

import { spawn } from "node:child_process";
import { validatePath } from "./AgenticFileService.ts";
import { WORKTREE_DIR } from "../config.ts";
import { routeForPath, sendRpc } from "./AgentConnectionManager.ts";

// Agent routing helper
async function tryAgentRoute(method: any, params: any, targetPath: any) {
  const agent = routeForPath(targetPath);
  if (!agent) return null;
  try {
    return await sendRpc(agent.id, method, params);
  } catch (error: unknown) {
    return { error: `Agent RPC failed: ${(error as Error).message}` };
  }
}

import {
  AGENT_GIT_TIMEOUT_MS as GIT_TIMEOUT_MS,
  AGENT_GIT_MAX_OUTPUT_BYTES as MAX_OUTPUT_BYTES,
} from "../constants.ts";

// ────────────────────────────────────────────────────────────
// Internal Git Runner
// ────────────────────────────────────────────────────────────

async function runGit(args: string[], cwd: string): Promise<any> {
  return new Promise<any>((resolve: any) => {
    const stdoutChunks: any[] = [];
    const stderrChunks: any[] = [];
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

    child.stdin.end();

    child.stdout.on("data", (chunk: any) => {
      if (stdoutLen < MAX_OUTPUT_BYTES) {
        stdoutChunks.push(chunk);
        stdoutLen += chunk.length;
      }
    });

    child.stderr.on("data", (chunk: any) => {
      if (stderrLen < MAX_OUTPUT_BYTES) {
        stderrChunks.push(chunk);
        stderrLen += chunk.length;
      }
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        resolve({ error: `Git command timed out after ${GIT_TIMEOUT_MS}ms` });
      }
    }, GIT_TIMEOUT_MS);

    child.on("close", (code: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");

      if (code !== 0) {
        resolve({ error: stderr.trim() || `Git exited with code ${code}`, exitCode: code });
        return;
      }

      resolve({ stdout, stderr: stderr.trim() });
    });

    child.on("error", (error: any) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ error: `Git process error: ${error.message}` });
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
export async function agenticGitStatus(repoPath: any) {
  // Agent routing
  const agentResult = await tryAgentRoute("git.status", { path: repoPath }, repoPath);
  if (agentResult) return agentResult;

  const validation = validatePath(repoPath);
  if (!validation.safe) {
    return { error: validation.error };
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
  const staged: any[] = [];
  const unstaged: any[] = [];
  const untracked: any[] = [];

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

/**
 * Get git diff output.
 */
export async function agenticGitDiff(repoPath: any, { staged = false, path: filePath, ref }: Record<string, any> = {}) {
  // Agent routing
  const agentResult = await tryAgentRoute("git.diff", { path: repoPath, staged, filePath, ref }, repoPath);
  if (agentResult) return agentResult;

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

/**
 * Get git log.
 */
export async function agenticGitLog(repoPath: any, { limit = 20, author, since, path: filePath }: Record<string, any> = {}) {
  // Agent routing
  const agentResult = await tryAgentRoute("git.log", { path: repoPath, limit, author, since, filePath }, repoPath);
  if (agentResult) return agentResult;

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

  const commits = result.stdout
    .split(separator)
    .filter((s: any) => s.trim())
    .map((entry: any) => {
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
export async function agenticGitWorktreeCreate(repoPath: any, branchName: any) {
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
    return { error: result.error, path: cwd };
  }

  return {
    worktreePath,
    branch: sanitized,
    repoPath: cwd,
  };
}

/**
 * Remove a git worktree and optionally delete the branch.
 */
export async function agenticGitWorktreeRemove(repoPath: any, worktreePath: any, { deleteBranch = true }: Record<string, any> = {}) {
  const validation = validatePath(repoPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const cwd = validation.resolved;

  // Get branch name from worktree before removing
  let branchName: any = null;
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
    return { error: result.error, path: cwd };
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

/**
 * Merge a worktree branch back into the current branch.
 */
export async function agenticGitWorktreeMerge(repoPath: any, branch: any, { message }: Record<string, any> = {}) {
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
    return { error: result.error, path: cwd };
  }

  return {
    merged: branch,
    output: result.stdout.trim(),
  };
}

/**
 * Get the diff between a worktree branch and the main branch.
 */
export async function agenticGitWorktreeDiff(repoPath: any, branch: any) {
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
    return { error: result.error, path: cwd };
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
export async function agenticGitWorktreeCleanup(repoPath: any) {
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
