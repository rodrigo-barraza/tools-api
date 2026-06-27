import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ────────────────────────────────────────────────────────────
// Locale Key Parity — Structural Integrity Test
// ────────────────────────────────────────────────────────────
// Enforces that every non-English locale has the exact same
// keys as the English (en) source-of-truth locale.
// English is canonical — all other locales must match 1:1.
// ────────────────────────────────────────────────────────────

const currentFilePath = fileURLToPath(import.meta.url);
const localesRootDirectory = path.resolve(
  path.dirname(currentFilePath),
  "..",
  "..",
  "locales",
);

function loadJsonFileKeys(filePath: string): string[] {
  const rawContent = fs.readFileSync(filePath, "utf-8");
  const parsedContent = JSON.parse(rawContent) as Record<string, unknown>;
  return Object.keys(parsedContent).sort();
}

function deepFlattenKeys(
  source: Record<string, unknown>,
  prefix = "",
): string[] {
  const flattenedKeys: string[] = [];

  for (const [key, value] of Object.entries(source)) {
    const flatKey = prefix ? `${prefix}.${key}` : key;

    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      flattenedKeys.push(
        ...deepFlattenKeys(value as Record<string, unknown>, flatKey),
      );
    } else {
      flattenedKeys.push(flatKey);
    }
  }

  return flattenedKeys.sort();
}

function loadFlattenedJsonKeys(filePath: string): string[] {
  const rawContent = fs.readFileSync(filePath, "utf-8");
  const parsedContent = JSON.parse(rawContent) as Record<string, unknown>;
  return deepFlattenKeys(parsedContent);
}

function discoverLocaleDirectories(): string[] {
  if (!fs.existsSync(localesRootDirectory)) {
    return [];
  }

  return fs
    .readdirSync(localesRootDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function discoverJsonFilesInLocale(localeName: string): string[] {
  const localeDirectory = path.join(localesRootDirectory, localeName);

  if (!fs.existsSync(localeDirectory)) {
    return [];
  }

  return fs
    .readdirSync(localeDirectory)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();
}

describe("PromptLocaleService — Key Parity", () => {
  const availableLocales = discoverLocaleDirectories();
  const nonEnglishLocales = availableLocales.filter(
    (localeName) => localeName !== "en",
  );
  const englishJsonFiles = discoverJsonFilesInLocale("en");

  it("should have at least the English locale", () => {
    expect(availableLocales).toContain("en");
  });

  it("should have at least one non-English locale", () => {
    expect(nonEnglishLocales.length).toBeGreaterThan(0);
  });

  describe.each(nonEnglishLocales)("locale '%s'", (localeName) => {
    const localeJsonFiles = discoverJsonFilesInLocale(localeName);

    it("should have every JSON file that English has", () => {
      const missingFiles = englishJsonFiles.filter(
        (fileName) => !localeJsonFiles.includes(fileName),
      );

      expect(
        missingFiles,
        `Locale "${localeName}" is missing JSON file(s) that exist in "en": ${missingFiles.join(", ")}`,
      ).toEqual([]);
    });

    describe.each(englishJsonFiles)("file '%s'", (jsonFileName) => {
      const englishFilePath = path.join(
        localesRootDirectory,
        "en",
        jsonFileName,
      );
      const localeFilePath = path.join(
        localesRootDirectory,
        localeName,
        jsonFileName,
      );

      it("should exist in the locale directory", () => {
        expect(
          fs.existsSync(localeFilePath),
          `Missing file: locales/${localeName}/${jsonFileName}`,
        ).toBe(true);
      });

      it("should have the exact same number of keys as English", () => {
        if (!fs.existsSync(localeFilePath)) return;

        const englishKeys = loadFlattenedJsonKeys(englishFilePath);
        const localeKeys = loadFlattenedJsonKeys(localeFilePath);

        expect(
          localeKeys.length,
          `Key count mismatch in "${localeName}/${jsonFileName}": EN has ${englishKeys.length} keys, ${localeName} has ${localeKeys.length} keys`,
        ).toBe(englishKeys.length);
      });

      it("should have the exact same keys as English (no missing, no extra)", () => {
        if (!fs.existsSync(localeFilePath)) return;

        const englishKeys = loadFlattenedJsonKeys(englishFilePath);
        const localeKeys = loadFlattenedJsonKeys(localeFilePath);

        const englishKeySet = new Set(englishKeys);
        const localeKeySet = new Set(localeKeys);

        const missingFromLocale = englishKeys.filter(
          (key) => !localeKeySet.has(key),
        );
        const extraInLocale = localeKeys.filter(
          (key) => !englishKeySet.has(key),
        );

        if (missingFromLocale.length > 0 || extraInLocale.length > 0) {
          const errorLines: string[] = [
            `Key mismatch in "${localeName}/${jsonFileName}":`,
          ];

          if (missingFromLocale.length > 0) {
            errorLines.push(
              `  Missing from ${localeName} (${missingFromLocale.length}):`,
            );
            for (const key of missingFromLocale.slice(0, 25)) {
              errorLines.push(`    - ${key}`);
            }
            if (missingFromLocale.length > 25) {
              errorLines.push(
                `    ... and ${missingFromLocale.length - 25} more`,
              );
            }
          }

          if (extraInLocale.length > 0) {
            errorLines.push(
              `  Extra in ${localeName} (not in EN) (${extraInLocale.length}):`,
            );
            for (const key of extraInLocale.slice(0, 25)) {
              errorLines.push(`    + ${key}`);
            }
            if (extraInLocale.length > 25) {
              errorLines.push(
                `    ... and ${extraInLocale.length - 25} more`,
              );
            }
          }

          expect.fail(errorLines.join("\n"));
        }
      });
    });
  });
});
