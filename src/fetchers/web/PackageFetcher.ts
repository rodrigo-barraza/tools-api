// ─── Unified NPM / PyPI Lookup ──────────────────────────────

import { getNpmPackage } from "./NpmFetcher.ts";
import { getPyPiPackage } from "./PyPiFetcher.ts";

// ─── Public API ───────────────────────────────────────────────────

/**
 * Look up a package on NPM or PyPI.
 *


 * @returns {Promise<object>} Package metadata with "registry" field
 */
export async function getPackageInfo(name: any, registry: any, options: Record<string, any> = {}) {
  if (!name || typeof name !== "string") {
    return { error: "Package name is required" };
  }

  const reg = (registry || "npm").toLowerCase().trim();

  let result: any;

  switch (reg) {
    case "npm":
      result = await getNpmPackage(name, {
        includeReadme: options.readme !== "false",
      });
      break;

    case "pypi":
    case "pip":
    case "python":
      result = await getPyPiPackage(name);
      break;

    default:
      return { error: `Unknown registry: "${registry}". Supported: "npm", "pypi".` };
  }

  // Tag the result with the registry
  if (result && !result.error) {
    result.registry = reg === "pip" || reg === "python" ? "pypi" : reg;
  }

  return result;
}
