import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";
import { Exercise } from "../../types/health.ts";
import { normalizeSearchText } from "@rodrigo-barraza/utilities-library";

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

export function ensureLoaded(): void {
  if (loaded) return;

  const dataDir = join(__dirname, "data");
  const files = readdirSync(dataDir).filter(
    (fileName: string) =>
      fileName.startsWith("digest_exercises") && fileName.endsWith(".csv"),
  );

  let totalCount = 0;

  for (const file of files) {
    const dataPath = join(dataDir, file);
    const rawData = readFileSync(dataPath, "utf-8");
    const lines = rawData.split("\n").filter((line: string) => line.trim());

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
        _source: source,
      };

      headers.forEach((header: string, index: number) => {
        const value = values[index] || "";
        if (header === "category" || header === "equipment") {
          row[header] = value.toLowerCase();
        } else if (
          header === "primary_muscles" ||
          header === "secondary_muscles"
        ) {
          row[header] = value
            ? value.split("|").map((muscle: string) => muscle.toLowerCase())
            : [];
        } else {
          row[header] = value;
        }
      });

      EXERCISE_DB.push(row);
      totalCount++;
    }
  }

  logger.info(
    `🏋️ Exercises DB loaded: ${totalCount} exercises from ${files.length} sources`,
  );
  loaded = true;
}

function normalizeSearch(searchText: string): string {
  return normalizeSearchText(searchText);
}

function normalizeQuery(searchText: string | undefined | null): string {
  return searchText ? searchText.toLowerCase().trim() : "";
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

export function searchExercises(
  query: string | null | undefined,
  opts: SearchExercisesOptions = {},
): SearchExercisesResult {
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
    const normalizedFilterValue = normalizeQuery(category);
    candidates = candidates.filter(
      (exercise: Exercise) =>
        normalizeQuery(exercise.category) === normalizedFilterValue,
    );
  }
  if (equipment) {
    const normalizedFilterValue = normalizeQuery(equipment);
    candidates = candidates.filter(
      (exercise: Exercise) =>
        normalizeQuery(exercise.equipment) === normalizedFilterValue,
    );
  }
  if (force) {
    const normalizedFilterValue = normalizeQuery(force);
    candidates = candidates.filter(
      (exercise: Exercise) =>
        normalizeQuery(exercise.force) === normalizedFilterValue,
    );
  }
  if (level) {
    const normalizedFilterValue = normalizeQuery(level);
    candidates = candidates.filter(
      (exercise: Exercise) =>
        normalizeQuery(exercise.level) === normalizedFilterValue,
    );
  }
  if (mechanic) {
    const normalizedFilterValue = normalizeQuery(mechanic);
    candidates = candidates.filter(
      (exercise: Exercise) =>
        normalizeQuery(exercise.mechanic) === normalizedFilterValue,
    );
  }
  if (muscle) {
    const normalizedFilterValue = normalizeQuery(muscle);
    candidates = candidates.filter(
      (exercise: Exercise) =>
        exercise.primary_muscles.some(
          (muscleValue: string) =>
            normalizeQuery(muscleValue) === normalizedFilterValue,
        ) ||
        exercise.secondary_muscles.some(
          (muscleValue: string) =>
            normalizeQuery(muscleValue) === normalizedFilterValue,
        ),
    );
  }

  if (query) {
    const term = normalizeSearch(query);
    candidates = candidates.filter((exercise: Exercise) => {
      const parts = term.split(/\s+/).filter(Boolean);
      const name = normalizeSearch(exercise.name);
      const id = normalizeSearch(exercise.id);
      return parts.every(
        (part: string) => name.includes(part) || id.includes(part),
      );
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
  const foundExercise = EXERCISE_DB.find(
    (exercise: Exercise) => normalizeQuery(exercise.id) === normalized,
  );
  return foundExercise || null;
}

export interface ExerciseCategoriesResult {
  totalExercises: number;
  categories: string[];
  equipment: string[];
  muscles: string[];
}

export function getExerciseCategories(): ExerciseCategoriesResult {
  ensureLoaded();
  const categories = [
    ...new Set(
      EXERCISE_DB.map((exercise: Exercise) => exercise.category).filter(
        Boolean,
      ),
    ),
  ];
  const equipment = [
    ...new Set(
      EXERCISE_DB.map((exercise: Exercise) => exercise.equipment).filter(
        Boolean,
      ),
    ),
  ];
  const muscles = [
    ...new Set(
      EXERCISE_DB.flatMap((exercise: Exercise) => [
        ...exercise.primary_muscles,
        ...exercise.secondary_muscles,
      ]).filter(Boolean),
    ),
  ];

  return {
    totalExercises: EXERCISE_DB.length,
    categories: categories.sort(),
    equipment: equipment.sort(),
    muscles: muscles.sort(),
  };
}
