/**
 * Meal Plan Fetcher — Automated Meal Composition Engine
 *
 * Greedy nutrient-coverage optimizer that selects food combinations
 * to maximize coverage of nutritional targets within a caloric budget.
 * Supports dietary preferences and nutrient emphasis.
 *
 * Algorithm: Iterative greedy selection with category diversification.
 * Each step selects the food that maxizes the "gap score improvement"
 * (i.e. covers the most remaining deficiencies) while staying within
 * protein/carb/fat targets per meal.
 */

import { calculateTargetProfile } from "./NutritionRequirementFetcher.ts";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { FoodItem } from "../../types/health.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Load Food DB (same as FoodSubstituteFetcher) ──────────────

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

function ensureFoodCache(): FoodItem[] {
  if (FOOD_CACHE) return FOOD_CACHE;

  const dataDir = join(__dirname, "data");
  const files = readdirSync(dataDir).filter(
    (f: string) => f.startsWith("digest_food") && f.endsWith(".csv"),
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
      for (let n = numericStart; n < headers.length; n++) {
        const rawVal = row[headers[n]];
        const value = typeof rawVal === "string" ? parseFloat(rawVal) : NaN;
        row[headers[n]] = isNaN(value) ? null : value;
      }
      foods.push(row as unknown as FoodItem);
    }
  }

  FOOD_CACHE = foods;
  return foods;
}

// ─── Dietary Preference Filters ────────────────────────────────

const DIET_FILTERS: Record<string, (f: FoodItem) => boolean> = {
  omnivore: () => true,
  vegetarian: (f: FoodItem) => {
    const k = (f.kingdom || "").toLowerCase();
    const t = (f.food_type || "").toLowerCase();
    return k !== "animalia" || t === "dairy" || t === "egg";
  },
  vegan: (f: FoodItem) => (f.kingdom || "").toLowerCase() !== "animalia",
  pescatarian: (f: FoodItem) => {
    const k = (f.kingdom || "").toLowerCase();
    const t = (f.food_type || "").toLowerCase();
    return k !== "animalia" || ["fish", "seafood", "dairy", "egg"].includes(t);
  },
  keto: (f: FoodItem) => {
    // Low carb: prefer foods with <10g carbs per 100g
    const carbs = f.carbohydrate || 0;
    return typeof carbs === "number" && carbs < 10;
  },
};

// ─── Key Nutrients for Score ───────────────────────────────────

const SCORING_NUTRIENTS = [
  "protein", "lipid", "carbohydrate", "fiber",
  "calcium", "iron", "magnesium", "potassium", "zinc",
  "ascorbic_acid", "vitamin_b6", "folate_total", "cyanocobalamin",
  "vitamin_a_rae", "vitamin_d", "alpha_tocopherol",
  "thiamin", "riboflavin", "niacin",
];

// ─── Scoring Functions ─────────────────────────────────────────

function computeGapScore(remainingGaps: Record<string, number>, food: FoodItem, portionScale: number): number {
  let score = 0;
  for (const nutrient of SCORING_NUTRIENTS) {
    const remaining = remainingGaps[nutrient] || 0;
    if (remaining <= 0) continue;

    const rawVal = food[nutrient];
    const valueNum = typeof rawVal === "number" ? rawVal : 0;
    const provided = valueNum * portionScale;
    const covered = Math.min(provided, remaining);
    score += covered / remaining; // % of gap filled
  }
  return score;
}

function normalizeSearch(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

// ─── Public API ────────────────────────────────────────────────

export interface MealItem {
  name: string;
  kingdom?: string;
  foodType?: string;
  portionGrams: number;
  calories: number;
  macros: {
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
  };
}

export interface Meal {
  meal: number;
  label: string;
  totalCalories: number;
  items: MealItem[];
}

export interface NutrientCoverageDetail {
  consumed: number;
  target: number;
  pctCovered: number;
  status: "✅" | "⚠️" | "❌";
}

export interface BuildMealPlanOptions {
  caloricTarget: number;
  mealsPerDay?: number;
  dietaryPreference?: string;
  excludeFoods?: string;
  emphasizeNutrients?: string;
  species?: string;
  lifeStage?: string;
  weightKg?: number;
  itemsPerMeal?: number;
}

/**
 * Generate a meal plan that covers nutritional targets.
 */
export function buildMealPlan({
  caloricTarget,
  mealsPerDay = 3,
  dietaryPreference = "omnivore",
  excludeFoods,
  emphasizeNutrients,
  species = "human",
  lifeStage = "adult_male",
  weightKg,
  itemsPerMeal = 4,
}: BuildMealPlanOptions) {
  // ── Validate ─────────────────────────────────────────────────
  if (!caloricTarget || caloricTarget <= 0) {
    return { error: "'caloricTarget' is required (e.g. 2000 for 2000 kcal/day)" };
  }
  if (mealsPerDay < 1 || mealsPerDay > 8) {
    return { error: "'mealsPerDay' must be between 1 and 8" };
  }

  const allFoods = ensureFoodCache();

  // ── Get nutritional requirements ─────────────────────────────
  const requirements = calculateTargetProfile({
    species,
    lifeStage,
    weightKg,
    caloricIntake: caloricTarget,
  });

  if ("error" in requirements) {
    return { error: `Requirement calculation failed: ${requirements.error}` };
  }

  // ── Set up nutrient targets ──────────────────────────────────
  const targets: Record<string, number> = {};
  for (const nutrient of SCORING_NUTRIENTS) {
    if (requirements.requirements && requirements.requirements[nutrient]) {
      const metrics = requirements.requirements[nutrient];
      // Get the primary target value
      for (const [metric, data] of Object.entries(metrics)) {
        if (metric !== "UL" && metric !== "NO_DRI" && !metric.includes("MAX")) {
          targets[nutrient] = data.value;
          break;
        }
      }
    }
  }

  // Macro targets from caloric budget (30/40/30 split by default)
  const caloriesPerMeal = caloricTarget / mealsPerDay;
  const macroTargets = {
    protein: (caloricTarget * 0.30) / 4, // 30% protein, 4 kcal/g
    carbohydrate: (caloricTarget * 0.40) / 4, // 40% carbs
    lipid: (caloricTarget * 0.30) / 9, // 30% fat, 9 kcal/g
  };

  // Merge macro targets
  for (const [key, value] of Object.entries(macroTargets)) {
    targets[key] = value;
  }

  // ── Apply filters ────────────────────────────────────────────
  const dietKey = (dietaryPreference || "omnivore").toLowerCase().replace(/[\s-]+/g, "_");
  const dietFilter = DIET_FILTERS[dietKey] || DIET_FILTERS.omnivore;

  let candidates = allFoods.filter(dietFilter);

  // Filter out excluded foods
  if (excludeFoods) {
    const excluded = excludeFoods
      .split(",")
      .map((e: string) => normalizeSearch(e.trim()))
      .filter(Boolean);
    candidates = candidates.filter(
      (f: FoodItem) => !excluded.some((e: string) => normalizeSearch(f.food_name || "").includes(e)),
    );
  }

  // Filter out zero-calorie foods
  candidates = candidates.filter(
    (f: FoodItem) => f.kilocalories && f.kilocalories > 10,
  );

  // ── Emphasized nutrients priority ────────────────────────────
  let emphasis: string[] | null = null;
  if (emphasizeNutrients) {
    emphasis = emphasizeNutrients
      .split(",")
      .map((n: string) => n.trim().toLowerCase().replace(/[\s-]+/g, "_"))
      .filter(Boolean);
  }

  // ── Greedy meal planning ─────────────────────────────────────
  const meals: Meal[] = [];
  const remainingGaps = { ...targets };
  const usedFoodNames = new Set<string>();

  for (let m = 0; m < mealsPerDay; m++) {
    const mealCalBudget = caloriesPerMeal;
    let mealCalUsed = 0;
    const mealItems: MealItem[] = [];

    for (let item = 0; item < itemsPerMeal; item++) {
      const remainingCal = mealCalBudget - mealCalUsed;
      if (remainingCal < 20) break;

      // Score each candidate
      let bestFood: FoodItem | null = null;
      let bestScore = -1;
      let bestPortion = 0;

      for (const food of candidates) {
        if (usedFoodNames.has(food.food_name)) continue;

        const cal = food.kilocalories || 100;
        // Portion: fill remaining calories, but max 300g per item
        const maxGrams = Math.min(300, (remainingCal / cal) * 100);
        if (maxGrams < 30) continue;

        // Target ~100-200g portions
        const portionGrams = Math.min(maxGrams, Math.max(50, 150));
        const portionScale = portionGrams / 100;

        let score = computeGapScore(remainingGaps, food, portionScale);

        // Bonus for emphasized nutrients
        if (emphasis) {
          for (const nutrient of emphasis) {
            const rawVal = food[nutrient];
            const value = typeof rawVal === "number" ? rawVal : 0;
            const portionVal = value * portionScale;
            if (portionVal > 0) score += portionVal * 2;
          }
        }

        // Diversity bonus: favor different food types
        if (mealItems.length > 0) {
          const lastType = mealItems[mealItems.length - 1].kingdom;
          if (food.kingdom !== lastType) score *= 1.2;
        }

        if (score > bestScore) {
          bestScore = score;
          bestFood = food;
          bestPortion = portionGrams;
        }
      }

      if (!bestFood) break;

      const portionScale = bestPortion / 100;
      const portionCalories = (bestFood.kilocalories || 0) * portionScale;

      const protVal = bestFood.protein;
      const carbVal = bestFood.carbohydrate;
      const lipVal = bestFood.lipid;
      const fibVal = bestFood.fiber;

      mealItems.push({
        name: bestFood.food_name,
        kingdom: bestFood.kingdom,
        foodType: bestFood.food_type,
        portionGrams: Math.round(bestPortion),
        calories: Math.round(portionCalories),
        macros: {
          protein_g: Number(((typeof protVal === "number" ? protVal : 0) * portionScale).toFixed(1)),
          carbs_g: Number(((typeof carbVal === "number" ? carbVal : 0) * portionScale).toFixed(1)),
          fat_g: Number(((typeof lipVal === "number" ? lipVal : 0) * portionScale).toFixed(1)),
          fiber_g: Number(((typeof fibVal === "number" ? fibVal : 0) * portionScale).toFixed(1)),
        },
      });

      // Update remaining gaps
      for (const nutrient of SCORING_NUTRIENTS) {
        if (remainingGaps[nutrient] && remainingGaps[nutrient] > 0) {
          const rawVal = bestFood[nutrient];
          const provided = (typeof rawVal === "number" ? rawVal : 0) * portionScale;
          remainingGaps[nutrient] = Math.max(0, remainingGaps[nutrient] - provided);
        }
      }

      mealCalUsed += portionCalories;
      usedFoodNames.add(bestFood.food_name);
    }

    meals.push({
      meal: m + 1,
      label: getMealLabel(m, mealsPerDay),
      totalCalories: Math.round(mealCalUsed),
      items: mealItems,
    });
  }

  // ── Coverage analysis ────────────────────────────────────────
  const coverage: Record<string, NutrientCoverageDetail> = {};
  for (const [nutrient, target] of Object.entries(targets)) {
    if (target <= 0) continue;
    const remaining = remainingGaps[nutrient] || 0;
    const consumed = target - remaining;
    const pct = (consumed / target) * 100;
    coverage[nutrient] = {
      consumed: Number(consumed.toFixed(2)),
      target: Number(target.toFixed(2)),
      pctCovered: Number(pct.toFixed(1)),
      status: pct >= 90 ? "✅" : pct >= 50 ? "⚠️" : "❌",
    };
  }

  const totalCal = meals.reduce((sum: number, ml: Meal) => sum + ml.totalCalories, 0);

  return {
    plan: {
      caloricTarget,
      caloricActual: totalCal,
      mealsPerDay,
      dietaryPreference: dietKey,
      itemsPerMeal,
    },
    meals,
    nutrientCoverage: coverage,
    _note: "Greedy optimizer — foods selected iteratively by largest gap-coverage improvement. All portions adjustable. Use analyze_nutrient_gaps for precise post-analysis.",
  };
}

// ─── Meal Label Helper ─────────────────────────────────────────

function getMealLabel(index: number, total: number) {
  if (total <= 3) {
    return ["Breakfast", "Lunch", "Dinner"][index] || `Meal ${index + 1}`;
  }
  if (total <= 5) {
    return ["Breakfast", "Snack", "Lunch", "Snack", "Dinner"][index] || `Meal ${index + 1}`;
  }
  return `Meal ${index + 1}`;
}
