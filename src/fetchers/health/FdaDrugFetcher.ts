import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";
import { DrugProduct, RawDrugRow } from "../../types/health.ts";
import { errorMessage } from "../../utilities.ts";

/**
 * FDA Drug Fetcher — Static In-Memory FDA NDC Drug Database
 *
 * Loads ~26,000 FDA-registered drug products (NDC directory) into memory.
 * Provides search, NDC lookup, dosage form browsing, ingredient search,
 * and pharmacological class filtering.
 *
 * Source: FDA openFDA Drug NDC API (Public Domain)
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CSV Parser ────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Load & Index ──────────────────────────────────────────────

const DRUG_DB: RawDrugRow[] = [];
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;

  try {
    const csvPath = join(__dirname, "data", "digest_fda_drugs.csv");
    const raw = readFileSync(csvPath, "utf-8");
    const lines = raw.split("\n").filter((line: string) => line.trim());
    if (lines.length === 0) return;
    const headers = parseCSVLine(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 3) continue;

      const row: RawDrugRow = {
        product_ndc: null,
        generic_name: null,
        brand_name: null,
        labeler_name: null,
        dosage_form: null,
        route: null,
        product_type: null,
        marketing_category: null,
        active_ingredients: null,
        pharm_class: null,
      };

      headers.forEach((header: string, index: number) => {
        row[header] = values[index] || null;
      });

      DRUG_DB.push(row);
    }
  } catch (error) {
    logger.error(`Failed to load FDA drug database: ${errorMessage(error)}`);
  }

  logger.info(`💊 FDA drug database loaded: ${DRUG_DB.length} products`);
}

// ─── Helpers ───────────────────────────────────────────────────

function normalizeSearch(searchText: string): string {
  return searchText.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function formatDrug(drugRow: RawDrugRow): DrugProduct {
  return {
    productNdc: drugRow.product_ndc || "",
    genericName: drugRow.generic_name || "",
    brandName: drugRow.brand_name || "",
    labelerName: drugRow.labeler_name || "",
    dosageForm: drugRow.dosage_form || "",
    route: drugRow.route || "",
    productType: drugRow.product_type || "",
    marketingCategory: drugRow.marketing_category || "",
    activeIngredients: drugRow.active_ingredients || "",
    pharmClass: drugRow.pharm_class || "",
  };
}

// ─── Public API ────────────────────────────────────────────────

export interface SearchDrugsOptions {
  limit?: number;
  dosageForm?: string;
  productType?: string;
}

export interface SearchDrugsResult {
  count: number;
  query: string | null | undefined;
  note: string;
  drugs: DrugProduct[];
}

/**
 * Search drugs by name, ingredient, or manufacturer.
 */
export function searchDrugs(
  query: string | null | undefined,
  opts: SearchDrugsOptions = {},
): SearchDrugsResult {
  ensureLoaded();

  const { limit = 10, dosageForm, productType } = opts;
  const normalizedQuery = normalizeSearch(query || "");

  if (!normalizedQuery)
    return { count: 0, query, note: "No query provided.", drugs: [] };

  let candidates = DRUG_DB;
  if (dosageForm) {
    const normalizedDosageForm = dosageForm.toUpperCase();
    candidates = candidates.filter(
      (drugRow: RawDrugRow) =>
        drugRow.dosage_form &&
        drugRow.dosage_form.toUpperCase().includes(normalizedDosageForm),
    );
  }
  if (productType) {
    const normalizedProductType = productType.toUpperCase();
    candidates = candidates.filter(
      (drugRow: RawDrugRow) =>
        drugRow.product_type &&
        drugRow.product_type.toUpperCase().includes(normalizedProductType),
    );
  }

  const scored = candidates
    .map((drugRow: RawDrugRow) => {
      let score = 0;
      const generic = normalizeSearch(drugRow.generic_name || "");
      const brand = normalizeSearch(drugRow.brand_name || "");
      const ingredients = normalizeSearch(drugRow.active_ingredients || "");
      const labeler = normalizeSearch(drugRow.labeler_name || "");

      if (brand === normalizedQuery) score += 100;
      else if (generic === normalizedQuery) score += 95;
      else if (brand.startsWith(normalizedQuery)) score += 70;
      else if (generic.startsWith(normalizedQuery)) score += 65;
      else if (brand.includes(normalizedQuery)) score += 40;
      else if (generic.includes(normalizedQuery)) score += 35;
      else if (ingredients.includes(normalizedQuery)) score += 25;
      else if (labeler.includes(normalizedQuery)) score += 15;

      return { drugRow, score };
    })
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    count: scored.length,
    query,
    note: "Data from FDA openFDA NDC API (Public Domain). For informational use only — not medical advice.",
    drugs: scored.map((entry) => formatDrug(entry.drugRow)),
  };
}

/**
 * Get drug by exact NDC code.
 */
export function getDrugByNdc(ndc: string): DrugProduct | null {
  ensureLoaded();

  const normalizedNdc = ndc.trim();
  const foundDrug = DRUG_DB.find(
    (drugRow: RawDrugRow) =>
      drugRow.product_ndc && drugRow.product_ndc === normalizedNdc,
  );

  if (!foundDrug) return null;
  return formatDrug(foundDrug);
}

export interface DosageFormCount {
  form: string;
  count: number;
}

export interface DosageFormsResult {
  totalProducts: number;
  dosageForms: DosageFormCount[];
  note: string;
}

/**
 * Get all unique dosage forms with counts.
 */
export function getDosageForms(): DosageFormsResult {
  ensureLoaded();

  const forms: Record<string, number> = {};
  for (const drugRow of DRUG_DB) {
    const dosageFormName = drugRow.dosage_form || "Unknown";
    forms[dosageFormName] = (forms[dosageFormName] || 0) + 1;
  }

  return {
    totalProducts: DRUG_DB.length,
    dosageForms: Object.entries(forms)
      .sort((a, b) => b[1] - a[1])
      .map(([form, count]) => ({ form, count })),
    note: "Data from FDA openFDA NDC API (Public Domain).",
  };
}

export interface SearchByIngredientOptions {
  limit?: number;
}

export interface SearchByIngredientResult {
  count: number;
  ingredient: string;
  note: string;
  drugs: DrugProduct[];
}

/**
 * Search drugs by active ingredient.
 */
export function searchByIngredient(
  ingredient: string,
  opts: SearchByIngredientOptions = {},
): SearchByIngredientResult {
  ensureLoaded();

  const { limit = 20 } = opts;
  const normalizedIngredient = normalizeSearch(ingredient);

  const matches = DRUG_DB.filter((drugRow: RawDrugRow) => {
    const ingredients = normalizeSearch(drugRow.active_ingredients || "");
    return ingredients.includes(normalizedIngredient);
  }).slice(0, limit);

  return {
    count: matches.length,
    ingredient: ingredient,
    note: "Data from FDA openFDA NDC API (Public Domain). For informational use only.",
    drugs: matches.map(formatDrug),
  };
}

export interface SearchByPharmClassOptions {
  limit?: number;
}

export interface SearchByPharmClassResult {
  count: number;
  pharmClass: string;
  note: string;
  drugs: DrugProduct[];
}

/**
 * Search drugs by pharmacological class.
 */
export function searchByPharmClass(
  pharmClass: string,
  opts: SearchByPharmClassOptions = {},
): SearchByPharmClassResult {
  ensureLoaded();

  const { limit = 20 } = opts;
  const normalizedPharmClass = normalizeSearch(pharmClass);

  const matches = DRUG_DB.filter((drugRow: RawDrugRow) => {
    const normalizedDrugPharmClass = normalizeSearch(drugRow.pharm_class || "");
    return normalizedDrugPharmClass.includes(normalizedPharmClass);
  }).slice(0, limit);

  return {
    count: matches.length,
    pharmClass: pharmClass,
    note: "Data from FDA openFDA NDC API (Public Domain). For informational use only.",
    drugs: matches.map(formatDrug),
  };
}
