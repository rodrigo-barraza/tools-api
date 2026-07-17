// ============================================================
// Static Dataset Integrity
//
// Guards the two failure modes that shipped a dataset-less build
// to production (2026-07): the build step not copying
// src/fetchers/**/data into dist/, and fetchers silently
// returning empty results when their CSVs are missing.
//
// The dist/ checks mirror PromptLocaleService.test.ts: they skip
// when dist/ is absent (plain `vitest` run without a build) and
// run during deploys, where deploy.sh's PRE_TEST hook builds the
// host dist/ first.
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
const DIST_FETCHERS = path.join(ROOT, "dist", "fetchers");

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

describe("Static datasets — dist/ Production Build", () => {
  it("copies every src data file into dist with identical size", () => {
    if (!fs.existsSync(DIST_FETCHERS)) return; // no build present — skip

    const sourceFiles = listDataFiles(SOURCE_FETCHERS);
    const distFiles = listDataFiles(DIST_FETCHERS);
    expect(distFiles).toEqual(sourceFiles);

    for (const relativePath of sourceFiles) {
      const sourceSize = fs.statSync(
        path.join(SOURCE_FETCHERS, relativePath),
      ).size;
      const distSize = fs.statSync(path.join(DIST_FETCHERS, relativePath)).size;
      expect(distSize, relativePath).toBe(sourceSize);
    }
  });
});
