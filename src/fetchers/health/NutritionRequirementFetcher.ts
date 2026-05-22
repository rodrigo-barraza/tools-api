import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CSV Parser ────────────────────────────────────────────────

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

// ─── Load & Index ──────────────────────────────────────────────

export interface RequirementRule {
  species: string;
  demographic_life_stage: string;
  authority: string;
  metric: string;
  value_numeric: number;
  unit: string;
  nutrient_id: string;
  [key: string]: string | number;
}

const REQUIREMENTS_DB: RequirementRule[] = [];
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;

  const datasetPath = join(
    __dirname,
    "..",
    "..",
    "..",
    "digest",
    "database",
    "data",
    "digest_nutrient_requirement.csv"
  );
  
  try {
    const raw = readFileSync(datasetPath, "utf-8");
    const lines = raw.split("\n").filter((l: string) => l.trim());
    if (lines.length === 0) return;
    const headers = parseCSVLine(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < headers.length) continue;

      const row: RequirementRule = {
        species: "",
        demographic_life_stage: "",
        authority: "",
        metric: "",
        value_numeric: 0,
        unit: "",
        nutrient_id: "",
      };
      
      headers.forEach((h: string, index: number) => {
        const val = values[index] || "";
        if (h === "value_numeric") {
          row.value_numeric = parseFloat(val) || 0;
        } else {
          row[h] = val;
        }
      });
      
      REQUIREMENTS_DB.push(row);
    }
    logger.info(`📊 Nutrition Requirement DB loaded: ${REQUIREMENTS_DB.length} rules.`);
  } catch (error: unknown) {
    logger.error("Failed to load digest_nutrient_requirement.csv", error);
  }
}

// ─── Target Profile Engine ─────────────────────────────────────

export interface CalculateTargetProfileOptions {
  species?: string;
  lifeStage?: string;
  authority?: string;
  weightKg?: number;
  caloricIntake?: number;
  includeCompositional?: boolean;
}

export interface NutrientTargetMetricData {
  value: number;
  unit: string;
}

export type NutrientTargetMetrics = Record<string, NutrientTargetMetricData>;

export interface TargetProfileResult {
  _context: {
    species: string;
    lifeStage: string;
    authority: string;
    weightKg?: number;
    caloricIntake?: number;
  };
  _summary: {
    actionableNutrients: number;
    compositionalNutrients: number;
    totalRulesMatched: number;
  };
  requirements: Record<string, NutrientTargetMetrics>;
  error?: string;
}

/**
 * Dynamically compile the nutritional requirement checklist for an agent context.
 */
export function calculateTargetProfile({
  species,
  lifeStage,
  authority,
  weightKg,
  caloricIntake,
  includeCompositional = false,
}: CalculateTargetProfileOptions = {}): TargetProfileResult | { error: string } {
  ensureLoaded();

  const speciesLower = (species || "human").toLowerCase();
  const lifeStageLower = (lifeStage || "adult_male").toLowerCase();
  const targetAuth = (authority || (speciesLower === "human" ? "US_DRI" : "AAFCO")).toUpperCase();

  const baseRules = REQUIREMENTS_DB.filter(
    (r: RequirementRule) =>
      r.species.toLowerCase() === speciesLower &&
      r.demographic_life_stage.toLowerCase() === lifeStageLower &&
      r.authority.toUpperCase() === targetAuth,
  );

  const requirements: Record<string, NutrientTargetMetrics> = {};
  const compositional: string[] = [];
  const kcalMult = caloricIntake ? caloricIntake / 1000.0 : 1;

  for (const rule of baseRules) {
    // Skip NO_DRI compositional nutrients unless explicitly requested
    if (rule.metric === "NO_DRI") {
      compositional.push(rule.nutrient_id);
      if (!includeCompositional) continue;
    }

    if (!requirements[rule.nutrient_id]) {
      requirements[rule.nutrient_id] = {};
    }

    const nutrientNode = requirements[rule.nutrient_id];
    let calculatedValue = rule.value_numeric;
    let finalUnit = rule.unit;

    // Execute context-aware math scaling based on human weight or pet calories
    if (rule.metric === "RDA_multiplier_per_kg" && weightKg) {
      calculatedValue = rule.value_numeric * weightKg;
    } else if (rule.metric.includes("per_1000kcal") && caloricIntake) {
      calculatedValue = rule.value_numeric * kcalMult;
      finalUnit = finalUnit.replace("_per_1000kcal", "");
    }

    nutrientNode[rule.metric] = {
      value: Number(calculatedValue.toFixed(4)),
      unit: finalUnit,
    };
  }

  return {
    _context: {
      species: speciesLower,
      lifeStage: lifeStageLower,
      authority: targetAuth,
      weightKg,
      caloricIntake,
    },
    _summary: {
      actionableNutrients: Object.keys(requirements).length,
      compositionalNutrients: compositional.length,
      totalRulesMatched: baseRules.length,
    },
    requirements,
  };
}

