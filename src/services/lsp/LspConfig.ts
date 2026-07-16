// ─── Language Server Registry ───────────────────────────────

import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// tsserver-compatible TypeScript fallback for workspaces without a usable
// install. typescript-language-server resolves: user tsserver.path →
// workspace node_modules (skipped when invalid) → this fallbackPath →
// bundled. Needed because a workspace pinning the TS 7 native preview
// (tsgo) has a node_modules/typescript with no lib/tsserver.js, and bare
// workspaces have none at all. `typescript5` is an npm alias of
// typescript@5.x in package.json — aliased so it can't collide with the
// repo's own `typescript: "next"` build pin.
// https://github.com/typescript-language-server/typescript-language-server#initializationoptions
function resolveFallbackTsserverPath(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    // Resolves the package main (lib/typescript.js); tsserver.js sits beside it.
    return join(dirname(require.resolve("typescript5")), "tsserver.js");
  } catch {
    return undefined; // Not installed — workspace-only resolution.
  }
}
const FALLBACK_TSSERVER_PATH = resolveFallbackTsserverPath();

export interface LspServerConfig {
  command: string;
  args: string[];
  extensionToLanguage: Record<string, string>;
  maxRestarts?: number;
  startupTimeout?: number;
  env?: Record<string, string>;
  initializationOptions?: Record<string, unknown>;
  workspaceFolder?: string;
}

export const LSP_SERVER_CONFIGS: Record<string, LspServerConfig> = {
  // ── TypeScript / JavaScript ──────────────────────────────
  typescript: {
    command: "npx",
    args: ["--yes", "typescript-language-server", "--stdio"],
    extensionToLanguage: {
      ".js": "javascript",
      ".jsx": "javascriptreact",
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".mjs": "javascript",
      ".cjs": "javascript",
    },
    maxRestarts: 3,
    startupTimeout: 30_000,
    ...(FALLBACK_TSSERVER_PATH && {
      initializationOptions: {
        tsserver: { fallbackPath: FALLBACK_TSSERVER_PATH },
      },
    }),
  },

  // ── Python ───────────────────────────────────────────────
  pyright: {
    command: "npx",
    // --package is required: "pyright-langserver" is a BINARY inside the
    // "pyright" package, not a package name. Without it, npx 404s against
    // the registry from any workspace that doesn't have pyright installed
    // locally, and the server crashes on start.
    args: ["--yes", "--package=pyright", "pyright-langserver", "--stdio"],
    extensionToLanguage: {
      ".py": "python",
      ".pyi": "python",
    },
    maxRestarts: 3,
    startupTimeout: 30_000,
  },

  // ── Rust ─────────────────────────────────────────────────
  "rust-analyzer": {
    command: "rust-analyzer",
    args: [],
    extensionToLanguage: {
      ".rs": "rust",
    },
    maxRestarts: 3,
    startupTimeout: 60_000,
  },

  // ── Go ───────────────────────────────────────────────────
  gopls: {
    command: "gopls",
    args: ["serve"],
    extensionToLanguage: {
      ".go": "go",
      ".mod": "go.mod",
      ".sum": "go.sum",
    },
    maxRestarts: 3,
    startupTimeout: 30_000,
  },

  // ── C / C++ ──────────────────────────────────────────────
  clangd: {
    command: "clangd",
    args: ["--background-index"],
    extensionToLanguage: {
      ".c": "c",
      ".h": "c",
      ".cpp": "cpp",
      ".cxx": "cpp",
      ".cc": "cpp",
      ".hpp": "cpp",
      ".hxx": "cpp",
      ".hh": "cpp",
    },
    maxRestarts: 3,
    startupTimeout: 30_000,
  },

  // ── Lua ──────────────────────────────────────────────────
  "lua-language-server": {
    command: "lua-language-server",
    args: [],
    extensionToLanguage: {
      ".lua": "lua",
    },
    maxRestarts: 3,
    startupTimeout: 30_000,
  },
};

/**
 * Get all configured LSP servers, optionally scoped to a workspace folder.
 */
export function getLspServerConfigs(
  workspaceFolder?: string,
): Record<string, LspServerConfig> {
  const configs: Record<string, LspServerConfig> = {};

  for (const [name, config] of Object.entries(LSP_SERVER_CONFIGS)) {
    configs[name] = {
      ...config,
      workspaceFolder: workspaceFolder || process.cwd(),
    };
  }

  return configs;
}
