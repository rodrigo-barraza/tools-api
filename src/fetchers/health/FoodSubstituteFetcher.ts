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
import { DIET_FILTER_KEYS, resolveDietFilter } from "./dietFilters.ts";
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
import { FoodItem } from "../../types/health.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let FOOD_CACHE: FoodItem[] | null = null;

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') {
      inQuotes = !inQuotes;
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

export function ensureFoodCache(): FoodItem[] {
  if (FOOD_CACHE) return FOOD_CACHE;

  const dataDir = join(__dirname, "data");
  const files = readdirSync(dataDir).filter(
    (value: string) => value.startsWith("digest_food") && value.endsWith(".csv"),
  );

  const foods: FoodItem[] = [];
  for (const file of files) {
    const raw = readFileSync(join(dataDir, file), "utf-8");
    const lines = raw.split("\n").filter((l: string) => l.trim());
    const headers = parseCSVLine(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < 40) continue;

      const row: Record<string, string | number | null> = {};
      headers.forEach((h: string, index: number) => {
        row[h] = values[index] || "";
      });

      const numericStart = 35;
      for (
        let nutrientIndex = numericStart;
        nutrientIndex < headers.length;
        nutrientIndex++
      ) {
        const rawValue = row[headers[nutrientIndex]];
        const value = typeof rawValue === "string" ? parseFloat(rawValue) : NaN;
        row[headers[nutrientIndex]] = isNaN(value) ? null : value;
      }
      foods.push(row as FoodItem);
    }
  }

  FOOD_CACHE = foods;
  return foods;
}

// ─── Nutrient Columns for Vector Comparison ────────────────────

const ALL_NUTRIENT_COLUMNS = [
  ...Object.keys(NUTRITION_MACRO_FIELDS).filter(
    (k: string) =>
      !["kilocalories", "kilojoules", "water", "mineral", "ethanol"].includes(
        k,
      ),
  ),
  ...Object.keys(NUTRITION_MINERAL_FIELDS),
  ...Object.keys(NUTRITION_VITAMIN_FIELDS),
  ...Object.keys(NUTRITION_AMINO_ACID_FIELDS),
  ...Object.keys(NUTRITION_LIPID_FIELDS),
];

// ─── Vector Helpers ────────────────────────────────────────────

function extractVector(food: FoodItem, columns: string[]): number[] {
  return columns.map((column: string) => {
    const value = food[column];
    return value !== null &&
      value !== undefined &&
      typeof value === "number" &&
      !isNaN(value)
      ? value
      : 0;
  });
}

function cosineSimilarity(agent: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < agent.length; i++) {
    dot += agent[i] * b[i];
    magA += agent[i] * agent[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function normalizeSearch(searchText: string): string {
  return searchText.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}


export interface FindSubstitutesOptions {
  food: string;
  targetNutrients?: string;
  dietaryPreference?: string;
  excludeKingdom?: string;
  excludeFoods?: string;
  limit?: number;
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Find nutritionally similar substitutes for a given food.
 */
export function findFoodSubstitutes({
  food,
  targetNutrients,
  dietaryPreference,
  excludeKingdom,
  excludeFoods,
  limit = 10,
}: FindSubstitutesOptions) {
  if (!food) {
    return {
      error: "'food' parameter is required (e.g. 'salmon', 'beef', 'tofu')",
    };
  }

  const allFoods = ensureFoodCache();

  // ── Find the source food ─────────────────────────────────────
  const normalized = normalizeSearch(food);
  let sourceFood = allFoods.find(
    (foodItem: FoodItem) => normalizeSearch(foodItem.food_name || "") === normalized,
  );

  if (!sourceFood) {
    // Fuzzy fallback
    const searchResult = searchFoods(food, { limit: 1 });
    if (!("foods" in searchResult) || searchResult.foods.length === 0) {
      return { error: `Food not found: "${food}"` };
    }
    const matchedName = normalizeSearch(searchResult.foods[0].name);
    sourceFood = allFoods.find(
      (foodItem: FoodItem) => normalizeSearch(foodItem.food_name || "") === matchedName,
    );
    if (!sourceFood) {
      return { error: `Food matched but not in vector DB: "${food}"` };
    }
  }

  // ── Determine comparison columns ──────────────────────────────
  const columns = ALL_NUTRIENT_COLUMNS;
  let emphasizedColumns: string[] | null = null;

  if (targetNutrients) {
    const targets = targetNutrients
      .split(",")
      .map((tool: string) =>
        tool
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_"),
      )
      .filter(Boolean);

    // Match target nutrient names to columns
    const matched: string[] = [];
    for (const target of targets) {
      const collection = ALL_NUTRIENT_COLUMNS.find(
        (client: string) => client === target || client.includes(target),
      );
      if (collection) matched.push(collection);
    }

    if (matched.length > 0) {
      emphasizedColumns = matched;
    }
  }

  // ── Extract source vector ────────────────────────────────────
  const sourceVector = extractVector(sourceFood, columns);

  // ── Filter candidates ────────────────────────────────────────
  let candidates = allFoods.filter((foodItem: FoodItem) => foodItem !== sourceFood);

  // Dietary preference filter
  if (dietaryPreference) {
    const resolvedDiet = resolveDietFilter(dietaryPreference);
    if (!resolvedDiet) {
      return {
        error: `Unknown dietaryPreference: "${dietaryPreference}"`,
        validPreferences: DIET_FILTER_KEYS,
      };
    }
    candidates = candidates.filter(resolvedDiet.filter);
  }

  // Kingdom exclusion
  if (excludeKingdom) {
    const exc = excludeKingdom.toLowerCase();
    candidates = candidates.filter(
      (foodItem: FoodItem) => (foodItem.kingdom || "").toLowerCase() !== exc,
    );
  }

  // Food name exclusion
  if (excludeFoods) {
    const excluded = excludeFoods
      .split(",")
      .map((excludedFood: string) => normalizeSearch(excludedFood.trim()))
      .filter(Boolean);
    candidates = candidates.filter(
      (foodItem: FoodItem) =>
        !excluded.some((excludedFood: string) =>
          normalizeSearch(foodItem.food_name || "").includes(excludedFood),
        ),
    );
  }

  // ── Score all candidates ─────────────────────────────────────
  const scored = candidates.map((candidate: FoodItem) => {
    const candidateVector = extractVector(candidate, columns);

    // Full profile similarity
    let similarity = cosineSimilarity(sourceVector, candidateVector);

    // If emphasized nutrients exist, compute a weighted bonus
    if (emphasizedColumns) {
      const sourceEmph = extractVector(sourceFood!, emphasizedColumns);
      const candEmph = extractVector(candidate, emphasizedColumns);
      const emphSimilarity = cosineSimilarity(sourceEmph, candEmph);
      // 60% emphasis on targeted nutrients, 40% overall profile
      similarity = 0.4 * similarity + 0.6 * emphSimilarity;
    }

    return { food: candidate, similarity };
  });

  // ── Sort and slice ───────────────────────────────────────────
  scored.sort((agent, b) => b.similarity - agent.similarity);
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
    substitutes: topResults.map((r) => ({
      name: r.food.food_name,
      kingdom: r.food.kingdom,
      foodType: r.food.food_type,
      source: r.food._source || "USDA",
      similarity: Number((r.similarity * 100).toFixed(1)),
      nutrients: formatKeyNutrients(r.food),
    })),
    _note:
      "Similarity score (0–100%) based on cosine similarity of nutrient profile vectors. All values per 100g.",
  };
}

// ─── Key Nutrient Formatter ────────────────────────────────────

function formatKeyNutrients(food: FoodItem) {
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
    preferences: DIET_FILTER_KEYS.map((k: string) => ({
      key: k,
      description: `Filter for ${k.replace(/_/g, " ")} diet`,
    })),
  };
}
