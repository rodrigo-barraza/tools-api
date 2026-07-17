// Regenerates src/fetchers/health/data/digest_nutrient_requirement.csv.
//
// The original digest pipeline that produced this dataset is gone (the file
// was never committed), so this script IS the pipeline now: a curated,
// reviewable encoding of published requirement tables.
//
// Sources:
//   - Human: NASEM/IOM Dietary Reference Intakes (adults 19-50), sodium CDRR
//     (2019), WHO free-sugar guideline, Health Canada caffeine guidance.
//     Amino acids: IOM/WHO adult requirements in mg per kg body weight per day.
//   - Canine/Feline: AAFCO Dog and Cat Food Nutrient Profiles, "per 1000 kcal
//     ME" basis (adult maintenance and growth profiles).
//
// Metrics understood by NutritionRequirementFetcher / NutrientGapFetcher:
//   RDA, AI, UL, RECOMMENDATION, GUIDELINE_MAX (informational, never a gap
//   target), RDA_multiplier_per_kg (scaled by weightKg),
//   MIN_per_1000kcal / MAX_per_1000kcal (scaled by caloricIntake / 1000),
//   NO_DRI (compositional marker).
//
// Units must stay convertible (g/mg/mcg) to the food DB columns in
// src/constants.ts NUTRITION_*_FIELDS — see FOOD_COLUMN_UNITS in
// NutrientGapFetcher.ts.
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const rows = [];
const add = (species, lifeStage, authority, nutrient, metric, value, unit) =>
  rows.push([species, lifeStage, authority, nutrient, metric, value, unit]);

// ─── Human — US_DRI (NASEM/IOM, adults 19-50) ──────────────────
// [nutrient, metric, male, female, unit]
const HUMAN = [
  ["protein", "RDA", 56, 46, "g"],
  ["protein", "RDA_multiplier_per_kg", 0.8, 0.8, "g"],
  ["carbohydrate", "RDA", 130, 130, "g"],
  ["fiber", "AI", 38, 25, "g"],
  ["water", "AI", 3700, 2700, "g"],
  ["lipid", "NO_DRI", 0, 0, ""],
  ["sugar", "GUIDELINE_MAX", 50, 50, "g"],
  ["cholesterol", "GUIDELINE_MAX", 300, 300, "mg"],
  ["caffeine", "GUIDELINE_MAX", 400, 400, "mg"],
  // Vitamins
  ["vitamin_a", "RDA", 900, 700, "mcg"],
  ["vitamin_a", "UL", 3000, 3000, "mcg"],
  ["vitamin_c", "RDA", 90, 75, "mg"],
  ["vitamin_c", "UL", 2000, 2000, "mg"],
  ["vitamin_d", "RDA", 15, 15, "mcg"],
  ["vitamin_d", "UL", 100, 100, "mcg"],
  ["alpha_tocopherol", "RDA", 15, 15, "mg"],
  ["alpha_tocopherol", "UL", 1000, 1000, "mg"],
  ["phylloquinone", "AI", 120, 90, "mcg"],
  ["thiamin", "RDA", 1.2, 1.1, "mg"],
  ["riboflavin", "RDA", 1.3, 1.1, "mg"],
  ["niacin", "RDA", 16, 14, "mg"],
  ["niacin", "UL", 35, 35, "mg"],
  ["vitamin_b5", "AI", 5, 5, "mg"],
  ["vitamin_b6", "RDA", 1.3, 1.3, "mg"],
  ["vitamin_b6", "UL", 100, 100, "mg"],
  ["folate", "RDA", 400, 400, "mcg"],
  ["folate", "UL", 1000, 1000, "mcg"],
  ["cyanocobalamin", "RDA", 2.4, 2.4, "mcg"],
  ["choline", "AI", 550, 425, "mg"],
  ["choline", "UL", 3500, 3500, "mg"],
  // Minerals
  ["calcium", "RDA", 1000, 1000, "mg"],
  ["calcium", "UL", 2500, 2500, "mg"],
  ["phosphorus", "RDA", 700, 700, "mg"],
  ["phosphorus", "UL", 4000, 4000, "mg"],
  ["magnesium", "RDA", 400, 310, "mg"], // UL omitted: applies to supplements only
  ["sodium", "AI", 1500, 1500, "mg"],
  ["sodium", "UL", 2300, 2300, "mg"], // CDRR (2019)
  ["potassium", "AI", 3400, 2600, "mg"],
  ["iron", "RDA", 8, 18, "mg"],
  ["iron", "UL", 45, 45, "mg"],
  ["zinc", "RDA", 11, 8, "mg"],
  ["zinc", "UL", 40, 40, "mg"],
  ["copper", "RDA", 0.9, 0.9, "mg"],
  ["copper", "UL", 10, 10, "mg"],
  ["selenium", "RDA", 55, 55, "mcg"],
  ["selenium", "UL", 400, 400, "mcg"],
  ["iodine", "RDA", 150, 150, "mcg"],
  ["iodine", "UL", 1100, 1100, "mcg"],
  ["manganese", "AI", 2.3, 1.8, "mg"],
  ["manganese", "UL", 11, 11, "mg"],
  ["fluoride", "AI", 4, 3, "mg"],
  ["fluoride", "UL", 10, 10, "mg"],
  // Essential amino acids — mg per kg body weight per day (IOM/WHO).
  // methionine row = total sulfur AAs (met+cys); phenylalanine row = total
  // aromatic AAs (phe+tyr) — matches how the requirement tables publish them.
  ["histidine", "RDA_multiplier_per_kg", 14, 14, "mg"],
  ["isoleucine", "RDA_multiplier_per_kg", 19, 19, "mg"],
  ["leucine", "RDA_multiplier_per_kg", 42, 42, "mg"],
  ["lysine", "RDA_multiplier_per_kg", 38, 38, "mg"],
  ["methionine", "RDA_multiplier_per_kg", 19, 19, "mg"],
  ["phenylalanine", "RDA_multiplier_per_kg", 33, 33, "mg"],
  ["threonine", "RDA_multiplier_per_kg", 20, 20, "mg"],
  ["tryptophan", "RDA_multiplier_per_kg", 5, 5, "mg"],
  ["valine", "RDA_multiplier_per_kg", 24, 24, "mg"],
  // Essential fatty acids
  ["c18_d2_n6_cis_cis", "AI", 17, 12, "g"], // linoleic
  ["c18_d3_n3_cis_cis_cis", "AI", 1.6, 1.1, "g"], // alpha-linolenic
  ["c22_d6_n3", "RECOMMENDATION", 0.25, 0.25, "g"], // EPA+DHA combined guidance
];

for (const [nutrient, metric, male, female, unit] of HUMAN) {
  add("human", "adult_male", "US_DRI", nutrient, metric, male, unit);
  add("human", "adult_female", "US_DRI", nutrient, metric, female, unit);
}

// ─── Canine — AAFCO (per 1000 kcal ME) ─────────────────────────
const CANINE_ADULT = [
  ["protein", 45, "g_per_1000kcal"],
  ["lipid", 13.8, "g_per_1000kcal"],
  ["calcium", 1250, "mg_per_1000kcal"],
  ["phosphorus", 1000, "mg_per_1000kcal"],
  ["potassium", 1500, "mg_per_1000kcal"],
  ["sodium", 200, "mg_per_1000kcal"],
  ["magnesium", 150, "mg_per_1000kcal"],
  ["iron", 10, "mg_per_1000kcal"],
  ["copper", 1.83, "mg_per_1000kcal"],
  ["manganese", 1.25, "mg_per_1000kcal"],
  ["zinc", 20, "mg_per_1000kcal"],
  ["selenium", 80, "mcg_per_1000kcal"],
  ["iodine", 250, "mcg_per_1000kcal"],
  ["vitamin_a", 1250, "mcg_per_1000kcal"],
  ["vitamin_d", 3.1, "mcg_per_1000kcal"],
  ["alpha_tocopherol", 8.4, "mg_per_1000kcal"],
  ["thiamin", 0.56, "mg_per_1000kcal"],
  ["riboflavin", 1.3, "mg_per_1000kcal"],
  ["choline", 340, "mg_per_1000kcal"],
];
for (const [nutrient, value, unit] of CANINE_ADULT) {
  add("canine", "adult_maintenance", "AAFCO", nutrient, "MIN_per_1000kcal", value, unit);
}
const CANINE_PUPPY = [
  ["protein", 56.3, "g_per_1000kcal"],
  ["lipid", 21.3, "g_per_1000kcal"],
  ["calcium", 3000, "mg_per_1000kcal"],
  ["phosphorus", 2500, "mg_per_1000kcal"],
];
for (const [nutrient, value, unit] of CANINE_PUPPY) {
  add("canine", "puppy", "AAFCO", nutrient, "MIN_per_1000kcal", value, unit);
}
add("canine", "puppy", "AAFCO", "calcium", "MAX_per_1000kcal", 4500, "mg_per_1000kcal");

// ─── Feline — AAFCO (per 1000 kcal ME) ─────────────────────────
const FELINE_ADULT = [
  ["protein", 65, "g_per_1000kcal"],
  ["lipid", 22.5, "g_per_1000kcal"],
  ["calcium", 1500, "mg_per_1000kcal"],
  ["phosphorus", 1250, "mg_per_1000kcal"],
  ["potassium", 1500, "mg_per_1000kcal"],
  ["sodium", 500, "mg_per_1000kcal"],
  ["magnesium", 100, "mg_per_1000kcal"],
  ["iron", 20, "mg_per_1000kcal"],
  ["copper", 1.25, "mg_per_1000kcal"],
  ["manganese", 1.9, "mg_per_1000kcal"],
  ["zinc", 18.75, "mg_per_1000kcal"],
  ["selenium", 75, "mcg_per_1000kcal"],
  ["taurine", 250, "mg_per_1000kcal"],
];
for (const [nutrient, value, unit] of FELINE_ADULT) {
  add("feline", "adult_maintenance", "AAFCO", nutrient, "MIN_per_1000kcal", value, unit);
}
const FELINE_KITTEN = [
  ["protein", 75, "g_per_1000kcal"],
  ["lipid", 22.5, "g_per_1000kcal"],
  ["calcium", 2400, "mg_per_1000kcal"],
  ["phosphorus", 2000, "mg_per_1000kcal"],
  ["taurine", 250, "mg_per_1000kcal"],
];
for (const [nutrient, value, unit] of FELINE_KITTEN) {
  add("feline", "kitten", "AAFCO", nutrient, "MIN_per_1000kcal", value, unit);
}

// ─── Emit ──────────────────────────────────────────────────────
const header = "species,demographic_life_stage,authority,nutrient_id,metric,value_numeric,unit";
const csv = [header, ...rows.map((row) => row.join(","))].join("\n") + "\n";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "src", "fetchers", "health", "data", "digest_nutrient_requirement.csv");
writeFileSync(outPath, csv);
console.log(`wrote ${rows.length} rules → ${outPath}`);
