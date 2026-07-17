import { ensureLoaded as loadExercises } from "./health/ExercisesFetcher.ts";
import { ensureLoaded as loadFdaDrugs } from "./health/FdaDrugFetcher.ts";
import { ensureFoodCache as loadFoodSubstitutes } from "./health/FoodSubstituteFetcher.ts";
import { ensureFoodCache as loadMealPlanFoods } from "./health/MealPlanFetcher.ts";
import { ensureLoaded as loadNutrition } from "./health/NutritionFetcher.ts";
import { ensureLoaded as loadNutritionRequirements } from "./health/NutritionRequirementFetcher.ts";
import { ensureLoaded as loadExoplanets } from "./knowledge/ExoplanetFetcher.ts";
import { ensureLoaded as loadPeriodicTable } from "./knowledge/PeriodicTableFetcher.ts";
import { ensureLoaded as loadWorldBank } from "./knowledge/WorldBankFetcher.ts";
import { ensureLoaded as loadAirports } from "./utility/AirportFetcher.ts";

/**
 * Eagerly load every static CSV-backed dataset at server startup.
 *
 * These datasets ship inside the build (dist/fetchers/x/data); if any file
 * is missing the load throws, startup aborts, and the Docker healthcheck
 * fails the deploy. Lazy loading instead surfaced a missing dataset as one
 * 500 followed by silent empty results on every subsequent request.
 */
export function preloadStaticDatasets(): void {
  loadNutrition();
  loadNutritionRequirements();
  loadExercises();
  loadFdaDrugs();
  loadFoodSubstitutes();
  loadMealPlanFoods();
  loadExoplanets();
  loadPeriodicTable();
  loadWorldBank();
  loadAirports();
}
