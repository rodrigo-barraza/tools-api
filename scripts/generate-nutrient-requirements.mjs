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
//   - Canine/Feline: AAFCO Dog and Cat Food Nutrient Profiles, transcribed from
//     the "BASED ON CALORIE CONTENT" (per 1000 kcal ME) tables of AAFCO Official
//     Publication Appendix A (2014 revision), which presume a caloric density of
//     4000 kcal ME/kg DM. Both growth & reproduction and adult maintenance
//     columns are carried, plus the published Maximum column.
//     https://www.aafco.org/wp-content/uploads/2023/01/Pet_Food_Report_Annual_2014-Appendix_A-Revised_AAFCO_Nutrient_Profiles-Final_092214.pdf
//
// Metrics understood by NutritionRequirementFetcher / NutrientGapFetcher:
//   RDA, AI, UL, RECOMMENDATION, GUIDELINE_MAX (informational, never a gap
//   target), RDA_multiplier_per_kg (scaled by weightKg),
//   MIN_per_1000kcal / MAX_per_1000kcal (scaled by caloricIntake / 1000;
//   MAX_per_1000kcal acts as the safety ceiling for pets, like UL for humans),
//   NO_DRI (compositional marker).
//
// Combined nutrient ids (methionine_cystine, phenylalanine_tyrosine, epa_dha)
// are requirements published as the SUM of two nutrients. NutrientGapFetcher
// maps each to several food columns and sums intake across them — do not
// rename one to a single-nutrient id, or intake will be understated.
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
  // The sulfur and aromatic AAs are published only as combined totals, so they
  // use combined ids that the gap fetcher scores against both food columns.
  ["histidine", "RDA_multiplier_per_kg", 14, 14, "mg"],
  ["isoleucine", "RDA_multiplier_per_kg", 19, 19, "mg"],
  ["leucine", "RDA_multiplier_per_kg", 42, 42, "mg"],
  ["lysine", "RDA_multiplier_per_kg", 38, 38, "mg"],
  ["methionine_cystine", "RDA_multiplier_per_kg", 19, 19, "mg"],
  ["phenylalanine_tyrosine", "RDA_multiplier_per_kg", 33, 33, "mg"],
  ["threonine", "RDA_multiplier_per_kg", 20, 20, "mg"],
  ["tryptophan", "RDA_multiplier_per_kg", 5, 5, "mg"],
  ["valine", "RDA_multiplier_per_kg", 24, 24, "mg"],
  // Essential fatty acids
  ["c18_d2_n6_cis_cis", "AI", 17, 12, "g"], // linoleic
  ["c18_d3_n3_cis_cis_cis", "AI", 1.6, 1.1, "g"], // alpha-linolenic
  ["epa_dha", "RECOMMENDATION", 0.25, 0.25, "g"], // EPA+DHA combined guidance
];

for (const [nutrient, metric, male, female, unit] of HUMAN) {
  add("human", "adult_male", "US_DRI", nutrient, metric, male, unit);
  add("human", "adult_female", "US_DRI", nutrient, metric, female, unit);
}

// ─── AAFCO transcription helpers ───────────────────────────────
// AAFCO publishes the fat-soluble vitamins in IU and several minerals in
// g or mg; the food DB stores mcg RAE (A), mcg (D), mg alpha-tocopherol (E),
// mg (macrominerals) and mcg (trace). Convert at transcription time so the CSV
// is directly comparable to food columns, and keep the published figure visible
// in the call so a reader can check it against the source table.
const round4 = (n) => Number(n.toFixed(4));
const iuVitaminA = (iu) => round4(iu * 0.3); // 1 IU retinol = 0.3 mcg RAE
const iuVitaminD = (iu) => round4(iu * 0.025); // 1 IU = 0.025 mcg
const iuVitaminE = (iu) => round4(iu * 0.67); // 1 IU d-alpha-tocopherol = 0.67 mg
const gToMg = (grams) => round4(grams * 1000);
const mgToMcg = (milligrams) => round4(milligrams * 1000);

// Emit a species profile. Rows are [nutrient, growth, adultMaintenance, unit];
// a null column means the value is published as "ND" (Not Determined) for that
// life stage and must not become a target. Stages are
// [lifeStage, columnIndex, maxOverrides].
const emitPetProfile = (species, stages, minRows, maxRows) => {
  for (const [lifeStage, column, maxOverrides] of stages) {
    for (const [nutrient, ...cols] of minRows) {
      if (cols[column] === null) continue;
      add(species, lifeStage, "AAFCO", nutrient, "MIN_per_1000kcal", cols[column], cols[2]);
    }
    for (const [nutrient, ...cols] of maxRows) {
      const value = nutrient in maxOverrides ? maxOverrides[nutrient] : cols[column];
      if (value === null) continue;
      add(species, lifeStage, "AAFCO", nutrient, "MAX_per_1000kcal", value, cols[2]);
    }
  }
};

// ─── Canine — AAFCO Dog Food Nutrient Profiles (per 1000 kcal ME) ─
const CANINE_MIN = [
  ["protein", 56.3, 45.0, "g_per_1000kcal"],
  ["arginine", 2.5, 1.28, "g_per_1000kcal"],
  ["histidine", 1.1, 0.48, "g_per_1000kcal"],
  ["isoleucine", 1.78, 0.95, "g_per_1000kcal"],
  ["leucine", 3.23, 1.7, "g_per_1000kcal"],
  ["lysine", 2.25, 1.58, "g_per_1000kcal"],
  ["methionine", 0.88, 0.83, "g_per_1000kcal"],
  ["methionine_cystine", 1.75, 1.63, "g_per_1000kcal"],
  ["phenylalanine", 2.08, 1.13, "g_per_1000kcal"],
  ["phenylalanine_tyrosine", 3.25, 1.85, "g_per_1000kcal"],
  ["threonine", 2.6, 1.2, "g_per_1000kcal"],
  ["tryptophan", 0.5, 0.4, "g_per_1000kcal"],
  ["valine", 1.7, 1.23, "g_per_1000kcal"],
  ["lipid", 21.3, 13.8, "g_per_1000kcal"], // crude fat
  ["c18_d2_n6_cis_cis", 3.3, 2.8, "g_per_1000kcal"], // linoleic
  ["c18_d3_n3_cis_cis_cis", 0.2, null, "g_per_1000kcal"], // alpha-linolenic
  ["epa_dha", 0.1, null, "g_per_1000kcal"],
  ["calcium", gToMg(3.0), gToMg(1.25), "mg_per_1000kcal"],
  ["phosphorus", gToMg(2.5), gToMg(1.0), "mg_per_1000kcal"],
  ["potassium", gToMg(1.5), gToMg(1.5), "mg_per_1000kcal"],
  ["sodium", gToMg(0.8), gToMg(0.2), "mg_per_1000kcal"],
  ["chloride", gToMg(1.1), gToMg(0.3), "mg_per_1000kcal"],
  ["magnesium", gToMg(0.15), gToMg(0.15), "mg_per_1000kcal"],
  ["iron", 22, 10, "mg_per_1000kcal"],
  ["copper", 3.1, 1.83, "mg_per_1000kcal"],
  ["manganese", 1.8, 1.25, "mg_per_1000kcal"],
  ["zinc", 25, 20, "mg_per_1000kcal"],
  ["iodine", mgToMcg(0.25), mgToMcg(0.25), "mcg_per_1000kcal"],
  ["selenium", mgToMcg(0.09), mgToMcg(0.08), "mcg_per_1000kcal"],
  ["vitamin_a", iuVitaminA(1250), iuVitaminA(1250), "mcg_per_1000kcal"],
  ["vitamin_d", iuVitaminD(125), iuVitaminD(125), "mcg_per_1000kcal"],
  ["alpha_tocopherol", iuVitaminE(12.5), iuVitaminE(12.5), "mg_per_1000kcal"],
  ["thiamin", 0.56, 0.56, "mg_per_1000kcal"],
  ["riboflavin", 1.3, 1.3, "mg_per_1000kcal"],
  ["vitamin_b5", 3.0, 3.0, "mg_per_1000kcal"], // pantothenic acid
  ["niacin", 3.4, 3.4, "mg_per_1000kcal"],
  ["vitamin_b6", 0.38, 0.38, "mg_per_1000kcal"], // pyridoxine
  ["folate", mgToMcg(0.054), mgToMcg(0.054), "mcg_per_1000kcal"],
  ["cyanocobalamin", mgToMcg(0.007), mgToMcg(0.007), "mcg_per_1000kcal"],
  ["choline", 340, 340, "mg_per_1000kcal"],
];
// The Maximum column is a single column in the source table, so it applies to
// growth and adult maintenance alike.
const CANINE_MAX = [
  ["calcium", gToMg(6.25), gToMg(6.25), "mg_per_1000kcal"],
  ["phosphorus", gToMg(4.0), gToMg(4.0), "mg_per_1000kcal"],
  ["iodine", mgToMcg(2.75), mgToMcg(2.75), "mcg_per_1000kcal"],
  ["selenium", mgToMcg(0.5), mgToMcg(0.5), "mcg_per_1000kcal"],
  ["vitamin_a", iuVitaminA(62500), iuVitaminA(62500), "mcg_per_1000kcal"],
  ["vitamin_d", iuVitaminD(750), iuVitaminD(750), "mcg_per_1000kcal"],
];
emitPetProfile(
  "canine",
  [
    ["puppy", 0, {}],
    // Excess calcium during growth causes developmental orthopedic disease in
    // large breeds, so AAFCO caps formulas that may be fed to puppies who will
    // mature at 70 lb or more at 4.5 g/1000 kcal rather than the general 6.25.
    ["puppy_large_breed", 0, { calcium: gToMg(4.5) }],
    ["adult_maintenance", 1, {}],
  ],
  CANINE_MIN,
  CANINE_MAX,
);

// ─── Feline — AAFCO Cat Food Nutrient Profiles (per 1000 kcal ME) ─
const FELINE_MIN = [
  ["protein", 75, 65, "g_per_1000kcal"],
  ["arginine", 3.1, 2.6, "g_per_1000kcal"],
  ["histidine", 0.83, 0.78, "g_per_1000kcal"],
  ["isoleucine", 1.4, 1.3, "g_per_1000kcal"],
  ["leucine", 3.2, 3.1, "g_per_1000kcal"],
  ["lysine", 3.0, 2.08, "g_per_1000kcal"],
  ["methionine", 1.55, 0.5, "g_per_1000kcal"],
  ["methionine_cystine", 2.75, 1.0, "g_per_1000kcal"],
  ["phenylalanine", 1.3, 1.05, "g_per_1000kcal"],
  ["phenylalanine_tyrosine", 4.8, 3.83, "g_per_1000kcal"],
  ["threonine", 1.83, 1.83, "g_per_1000kcal"],
  ["tryptophan", 0.63, 0.4, "g_per_1000kcal"],
  ["valine", 1.55, 1.55, "g_per_1000kcal"],
  ["lipid", 22.5, 22.5, "g_per_1000kcal"], // crude fat
  ["c18_d2_n6_cis_cis", 1.4, 1.4, "g_per_1000kcal"], // linoleic
  ["c18_d3_n3_cis_cis_cis", 0.05, null, "g_per_1000kcal"], // alpha-linolenic
  // Cats cannot desaturate linoleic acid to arachidonic at a useful rate, so
  // unlike dogs and humans they have a dietary arachidonic requirement.
  ["c20_d4_n6", 0.05, 0.05, "g_per_1000kcal"],
  ["epa_dha", 0.03, null, "g_per_1000kcal"],
  ["calcium", gToMg(2.5), gToMg(1.5), "mg_per_1000kcal"],
  ["phosphorus", gToMg(2.0), gToMg(1.25), "mg_per_1000kcal"],
  ["potassium", gToMg(1.5), gToMg(1.5), "mg_per_1000kcal"],
  ["sodium", gToMg(0.5), gToMg(0.5), "mg_per_1000kcal"],
  ["chloride", gToMg(0.75), gToMg(0.75), "mg_per_1000kcal"],
  ["magnesium", gToMg(0.2), gToMg(0.1), "mg_per_1000kcal"],
  ["iron", 20.0, 20.0, "mg_per_1000kcal"],
  ["copper", 3.75, 1.25, "mg_per_1000kcal"], // extruded-diet figures
  ["manganese", 1.9, 1.9, "mg_per_1000kcal"],
  ["zinc", 18.8, 18.8, "mg_per_1000kcal"],
  ["iodine", mgToMcg(0.45), mgToMcg(0.15), "mcg_per_1000kcal"],
  ["selenium", mgToMcg(0.075), mgToMcg(0.075), "mcg_per_1000kcal"],
  ["vitamin_a", iuVitaminA(1667), iuVitaminA(833), "mcg_per_1000kcal"],
  ["vitamin_d", iuVitaminD(70), iuVitaminD(70), "mcg_per_1000kcal"],
  ["alpha_tocopherol", iuVitaminE(10), iuVitaminE(10), "mg_per_1000kcal"],
  ["phylloquinone", mgToMcg(0.025), mgToMcg(0.025), "mcg_per_1000kcal"],
  ["thiamin", 1.4, 1.4, "mg_per_1000kcal"],
  ["riboflavin", 1.0, 1.0, "mg_per_1000kcal"],
  ["vitamin_b5", 1.44, 1.44, "mg_per_1000kcal"], // pantothenic acid
  ["niacin", 15, 15, "mg_per_1000kcal"],
  ["vitamin_b6", 1.0, 1.0, "mg_per_1000kcal"], // pyridoxine
  ["folate", mgToMcg(0.2), mgToMcg(0.2), "mcg_per_1000kcal"],
  ["biotin", mgToMcg(0.018), mgToMcg(0.018), "mcg_per_1000kcal"],
  ["cyanocobalamin", mgToMcg(0.005), mgToMcg(0.005), "mcg_per_1000kcal"],
  ["choline", 600, 600, "mg_per_1000kcal"],
  ["taurine", gToMg(0.25), gToMg(0.25), "mg_per_1000kcal"], // extruded
];
const FELINE_MAX = [
  ["methionine", 3.75, 3.75, "g_per_1000kcal"],
  ["tryptophan", 4.25, 4.25, "g_per_1000kcal"],
  ["vitamin_a", iuVitaminA(83325), iuVitaminA(83325), "mcg_per_1000kcal"],
  ["vitamin_d", iuVitaminD(7520), iuVitaminD(7520), "mcg_per_1000kcal"],
];
emitPetProfile(
  "feline",
  [
    ["kitten", 0, {}],
    ["adult_maintenance", 1, {}],
  ],
  FELINE_MIN,
  FELINE_MAX,
);

// ─── Emit ──────────────────────────────────────────────────────
const header = "species,demographic_life_stage,authority,nutrient_id,metric,value_numeric,unit";
const csv = [header, ...rows.map((row) => row.join(","))].join("\n") + "\n";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "..", "src", "fetchers", "health", "data", "digest_nutrient_requirement.csv");
writeFileSync(outPath, csv);
console.log(`wrote ${rows.length} rules → ${outPath}`);
