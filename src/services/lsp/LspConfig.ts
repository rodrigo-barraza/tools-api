// ─── Language Server Registry ───────────────────────────────

/**
 * @typedef {object} LspServerConfig
 * @property {string} command — binary to run
 * @property {string[]} args — arguments to pass
 * @property {Record<string,string>} extensionToLanguage — file ext → LSP languageId
 * @property {number} [maxRestarts] — max restart attempts before giving up (default: 3)
 * @property {number} [startupTimeout] — init timeout in ms
 * @property {Record<string,string>} [env] — extra environment variables
 * @property {object} [initializationOptions] — server-specific init options
 */


export const LSP_SERVER_CONFIGS = {
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
  },

  // ── Python ───────────────────────────────────────────────
  pyright: {
    command: "npx",
    args: ["--yes", "pyright-langserver", "--stdio"],
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
 *
 * @param {string} [workspaceFolder] — project root path (injected into each config)

 */
export function getLspServerConfigs(workspaceFolder) {
  const configs: Record<string, any> = {};

  for (const [name, config] of Object.entries(LSP_SERVER_CONFIGS)) {
    configs[name] = {
      ...config,
      workspaceFolder: workspaceFolder || process.cwd(),
    };
  }

  return configs;
}
