// ────────────────────────────────────────────────────────────
// Tool Definitions — Health
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, staticDataset, compute, fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";

export function getHealthTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
  {
    name: "get_pollen_forecast",
    dataSource: onDemand("Google Pollen API (cached)"),
    description: translate("get_pollen_forecast.description"),
    endpoint: {
      path: "/weather/pollen/today",
      queryParams: ["fields"],
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.POLLEN),
      },
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "search_drugs",
    dataSource: onDemand("OpenFDA + FDA NDC API"),
    description: translate("search_drugs.description"),
    endpoint: {
      path: "/health/drugs/unified",
      queryParams: ["q", "searchBy", "limit", "dosageForm", "productType"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_drugs.params.q"),
        },
        searchBy: {
          type: "string",
          description: translate("search_drugs.params.searchBy"),
          enum: [
            "name",
            "ndc_search",
            "ndc_lookup",
            "ingredient",
            "pharm_class",
          ],
        },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
        dosageForm: {
          type: "string",
          description: translate("search_drugs.params.dosageForm"),
        },
        productType: {
          type: "string",
          description: translate("search_drugs.params.productType"),
        },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["q"],
    },
    display: {
      activeVerb: "Searching FDA drugs database for",
      completedVerb: "Searched FDA drugs database for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "get_drug_adverse_events",
    dataSource: onDemand("openFDA"),
    description: translate("get_drug_adverse_events.description"),
    endpoint: {
      path: "/health/drugs/adverse-events",
      queryParams: ["drug", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        drug: {
          type: "string",
          description: translate("get_drug_adverse_events.params.drug"),
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
        ...fieldsParam(FIELDS.DRUG_ADVERSE_EVENTS),
      },
      required: ["drug"],
    },
    display: {
      activeVerb: "Fetching adverse events for",
      completedVerb: "Fetched adverse events for",
      subjectParam: "drug",
      subjectFormat: "quoted",
    },
  },
  {
    name: "get_drug_recalls",
    dataSource: onDemand("openFDA"),
    description: translate("get_drug_recalls.description"),
    endpoint: {
      path: "/health/drugs/recalls",
      queryParams: ["q", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("get_drug_recalls.params.q"),
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
        ...fieldsParam(FIELDS.DRUG_RECALLS),
      },
    },
    display: {
      activeVerb: "Searching drug recalls for",
      completedVerb: "Searched drug recalls for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "search_gym_exercises",
    dataSource: staticDataset("Free Exercise DB & Wger"),
    description: translate("search_gym_exercises.description"),
    endpoint: {
      path: "/health/exercises/search",
      queryParams: [
        "q",
        "limit",
        "category",
        "equipment",
        "force",
        "level",
        "mechanic",
        "muscle",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_gym_exercises.params.q"),
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
        category: {
          type: "string",
          description: translate("search_gym_exercises.params.category"),
        },
        equipment: {
          type: "string",
          description: translate("search_gym_exercises.params.equipment"),
        },
        force: {
          type: "string",
          description: translate("search_gym_exercises.params.force"),
        },
        level: {
          type: "string",
          description: translate("search_gym_exercises.params.level"),
        },
        mechanic: {
          type: "string",
          description: translate("search_gym_exercises.params.mechanic"),
        },
        muscle: {
          type: "string",
          description: translate("search_gym_exercises.params.muscle"),
        },
        ...fieldsParam(FIELDS.EXERCISES),
      },
    },
    display: {
      activeVerb: "Searching gym exercises for",
      completedVerb: "Searched gym exercises for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "get_gym_exercise_categories",
    dataSource: staticDataset("Free Exercise DB & Wger"),
    description: translate("get_gym_exercise_categories.description"),
    endpoint: {
      path: "/health/exercises/categories",
      queryParams: [],
    },
    parameters: {
      type: "object",
      properties: {},
    },
    display: {
      activeVerb: "Fetching gym exercise categories",
      completedVerb: "Fetched gym exercise categories",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_gym_exercise_by_id",
    dataSource: staticDataset("Free Exercise DB & Wger"),
    description: translate("get_gym_exercise_by_id.description"),
    endpoint: {
      path: "/health/exercises/{id}",
      pathParams: ["id"],
    },
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: translate("get_gym_exercise_by_id.params.id"),
        },
        ...fieldsParam(FIELDS.EXERCISES),
      },
      required: ["id"],
    },
    display: {
      activeVerb: "Fetching gym exercise details for ID",
      completedVerb: "Fetched gym exercise details for ID",
      subjectParam: "id",
      subjectFormat: "full",
    },
  },
  {
    name: "search_food_nutrition",
    dataSource: staticDataset("Multi-source food composition DB"),
    description: translate("search_food_nutrition.description"),
    endpoint: {
      path: "/health/nutrition/search",
      queryParams: [
        "q",
        "limit",
        "kingdom",
        "foodType",
        "nutrientTypes",
        "taxonRank",
        "taxonValue",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_food_nutrition.params.q"),
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
        kingdom: {
          type: "string",
          description: translate("search_food_nutrition.params.kingdom"),
          enum: ["animalia", "plantae", "fungi", "protista"],
        },
        foodType: {
          type: "string",
          description: translate("search_food_nutrition.params.foodType"),
          enum: [
            "animal",
            "animal product",
            "plant",
            "fungus",
            "mushroom",
            "mineral",
          ],
        },
        nutrientTypes: {
          type: "string",
          description: translate("search_food_nutrition.params.nutrientTypes"),
        },
        taxonRank: {
          type: "string",
          description: translate("search_food_nutrition.params.taxonRank"),
          enum: [
            "kingdom",
            "phylum",
            "class",
            "order",
            "family",
            "genus",
            "species",
            "cultivar",
          ],
        },
        taxonValue: {
          type: "string",
          description: translate("search_food_nutrition.params.taxonValue"),
        },
        ...fieldsParam(FIELDS.USDA_NUTRITION),
      },
      required: [],
    },
    display: {
      activeVerb: "Searching food nutrition data for",
      completedVerb: "Searched food nutrition data for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "rank_foods_by_nutrient",
    dataSource: staticDataset("USDA SR Legacy"),
    description: translate("rank_foods_by_nutrient.description"),
    endpoint: {
      path: "/health/nutrition/rank",
      queryParams: [
        "nutrient",
        "category",
        "limit",
        "kingdom",
        "foodType",
        "sources",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        nutrient: {
          type: "string",
          description: translate("rank_foods_by_nutrient.params.nutrient"),
        },
        category: {
          type: "string",
          description: translate("rank_foods_by_nutrient.params.category"),
          enum: [
            "macros",
            "minerals",
            "vitamins",
            "amino_acids",
            "lipids",
            "carbs",
            "sterols",
          ],
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
        kingdom: {
          type: "string",
          description: translate("rank_foods_by_nutrient.params.kingdom"),
          enum: ["animalia", "plantae", "fungi", "protista"],
        },
        foodType: {
          type: "string",
          description: translate("rank_foods_by_nutrient.params.foodType"),
          enum: [
            "animal",
            "animal product",
            "plant",
            "fungus",
            "mushroom",
            "mineral",
          ],
        },
        sources: {
          type: "string",
          description: translate("rank_foods_by_nutrient.params.sources"),
          enum: ["usda", "all"],
        },
        ...fieldsParam(FIELDS.USDA_NUTRIENT_RANKING),
      },
      required: ["nutrient"],
    },
    display: {
      activeVerb: "Ranking foods by nutrient",
      completedVerb: "Ranked foods by nutrient",
      subjectParam: "nutrient",
      subjectFormat: "full",
    },
  },
  {
    name: "compare_food_nutrition",
    dataSource: staticDataset("USDA SR Legacy"),
    description: translate("compare_food_nutrition.description"),
    endpoint: {
      path: "/health/nutrition/compare",
      queryParams: ["foods", "nutrientTypes"],
    },
    parameters: {
      type: "object",
      properties: {
        foods: {
          type: "string",
          description: translate("compare_food_nutrition.params.foods"),
        },
        nutrientTypes: {
          type: "string",
          description: translate("compare_food_nutrition.params.nutrientTypes"),
        },
        ...fieldsParam(FIELDS.USDA_NUTRITION),
      },
      required: ["foods"],
    },
    display: {
      activeVerb: "Comparing nutritional values for",
      completedVerb: "Compared nutritional values for",
      subjectParam: "foods",
      subjectFormat: "quoted",
    },
  },
  {
    name: "get_nutrition_reference",
    dataSource: staticDataset("Multi-source food composition DB"),
    description: translate("get_nutrition_reference.description"),
    endpoint: {
      path: "/health/nutrition/reference",
      queryParams: ["topic", "category", "rank", "parentRank", "parentValue"],
    },
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: translate("get_nutrition_reference.params.topic"),
          enum: ["categories", "nutrients", "taxonomy"],
        },
        category: {
          type: "string",
          description: translate("get_nutrition_reference.params.category"),
          enum: [
            "macros",
            "minerals",
            "vitamins",
            "amino_acids",
            "lipids",
            "carbs",
            "sterols",
          ],
        },
        rank: {
          type: "string",
          description: translate("get_nutrition_reference.params.rank"),
          enum: [
            "kingdom",
            "phylum",
            "class",
            "order",
            "family",
            "genus",
            "species",
            "cultivar",
          ],
        },
        parentRank: {
          type: "string",
          description: translate("get_nutrition_reference.params.parentRank"),
          enum: ["kingdom", "phylum", "class", "order", "family", "genus"],
        },
        parentValue: {
          type: "string",
          description: translate("get_nutrition_reference.params.parentValue"),
        },
      },
      required: ["topic"],
    },
    display: {
      activeVerb: "Fetching nutrition reference",
      completedVerb: "Fetched nutrition reference",
      subjectParam: "topic",
      subjectFormat: "full",
    },
  },
      {
    name: "get_nutritional_requirements",
    dataSource: staticDataset("Multispecies Standards Database"),
    description: translate("get_nutritional_requirements.description"),
    endpoint: {
      path: "/health/nutrition/requirements",
      queryParams: [
        "species",
        "lifeStage",
        "authority",
        "weightKg",
        "caloricIntake",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        species: {
          type: "string",
          description: translate("get_nutritional_requirements.params.species"),
          enum: ["human", "canine", "feline"],
        },
        lifeStage: {
          type: "string",
          description: translate("get_nutritional_requirements.params.lifeStage"),
          enum: [
            "adult_male",
            "adult_female",
            "adult_maintenance",
            "puppy",
            "kitten",
          ],
        },
        authority: {
          type: "string",
          description: translate("get_nutritional_requirements.params.authority"),
          enum: ["US_DRI", "AAFCO"],
        },
        weightKg: {
          type: "number",
          description: translate("get_nutritional_requirements.params.weightKg"),
        },
        caloricIntake: {
          type: "number",
          description: translate("get_nutritional_requirements.params.caloricIntake"),
        },
      },
    },
    display: {
      activeVerb: "Fetching nutritional requirements",
      completedVerb: "Fetched nutritional requirements",
      subjectParam: "species",
      subjectFormat: "full",
    },
  },
  {
    name: "calculate_caloric_needs",
    dataSource: compute("Mifflin-St Jeor / TDEE"),
    description: translate("calculate_caloric_needs.description"),
    endpoint: {
      path: "/health/calories/calculate",
      queryParams: [
        "sex",
        "weightKg",
        "heightCm",
        "ageYears",
        "activityLevel",
        "goal",
        "macroSplit",
        "bodyFatPct",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        sex: {
          type: "string",
          description: translate("calculate_caloric_needs.params.sex"),
          enum: ["male", "female"],
        },
        weightKg: {
          type: "number",
          description: translate("estimate_exercise_calories.params.weightKg"),
        },
        heightCm: {
          type: "number",
          description: translate("calculate_caloric_needs.params.heightCm"),
        },
        ageYears: {
          type: "number",
          description: translate("calculate_caloric_needs.params.ageYears"),
        },
        activityLevel: {
          type: "string",
          description: translate("calculate_hydration_needs.params.activityLevel"),
          enum: ["sedentary", "light", "moderate", "active", "very_active"],
        },
        goal: {
          type: "string",
          description: translate("calculate_caloric_needs.params.goal"),
          enum: ["maintain", "cut", "aggressive_cut", "lean_bulk", "bulk"],
        },
        macroSplit: {
          type: "string",
          description: translate("calculate_caloric_needs.params.macroSplit"),
          enum: ["balanced", "high_protein", "keto", "low_fat", "zone"],
        },
        "bodyFatPct": {
          type: "number",
          description: translate("calculate_caloric_needs.params.bodyFatPct"),
        },
      },
      required: ["sex", "weightKg", "heightCm", "ageYears"],
    },
    display: {
      activeVerb: "Calculating caloric needs for",
      completedVerb: "Calculated caloric needs for",
      subjectParam: "sex",
      subjectFormat: "full",
    },
  },
  {
    name: "analyze_nutrient_gaps",
    dataSource: compute("Nutrient Gap Engine"),
    description: translate("analyze_nutrient_gaps.description"),
    endpoint: {
      path: "/health/nutrition/gap-analysis",
      queryParams: [
        "foods",
        "species",
        "lifeStage",
        "authority",
        "weightKg",
        "caloricIntake",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        foods: {
          type: "array",
          description: translate("analyze_nutrient_gaps.params.foods"),
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              grams: { type: "number" },
            },
            required: ["name", "grams"],
          },
        },
        species: {
          type: "string",
          description: translate("build_meal_plan.params.species"),
          enum: ["human", "canine", "feline"],
        },
        lifeStage: {
          type: "string",
          description: translate("build_meal_plan.params.lifeStage"),
          enum: [
            "adult_male",
            "adult_female",
            "adult_maintenance",
            "puppy",
            "kitten",
          ],
        },
        weightKg: {
          type: "number",
          description: translate("analyze_nutrient_gaps.params.weightKg"),
        },
        caloricIntake: {
          type: "number",
          description: translate("analyze_nutrient_gaps.params.caloricIntake"),
        },
      },
      required: ["foods"],
    },
    display: {
      activeVerb: "Analyzing nutrient gaps for",
      completedVerb: "Analyzed nutrient gaps for",
      subjectParam: "species",
      subjectFormat: "full",
    },
  },
  {
    name: "search_food_substitutes",
    dataSource: compute("Nutrient Similarity Engine"),
    description: translate("search_food_substitutes.description"),
    endpoint: {
      path: "/health/nutrition/substitutes",
      queryParams: [
        "food",
        "targetNutrients",
        "dietaryPreference",
        "excludeKingdom",
        "excludeFoods",
        "limit",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        food: {
          type: "string",
          description: translate("search_food_substitutes.params.food"),
        },
        targetNutrients: {
          type: "string",
          description: translate("search_food_substitutes.params.targetNutrients"),
        },
        dietaryPreference: {
          type: "string",
          description: translate("search_food_substitutes.params.dietaryPreference"),
          enum: ["vegetarian", "vegan", "pescatarian", "plant_only", "keto"],
        },
        excludeKingdom: {
          type: "string",
          description: translate("search_food_substitutes.params.excludeKingdom"),
          enum: ["animalia", "plantae", "fungi"],
        },
        excludeFoods: {
          type: "string",
          description: translate("search_food_substitutes.params.excludeFoods"),
        },
        limit: {
          type: "number",
          description: translate("common.params.maxResultsDefault10"),
        },
      },
      required: ["food"],
    },
    display: {
      activeVerb: "Searching food substitutes for",
      completedVerb: "Searched food substitutes for",
      subjectParam: "food",
      subjectFormat: "quoted",
    },
  },
  {
    name: "estimate_exercise_calories",
    dataSource: compute("Compendium of Physical Activities MET Table"),
    description: translate("estimate_exercise_calories.description"),
    endpoint: {
      path: "/health/exercises/calories",
      queryParams: [
        "exercise",
        "durationMinutes",
        "weightKg",
        "intensity",
        "category",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        exercise: {
          type: "string",
          description: translate("estimate_exercise_calories.params.exercise"),
        },
        durationMinutes: {
          type: "number",
          description: translate("estimate_exercise_calories.params.durationMinutes"),
        },
        weightKg: {
          type: "number",
          description: translate("estimate_exercise_calories.params.weightKg"),
        },
        intensity: {
          type: "string",
          description: translate("estimate_exercise_calories.params.intensity"),
          enum: ["low", "moderate", "high"],
        },
        category: {
          type: "string",
          description: translate("estimate_exercise_calories.params.category"),
        },
      },
      required: ["exercise", "durationMinutes", "weightKg"],
    },
    display: {
      activeVerb: "Estimating calorie burn for",
      completedVerb: "Estimated calorie burn for",
      subjectParam: "exercise",
      subjectFormat: "quoted",
    },
  },
  {
    name: "calculate_hydration_needs",
    dataSource: compute("ACSM Hydration Model"),
    description: translate("calculate_hydration_needs.description"),
    endpoint: {
      path: "/health/hydration/calculate",
      queryParams: [
        "weightKg",
        "activityLevel",
        "climateTemp",
        "exerciseMinutes",
        "exerciseIntensity",
        "altitudeM",
        "pregnant",
        "breastfeeding",
        "caffeineIntakeMg",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        weightKg: {
          type: "number",
          description: translate("estimate_exercise_calories.params.weightKg"),
        },
        activityLevel: {
          type: "string",
          description: translate("calculate_hydration_needs.params.activityLevel"),
          enum: ["sedentary", "light", "moderate", "active", "very_active"],
        },
        climateTemp: {
          type: "number",
          description: translate("calculate_hydration_needs.params.climateTemp"),
        },
        exerciseMinutes: {
          type: "number",
          description: translate("calculate_hydration_needs.params.exerciseMinutes"),
        },
        exerciseIntensity: {
          type: "string",
          description: translate("calculate_hydration_needs.params.exerciseIntensity"),
          enum: ["low", "moderate", "high"],
        },
        altitudeM: {
          type: "number",
          description: translate("calculate_hydration_needs.params.altitudeM"),
        },
        pregnant: {
          type: "string",
          description: translate("calculate_hydration_needs.params.pregnant"),
          enum: ["true", "false"],
        },
        breastfeeding: {
          type: "string",
          description: translate("calculate_hydration_needs.params.breastfeeding"),
          enum: ["true", "false"],
        },
        caffeineIntakeMg: {
          type: "number",
          description: translate("calculate_hydration_needs.params.caffeineIntakeMg"),
        },
      },
      required: ["weightKg"],
    },
    display: {
      activeVerb: "Calculating hydration needs",
      completedVerb: "Calculated hydration needs",
      subjectParam: "activityLevel",
      subjectFormat: "full",
    },
  },
  {
    name: "build_meal_plan",
    dataSource: compute("Meal Optimization Engine"),
    description: translate("build_meal_plan.description"),
    endpoint: {
      path: "/health/nutrition/meal-plan",
      queryParams: [
        "caloricTarget",
        "mealsPerDay",
        "dietaryPreference",
        "excludeFoods",
        "emphasizeNutrients",
        "species",
        "lifeStage",
        "weightKg",
        "itemsPerMeal",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        caloricTarget: {
          type: "number",
          description: translate("build_meal_plan.params.caloricTarget"),
        },
        mealsPerDay: {
          type: "number",
          description: translate("build_meal_plan.params.mealsPerDay"),
        },
        dietaryPreference: {
          type: "string",
          description: translate("search_food_substitutes.params.dietaryPreference"),
          enum: [
            "omnivore",
            "vegetarian",
            "vegan",
            "pescatarian",
            "plant_only",
            "keto",
          ],
        },
        excludeFoods: {
          type: "string",
          description: translate("build_meal_plan.params.excludeFoods"),
        },
        emphasizeNutrients: {
          type: "string",
          description: translate("build_meal_plan.params.emphasizeNutrients"),
        },
        species: {
          type: "string",
          description: translate("build_meal_plan.params.species"),
          enum: ["human", "canine", "feline"],
        },
        lifeStage: {
          type: "string",
          description: translate("build_meal_plan.params.lifeStage"),
          enum: [
            "adult_male",
            "adult_female",
            "adult_maintenance",
            "puppy",
            "kitten",
          ],
        },
        weightKg: {
          type: "number",
          description: translate("build_meal_plan.params.weightKg"),
        },
        itemsPerMeal: {
          type: "number",
          description: translate("build_meal_plan.params.itemsPerMeal"),
        },
      },
      required: ["caloricTarget"],
    },
    display: {
      activeVerb: "Building meal plan for target",
      completedVerb: "Built meal plan for target",
      subjectParam: "caloricTarget",
      subjectFormat: "full",
    },
  },
  {
    name: "check_drug_nutrient_interactions",
    dataSource: staticDataset("Drug-Nutrient Interaction DB"),
    description: translate("check_drug_nutrient_interactions.description"),
    endpoint: {
      path: "/health/drugs/nutrient-interactions",
      queryParams: ["drug", "nutrients"],
    },
    parameters: {
      type: "object",
      properties: {
        drug: {
          type: "string",
          description: translate("check_drug_nutrient_interactions.params.drug"),
        },
        nutrients: {
          type: "string",
          description: translate("check_drug_nutrient_interactions.params.nutrients"),
        },
      },
      required: ["drug"],
    },
    display: {
      activeVerb: "Checking drug-nutrient interactions for",
      completedVerb: "Checked drug-nutrient interactions for",
      subjectParam: "drug",
      subjectFormat: "quoted",
    },
  },
  {
    name: "list_drug_dosage_forms",
    dataSource: staticDataset("FDA NDC Directory"),
    description: translate("list_drug_dosage_forms.description"),
    endpoint: { path: "/health/drugs/ndc/dosage-forms" },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.FDA_DOSAGE_FORMS),
      },
    },
    display: {
      activeVerb: "Listing drug dosage forms",
      completedVerb: "Listed drug dosage forms",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  ];
}
