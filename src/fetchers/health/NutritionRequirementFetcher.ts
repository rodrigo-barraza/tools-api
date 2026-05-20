import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CSV Parser ────────────────────────────────────────────────

function parseCSVLine(line: any) {
  const fields: any[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Load & Index ──────────────────────────────────────────────

const REQUIREMENTS_DB: any[] = [];
let loaded = false;

function ensureLoaded() {
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
    const lines = raw.split("\n").filter((l: any) => l.trim());
    const headers = parseCSVLine(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < headers.length) continue;

      const row: Record<string, any> = {};
      headers.forEach((h: any, index: any) => {
        row[h] = values[index] || "";
      });
      
      row.value_numeric = parseFloat(row.value_numeric);
      REQUIREMENTS_DB.push(row);
    }
    logger.info(`📊 Nutrition Requirement DB loaded: ${REQUIREMENTS_DB.length} rules.`);
  } catch (error: any) {
    logger.error("Failed to load digest_nutrient_requirement.csv", error);
  }
}

// ─── Target Profile Engine ─────────────────────────────────────

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
}: any) {
  ensureLoaded();

  const speciesLower = (species || "human").toLowerCase();
  const lifeStageLower = (lifeStage || "adult_male").toLowerCase();
  const targetAuth = (authority || (speciesLower === "human" ? "US_DRI" : "AAFCO")).toUpperCase();

  const baseRules = REQUIREMENTS_DB.filter(
    (r: any) =>
      r.species.toLowerCase() === speciesLower &&
      r.demographic_life_stage.toLowerCase() === lifeStageLower &&
      r.authority.toUpperCase() === targetAuth,
  );

  const requirements: Record<string, any> = {};
  const compositional: any[] = [];
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
