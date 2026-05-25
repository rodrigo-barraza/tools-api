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
    const lines = raw.split("\n").filter((l: string) => l.trim());
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
      
      headers.forEach((h: string, index: number) => {
        row[h] = values[index] || null;
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

function formatDrug(d: RawDrugRow): DrugProduct {
  return {
    productNdc: d.product_ndc || "",
    genericName: d.generic_name || "",
    brandName: d.brand_name || "",
    labelerName: d.labeler_name || "",
    dosageForm: d.dosage_form || "",
    route: d.route || "",
    productType: d.product_type || "",
    marketingCategory: d.marketing_category || "",
    activeIngredients: d.active_ingredients || "",
    pharmClass: d.pharm_class || "",
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
export function searchDrugs(query: string | null | undefined, opts: SearchDrugsOptions = {}): SearchDrugsResult {
  ensureLoaded();

  const { limit = 10, dosageForm, productType } = opts;
  const q = normalizeSearch(query || "");

  if (!q) return { count: 0, query, note: "No query provided.", drugs: [] };

  let candidates = DRUG_DB;
  if (dosageForm) {
    const df = dosageForm.toUpperCase();
    candidates = candidates.filter(
      (d: RawDrugRow) => d.dosage_form && d.dosage_form.toUpperCase().includes(df),
    );
  }
  if (productType) {
    const pt = productType.toUpperCase();
    candidates = candidates.filter(
      (d: RawDrugRow) => d.product_type && d.product_type.toUpperCase().includes(pt),
    );
  }

  const scored = candidates
    .map((d: RawDrugRow) => {
      let score = 0;
      const generic = normalizeSearch(d.generic_name || "");
      const brand = normalizeSearch(d.brand_name || "");
      const ingredients = normalizeSearch(d.active_ingredients || "");
      const labeler = normalizeSearch(d.labeler_name || "");

      if (brand === q) score += 100;
      else if (generic === q) score += 95;
      else if (brand.startsWith(q)) score += 70;
      else if (generic.startsWith(q)) score += 65;
      else if (brand.includes(q)) score += 40;
      else if (generic.includes(q)) score += 35;
      else if (ingredients.includes(q)) score += 25;
      else if (labeler.includes(q)) score += 15;

      return { d, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    count: scored.length,
    query,
    note: "Data from FDA openFDA NDC API (Public Domain). For informational use only — not medical advice.",
    drugs: scored.map((s) => formatDrug(s.d)),
  };
}

/**
 * Get drug by exact NDC code.
 */
export function getDrugByNdc(ndc: string): DrugProduct | null {
  ensureLoaded();

  const n = ndc.trim();
  const d = DRUG_DB.find(
    (d: RawDrugRow) => d.product_ndc && d.product_ndc === n,
  );

  if (!d) return null;
  return formatDrug(d);
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
  for (const d of DRUG_DB) {
    const f = d.dosage_form || "Unknown";
    forms[f] = (forms[f] || 0) + 1;
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
export function searchByIngredient(ingredient: string, opts: SearchByIngredientOptions = {}): SearchByIngredientResult {
  ensureLoaded();

  const { limit = 20 } = opts;
  const q = normalizeSearch(ingredient);

  const matches = DRUG_DB.filter((d: RawDrugRow) => {
    const ingredients = normalizeSearch(d.active_ingredients || "");
    return ingredients.includes(q);
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
export function searchByPharmClass(pharmClass: string, opts: SearchByPharmClassOptions = {}): SearchByPharmClassResult {
  ensureLoaded();

  const { limit = 20 } = opts;
  const q = normalizeSearch(pharmClass);

  const matches = DRUG_DB.filter((d: RawDrugRow) => {
    const pc = normalizeSearch(d.pharm_class || "");
    return pc.includes(q);
  }).slice(0, limit);

  return {
    count: matches.length,
    pharmClass: pharmClass,
    note: "Data from FDA openFDA NDC API (Public Domain). For informational use only.",
    drugs: matches.map(formatDrug),
  };
}

