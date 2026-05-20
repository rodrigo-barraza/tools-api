import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";
import {
  DATASET_REGISTRY,
  NUTRITION_NUTRIENT_TYPES,
  NUTRITION_MACRO_FIELDS,
  NUTRITION_MINERAL_FIELDS,
  NUTRITION_VITAMIN_FIELDS,
  NUTRITION_AMINO_ACID_FIELDS,
  NUTRITION_LIPID_FIELDS,
  NUTRITION_CARB_DETAIL_FIELDS,
  NUTRITION_STEROL_FIELDS,
} from "../../constants.ts";

/**
 * Nutrition Fetcher — Static In-Memory Multi-Source Database
 *
 * Loads raw whole foods from multiple curated digest CSVs into memory:
 *   - USDA National Nutrient Database (~1,346 foods)
 *   - Health Canada Canadian Nutrient File (~3,570 foods)
 *
 * Provides search, lookup, and nutrient-specific queries
 * without any external API calls.
 *
 * All nutrient values are per 100g of the food.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CSV Parser (handles quoted fields with commas) ────────────

function parseCSVLine(line: any) {
  const fields: any[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Load & Index ──────────────────────────────────────────────

const FOOD_DB: any[] = [];
const NUTRIENT_DB: any[] = [];
let loaded = false;

const FOOD_DATA_FILES = [
  { file: "digest_food.csv", source: "USDA" },
  { file: "digest_food_canada.csv", source: "Health Canada CNF" },
  { file: "digest_food_fao.csv", source: "FAO/INFOODS BioFoodComp" },
  { file: "digest_food_uk.csv", source: "UK CoFID" },
  { file: "digest_food_india.csv", source: "India IFCT" },
  { file: "digest_food_australia.csv", source: "Australia AFCD" },
  { file: "digest_food_japan.csv", source: "Japan MEXT" },
];

const SOURCES_NOTE = `All nutrient values per 100g edible portion. Sources: ${FOOD_DATA_FILES.map((f: any) => f.source).join(", ")}.`;

function loadFoodCSV(filename: any, source: any) {
  const foodPath = join(__dirname, "data", filename);
  const foodRaw = readFileSync(foodPath, "utf-8");
  const foodLines = foodRaw.split("\n").filter((l: any) => l.trim());
  const foodHeaders = parseCSVLine(foodLines[0]);
  let count = 0;

  for (let i = 1; i < foodLines.length; i++) {
    const values = parseCSVLine(foodLines[i]);
    if (values.length < 40) continue;

    const row: Record<string, any> = {};
    foodHeaders.forEach((h: any, index: any) => {
      row[h] = values[index] || "";
    });

    // Parse numeric nutrient fields (columns 36 onward are numeric)
    const numericStart = 35; // protein is index 35 (0-based)
    for (let n = numericStart; n < foodHeaders.length; n++) {
      const value = parseFloat(row[foodHeaders[n]]);
      row[foodHeaders[n]] = isNaN(value) ? null : value;
    }

    // Tag the data source for provenance
    row._source = source;

    FOOD_DB.push(row);
    count++;
  }

  return count;
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;

  // Load all food data files
  const counts: any[] = [];
  for (const { file, source } of FOOD_DATA_FILES) {
    const count = loadFoodCSV(file, source);
    counts.push(`${count} ${source}`);
  }

  // Load nutrient metadata
  const nutrientPath = join(__dirname, "data", "digest_nutrient.csv");
  const nutrientRaw = readFileSync(nutrientPath, "utf-8");
  const nutrientLines = nutrientRaw.split("\n").filter((l: any) => l.trim());
  const nutrientHeaders = parseCSVLine(nutrientLines[0]);

  for (let i = 1; i < nutrientLines.length; i++) {
    const values = parseCSVLine(nutrientLines[i]);
    const row: Record<string, any> = {};
    nutrientHeaders.forEach((h: any, index: any) => {
      row[h] = values[index] || "";
    });
    NUTRIENT_DB.push(row);
  }

  logger.info(
    `🥦 Nutrition DB loaded: ${FOOD_DB.length} foods (${counts.join(", ")}), ${NUTRIENT_DB.length} nutrients`,
  );
}

// ─── Search Helpers ────────────────────────────────────────────

function normalizeSearch(str: any) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function scoreMatch(food: any, terms: any) {
  const name = normalizeSearch(food.food_name || "");
  const desc = normalizeSearch(food.description_long || "");
  const keywords = normalizeSearch(food.food_keywords || "");
  const type = normalizeSearch(food.food_type || "");
  const part = normalizeSearch(food.food_part || "");

  let score = 0;
  let allMatch = true;

  for (const term of terms) {
    let termMatched = false;

    // Exact name match is strongest
    if (name === term) {
      score += 100;
      termMatched = true;
    } else if (name.startsWith(term)) {
      score += 50;
      termMatched = true;
    } else if (name.includes(term)) {
      score += 30;
      termMatched = true;
    }

    if (desc.includes(term)) {
      score += 10;
      termMatched = true;
    }
    if (keywords.includes(term)) {
      score += 15;
      termMatched = true;
    }
    if (type.includes(term)) {
      score += 5;
      termMatched = true;
    }
    if (part.includes(term)) {
      score += 5;
      termMatched = true;
    }

    if (!termMatched) allMatch = false;
  }

  // All terms must match somewhere
  return allMatch ? score : 0;
}

// ─── Nutrient Extraction ───────────────────────────────────────

function extractMacros(food: any) {
  const result: Record<string, any> = {};
  for (const [key, label] of Object.entries(NUTRITION_MACRO_FIELDS)) {
    if (food[key] !== null && food[key] !== undefined) {
      result[label] = food[key];
    }
  }
  return result;
}

function extractMinerals(food: any) {
  const result: Record<string, any> = {};
  for (const [key, label] of Object.entries(NUTRITION_MINERAL_FIELDS)) {
    if (food[key] !== null && food[key] !== undefined) {
      result[label] = food[key];
    }
  }
  return result;
}

function extractVitamins(food: any) {
  const result: Record<string, any> = {};
  for (const [key, label] of Object.entries(NUTRITION_VITAMIN_FIELDS)) {
    if (food[key] !== null && food[key] !== undefined) {
      result[label] = food[key];
    }
  }
  return result;
}

function extractAminoAcids(food: any) {
  const result: Record<string, any> = {};
  for (const [key, label] of Object.entries(NUTRITION_AMINO_ACID_FIELDS)) {
    if (food[key] !== null && food[key] !== undefined) {
      result[label] = food[key];
    }
  }
  return result;
}

function extractLipidProfile(food: any) {
  const result: Record<string, any> = {};
  for (const [key, label] of Object.entries(NUTRITION_LIPID_FIELDS)) {
    if (food[key] !== null && food[key] !== undefined) {
      result[label] = food[key];
    }
  }
  return result;
}

function extractCarbDetails(food: any) {
  const result: Record<string, any> = {};
  for (const [key, label] of Object.entries(NUTRITION_CARB_DETAIL_FIELDS)) {
    if (food[key] !== null && food[key] !== undefined) {
      result[label] = food[key];
    }
  }
  return result;
}

function extractSterols(food: any) {
  const result: Record<string, any> = {};
  for (const [key, label] of Object.entries(NUTRITION_STEROL_FIELDS)) {
    if (food[key] !== null && food[key] !== undefined) {
      result[label] = food[key];
    }
  }
  return result;
}

function formatFood(food: any, nutrientTypes: any = null) {
  const types = nutrientTypes
    ? nutrientTypes.split(",").map((t: any) => t.trim().toLowerCase())
    : null;

  const base = {
    name: food.food_name,
    description: food.description_long,
    source: food._source || "USDA",
    region: food.food_region || null,
    kingdom: food.kingdom,
    foodType: food.food_type,
    foodSubtype: food.food_subtype || null,
    part: food.food_part || null,
    form: food.food_form || null,
    state: food.food_state || null,
    taxonomy: {
      taxon: food.taxon || null,
      kingdom: food.kingdom || null,
      phylum: food.phylum || null,
      class: food.class || null,
      order: food.order || null,
      suborder: food.suborder || null,
      family: food.family || null,
      subfamily: food.subfamily || null,
      tribe: food.tribe || null,
      genus: food.genus || null,
      species: food.species || null,
      subspecies: food.subspecies || null,
      variety: food.variety || null,
      form: food.form || null,
      group: food.group || null,
      cultivar: food.cultivar || null,
      phenotype: food.phenotype || null,
      binomial: food.binomial || null,
      nomial: food.nomial || null,
      trinomial: food.trinomial || null,
    },
    perHundredGrams: {} as Record<string, any>,
  };

  // Always include macros unless specific types are requested
  const includeAll = !types;
  const include = (t: any) => includeAll || types.includes(t);

  if (include("macros") || include("macro")) {
    base.perHundredGrams.macros = extractMacros(food);
  }
  if (include("minerals") || include("mineral")) {
    base.perHundredGrams.minerals = extractMinerals(food);
  }
  if (include("vitamins") || include("vitamin")) {
    base.perHundredGrams.vitamins = extractVitamins(food);
  }
  if (include("amino_acids") || include("amino") || include("protein")) {
    base.perHundredGrams.aminoAcids = extractAminoAcids(food);
  }
  if (include("lipids") || include("fats") || include("fat")) {
    base.perHundredGrams.lipidProfile = extractLipidProfile(food);
  }
  if (include("carbs") || include("carbohydrates") || include("sugars")) {
    base.perHundredGrams.carbDetails = extractCarbDetails(food);
  }
  if (include("sterols") || include("cholesterol")) {
    base.perHundredGrams.sterols = extractSterols(food);
  }

  return base;
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Search for foods by name/keyword.


 */
export function searchFoods(query: any, opts: Record<string, any> = {}) {
  ensureLoaded();

  const { limit = 10, kingdom, foodType, nutrientTypes } = opts;
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);

  if (!terms.length) {
    return { count: 0, query, foods: [] };
  }

  let candidates = FOOD_DB;

  // Apply filters
  if (kingdom) {
    const k = kingdom.toLowerCase();
    candidates = candidates.filter(
      (f: any) => f.kingdom && f.kingdom.toLowerCase() === k,
    );
  }
  if (foodType) {
    const ft = foodType.toLowerCase();
    candidates = candidates.filter(
      (f: any) => f.food_type && f.food_type.toLowerCase() === ft,
    );
  }

  // Score and rank
  const scored = candidates
    .map((food: any) => ({ food, score: scoreMatch(food, terms) }))
    .filter((s: any) => s.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit);

  return {
    count: scored.length,
    query,
    note: SOURCES_NOTE,
    foods: scored.map((s: any) => formatFood(s.food, nutrientTypes)),
  };
}

/**
 * Get detailed nutrition for a specific food by exact name.


 */
export function getFoodByName(name: any, nutrientTypes: any = null) {
  ensureLoaded();

  const normalized = normalizeSearch(name);
  const food = FOOD_DB.find((f: any) => normalizeSearch(f.food_name) === normalized);

  if (!food) return null;
  return formatFood(food, nutrientTypes);
}

/**
 * Get all foods ranked by a specific nutrient (highest first).


 */
export function rankByNutrient(nutrient: any, opts: Record<string, any> = {}) {
  ensureLoaded();

  const { limit = 10, kingdom, foodType } = opts;

  // Validate nutrient exists
  if (!FOOD_DB[0] || !(nutrient in FOOD_DB[0])) {
    // Try to find a close match
    const allKeys = Object.keys(FOOD_DB[0] || {}).filter(
      (k: any) => typeof FOOD_DB[0][k] === "number" || FOOD_DB[0][k] === null,
    );
    return {
      error: `Unknown nutrient: "${nutrient}"`,
      availableNutrients: allKeys.slice(35), // skip taxonomy fields
    };
  }

  let candidates = FOOD_DB;

  if (kingdom) {
    const k = kingdom.toLowerCase();
    candidates = candidates.filter(
      (f: any) => f.kingdom && f.kingdom.toLowerCase() === k,
    );
  }
  if (foodType) {
    const ft = foodType.toLowerCase();
    candidates = candidates.filter(
      (f: any) => f.food_type && f.food_type.toLowerCase() === ft,
    );
  }

  const ranked = candidates
    .filter((f: any) => f[nutrient] !== null && f[nutrient] > 0)
    .sort((a: any, b: any) => b[nutrient] - a[nutrient])
    .slice(0, limit);

  // Find unit from nutrient metadata
  const nutrientMeta = NUTRIENT_DB.find((n: any) => n.nutrient_id === nutrient);

  return {
    nutrient,
    nutrientName: nutrientMeta?.nutrient_name || nutrient,
    type: nutrientMeta?.nutrient_type || "unknown",
    count: ranked.length,
    note: SOURCES_NOTE,
    foods: ranked.map((f: any) => ({
      name: f.food_name,
      description: f.description_long,
      source: f._source || "USDA",
      kingdom: f.kingdom,
      foodType: f.food_type,
      value: f[nutrient],
    })),
  };
}

/**
 * List available nutrient types for filtering.
 */
export function getNutrientTypes() {
  ensureLoaded();

  const nutritionDatasets = DATASET_REGISTRY.filter(
    (d: any) => d.domain === "nutrition" && d.foods,
  );

  return {
    types: NUTRITION_NUTRIENT_TYPES,
    totalFoods: FOOD_DB.length,
    totalNutrients: NUTRIENT_DB.length,
    sources: nutritionDatasets.map((d: any) => ({
      id: d.id,
      name: d.name,
      region: d.region,
      version: d.version,
      dataYear: d.dataYear,
      foods: d.foods,
    })),
  };
}

/**
 * List all unique food categories / kingdoms / types.
 */
export function getFoodCategories() {
  ensureLoaded();

  const kingdoms = [...new Set(FOOD_DB.map((f: any) => f.kingdom).filter(Boolean))];
  const foodTypes = [
    ...new Set(FOOD_DB.map((f: any) => f.food_type).filter(Boolean)),
  ];
  const foodSubtypes = [
    ...new Set(FOOD_DB.map((f: any) => f.food_subtype).filter(Boolean)),
  ];
  const parts = [...new Set(FOOD_DB.map((f: any) => f.food_part).filter(Boolean))];

  return {
    totalFoods: FOOD_DB.length,
    kingdoms: kingdoms.sort(),
    foodTypes: foodTypes.sort(),
    foodSubtypes: foodSubtypes.sort(),
    parts: parts.sort(),
  };
}

/**
 * Compare nutrition between two or more foods.


 */
export function compareFoods(foodNames: any, nutrientTypes: any = null) {
  ensureLoaded();

  const results = foodNames.map((name: any) => {
    const normalized = normalizeSearch(name);
    const terms = normalized.split(/\s+/).filter(Boolean);

    // Try exact match first, then scored search
    let food = FOOD_DB.find((f: any) => normalizeSearch(f.food_name) === normalized);

    if (!food) {
      const scored = FOOD_DB.map((f: any) => ({
        food: f,
        score: scoreMatch(f, terms),
      }))
        .filter((s: any) => s.score > 0)
        .sort((a: any, b: any) => b.score - a.score);
      food = scored[0]?.food || null;
    }

    if (!food) return { query: name, found: false };
    return { query: name, found: true, ...formatFood(food, nutrientTypes) };
  });

  return {
    count: results.filter((r: any) => r.found).length,
    note: SOURCES_NOTE,
    comparison: results,
  };
}

// ─── Category → Field Map Lookup ───────────────────────────────

const CATEGORY_FIELD_MAP: Record<string, any> = {
  macros: NUTRITION_MACRO_FIELDS,
  minerals: NUTRITION_MINERAL_FIELDS,
  vitamins: NUTRITION_VITAMIN_FIELDS,
  amino_acids: NUTRITION_AMINO_ACID_FIELDS,
  lipids: NUTRITION_LIPID_FIELDS,
  carbs: NUTRITION_CARB_DETAIL_FIELDS,
  sterols: NUTRITION_STEROL_FIELDS,
};

/**
 * Resolve a human-friendly nutrient name to its CSV column name.
 * Accepts: CSV column name, human label, or partial match.


 */
function resolveNutrientColumn(category: any, nutrient: any) {
  const fields = CATEGORY_FIELD_MAP[category];
  if (!fields) return null;

  const lower = nutrient.toLowerCase().replace(/[\s-]+/g, "_");

  // Direct CSV column match
  if (lower in fields) {
    return { column: lower, label: fields[lower] };
  }

  // Match by label value (e.g. "calcium_mg" → "calcium")
  for (const [col, label] of Object.entries(fields)) {
    if ((label as string).toLowerCase() === lower) {
      return { column: col, label };
    }
  }

  // Partial match on column or label
  for (const [col, label] of Object.entries(fields)) {
    if (col.includes(lower) || (label as string).toLowerCase().includes(lower)) {
      return { column: col, label };
    }
  }

  return null;
}

// ─── Top Foods by Category ─────────────────────────────────────

/**
 * Get top foods ranked by a specific nutrient within a category.
 * Accepts human-friendly nutrient names (e.g. "calcium", "omega3", "vitamin C").


 */
export function getTopFoodsByCategory(category: any, nutrient: any, opts: Record<string, any> = {}) {
  ensureLoaded();

  const fields = CATEGORY_FIELD_MAP[category];
  if (!fields) {
    return {
      error: `Unknown category: "${category}"`,
      availableCategories: Object.keys(CATEGORY_FIELD_MAP),
    };
  }

  const resolved = resolveNutrientColumn(category, nutrient);
  if (!resolved) {
    return {
      error: `Unknown nutrient "${nutrient}" in category "${category}"`,
      availableNutrients: Object.entries(fields).map(([col, label]: any) => ({
        column: col,
        label,
      })),
    };
  }

  const { limit = 10, kingdom, foodType } = opts;
  let candidates = FOOD_DB;

  if (kingdom) {
    const k = kingdom.toLowerCase();
    candidates = candidates.filter(
      (f: any) => f.kingdom && f.kingdom.toLowerCase() === k,
    );
  }
  if (foodType) {
    const ft = foodType.toLowerCase();
    candidates = candidates.filter(
      (f: any) => f.food_type && f.food_type.toLowerCase() === ft,
    );
  }

  const ranked = candidates
    .filter((f: any) => f[resolved.column] !== null && f[resolved.column] > 0)
    .sort((a: any, b: any) => b[resolved.column] - a[resolved.column])
    .slice(0, limit);

  // Find unit from nutrient metadata
  const nutrientMeta = NUTRIENT_DB.find(
    (n: any) => n.nutrient_id === resolved.column,
  );

  return {
    category,
    nutrient: resolved.column,
    nutrientLabel: resolved.label,
    nutrientName: nutrientMeta?.nutrient_name || resolved.column,
    unit: nutrientMeta?.unit || null,
    count: ranked.length,
    note: SOURCES_NOTE,
    foods: ranked.map((f: any) => ({
      name: f.food_name,
      description: f.description_long,
      source: f._source || "USDA",
      kingdom: f.kingdom,
      foodType: f.food_type,
      value: f[resolved.column],
    })),
  };
}

/**
 * List available nutrients within a specific category.

 */
export function listCategoryNutrients(category: any) {
  ensureLoaded();

  const fields = CATEGORY_FIELD_MAP[category];
  if (!fields) {
    return {
      error: `Unknown category: "${category}"`,
      availableCategories: Object.keys(CATEGORY_FIELD_MAP),
    };
  }

  const typeMeta = NUTRITION_NUTRIENT_TYPES.find((t: any) => t.key === category);

  return {
    category,
    label: typeMeta?.label || category,
    description: typeMeta?.description || null,
    nutrients: Object.entries(fields).map(([column, label]: any) => ({
      column,
      label,
    })),
  };
}

// ─── Taxonomy Constants ────────────────────────────────────────

const TAXONOMY_RANKS = [
  "kingdom",
  "phylum",
  "class",
  "order",
  "suborder",
  "family",
  "subfamily",
  "tribe",
  "genus",
  "species",
  "subspecies",
  "variety",
  "form",
  "group",
  "cultivar",
  "phenotype",
];

// ─── Search by Taxonomy ────────────────────────────────────────

/**
 * Search / browse foods by taxonomic rank and value.
 * Example: rank="family", value="Rosaceae" → all rose-family foods.


 */
export function searchByTaxonomy(rank: any, value: any, opts: Record<string, any> = {}) {
  ensureLoaded();

  const normalizedRank = rank.toLowerCase().trim();
  if (!TAXONOMY_RANKS.includes(normalizedRank)) {
    return {
      error: `Unknown taxonomic rank: "${rank}"`,
      availableRanks: TAXONOMY_RANKS,
    };
  }

  const { limit = 25, nutrientTypes } = opts;
  const normalizedValue = value.toLowerCase().trim();

  const matched = FOOD_DB.filter((f: any) => {
    const fieldVal = (f[normalizedRank] || "").toLowerCase().trim();
    return fieldVal === normalizedValue || fieldVal.includes(normalizedValue);
  }).slice(0, limit);

  return {
    rank: normalizedRank,
    value,
    count: matched.length,
    note: SOURCES_NOTE,
    foods: matched.map((f: any) => formatFood(f, nutrientTypes)),
  };
}

/**
 * Get all unique values at each taxonomic rank — the full taxonomy tree.
 * Useful for discovery: "what families exist?", "what genera are in Rosaceae?"


 */
export function getTaxonomyTree(
  rank: any = null,
  parentRank: any = null,
  parentValue: any = null,
) {
  ensureLoaded();

  // If a specific rank is requested
  if (rank) {
    const normalizedRank = rank.toLowerCase().trim();
    if (!TAXONOMY_RANKS.includes(normalizedRank)) {
      return {
        error: `Unknown taxonomic rank: "${rank}"`,
        availableRanks: TAXONOMY_RANKS,
      };
    }

    let candidates = FOOD_DB;

    // Filter by parent rank if provided
    if (parentRank && parentValue) {
      const normalizedParent = parentRank.toLowerCase().trim();
      const normalizedParentVal = parentValue.toLowerCase().trim();
      if (!TAXONOMY_RANKS.includes(normalizedParent)) {
        return {
          error: `Unknown parent rank: "${parentRank}"`,
          availableRanks: TAXONOMY_RANKS,
        };
      }
      candidates = candidates.filter(
        (f: any) =>
          (f[normalizedParent] || "").toLowerCase().trim() ===
          normalizedParentVal,
      );
    }

    const values = [
      ...new Set(candidates.map((f: any) => f[normalizedRank]).filter(Boolean)),
    ].sort();

    return {
      rank: normalizedRank,
      parentFilter: parentRank
        ? { rank: parentRank, value: parentValue }
        : null,
      count: values.length,
      values,
    };
  }

  // Full tree: all ranks with their unique values
  const tree: Record<string, any> = {};
  for (const r of TAXONOMY_RANKS) {
    const values = [
      ...new Set(FOOD_DB.map((f: any) => f[r]).filter(Boolean)),
    ].sort();
    if (values.length > 0) {
      tree[r] = { count: values.length, values };
    }
  }

  return {
    totalFoods: FOOD_DB.length,
    ranks: TAXONOMY_RANKS,
    tree,
  };
}

