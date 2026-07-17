/**
 * Nutrient Gap Fetcher — Dietary Adequacy Assessment Engine
 *
 * Compares actual nutrient intake (from food log) against
 * authoritative requirements (DRI/AAFCO) to produce a
 * per-nutrient deficiency/surplus analysis.
 *
 * Bridges NutritionFetcher (food data) and NutritionRequirementFetcher
 * (target profiles) into a single gap analysis output.
 *
 * References:
 *   - IOM Dietary Reference Intakes (2006)
 *   - AAFCO Dog & Cat Food Nutrient Profiles (2023)
 */

import { searchFoods } from "./NutritionFetcher.ts";
import {
  calculateTargetProfile,
  TargetProfileResult,
} from "./NutritionRequirementFetcher.ts";
import {
  NUTRITION_MACRO_FIELDS,
  NUTRITION_MINERAL_FIELDS,
  NUTRITION_VITAMIN_FIELDS,
  NUTRITION_AMINO_ACID_FIELDS,
  NUTRITION_LIPID_FIELDS,
  NUTRITION_STEROL_FIELDS,
} from "../../constants.ts";

// ─── Mapping: requirement nutrient_id → food CSV column ────────

const REQUIREMENT_TO_FOOD_COLUMN = {
  // Direct matches (most nutrients share the same ID)
  protein: "protein",
  carbohydrate: "carbohydrate",
  lipid: "lipid",
  fiber: "fiber",
  water: "water",
  // Vitamins
  vitamin_a: "vitamin_a_rae",
  vitamin_c: "ascorbic_acid",
  vitamin_d: "vitamin_d",
  alpha_tocopherol: "alpha_tocopherol",
  phylloquinone: "phylloquinone",
  thiamin: "thiamin",
  riboflavin: "riboflavin",
  niacin: "niacin",
  vitamin_b5: "pantothenic_acid",
  vitamin_b6: "vitamin_b6",
  folate: "folate_total",
  cyanocobalamin: "cyanocobalamin",
  choline: "choline",
  // Minerals
  calcium: "calcium",
  phosphorus: "phosphorus",
  magnesium: "magnesium",
  sodium: "sodium",
  potassium: "potassium",
  iron: "iron",
  zinc: "zinc",
  copper: "copper",
  selenium: "selenium",
  iodine: "iodine",
  manganese: "manganese",
  fluoride: "fluoride",
  // Amino acids
  histidine: "histidine",
  isoleucine: "isoleucine",
  leucine: "leucine",
  lysine: "lysine",
  methionine: "methionine",
  phenylalanine: "phenylalanine",
  threonine: "threonine",
  tryptophan: "tryptophan",
  valine: "valine",
  cystine: "cystine",
  tyrosine: "tyrosine",
  arginine: "arginine",
  taurine: "taurine",
  // Lipids
  c18_d2_n6_cis_cis: "c18_d2_n6_cis_cis",
  c18_d3_n3_cis_cis_cis: "c18_d3_n3_cis_cis_cis",
  c20_d5_n3: "c20_d5_n3",
  c22_d6_n3: "c22_d6_n3_dha",
  c20_d4_n6: "c20_d4_undifferentiated",
  // Sterols
  cholesterol: "cholesterol",
  phytosterol: "phytosterol",
  // Other
  sugar: "sugar",
  caffeine: "caffeine",
  theobromine: "theobromine",
};

// ─── Unit Normalization ────────────────────────────────────────
// Requirements may be in different units than food data.
// Food data is always per 100g. We need to know what units
// the food DB uses for each nutrient.

const FOOD_COLUMN_UNITS: Record<string, string> = {};

// Build from all field maps
for (const [columnKey, label] of Object.entries(NUTRITION_MACRO_FIELDS)) {
  FOOD_COLUMN_UNITS[columnKey] = label.endsWith("_g")
    ? "g"
    : label.endsWith("_kcal")
      ? "kcal"
      : label.endsWith("_kj")
        ? "kj"
        : "g";
}
for (const [columnKey, label] of Object.entries(NUTRITION_MINERAL_FIELDS)) {
  FOOD_COLUMN_UNITS[columnKey] = label.endsWith("_mcg") ? "mcg" : "mg";
}
for (const [columnKey, label] of Object.entries(NUTRITION_VITAMIN_FIELDS)) {
  FOOD_COLUMN_UNITS[columnKey] = label.endsWith("_mcg")
    ? "mcg"
    : label.endsWith("_IU")
      ? "IU"
      : "mg";
}
for (const [columnKey] of Object.entries(NUTRITION_AMINO_ACID_FIELDS)) {
  FOOD_COLUMN_UNITS[columnKey] = "g";
}
for (const [columnKey] of Object.entries(NUTRITION_LIPID_FIELDS)) {
  FOOD_COLUMN_UNITS[columnKey] = "g";
}
for (const [columnKey] of Object.entries(NUTRITION_STEROL_FIELDS)) {
  FOOD_COLUMN_UNITS[columnKey] = "mg";
}

// ─── Unit Conversion Helpers ───────────────────────────────────

function convertToTarget(
  value: number,
  fromUnit: string,
  toUnit: string,
): number {
  if (fromUnit === toUnit) return value;

  const normalized = `${fromUnit}→${toUnit}`;
  switch (normalized) {
    case "g→mg":
      return value * 1000;
    case "mg→g":
      return value / 1000;
    case "g→mcg":
      return value * 1_000_000;
    case "mcg→g":
      return value / 1_000_000;
    case "mg→mcg":
      return value * 1000;
    case "mcg→mg":
      return value / 1000;
    default:
      return value; // can't convert, pass through
  }
}

// ─── Status Classification ─────────────────────────────────────

function classifyStatus(
  percentageDRI: number | null,
  hasUL: boolean,
  percentageUL: number | null,
): string {
  if (percentageDRI === null) return "no_data";
  if (hasUL && percentageUL !== null && percentageUL > 100) return "over_UL";
  if (percentageDRI >= 90 && percentageDRI <= 110) return "adequate";
  if (percentageDRI >= 110) return "surplus";
  if (percentageDRI >= 50) return "low";
  return "deficient";
}

function statusEmoji(status: string): string {
  switch (status) {
    case "deficient":
      return "🔴";
    case "low":
      return "🟡";
    case "adequate":
      return "🟢";
    case "surplus":
      return "🔵";
    case "over_UL":
      return "⛔";
    case "no_data":
      return "⚪";
    default:
      return "❓";
  }
}

// ─── Public API ────────────────────────────────────────────────

export interface FoodSearchResult {
  name: string;
  description: string;
  source: string;
  region: string | null;
  kingdom: string | null;
  foodType: string;
  foodSubtype: string | null;
  part: string | null;
  form: string | null;
  state: string | null;
  taxonomy: Record<string, string | null>;
  perHundredGrams: {
    macros?: Record<string, number>;
    minerals?: Record<string, number>;
    vitamins?: Record<string, number>;
    aminoAcids?: Record<string, number>;
    lipidProfile?: Record<string, number>;
    sterols?: Record<string, number>;
    [key: string]: Record<string, number> | undefined;
  };
}

export interface ResolvedFood {
  query: string;
  matched: string;
  grams: number;
  food: FoodSearchResult;
}

export interface FoodLogInputItem {
  name: string;
  grams: number;
}

export interface AnalyzeNutrientGapsOptions {
  foods: FoodLogInputItem[];
  species?: string;
  lifeStage?: string;
  authority?: string;
  weightKg?: number;
  caloricIntake?: number;
}

export interface NutrientGapItem {
  nutrient: string;
  status: string;
  icon: string;
  consumed: number;
  target: number;
  unit: string;
  percentageDRI: number | null;
  percentageUL: number | null;
  metric: string;
}

export interface AnalyzeNutrientGapsResult {
  error?: string;
  unresolvedFoods?: string[];
  _context?: TargetProfileResult["_context"];
  summary?: {
    foodsAnalyzed: number;
    unresolvedFoods?: string[];
    nutrientsEvaluated: number;
    totalCalories: number;
    deficient: number;
    low: number;
    adequate: number;
    surplus: number;
    overUL: number;
    overallScore: number;
  };
  foodLog?: {
    query: string;
    matched: string;
    grams: number;
  }[];
  gaps?: NutrientGapItem[];
  _note?: string;
}

/**
 * Analyze nutrient gaps between consumed foods and requirements.
 */
export function analyzeNutrientGaps({
  foods,
  species = "human",
  lifeStage, // species-aware default applied by calculateTargetProfile
  authority,
  weightKg,
  caloricIntake,
}: AnalyzeNutrientGapsOptions): AnalyzeNutrientGapsResult {
  // ── Validate ─────────────────────────────────────────────────
  if (!foods || !Array.isArray(foods) || foods.length === 0) {
    return {
      error:
        "Parameter 'foods' is required — provide an array of {name, grams} objects. Example: [{name: 'chicken breast', grams: 200}, {name: 'brown rice', grams: 150}]",
    };
  }

  for (const item of foods) {
    if (!item.name || !item.grams || item.grams <= 0) {
      return {
        error: `Invalid food entry: ${JSON.stringify(item)}. Each food must have 'name' (string) and 'grams' (positive number).`,
      };
    }
  }

  // ── Resolve foods from the database ──────────────────────────
  const resolvedFoods: ResolvedFood[] = [];
  const unresolvedFoods: string[] = [];

  for (const { name, grams } of foods) {
    const result = searchFoods(name, { limit: 1 });
    if ("foods" in result && result.foods.length > 0) {
      resolvedFoods.push({
        query: name,
        matched: result.foods[0].name,
        grams,
        food: result.foods[0],
      });
    } else {
      unresolvedFoods.push(name);
    }
  }

  if (resolvedFoods.length === 0) {
    return {
      error: "No foods could be matched in the database.",
      unresolvedFoods,
    };
  }

  // ── Aggregate consumed nutrients ─────────────────────────────
  // Food data is per 100g, scale by (grams / 100)
  const consumed: Record<string, number> = {};

  for (const { grams, food } of resolvedFoods) {
    const scale = grams / 100;
    const allNutrients = {
      ...(food.perHundredGrams.macros || {}),
      ...(food.perHundredGrams.minerals || {}),
      ...(food.perHundredGrams.vitamins || {}),
      ...(food.perHundredGrams.aminoAcids || {}),
      ...(food.perHundredGrams.lipidProfile || {}),
      ...(food.perHundredGrams.sterols || {}),
    };

    for (const [label, value] of Object.entries(allNutrients)) {
      if (value !== null && value !== undefined && typeof value === "number") {
        consumed[label] = (consumed[label] || 0) + value * scale;
      }
    }
  }

  // ── Get requirements ─────────────────────────────────────────
  const requirements = calculateTargetProfile({
    species,
    lifeStage,
    authority,
    weightKg,
    caloricIntake,
    includeCompositional: false,
  });

  if ("error" in requirements && requirements.error) {
    return { error: `Requirement calculation failed: ${requirements.error}` };
  }

  const typedRequirements = requirements as TargetProfileResult;

  // ── Build reverse label→column map for matching ──────────────
  const ALL_FIELD_MAPS: Record<string, string> = {
    ...NUTRITION_MACRO_FIELDS,
    ...NUTRITION_MINERAL_FIELDS,
    ...NUTRITION_VITAMIN_FIELDS,
    ...NUTRITION_AMINO_ACID_FIELDS,
    ...NUTRITION_LIPID_FIELDS,
    ...NUTRITION_STEROL_FIELDS,
  };

  const labelToColumn: Record<string, string> = {};
  for (const [columnKey, label] of Object.entries(ALL_FIELD_MAPS)) {
    labelToColumn[label] = columnKey;
  }

  // ── Gap analysis per nutrient ────────────────────────────────
  const gaps: NutrientGapItem[] = [];
  const { requirements: requestMap } = typedRequirements;

  for (const [nutrientId, metrics] of Object.entries(requestMap)) {
    // Find the food column for this requirement nutrient
    const foodColumn =
      REQUIREMENT_TO_FOOD_COLUMN[
        nutrientId as keyof typeof REQUIREMENT_TO_FOOD_COLUMN
      ];
    if (!foodColumn) continue;

    // Find the label used in consumed data
    const label = ALL_FIELD_MAPS[foodColumn];
    if (!label) continue;

    const consumedValue = consumed[label] || 0;
    const foodUnit = FOOD_COLUMN_UNITS[foodColumn] || "unknown";

    // Find target value (use RDA > AI > MIN > RDA_multiplier_per_kg)
    let targetValue: number | null = null;
    let targetMetric: string | null = null;
    let targetUnit: string | null = null;
    let ulValue: number | null = null;

    for (const [metric, data] of Object.entries(metrics)) {
      if (metric === "NO_DRI") continue;

      const metricLower = metric.toLowerCase();
      if (metricLower === "ul") {
        ulValue = data.value;
        continue;
      }
      if (metricLower.includes("max")) continue;
      if (metricLower.includes("guideline_max")) continue;

      // Priority: RDA > RDA_multiplier_per_kg > AI > MIN_per_1000kcal > RECOMMENDATION
      if (!targetValue || priorityOf(metric) > priorityOf(targetMetric)) {
        targetValue = data.value;
        targetMetric = metric;
        targetUnit = data.unit;
      }
    }

    if (targetValue === null || targetValue === 0) continue;

    // Convert consumed value to match target unit if needed
    let consumedConverted = consumedValue;

    // Extract just the base unit from target (e.g. "mg" from "mg", "mcg RAE" → "mcg")
    const targetBaseUnit = (targetUnit || "").split(/\s/)[0].toLowerCase();
    const foodBaseUnit = foodUnit.toLowerCase();

    if (targetBaseUnit && foodBaseUnit && targetBaseUnit !== foodBaseUnit) {
      consumedConverted = convertToTarget(
        consumedValue,
        foodBaseUnit,
        targetBaseUnit,
      );
    }

    const percentageDRI =
      targetValue > 0
        ? Number(((consumedConverted / targetValue) * 100).toFixed(1))
        : null;
    const percentageUL = ulValue
      ? Number(((consumedConverted / ulValue) * 100).toFixed(1))
      : null;

    const status = classifyStatus(percentageDRI, !!ulValue, percentageUL);

    gaps.push({
      nutrient: nutrientId,
      status,
      icon: statusEmoji(status),
      consumed: Number(consumedConverted.toFixed(4)),
      target: targetValue,
      unit: targetUnit || "",
      percentageDRI,
      percentageUL: percentageUL || null,
      metric: targetMetric || "",
    });
  }

  // ── Sort: deficiencies first, then low, adequate, surplus, over_UL ──
  const statusOrder: Record<string, number> = {
    deficient: 0,
    low: 1,
    over_UL: 2,
    surplus: 3,
    adequate: 4,
    no_data: 5,
  };
  gaps.sort((firstItem, secondItem) => {
    const orderDiff =
      (statusOrder[firstItem.status] ?? 99) - (statusOrder[secondItem.status] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return (firstItem.percentageDRI || 0) - (secondItem.percentageDRI || 0);
  });

  // ── Summary ──────────────────────────────────────────────────
  const deficient = gaps.filter((g) => g.status === "deficient");
  const low = gaps.filter((g) => g.status === "low");
  const adequate = gaps.filter((g) => g.status === "adequate");
  const surplus = gaps.filter((g) => g.status === "surplus");
  const overUL = gaps.filter((g) => g.status === "over_UL");

  const totalCalories = consumed["calories_kcal"] || consumed["calories"] || 0;

  return {
    _context: typedRequirements._context,
    summary: {
      foodsAnalyzed: resolvedFoods.length,
      unresolvedFoods: unresolvedFoods.length > 0 ? unresolvedFoods : undefined,
      nutrientsEvaluated: gaps.length,
      totalCalories: Math.round(totalCalories),
      deficient: deficient.length,
      low: low.length,
      adequate: adequate.length,
      surplus: surplus.length,
      overUL: overUL.length,
      overallScore:
        gaps.length > 0
          ? Number(
              (
                (gaps.filter(
                  (g) => g.status === "adequate" || g.status === "surplus",
                ).length /
                  gaps.length) *
                100
              ).toFixed(1),
            )
          : 0,
    },
    foodLog: resolvedFoods.map((food) => ({
      query: food.query,
      matched: food.matched,
      grams: food.grams,
    })),
    gaps,
    _note:
      "Status: 🔴 deficient (<50% DRI), 🟡 low (50-89% DRI), 🟢 adequate (90-110% DRI), 🔵 surplus (>110% DRI), ⛔ over_UL (exceeds tolerable upper limit).",
  };
}

// ─── Metric Priority Helper ───────────────────────────────────

function priorityOf(metric: string | null): number {
  if (!metric) return -1;
  const normalizedMetric = metric.toLowerCase();
  if (normalizedMetric === "rda") return 10;
  if (normalizedMetric === "rda_multiplier_per_kg") return 9;
  if (normalizedMetric === "ai") return 8;
  if (normalizedMetric.includes("min_per_1000kcal")) return 7;
  if (normalizedMetric === "recommendation") return 6;
  if (normalizedMetric === "guideline") return 5;
  return 0;
}
