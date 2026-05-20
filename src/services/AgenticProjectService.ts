// ─── Workspace Intelligence ─────────────────────────────────

import { readFile, stat, readdir } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { validatePath } from "./AgenticFileService.ts";
import { routeForPath, sendRpc } from "./AgentConnectionManager.ts";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const README_MAX_CHARS = 800;
const MAX_SCAN_DEPTH = 3;
const MAX_SCAN_ENTRIES = 200;

// ────────────────────────────────────────────────────────────
// Project Summary
// ────────────────────────────────────────────────────────────

/**
 * Scan a project root and return structured metadata.
 */
export async function agenticProjectSummary(projectPath: any) {
  // Agent routing
  const agent = routeForPath(projectPath);
  if (agent) {
    try {
      return await sendRpc(agent.id, "project.summary", { path: projectPath });
    } catch (error: any) {
      return { error: `Agent RPC failed: ${error.message}` };
    }
  }

  const validation = validatePath(projectPath);
  if (!validation.safe) {
    return { error: validation.error };
  }

  const root = validation.resolved;

  try {
    const stats = await stat(root);
    if (!stats.isDirectory()) {
      return { error: `'${root}' is not a directory` };
    }
  } catch {
    return { error: `Directory not found: ${root}` };
  }

  const result: Record<string, any> = {
    path: root,
    name: root.split("/").pop(),
  };

  // ── Package.json Analysis ────────────────────────────────
  try {
    const pkgRaw = await readFile(join(root, "package.json"), "utf-8");
    const packageJson = JSON.parse(pkgRaw);

    result.packageManager = "npm";
    result.version = packageJson.version || null;
    result.description = packageJson.description || null;
    result.scripts = packageJson.scripts || {};
    result.dependencies = Object.keys(packageJson.dependencies || {});
    result.devDependencies = Object.keys(packageJson.devDependencies || {});

    // Detect framework from dependencies
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const frameworks: any[] = [];
    if (allDeps["next"]) frameworks.push("next.js");
    if (allDeps["react"]) frameworks.push("react");
    if (allDeps["vue"]) frameworks.push("vue");
    if (allDeps["svelte"]) frameworks.push("svelte");
    if (allDeps["express"]) frameworks.push("express");
    if (allDeps["fastify"]) frameworks.push("fastify");
    if (allDeps["vite"]) frameworks.push("vite");
    if (allDeps["@angular/core"]) frameworks.push("angular");

    result.frameworks = frameworks;
    result.type = packageJson.type || "commonjs";
  } catch {
    // Not a Node.js project — check for Python
    try {
      await stat(join(root, "pyproject.toml"));
      result.packageManager = "python (pyproject.toml)";
    } catch {
      try {
        await stat(join(root, "requirements.txt"));
        result.packageManager = "python (pip)";
      } catch {
        result.packageManager = null;
      }
    }
  }

  // ── README ───────────────────────────────────────────────
  for (const name of ["README.md", "readme.md", "README.txt", "README"]) {
    try {
      const content = await readFile(join(root, name), "utf-8");
      result.readme = content.length > README_MAX_CHARS
        ? content.slice(0, README_MAX_CHARS) + "\n... [truncated]"
        : content;
      break;
    } catch {
      // Try next
    }
  }

  // ── Directory Structure ──────────────────────────────────
  const structure: Record<string, any> = {};
  let totalFiles = 0;
  let totalDirs = 0;

  async function scanDir(dir: any, depth: any) {
    if (depth > MAX_SCAN_DEPTH || totalFiles + totalDirs > MAX_SCAN_ENTRIES) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (totalFiles + totalDirs > MAX_SCAN_ENTRIES) break;

        // Skip non-essential dirs
        if (entry.name === "node_modules" || entry.name === ".git" ||
            entry.name === ".next" || entry.name === "__pycache__" ||
            entry.name === "dist" || entry.name === "build" ||
            entry.name === ".cache") {
          continue;
        }

        const relPath = relative(root, resolve(dir, entry.name));

        if (entry.isDirectory()) {
          totalDirs++;
          // Count children
          try {
            const children = await readdir(resolve(dir, entry.name));
            structure[relPath + "/"] = children.length;
          } catch {
            structure[relPath + "/"] = 0;
          }
          await scanDir(resolve(dir, entry.name), depth + 1);
        } else {
          totalFiles++;
        }
      }
    } catch {
      // Skip unreadable dirs
    }
  }

  await scanDir(root, 0);
  result.structure = structure;
  result.totalFiles = totalFiles;
  result.totalDirectories = totalDirs;

  // ── Entry Points ─────────────────────────────────────────
  const entryPoints: any[] = [];
  const candidates = [
    "src/app/layout.js", "src/app/layout.tsx", "src/app/page.js", "src/app/page.tsx",
    "src/index.js", "src/index.ts", "src/index.tsx",
    "src/main.js", "src/main.ts",
    "index.js", "index.ts", "server.js", "app.js",
    "main.py", "app.py",
  ];

  for (const candidate of candidates) {
    try {
      await stat(join(root, candidate));
      entryPoints.push(candidate);
    } catch {
      // Not found
    }
  }
  result.entryPoints = entryPoints;

  // ── Config Files ─────────────────────────────────────────
  const configFiles: any[] = [];
  const configCandidates = [
    "tsconfig.json", "jsconfig.json", ".eslintrc.js", "eslint.config.js",
    ".prettierrc", ".prettierrc.js", "prettier.config.js",
    "next.config.js", "next.config.mjs", "vite.config.js",
    "tailwind.config.js", "postcss.config.js",
    ".gitignore", "Dockerfile", "docker-compose.yml",
    "Makefile", ".env.example", "secrets.example.js",
  ];

  for (const name of configCandidates) {
    try {
      await stat(join(root, name));
      configFiles.push(name);
    } catch {
      // Not found
    }
  }
  result.configFiles = configFiles;

  return result;
}
