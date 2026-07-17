// ============================================================
// Nutrition tools — agentic harness overhaul (2026-07)
//
// Each block pins a bug found in the production audit with the
// exact failure pattern real agents hit:
//   - 7-round-trip retry spiral on over-specified search queries
//   - "plant"/"meat" filter values silently matching nothing
//   - vegetarian/pescatarian diet filters behaving as vegan
//   - the missing DRI/AAFCO requirement dataset (dead tools)
//   - bodyFatPct advertised in the schema but never read
//   - NaN climateTemp classified as extreme heat (+750 mL)
//   - cross-source unit errors dominating nutrient rankings
// ============================================================
import { describe, expect, it } from "vitest";

import {
  searchFoods,
  rankByNutrient,
  getFoodCategories,
} from "../NutritionFetcher.ts";
import { calculateTargetProfile } from "../NutritionRequirementFetcher.ts";
import { analyzeNutrientGaps } from "../NutrientGapFetcher.ts";
import { findFoodSubstitutes } from "../FoodSubstituteFetcher.ts";
import { buildMealPlan } from "../MealPlanFetcher.ts";
import { calculateHydrationNeeds } from "../HydrationFetcher.ts";
import { calculateCaloricNeeds } from "../CalorieCalculatorFetcher.ts";
import { DIET_FILTERS, isSeafood } from "../dietFilters.ts";

// ─── searchFoods: auto-relax + filter aliases ──────────────────

describe("searchFoods — agent ergonomics", () => {
  it("auto-relaxes over-specified queries instead of returning empty", () => {
    // The exact spiral from conversation 14305343 (2026-07-17): the agent
    // retried 7 rewordings of "chicken breast" against an empty DB. With
    // data present, an over-specified query must still degrade gracefully.
    const result = searchFoods("grilled chicken sandwich", { limit: 3 });
    expect("foods" in result && result.foods.length).toBeGreaterThan(0);
    if ("relaxedMatch" in result) {
      expect(result.relaxedMatch).toBe(true);
      expect(result.hint).toMatch(/closest matches/i);
    }
  });

  it("coerces kingdom aliases (plant → plantae)", () => {
    const result = searchFoods("banana", { kingdom: "plant" });
    expect("count" in result && result.count).toBeGreaterThan(0);
  });

  it("coerces foodType aliases (meat → animal, dairy → animal product)", () => {
    const meat = searchFoods("chicken", { foodType: "meat" });
    expect("count" in meat && meat.count).toBeGreaterThan(0);
    const dairy = searchFoods("milk", { foodType: "dairy" });
    expect("count" in dairy && dairy.count).toBeGreaterThan(0);
  });

  it("rejects unknown filter values with the valid vocabulary", () => {
    const result = searchFoods("banana", { kingdom: "vegetal" });
    expect("error" in result && result.error).toMatch(/Unknown kingdom/);
    expect("validValues" in result && result.validValues).toContain("plantae");
  });

  it("browses by taxonomy without a text query", () => {
    const result = searchFoods("", {
      taxonRank: "family",
      taxonValue: "Rosaceae",
      limit: 5,
    });
    expect("count" in result && result.count).toBeGreaterThan(0);
  });

  it("returns a raw-whole-foods hint when nothing matches at all", () => {
    const result = searchFoods("zzzqqxx", { limit: 3 });
    expect("count" in result && result.count).toBe(0);
    expect("hint" in result && result.hint).toMatch(/raw whole foods/i);
  });
});

// ─── rankByNutrient: fuzzy names + curated default ─────────────

describe("rankByNutrient — merged ranking tool", () => {
  it("resolves loose nutrient names across categories", () => {
    expect(rankByNutrient("vitamin C", { limit: 2 }).nutrient).toBe(
      "ascorbic_acid",
    );
    expect(rankByNutrient("b12", { limit: 2 }).nutrient).toBe(
      "cyanocobalamin",
    );
    expect(rankByNutrient("omega3 DHA", { limit: 2 }).nutrient).toBe(
      "c22_d6_n3_dha",
    );
  });

  it("defaults to the curated USDA subset for rankings", () => {
    const result = rankByNutrient("ascorbic_acid", { limit: 5 });
    expect(result.foods!.every((food) => food.source === "USDA")).toBe(true);
    expect(result.note).toMatch(/USDA subset/);
  });

  it("keeps cross-source unit errors out of default rankings", () => {
    // FAO tomato cultivars list vitamin C around 26,000 mg/100g (a unit
    // error ~1000× the true value); acerola's real record is ~1,678 mg.
    const result = rankByNutrient("ascorbic_acid", { limit: 3 });
    for (const food of result.foods!) {
      expect(food.value).toBeLessThan(5000);
    }
  });

  it("still allows ranking across all sources on request", () => {
    const result = rankByNutrient("protein", { limit: 3, sources: "all" });
    expect(result.count).toBeGreaterThan(0);
  });

  it("respects the optional category narrowing", () => {
    const result = rankByNutrient("iron", { category: "minerals", limit: 2 });
    expect(result.nutrient).toBe("iron");
  });
});

// ─── Diet filters: the vegetarian≠vegan fix ────────────────────

describe("diet filters — food_type vocabulary fix", () => {
  const dairy = { kingdom: "animalia", food_type: "animal product", food_name: "milk", description_long: "Milk, whole" };
  const chicken = { kingdom: "animalia", food_type: "animal", food_name: "chicken", description_long: "Chicken, meat only" };
  const salmon = { kingdom: "animalia", food_type: "animal", food_name: "salmon", description_long: "Salmon, raw" };
  const spinach = { kingdom: "plantae", food_type: "plant", food_name: "spinach", description_long: "Spinach, raw" };

  it("vegetarian keeps dairy/eggs, drops flesh", () => {
    expect(DIET_FILTERS.vegetarian(dairy as never)).toBe(true);
    expect(DIET_FILTERS.vegetarian(chicken as never)).toBe(false);
    expect(DIET_FILTERS.vegetarian(spinach as never)).toBe(true);
  });

  it("pescatarian keeps fish and dairy, drops other meat", () => {
    expect(DIET_FILTERS.pescatarian(salmon as never)).toBe(true);
    expect(DIET_FILTERS.pescatarian(dairy as never)).toBe(true);
    expect(DIET_FILTERS.pescatarian(chicken as never)).toBe(false);
  });

  it("detects seafood via name when taxonomy is missing", () => {
    expect(isSeafood(salmon as never)).toBe(true);
    expect(isSeafood(chicken as never)).toBe(false);
  });

  it("substitute search errors on unknown preference instead of ignoring it", () => {
    const result = findFoodSubstitutes({
      food: "beef",
      dietaryPreference: "carnivore",
    });
    expect(result.error).toMatch(/Unknown dietaryPreference/);
    expect(result.validPreferences).toContain("pescatarian");
  });

  it("vegetarian substitutes for chicken include animal products", () => {
    const result = findFoodSubstitutes({
      food: "chicken",
      dietaryPreference: "vegetarian",
      limit: 30,
    });
    const names = result.substitutes!.map((sub) => sub.name.toLowerCase());
    expect(names.some((name) => /egg|milk|cheese|yogurt/.test(name))).toBe(
      true,
    );
  });
});

// ─── Requirements dataset revived ──────────────────────────────

describe("calculateTargetProfile — regenerated DRI/AAFCO dataset", () => {
  it("returns a full human adult profile", () => {
    const profile = calculateTargetProfile({
      species: "human",
      lifeStage: "adult_female",
      weightKg: 60,
    });
    expect("requirements" in profile).toBe(true);
    const requirements = (profile as { requirements: Record<string, Record<string, { value: number; unit: string }>> }).requirements;
    expect(requirements.iron.RDA.value).toBe(18);
    expect(requirements.iron.UL.value).toBe(45);
    expect(requirements.leucine.RDA_multiplier_per_kg.value).toBe(2520); // 42 mg/kg × 60
  });

  it("omits per-kg targets without weightKg and says so", () => {
    const profile = calculateTargetProfile({ species: "human" });
    expect((profile as { _hint?: string })._hint).toMatch(/weightKg/);
    const requirements = (profile as { requirements: Record<string, unknown> }).requirements;
    expect(requirements.leucine).toBeUndefined();
    expect(requirements.protein).toBeDefined(); // plain RDA still present
  });

  it("scales AAFCO pet standards by caloric intake", () => {
    const profile = calculateTargetProfile({
      species: "canine",
      caloricIntake: 1200,
    });
    const requirements = (profile as { requirements: Record<string, Record<string, { value: number; unit: string }>> }).requirements;
    expect(requirements.protein.MIN_per_1000kcal.value).toBeCloseTo(54); // 45 g × 1.2
  });

  it("defaults pets to adult_maintenance instead of erroring", () => {
    const profile = calculateTargetProfile({ species: "feline" });
    expect("requirements" in profile).toBe(true);
  });

  it("teaches available combos on an unknown authority", () => {
    const profile = calculateTargetProfile({
      species: "human",
      authority: "EFSA",
    });
    expect((profile as { error?: string }).error).toMatch(
      /Available species\/lifeStage\/authority/,
    );
  });
});

// ─── AAFCO pet profiles: full transcription ────────────────────

describe("calculateTargetProfile — AAFCO pet profiles", () => {
  const profileOf = (species: string, lifeStage?: string) =>
    (
      calculateTargetProfile({ species, lifeStage, caloricIntake: 1000 }) as {
        requirements: Record<string, Record<string, { value: number; unit: string }>>;
      }
    ).requirements;

  it("converts the IU-published fat-soluble vitamins to food-DB units", () => {
    const dog = profileOf("canine");
    // AAFCO publishes 1250 IU/1000 kcal; the IU figure was previously emitted
    // verbatim as mcg, overstating the target 3.3x and faking a deficiency.
    expect(dog.vitamin_a.MIN_per_1000kcal.value).toBe(375); // 1250 IU x 0.3
    expect(dog.vitamin_a.MIN_per_1000kcal.unit).toBe("mcg");
    expect(dog.vitamin_d.MIN_per_1000kcal.value).toBeCloseTo(3.125); // 125 IU
    expect(dog.alpha_tocopherol.MIN_per_1000kcal.value).toBeCloseTo(8.375); // 12.5 IU
  });

  it("carries the canine amino acid, fatty acid and B-vitamin panels", () => {
    const dog = profileOf("canine");
    expect(dog.arginine.MIN_per_1000kcal.value).toBeCloseTo(1.28);
    expect(dog.methionine_cystine.MIN_per_1000kcal.value).toBeCloseTo(1.63);
    expect(dog.phenylalanine_tyrosine.MIN_per_1000kcal.value).toBeCloseTo(1.85);
    expect(dog.c18_d2_n6_cis_cis.MIN_per_1000kcal.value).toBeCloseTo(2.8);
    expect(dog.vitamin_b5.MIN_per_1000kcal.value).toBeCloseTo(3.0);
    expect(dog.folate.MIN_per_1000kcal.value).toBeCloseTo(54);
    expect(dog.cyanocobalamin.MIN_per_1000kcal.value).toBeCloseTo(7);
  });

  it("gives cats the nutrients their obligate carnivory requires", () => {
    const cat = profileOf("feline");
    // Cats cannot make arachidonic acid from linoleic the way dogs can.
    expect(cat.c20_d4_n6.MIN_per_1000kcal.value).toBeCloseTo(0.05);
    expect(cat.taurine.MIN_per_1000kcal.value).toBe(250);
    expect(cat.arginine.MIN_per_1000kcal.value).toBeCloseTo(2.6);
    expect(cat.vitamin_a.MIN_per_1000kcal.value).toBeCloseTo(249.9); // 833 IU
    expect(cat.niacin.MIN_per_1000kcal.value).toBe(15);
    expect(cat.cyanocobalamin.MIN_per_1000kcal.value).toBeCloseTo(5);
  });

  it("uses the published kitten calcium minimum", () => {
    expect(profileOf("feline", "kitten").calcium.MIN_per_1000kcal.value).toBe(2500);
  });

  it("omits nutrients published as ND for a life stage", () => {
    // Adult dog alpha-linolenic is "Not Determined"; growth has a real minimum.
    expect(profileOf("canine").c18_d3_n3_cis_cis_cis).toBeUndefined();
    expect(
      profileOf("canine", "puppy").c18_d3_n3_cis_cis_cis.MIN_per_1000kcal.value,
    ).toBeCloseTo(0.2);
  });

  it("caps large-breed puppy calcium tighter than general growth", () => {
    expect(profileOf("canine", "puppy").calcium.MAX_per_1000kcal.value).toBe(6250);
    expect(
      profileOf("canine", "puppy_large_breed").calcium.MAX_per_1000kcal.value,
    ).toBe(4500);
  });

  it("publishes safety ceilings for the pet toxicity nutrients", () => {
    const dog = profileOf("canine");
    expect(dog.vitamin_a.MAX_per_1000kcal.value).toBe(18750); // 62500 IU
    expect(dog.vitamin_d.MAX_per_1000kcal.value).toBeCloseTo(18.75); // 750 IU
    expect(profileOf("feline").vitamin_d.MAX_per_1000kcal.value).toBeCloseTo(188);
  });
});

// ─── Gap analysis: end-to-end revival ──────────────────────────

describe("analyzeNutrientGaps — revived end-to-end", () => {
  it("produces real gaps for a simple food log", () => {
    const result = analyzeNutrientGaps({
      foods: [
        { name: "chicken", grams: 200 },
        { name: "rice", grams: 150 },
        { name: "broccoli", grams: 100 },
      ],
      weightKg: 75,
    });
    expect(result.error).toBeUndefined();
    expect(result.summary!.nutrientsEvaluated).toBeGreaterThan(20);
    expect(result.gaps!.length).toBeGreaterThan(20);
    expect(result.summary!.totalCalories).toBeGreaterThan(100);
  });

  it("personalizes the protein target per kg when weightKg is given", () => {
    const foods = [{ name: "chicken", grams: 200 }];
    const withWeight = analyzeNutrientGaps({ foods, weightKg: 100 });
    const proteinPersonalized = withWeight.gaps!.find(
      (gap) => gap.nutrient === "protein",
    )!;
    expect(proteinPersonalized.metric).toBe("RDA_multiplier_per_kg");
    expect(proteinPersonalized.target).toBeCloseTo(80); // 0.8 g/kg × 100

    const withoutWeight = analyzeNutrientGaps({ foods });
    const proteinFixed = withoutWeight.gaps!.find(
      (gap) => gap.nutrient === "protein",
    )!;
    expect(proteinFixed.metric).toBe("RDA");
    expect(proteinFixed.target).toBe(56); // adult_male reference-weight RDA
  });

  it("scores a combined target against every component nutrient", () => {
    // The met+cys requirement is a sum, so intake must count cystine too —
    // scoring it against methionine alone understates intake and fakes a gap.
    const food = searchFoods("chicken", { limit: 1 });
    const aminoAcids = ("foods" in food && food.foods[0].perHundredGrams.aminoAcids) as Record<string, number>;
    const expected = (aminoAcids.methionine_g + aminoAcids.cystine_g) * 3; // 300 g

    const result = analyzeNutrientGaps({
      foods: [{ name: "chicken", grams: 300 }],
      species: "canine",
      caloricIntake: 1000,
    });
    const combined = result.gaps!.find((gap) => gap.nutrient === "methionine_cystine")!;
    const methionineOnly = result.gaps!.find((gap) => gap.nutrient === "methionine")!;

    expect(combined.consumed).toBeCloseTo(expected, 3);
    expect(combined.consumed).toBeGreaterThan(methionineOnly.consumed);
  });

  it("measures pet intake against AAFCO maxima, not just minima", () => {
    const result = analyzeNutrientGaps({
      foods: [{ name: "chicken", grams: 300 }],
      species: "canine",
      caloricIntake: 1000,
    });
    const calcium = result.gaps!.find((gap) => gap.nutrient === "calcium")!;
    expect(calcium.metric).toBe("MIN_per_1000kcal");
    expect(calcium.percentageUL).not.toBeNull(); // ceiling comes from MAX_per_1000kcal
  });

  it("meal plans pick up micronutrient targets from the dataset", () => {
    const plan = buildMealPlan({ caloricTarget: 2000, weightKg: 75 });
    expect(plan.error).toBeUndefined();
    expect(Object.keys(plan.nutrientCoverage!).length).toBeGreaterThan(10);
    expect(plan.nutrientCoverage!.calcium).toBeDefined();
  });
});

// ─── Calculators: inert param + NaN holes ──────────────────────

describe("calculators — input handling", () => {
  it("caloric needs uses bodyFatPercentage for lean-mass output", () => {
    const result = calculateCaloricNeeds({
      sex: "male",
      weightKg: 80,
      heightCm: 180,
      ageYears: 30,
      bodyFatPercentage: 15,
    });
    expect(result.bodyComposition).not.toBeNull();
    expect(result.bodyComposition!.leanMassKg).toBe(68);
  });

  it("hydration rejects NaN climateTemp instead of assuming extreme heat", () => {
    const result = calculateHydrationNeeds({
      weightKg: 70,
      climateTemp: NaN, // parseFloat("hot")
    });
    expect(result.error).toMatch(/climateTemp/);
  });

  it("hydration rejects unknown exerciseIntensity", () => {
    const result = calculateHydrationNeeds({
      weightKg: 70,
      exerciseMinutes: 30,
      exerciseIntensity: "extreme",
    });
    expect(result.error).toMatch(/exerciseIntensity/);
    expect(result.validIntensities).toEqual(["low", "moderate", "high"]);
  });
});

// ─── Outlier scrub sanity ──────────────────────────────────────

describe("cross-source outlier scrub", () => {
  it("keeps the database loadable and non-empty after scrubbing", () => {
    const categories = getFoodCategories();
    expect(categories.totalFoods).toBeGreaterThan(15000);
  });
});
