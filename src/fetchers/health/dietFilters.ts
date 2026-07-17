import type { FoodItem } from "../../types/health.ts";

/**
 * Shared dietary-preference filters for the food database.
 *
 * The database vocabulary matters here: `food_type` is only ever one of
 * animal | animal product | fungus | mineral | mushroom | plant, and dairy,
 * eggs, and honey-like items are classified as "animal product". Fish has no
 * dedicated food_type, so pescatarian detection combines taxonomy class,
 * food_subtype, and name/keyword matching. (The previous filters tested
 * food_type against "dairy"/"egg"/"fish" — values that do not exist — which
 * made vegetarian and pescatarian behave exactly like vegan.)
 */

const SEAFOOD_CLASSES = new Set([
  "actinopterygii", // ray-finned fish
  "chondrichthyes", // sharks & rays
  "cephalopoda",
  "gastropoda",
  "bivalvia",
  "malacostraca", // crabs, lobsters, shrimp
]);

const SEAFOOD_SUBTYPES = new Set(["seafood", "mollusk"]);

const SEAFOOD_NAME_PATTERN =
  /\b(fish|salmon|tuna|cod|trout|herring|sardine|mackerel|anchov|halibut|shrimp|prawn|crab|lobster|oyster|mussel|clam|scallop|squid|octopus|eel|tilapia|snapper|bass|perch|carp|pollock|haddock|sole|flounder|crayfish|roe|caviar|whelk|abalone|cuttlefish|krill)\b/i;

function isAnimal(food: FoodItem): boolean {
  return (String(food.kingdom) || "").toLowerCase() === "animalia";
}

/** Dairy, eggs, honey-adjacent — animal-derived without slaughter. */
function isAnimalProduct(food: FoodItem): boolean {
  return (String(food.food_type) || "").toLowerCase() === "animal product";
}

export function isSeafood(food: FoodItem): boolean {
  if (!isAnimal(food)) return false;
  const taxonomicClass = (String(food.class ?? "") || "").toLowerCase();
  if (SEAFOOD_CLASSES.has(taxonomicClass)) return true;
  const subtype = (String(food.food_subtype ?? "") || "").toLowerCase();
  if (SEAFOOD_SUBTYPES.has(subtype)) return true;
  const searchable = `${food.food_name ?? ""} ${food.description_long ?? ""} ${food.food_keywords ?? ""}`;
  return SEAFOOD_NAME_PATTERN.test(searchable);
}

export const DIET_FILTERS: Record<string, (food: FoodItem) => boolean> = {
  omnivore: () => true,
  vegetarian: (food) => !isAnimal(food) || isAnimalProduct(food),
  vegan: (food) => !isAnimal(food),
  plant_only: (food) => (String(food.kingdom) || "").toLowerCase() === "plantae",
  pescatarian: (food) =>
    !isAnimal(food) || isAnimalProduct(food) || isSeafood(food),
  keto: (food) => {
    // Low carb: prefer foods with <10g carbs per 100g
    const carbs = food.carbohydrate || 0;
    return typeof carbs === "number" && carbs < 10;
  },
};

export const DIET_FILTER_KEYS = Object.keys(DIET_FILTERS);

/**
 * Resolve a dietary preference string to a filter, tolerating case,
 * spaces, and hyphens. Returns null for unknown values so callers can
 * return a teaching error instead of silently ignoring the filter.
 */
export function resolveDietFilter(
  preference: string | undefined,
): { key: string; filter: (food: FoodItem) => boolean } | null {
  if (!preference) return { key: "omnivore", filter: DIET_FILTERS.omnivore };
  const key = preference.toLowerCase().replace(/[\s-]+/g, "_");
  const filter = Object.hasOwn(DIET_FILTERS, key)
    ? DIET_FILTERS[key]
    : undefined;
  return filter ? { key, filter } : null;
}
