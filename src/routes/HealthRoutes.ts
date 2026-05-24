import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { parseIntParam } from "@rodrigo-barraza/utilities-library";
import { Request, Response, Router } from "express";
import {
  searchDrugLabels,
  getDrugAdverseEvents,
  getDrugRecalls,
} from "../fetchers/health/OpenFdaFetcher.ts";
import {
  searchFoods,
  rankByNutrient,
  compareFoods,
  getNutrientTypes,
  getFoodCategories,
  getTopFoodsByCategory,
  listCategoryNutrients,
  searchByTaxonomy,
  getTaxonomyTree,
} from "../fetchers/health/NutritionFetcher.ts";
import { calculateTargetProfile } from "../fetchers/health/NutritionRequirementFetcher.ts";
import {
  searchDrugs,
  getDrugByNdc,
  getDosageForms,
  searchByIngredient,
  searchByPharmClass,
} from "../fetchers/health/FdaDrugFetcher.ts";
import {
  searchExercises,
  getExerciseById,
  getExerciseCategories,
} from "../fetchers/health/ExercisesFetcher.ts";
import {
  calculateCaloricNeeds,
  getCaloricNeedsOptions,
} from "../fetchers/health/CalorieCalculatorFetcher.ts";
import { analyzeNutrientGaps } from "../fetchers/health/NutrientGapFetcher.ts";
import type { FoodLogInputItem } from "../fetchers/health/NutrientGapFetcher.ts";
import {
  findFoodSubstitutes,
  getDietaryPreferences,
} from "../fetchers/health/FoodSubstituteFetcher.ts";
import {
  estimateExerciseCalories,
  getMetCategories,
} from "../fetchers/health/ExerciseCalorieFetcher.ts";
import { calculateHydrationNeeds } from "../fetchers/health/HydrationFetcher.ts";
import { buildMealPlan } from "../fetchers/health/MealPlanFetcher.ts";
import {
  checkDrugNutrientInteractions,
  getDrugInteractionCategories,
} from "../fetchers/health/DrugNutrientFetcher.ts";
const router = Router();
// ─── USDA Nutrition (raw whole foods — in-memory database) ────
router.get("/nutrition/search", (req: Request, res: Response) => {
  const { q, limit, kingdom, foodType, nutrientTypes } = req.query as Record<string, string | undefined>;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(searchFoods(q, {
    limit: parseIntParam(limit, 10),
    kingdom,
    foodType,
    nutrientTypes,
  }));
});
router.get("/nutrition/rank", (req: Request, res: Response) => {
  const { nutrient, limit, kingdom, foodType } = req.query as Record<string, string | undefined>;
  if (!nutrient) {
    return res
      .status(400)
      .json({ error: "Query parameter 'nutrient' is required" });
  }
  const result = rankByNutrient(nutrient, {
    limit: parseIntParam(limit, 10),
    kingdom,
    foodType,
  });
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});
router.get("/nutrition/compare", (req: Request, res: Response) => {
  const { foods, nutrientTypes } = req.query as Record<string, string | undefined>;
  if (!foods) {
    return res
      .status(400)
      .json({
        error:
          "Query parameter 'foods' is required (comma-separated food names)",
      });
  }
  const foodList = foods
    .split(",")
    .map((f: string) => f.trim())
    .filter(Boolean);
  if (foodList.length < 2) {
    return res
      .status(400)
      .json({ error: "At least 2 food names are required for comparison" });
  }
  res.json(compareFoods(foodList, nutrientTypes));
});
router.get("/nutrition/categories", asyncHandler(
  async () => getFoodCategories(),
  "Categories lookup",
  500,
));
router.get("/nutrition/nutrient-types", asyncHandler(
  async () => getNutrientTypes(),
  "Nutrient types lookup",
  500,
));
router.get("/nutrition/top", (req: Request, res: Response) => {
  const { category, nutrient, limit, kingdom, foodType } = req.query as Record<string, string | undefined>;
  if (!category || !nutrient) {
    return res.status(400).json({
      error:
        "Query parameters 'category' and 'nutrient' are required. Categories: macros, minerals, vitamins, amino_acids, lipids, carbs, sterols.",
    });
  }
  const result = getTopFoodsByCategory(category, nutrient, {
    limit: parseIntParam(limit, 10),
    kingdom,
    foodType,
  });
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});
router.get("/nutrition/nutrients/:category", (req: Request, res: Response) => {
  const result = listCategoryNutrients(req.params.category as string);
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});
router.get("/nutrition/taxonomy/search", (req: Request, res: Response) => {
  const { rank, value, limit, nutrientTypes } = req.query as Record<string, string | undefined>;
  if (!rank || !value) {
    return res.status(400).json({
      error:
        "Query parameters 'rank' and 'value' are required. Ranks: kingdom, phylum, class, order, family, genus, species, etc.",
    });
  }
  const result = searchByTaxonomy(rank, value, {
    limit: parseIntParam(limit, 25),
    nutrientTypes,
  });
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});
router.get("/nutrition/taxonomy/tree", (req: Request, res: Response) => {
  const { rank, parentRank, parentValue } = req.query as Record<string, string | undefined>;
  const result = getTaxonomyTree(rank || null, parentRank || null, parentValue || null);
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});
router.get("/nutrition/requirements", (req: Request, res: Response) => {
  const { species, lifeStage, authority, weightKg, caloricIntake, includeCompositional } = req.query as Record<string, string | undefined>;
  const result = calculateTargetProfile({
    species,
    lifeStage,
    authority,
    weightKg: weightKg ? parseFloat(weightKg) : undefined,
    caloricIntake: caloricIntake ? parseFloat(caloricIntake) : undefined,
    includeCompositional: includeCompositional === "true",
  });
  res.json(result);
});
// ─── Drug Info (openFDA) ───────────────────────────────────────────
router.get("/drugs/search", asyncHandler(async (req: Request, res: Response) => {
  const { q, limit } = req.query as Record<string, string | undefined>;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(await searchDrugLabels(q, parseIntParam(limit, 5)));
}));
router.get("/drugs/adverse-events", asyncHandler(async (req: Request, res: Response) => {
  const { drug, limit } = req.query as Record<string, string | undefined>;
  if (!drug) {
    return res
      .status(400)
      .json({ error: "Query parameter 'drug' is required" });
  }
  res.json(await getDrugAdverseEvents(drug, parseIntParam(limit, 10)));
}));
router.get("/drugs/recalls", asyncHandler(
  (req: Request) => getDrugRecalls(req.query.q as string, parseIntParam(req.query.limit as string, 10)),
  "Drug recalls lookup",
));
// ─── FDA Drug NDC Database (In-Memory) ──────────────────────────────
router.get("/drugs/ndc/search", (req: Request, res: Response) => {
  const { q, limit, dosageForm, productType } = req.query as Record<string, string | undefined>;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(searchDrugs(q, {
    limit: parseIntParam(limit, 10),
    dosageForm,
    productType,
  }));
});
router.get("/drugs/ndc/lookup/:ndc", (req: Request, res: Response) => {
  const result = getDrugByNdc(req.params.ndc as string);
  if (!result) {
    return res.status(404).json({ error: `Drug not found: ${req.params.ndc as string}` });
  }
  res.json(result);
});
router.get("/drugs/ndc/dosage-forms", asyncHandler(
  async () => getDosageForms(),
  "Dosage forms lookup",
  500,
));
router.get("/drugs/ndc/ingredient", (req: Request, res: Response) => {
  const { q, limit } = req.query as Record<string, string | undefined>;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(searchByIngredient(q, {
    limit: parseIntParam(limit, 20),
  }));
});
router.get("/drugs/ndc/pharm-class", (req: Request, res: Response) => {
  const { q, limit } = req.query as Record<string, string | undefined>;
  if (!q) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }
  res.json(searchByPharmClass(q, {
    limit: parseIntParam(limit, 20),
  }));
});
// ─── Gym Exercises (Free Exercise DB) ──────────────────────────────
router.get("/exercises/search", (req: Request, res: Response) => {
  const { q, limit, category, equipment, force, level, mechanic, muscle } = req.query as Record<string, string | undefined>;
  res.json(searchExercises(q, {
    limit: parseIntParam(limit, 10),
    category,
    equipment,
    force,
    level,
    mechanic,
    muscle,
  }));
});
router.get("/exercises/categories", asyncHandler(
  async () => getExerciseCategories(),
  "Exercise categories lookup",
  500,
));
router.get("/exercises/:id", (req: Request, res: Response) => {
  const result = getExerciseById(req.params.id as string);
  if (!result) {
    return res.status(404).json({ error: `Exercise not found: ${req.params.id as string}` });
  }
  res.json(result);
});
// ─── Calorie Calculator (BMR/TDEE) ─────────────────────────────────
router.get("/calories/calculate", (req: Request, res: Response) => {
  const { sex, weightKg, heightCm, ageYears, activityLevel, goal, macroSplit, bodyFatPct } = req.query as Record<string, string | undefined>;
  if (!sex || !weightKg || !heightCm || !ageYears) {
    return res.status(400).json({
      error: "Required parameters: sex, weightKg, heightCm, ageYears",
    });
  }
  const result = calculateCaloricNeeds({
    sex,
    weightKg: parseFloat(weightKg),
    heightCm: parseFloat(heightCm),
    ageYears: parseFloat(ageYears),
    activityLevel,
    goal,
    macroSplit,
    bodyFatPct: bodyFatPct ? parseFloat(bodyFatPct) : undefined,
  });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
router.get("/calories/options", asyncHandler(
  async () => getCaloricNeedsOptions(),
  "Caloric options lookup",
  500,
));
// ─── Nutrient Gap Analysis ─────────────────────────────────────────
router.post("/nutrition/gap-analysis", (req: Request, res: Response) => {
  const { foods, species, lifeStage, authority, weightKg, caloricIntake } = req.body;
  const result = analyzeNutrientGaps({
    foods,
    species,
    lifeStage,
    authority,
    weightKg: weightKg ? parseFloat(weightKg) : undefined,
    caloricIntake: caloricIntake ? parseFloat(caloricIntake) : undefined,
  });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
// GET variant for agent tool-call compatibility
router.get("/nutrition/gap-analysis", (req: Request, res: Response) => {
  const { foods, species, lifeStage, authority, weightKg, caloricIntake } = req.query as Record<string, string | undefined>;
  if (!foods) {
    return res.status(400).json({
      error: "'foods' is required — JSON array of {name, grams} objects. Example: [{\"name\":\"chicken\",\"grams\":200}]",
    });
  }
  let parsedFoods: FoodLogInputItem[];
  try {
    parsedFoods = JSON.parse(foods);
  } catch {
    return res.status(400).json({ error: "'foods' must be valid JSON array" });
  }
  const result = analyzeNutrientGaps({
    foods: parsedFoods,
    species,
    lifeStage,
    authority,
    weightKg: weightKg ? parseFloat(weightKg) : undefined,
    caloricIntake: caloricIntake ? parseFloat(caloricIntake) : undefined,
  });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
// ─── Food Substitutes ──────────────────────────────────────────────
router.get("/nutrition/substitutes", (req: Request, res: Response) => {
  const { food, targetNutrients, dietaryPreference, excludeKingdom, excludeFoods, limit } = req.query as Record<string, string | undefined>;
  if (!food) {
    return res.status(400).json({ error: "'food' parameter is required" });
  }
  const result = findFoodSubstitutes({
    food,
    targetNutrients,
    dietaryPreference,
    excludeKingdom,
    excludeFoods,
    limit: parseIntParam(limit, 10),
  });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
router.get("/nutrition/substitutes/preferences", asyncHandler(
  async () => getDietaryPreferences(),
  "Dietary preferences lookup",
  500,
));
// ─── Exercise Calorie Estimation ───────────────────────────────────
router.get("/exercises/calories", (req: Request, res: Response) => {
  const { exercise, durationMinutes, weightKg, intensity, category } = req.query as Record<string, string | undefined>;
  if (!exercise || !durationMinutes || !weightKg) {
    return res.status(400).json({
      error: "Required parameters: exercise, durationMinutes, weightKg",
    });
  }
  const result = estimateExerciseCalories({
    exercise,
    durationMinutes: parseFloat(durationMinutes),
    weightKg: parseFloat(weightKg),
    intensity,
    category,
  });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
router.get("/exercises/met-categories", asyncHandler(
  async () => getMetCategories(),
  "MET categories lookup",
  500,
));
// ─── Hydration Calculator ──────────────────────────────────────────
router.get("/hydration/calculate", (req: Request, res: Response) => {
  const {
    weightKg, activityLevel, climateTemp, exerciseMinutes,
    exerciseIntensity, altitudeM, pregnant, breastfeeding, caffeineIntakeMg,
  } = req.query as Record<string, string | undefined>;
  if (!weightKg) {
    return res.status(400).json({ error: "'weightKg' is required" });
  }
  const result = calculateHydrationNeeds({
    weightKg: parseFloat(weightKg),
    activityLevel,
    climateTemp: climateTemp ? parseFloat(climateTemp) : undefined,
    exerciseMinutes: exerciseMinutes ? parseFloat(exerciseMinutes) : undefined,
    exerciseIntensity,
    altitudeM: altitudeM ? parseFloat(altitudeM) : undefined,
    pregnant: pregnant === "true",
    breastfeeding: breastfeeding === "true",
    caffeineIntakeMg: caffeineIntakeMg ? parseFloat(caffeineIntakeMg) : undefined,
  });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
// ─── Meal Plan Builder ─────────────────────────────────────────────
router.get("/nutrition/meal-plan", (req: Request, res: Response) => {
  const {
    caloricTarget, mealsPerDay, dietaryPreference, excludeFoods,
    emphasizeNutrients, species, lifeStage, weightKg, itemsPerMeal,
  } = req.query as Record<string, string | undefined>;
  if (!caloricTarget) {
    return res.status(400).json({ error: "'caloricTarget' is required (e.g. 2000)" });
  }
  const result = buildMealPlan({
    caloricTarget: parseFloat(caloricTarget),
    mealsPerDay: mealsPerDay ? parseInt(mealsPerDay, 10) : 3,
    dietaryPreference,
    excludeFoods,
    emphasizeNutrients,
    species,
    lifeStage,
    weightKg: weightKg ? parseFloat(weightKg) : undefined,
    itemsPerMeal: itemsPerMeal ? parseInt(itemsPerMeal, 10) : 4,
  });
  if (result.error) return res.status(400).json(result);
  res.json(result);
});
// ─── Drug-Nutrient Interactions ────────────────────────────────────
router.get("/drugs/nutrient-interactions", (req: Request, res: Response) => {
  const { drug, nutrients } = req.query as Record<string, string | undefined>;
  if (!drug) {
    return res.status(400).json({ error: "'drug' parameter is required" });
  }
  res.json(checkDrugNutrientInteractions({ drug, nutrients }));
});
router.get("/drugs/nutrient-interactions/categories", asyncHandler(
  async () => getDrugInteractionCategories(),
  "Drug-nutrient interaction categories",
  500,
));
// ─── Health ────────────────────────────────────────────────────────
export function getHealthDomainHealth() {
  return {
    openFda: "on-demand",
    usdaNutrition: "on-demand (in-memory, ~1346 raw whole foods)",
    fdaDrugNdc: "on-demand (in-memory, ~26,000 products)",
    freeExerciseDb: "on-demand (in-memory, ~1700+ exercises from multiple sources)",
    calorieCalculator: "compute (Mifflin-St Jeor / TDEE)",
    nutrientGapAnalysis: "compute (NutritionFetcher + RequirementFetcher)",
    foodSubstitutes: "compute (cosine similarity on nutrient vectors)",
    exerciseCalories: "compute (MET-based, Compendium of Physical Activities)",
    hydration: "compute (ACSM/IOM guidelines)",
    mealPlan: "compute (greedy nutrient-coverage optimizer)",
    drugNutrientInteractions: "static (curated pharmacological dataset)",
  };
}
// ── Unified Drug Search Dispatcher ─────────────────────────────────
router.get("/drugs/unified", asyncHandler(async (req: Request, res: Response) => {
  const { q, searchBy, limit, dosageForm, productType } = req.query as Record<string, string | undefined>;
  if (!q) return res.status(400).json({ error: "'q' is required" });
  const mode = searchBy || "name";
  switch (mode) {
    case "name":
      req.url = `/drugs/search?q=${encodeURIComponent(q)}&limit=${limit || 10}`;
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    case "ndc_search":
      req.url = `/drugs/ndc/search?q=${encodeURIComponent(q)}&limit=${limit || 10}&dosageForm=${dosageForm || ""}&productType=${productType || ""}`;
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    case "ndc_lookup":
      req.url = `/drugs/ndc/lookup/${encodeURIComponent(q)}`;
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    case "ingredient":
      req.url = `/drugs/ndc/ingredient?q=${encodeURIComponent(q)}&limit=${limit || 10}`;
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    case "pharm_class":
      req.url = `/drugs/ndc/pharm-class?q=${encodeURIComponent(q)}&limit=${limit || 10}`;
      return router.handle(req, res, () => res.status(404).json({ error: "Route not found" }));
    default:
      return res.status(400).json({ error: `Unknown searchBy: ${mode}`, validModes: ["name", "ndc_search", "ndc_lookup", "ingredient", "pharm_class"] });
  }
}));
export default router;
