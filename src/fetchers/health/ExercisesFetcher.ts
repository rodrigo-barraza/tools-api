import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";
import { Exercise } from "../../types/health.ts";

/**
 * Exercises Fetcher — Static In-Memory Database
 *
 * Loads gym exercises into memory.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

const EXERCISE_DB: Exercise[] = [];
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;

  const dataDir = join(__dirname, "data");
  let files: string[] = [];
  try {
    files = readdirSync(dataDir).filter((f: string) => f.startsWith("digest_exercises") && f.endsWith(".csv"));
  } catch (error) {
    logger.error(`Error reading exercises directory: ${(error as Error).message}`);
    return;
  }
  
  let totalCount = 0;

  for (const file of files) {
    const dataPath = join(dataDir, file);
    const rawData = readFileSync(dataPath, "utf-8");
    const lines = rawData.split("\n").filter((l: string) => l.trim());
    
    if (lines.length === 0) continue;
    const headers = parseCSVLine(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length < headers.length) continue;

      // Infer source from filename (e.g. digest_exercises.csv -> Free Exercise DB, digest_exercises_wger.csv -> WGER)
      const isWger = file.includes("wger");
      const source = isWger ? "Wger" : "Free Exercise DB";

      const row: Exercise = {
        id: "",
        name: "",
        category: "",
        equipment: "",
        force: "",
        level: "",
        mechanic: "",
        primary_muscles: [],
        secondary_muscles: [],
        _source: source
      };

      headers.forEach((h: string, index: number) => {
        const value = values[index] || "";
        if (h === "category" || h === "equipment") {
          row[h] = value.toLowerCase();
        } else if (h === "primary_muscles" || h === "secondary_muscles") {
          row[h] = value ? value.split("|").map((m: string) => m.toLowerCase()) : [];
        } else {
          row[h] = value;
        }
      });

      EXERCISE_DB.push(row);
      totalCount++;
    }
  }

  logger.info(`🏋️ Exercises DB loaded: ${totalCount} exercises from ${files.length} sources`);
}

function normalizeSearch(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function normalizeQuery(str: string | undefined | null): string {
  return str ? str.toLowerCase().trim() : "";
}

export interface SearchExercisesOptions {
  limit?: number;
  category?: string;
  equipment?: string;
  force?: string;
  level?: string;
  mechanic?: string;
  muscle?: string;
}

export interface SearchExercisesResult {
  count: number;
  returned: number;
  query: string | null;
  exercises: Exercise[];
}

export function searchExercises(query: string | null | undefined, opts: SearchExercisesOptions = {}): SearchExercisesResult {
  ensureLoaded();

  const {
    limit = 10,
    category,
    equipment,
    force,
    level,
    mechanic,
    muscle,
  } = opts;

  let candidates = EXERCISE_DB;

  if (category) {
    const f = normalizeQuery(category);
    candidates = candidates.filter((c: Exercise) => normalizeQuery(c.category) === f);
  }
  if (equipment) {
    const f = normalizeQuery(equipment);
    candidates = candidates.filter((c: Exercise) => normalizeQuery(c.equipment) === f);
  }
  if (force) {
    const f = normalizeQuery(force);
    candidates = candidates.filter((c: Exercise) => normalizeQuery(c.force) === f);
  }
  if (level) {
    const f = normalizeQuery(level);
    candidates = candidates.filter((c: Exercise) => normalizeQuery(c.level) === f);
  }
  if (mechanic) {
    const f = normalizeQuery(mechanic);
    candidates = candidates.filter((c: Exercise) => normalizeQuery(c.mechanic) === f);
  }
  if (muscle) {
    const f = normalizeQuery(muscle);
    candidates = candidates.filter(
      (c: Exercise) =>
        c.primary_muscles.some((m: string) => normalizeQuery(m) === f) ||
        c.secondary_muscles.some((m: string) => normalizeQuery(m) === f)
    );
  }

  if (query) {
    const term = normalizeSearch(query);
    candidates = candidates.filter((c: Exercise) => {
      const parts = term.split(/\s+/).filter(Boolean);
      const name = normalizeSearch(c.name);
      const id = normalizeSearch(c.id);
      return parts.every((p: string) => name.includes(p) || id.includes(p));
    });
  }

  return {
    count: candidates.length,
    returned: Math.min(candidates.length, limit),
    query: query || null,
    exercises: candidates.slice(0, limit),
  };
}

export function getExerciseById(id: string): Exercise | null {
  ensureLoaded();
  const normalized = normalizeQuery(id);
  const ex = EXERCISE_DB.find((c: Exercise) => normalizeQuery(c.id) === normalized);
  return ex || null;
}

export interface ExerciseCategoriesResult {
  totalExercises: number;
  categories: string[];
  equipment: string[];
  muscles: string[];
}

export function getExerciseCategories(): ExerciseCategoriesResult {
  ensureLoaded();
  const categories = [...new Set(EXERCISE_DB.map((e: Exercise) => e.category).filter(Boolean))];
  const equipment = [...new Set(EXERCISE_DB.map((e: Exercise) => e.equipment).filter(Boolean))];
  const muscles = [
    ...new Set(EXERCISE_DB.flatMap((e: Exercise) => [...e.primary_muscles, ...e.secondary_muscles]).filter(Boolean)),
  ];

  return {
    totalExercises: EXERCISE_DB.length,
    categories: categories.sort(),
    equipment: equipment.sort(),
    muscles: muscles.sort(),
  };
}

