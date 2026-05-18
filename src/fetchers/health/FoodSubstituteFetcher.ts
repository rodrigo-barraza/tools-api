/**
 * Food Substitute Fetcher — Nutritional Equivalence Matching
 *
 * Finds foods with similar nutrient profiles to a target food,
 * using cosine similarity on normalized nutrient vectors.
 * Supports dietary preference filtering (vegetarian, vegan, etc.)
 * and specific nutrient emphasis for targeted substitution.
 *
 * Algorithm: Cosine similarity over z-score normalized nutrient vectors.
 * When targetNutrients are specified, only those dimensions are compared
 * (weighted Euclidean distance as fallback for sparse vectors).
 */

import { searchFoods } from "./NutritionFetcher.ts";
import {
  NUTRITION_MACRO_FIELDS,
  NUTRITION_MINERAL_FIELDS,
  NUTRITION_VITAMIN_FIELDS,
  NUTRITION_AMINO_ACID_FIELDS,
  NUTRITION_LIPID_FIELDS,
} from "../../constants.ts";

// ─── Internal access to raw FOOD_DB ────────────────────────────

import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let FOOD_CACHE: any = null;

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

function ensureFoodCache() {
  if (FOOD_CACHE) return FOOD_CACHE;

  const dataDir = join(__dirname, "data");
  const files = readdirSync(dataDir).filter(
    (f: any) => f.startsWith("digest_food") && f.endsWith(".csv"),
  );

  const foods: any[] = [];
  for (const file of files) {
    const raw = readFileSync(join(dataDir, file), "utf-8");
    const lines = raw.split("\n").filter((l: any) => l.trim());
    const headers = parseCSVLine(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 40) continue;

      const row: Record<string, any> = {};
      headers.forEach((h: any, index: any) => {
        row[h] = values[index] || "";
      });

      const numericStart = 35;
      for (let n = numericStart; n < headers.length; n++) {
        const value = parseFloat(row[headers[n]]);
        row[headers[n]] = isNaN(value) ? null : value;
      }
      foods.push(row);
    }
  }

  FOOD_CACHE = foods;
  return foods;
}

// ─── Nutrient Columns for Vector Comparison ────────────────────

const ALL_NUTRIENT_COLUMNS = [
  ...Object.keys(NUTRITION_MACRO_FIELDS).filter(
    (k: any) => !["kilocalories", "kilojoules", "water", "mineral", "ethanol"].includes(k),
  ),
  ...Object.keys(NUTRITION_MINERAL_FIELDS),
  ...Object.keys(NUTRITION_VITAMIN_FIELDS),
  ...Object.keys(NUTRITION_AMINO_ACID_FIELDS),
  ...Object.keys(NUTRITION_LIPID_FIELDS),
];

// ─── Vector Helpers ────────────────────────────────────────────

function extractVector(food: any, columns: any) {
  return columns.map((col: any) => {
    const value = food[col];
    return value !== null && value !== undefined && !isNaN(value) ? value : 0;
  });
}

function cosineSimilarity(a: any, b: any) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function normalizeSearch(str: any) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

// ─── Kingdom/Type Filters ──────────────────────────────────────

const DIETARY_FILTERS = {
  vegetarian: (food: any) => {
    const type = (food.food_type || "").toLowerCase();
    const kingdom = (food.kingdom || "").toLowerCase();
    // Allow everything except meat/fish
    return kingdom !== "animalia" || type === "dairy" || type === "egg";
  },
  vegan: (food: any) => {
    const kingdom = (food.kingdom || "").toLowerCase();
    return kingdom !== "animalia";
  },
  pescatarian: (food: any) => {
    const type = (food.food_type || "").toLowerCase();
    const kingdom = (food.kingdom || "").toLowerCase();
    return kingdom !== "animalia" || type === "fish" || type === "seafood" || type === "dairy" || type === "egg";
  },
  plant_only: (food: any) => {
    const kingdom = (food.kingdom || "").toLowerCase();
    return kingdom === "plantae";
  },
};

// ─── Public API ────────────────────────────────────────────────

/**
 * Find nutritionally similar substitutes for a given food.
 *

 * @param {string} params.food - Source food name


 * @returns {object} Ranked substitutes with similarity scores
 */
export function findFoodSubstitutes({
  food,
  targetNutrients,
  dietaryPreference,
  excludeKingdom,
  excludeFoods,
  limit = 10,
}: any) {
  if (!food) {
    return { error: "'food' parameter is required (e.g. 'salmon', 'beef', 'tofu')" };
  }

  const allFoods = ensureFoodCache();

  // ── Find the source food ─────────────────────────────────────
  const normalized = normalizeSearch(food);
  let sourceFood = allFoods.find(
    (f: any) => normalizeSearch(f.food_name || "") === normalized,
  );

  if (!sourceFood) {
    // Fuzzy fallback
    const searchResult = searchFoods(food, { limit: 1 });
    if (!searchResult.foods || searchResult.foods.length === 0) {
      return { error: `Food not found: "${food}"` };
    }
    const matchedName = normalizeSearch(searchResult.foods[0].name);
    sourceFood = allFoods.find(
      (f: any) => normalizeSearch(f.food_name || "") === matchedName,
    );
    if (!sourceFood) {
      return { error: `Food matched but not in vector DB: "${food}"` };
    }
  }

  // ── Determine comparison columns ──────────────────────────────
  const columns = ALL_NUTRIENT_COLUMNS;
  let emphasizedColumns: any = null;

  if (targetNutrients) {
    const targets = targetNutrients
      .split(",")
      .map((t: any) => t.trim().toLowerCase().replace(/[\s-]+/g, "_"))
      .filter(Boolean);

    // Match target nutrient names to columns
    const matched: any[] = [];
    for (const target of targets) {
      const col = ALL_NUTRIENT_COLUMNS.find(
        (c: any) => c === target || c.includes(target),
      );
      if (col) matched.push(col);
    }

    if (matched.length > 0) {
      emphasizedColumns = matched;
    }
  }

  // ── Extract source vector ────────────────────────────────────
  const sourceVector = extractVector(sourceFood, columns);

  // ── Filter candidates ────────────────────────────────────────
  let candidates = allFoods.filter(
    (f: any) => f !== sourceFood,
  );

  // Dietary preference filter
  if (dietaryPreference) {
    // @ts-expect-error - TS7053: implicit any index
    const filterFn = DIETARY_FILTERS[dietaryPreference.toLowerCase().replace(/[\s-]+/g, "_")];
    if (filterFn) {
      candidates = candidates.filter(filterFn);
    }
  }

  // Kingdom exclusion
  if (excludeKingdom) {
    const exc = excludeKingdom.toLowerCase();
    candidates = candidates.filter(
      (f: any) => (f.kingdom || "").toLowerCase() !== exc,
    );
  }

  // Food name exclusion
  if (excludeFoods) {
    const excluded = excludeFoods
      .split(",")
      .map((e: any) => normalizeSearch(e.trim()))
      .filter(Boolean);
    candidates = candidates.filter(
      (f: any) => !excluded.some((e: any) => normalizeSearch(f.food_name || "").includes(e)),
    );
  }

  // ── Score all candidates ─────────────────────────────────────
  const scored = candidates.map((candidate: any) => {
    const candidateVector = extractVector(candidate, columns);

    // Full profile similarity
    let similarity = cosineSimilarity(sourceVector, candidateVector);

    // If emphasized nutrients exist, compute a weighted bonus
    if (emphasizedColumns) {
      const srcEmph = extractVector(sourceFood, emphasizedColumns);
      const candEmph = extractVector(candidate, emphasizedColumns);
      const emphSimilarity = cosineSimilarity(srcEmph, candEmph);
      // 60% emphasis on targeted nutrients, 40% overall profile
      similarity = 0.4 * similarity + 0.6 * emphSimilarity;
    }

    return { food: candidate, similarity };
  });

  // ── Sort and slice ───────────────────────────────────────────
  scored.sort((a: any, b: any) => b.similarity - a.similarity);
  const topResults = scored.slice(0, limit);

  // ── Format output ────────────────────────────────────────────
  const sourceNutrients = formatKeyNutrients(sourceFood);

  return {
    sourceFood: {
      name: sourceFood.food_name,
      kingdom: sourceFood.kingdom,
      foodType: sourceFood.food_type,
      nutrients: sourceNutrients,
    },
    filters: {
      dietaryPreference: dietaryPreference || null,
      excludeKingdom: excludeKingdom || null,
      emphasizedNutrients: emphasizedColumns || null,
    },
    count: topResults.length,
    candidatesEvaluated: candidates.length,
    substitutes: topResults.map((r: any) => ({
      name: r.food.food_name,
      kingdom: r.food.kingdom,
      foodType: r.food.food_type,
      source: r.food._source || "USDA",
      similarity: Number((r.similarity * 100).toFixed(1)),
      nutrients: formatKeyNutrients(r.food),
    })),
    _note: "Similarity score (0–100%) based on cosine similarity of nutrient profile vectors. All values per 100g.",
  };
}

// ─── Key Nutrient Formatter ────────────────────────────────────

function formatKeyNutrients(food: any) {
  return {
    calories: food.kilocalories,
    protein_g: food.protein,
    fat_g: food.lipid,
    carbs_g: food.carbohydrate,
    fiber_g: food.fiber,
    calcium_mg: food.calcium,
    iron_mg: food.iron,
    potassium_mg: food.potassium,
    vitaminC_mg: food.ascorbic_acid,
    vitaminA_mcg: food.vitamin_a_rae,
    omega3_DHA_g: food.c22_d6_n3_dha,
  };
}

/**
 * Return available dietary preference filters.
 */
export function getDietaryPreferences() {
  return {
    preferences: Object.keys(DIETARY_FILTERS).map((k: any) => ({
      key: k,
      description: `Filter for ${k.replace(/_/g, " ")} diet`,
    })),
  };
}
