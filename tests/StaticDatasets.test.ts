// ============================================================
// Static Dataset Integrity
//
// Guards the failure mode that shipped a dataset-less build to
// production (2026-07): fetchers silently returning empty results
// when their CSVs are missing. The runtime now executes src/
// directly, so the datasets under src/fetchers/**/data are the
// ones production reads — no dist/ copy step to verify.
// ============================================================
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

import { preloadStaticDatasets } from "../src/fetchers/preloadStaticDatasets.ts";
import { getFoodCategories } from "../src/fetchers/health/NutritionFetcher.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SOURCE_FETCHERS = path.join(ROOT, "src", "fetchers");

function listDataFiles(baseDirectory: string): string[] {
  if (!fs.existsSync(baseDirectory)) return [];
  const results: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (fullPath.split(path.sep).includes("data")) {
        results.push(path.relative(baseDirectory, fullPath));
      }
    }
  };
  walk(baseDirectory);
  return results.sort();
}

describe("Static datasets — source", () => {
  it("has data files under src/fetchers/**/data", () => {
    const sourceFiles = listDataFiles(SOURCE_FETCHERS);
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it("preloads every static dataset without throwing", () => {
    expect(() => preloadStaticDatasets()).not.toThrow();

    // Spot-check the nutrition DB actually populated (the 2026-07 bug
    // surfaced as structurally-valid responses over an empty database).
    const categories = getFoodCategories();
    expect(categories.totalFoods).toBeGreaterThan(10000);
    expect(categories.kingdoms).toContain("plantae");
  });
});
