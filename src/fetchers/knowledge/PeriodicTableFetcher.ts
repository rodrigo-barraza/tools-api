import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";
import { PeriodicElement, FormattedElement } from "../../types/knowledge.ts";

/**
 * Periodic Table Fetcher — Static In-Memory Element Database
 *
 * Loads all 118+ elements from a curated digest CSV into memory.
 * Provides search, lookup, ranking, and category queries
 * without any external API calls.
 *
 * Source: Bowserinator/Periodic-Table-JSON (CC BY-SA 3.0)
 */

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
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

const ELEMENT_DB: PeriodicElement[] = [];
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;

  const csvPath = join(__dirname, "data", "digest_elements.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((line: string) => line.trim());
  const headers = parseCSVLine(lines[0]);

  const NUMERIC_FIELDS = new Set([
    "atomic_number",
    "atomic_mass",
    "group_number",
    "period",
    "electronegativity",
    "density_g_cm3",
    "molar_heat_j_mol_k",
    "electron_affinity_kj_mol",
    "first_ionization_energy_kj_mol",
    "melting_point_k",
    "boiling_point_k",
  ]);

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 5) continue;

    const row: Record<string, string | number | null> = {};
    headers.forEach((header: string, index: number) => {
      const value = values[index] || "";
      if (NUMERIC_FIELDS.has(header)) {
        const num = parseFloat(value);
        row[header] = isNaN(num) ? null : num;
      } else {
        row[header] = value || null;
      }
    });

    ELEMENT_DB.push(row as PeriodicElement);
  }

  logger.info(`⚛️  Periodic Table loaded: ${ELEMENT_DB.length} elements`);
}

// ─── Helpers ───────────────────────────────────────────────────

function normalizeSearch(searchText: string): string {
  return searchText.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function formatElement(element: PeriodicElement): FormattedElement {
  return {
    atomicNumber: element.atomic_number,
    symbol: element.symbol,
    name: element.name,
    atomicMass: element.atomic_mass,
    category: element.category,
    groupNumber: element.group_number,
    period: element.period,
    block: element.block,
    electronConfiguration: element.electron_configuration,
    electronegativity: element.electronegativity,
    density: element.density_g_cm3,
    molarHeat: element.molar_heat_j_mol_k,
    electronAffinity: element.electron_affinity_kj_mol,
    firstIonizationEnergy: element.first_ionization_energy_kj_mol,
    phaseAtSTP: element.phase_at_stp,
    meltingPoint: element.melting_point_k,
    boilingPoint: element.boiling_point_k,
    appearance: element.appearance,
    discoveredBy: element.discovered_by,
    cpkHexColor: element.cpk_hex_color,
    summary: element.summary,
  };
}

// ─── Rankable Properties ───────────────────────────────────────

const RANKABLE_PROPERTIES = {
  atomic_mass: "Atomic Mass (u)",
  electronegativity: "Electronegativity (Pauling)",
  density_g_cm3: "Density (g/cm³)",
  molar_heat_j_mol_k: "Molar Heat (J/mol·K)",
  electron_affinity_kj_mol: "Electron Affinity (kJ/mol)",
  first_ionization_energy_kj_mol: "First Ionization Energy (kJ/mol)",
  melting_point_k: "Melting Point (K)",
  boiling_point_k: "Boiling Point (K)",
  atomic_number: "Atomic Number",
};

export type RankableProperty = keyof typeof RANKABLE_PROPERTIES;

// ─── Public API ────────────────────────────────────────────────

export interface SearchElementsOptions {
  limit?: number;
  category?: string;
  block?: string;
}

/**
 * Search elements by name, symbol, or atomic number.
 */
export function searchElements(query: string, opts: SearchElementsOptions = {}) {
  ensureLoaded();

  const { limit = 10, category, block } = opts;
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedQuery) return { count: 0, query, elements: [] as FormattedElement[] };

  let candidates = ELEMENT_DB;

  if (category) {
    const normalizedCategory = category.toLowerCase();
    candidates = candidates.filter(
      (element: PeriodicElement) => element.category && element.category.toLowerCase().includes(normalizedCategory),
    );
  }
  if (block) {
    const normalizedBlock = block.toLowerCase();
    candidates = candidates.filter(
      (element: PeriodicElement) => element.block && element.block.toLowerCase() === normalizedBlock,
    );
  }

  // Try atomic number match first
  const numQuery = parseInt(normalizedQuery, 10);

  const scored = candidates
    .map((element: PeriodicElement) => {
      let score = 0;
      const name = normalizeSearch(element.name || "");
      const symbol = (element.symbol || "").toLowerCase();
      const cat = normalizeSearch(element.category || "");

      // Exact symbol match
      if (symbol === normalizedQuery) score += 100;
      // Exact name match
      else if (name === normalizedQuery) score += 90;
      // Atomic number match
      else if (!isNaN(numQuery) && element.atomic_number === numQuery) score += 95;
      // Name starts with query
      else if (name.startsWith(normalizedQuery)) score += 60;
      // Symbol starts with query
      else if (symbol.startsWith(normalizedQuery)) score += 55;
      // Name contains query
      else if (name.includes(normalizedQuery)) score += 30;
      // Category contains query
      else if (cat.includes(normalizedQuery)) score += 15;
      // Summary contains query
      else if (
        element.summary &&
        normalizeSearch(element.summary).includes(normalizedQuery)
      )
        score += 5;

      return { element, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    count: scored.length,
    query,
    note: "Data from Bowserinator Periodic Table JSON (CC BY-SA 3.0). Temperatures in Kelvin, densities in g/cm³.",
    elements: scored.map((s) => formatElement(s.element)),
  };
}

/**
 * Get element by exact symbol.
 */
export function getElementBySymbol(symbol: string) {
  ensureLoaded();

  const normalizedSymbol = symbol.trim();
  const element = ELEMENT_DB.find(
    (elementEntry: PeriodicElement) => elementEntry.symbol && elementEntry.symbol.toLowerCase() === normalizedSymbol.toLowerCase(),
  );

  if (!element) return null;
  return formatElement(element);
}

export interface RankElementsOptions {
  limit?: number;
  order?: "asc" | "desc";
  category?: string;
  block?: string;
}

/**
 * Rank elements by a numeric property (highest first by default).
 */
export function rankElementsByProperty(property: string, opts: RankElementsOptions = {}) {
  ensureLoaded();

  const { limit = 10, order = "desc", category, block } = opts;

  if (!(property in RANKABLE_PROPERTIES)) {
    return {
      error: `Unknown property: "${property}"`,
      availableProperties: Object.entries(RANKABLE_PROPERTIES).map(
        ([key, label]) => ({ key, label }),
      ),
    };
  }

  const propKey = property as RankableProperty;
  let candidates = ELEMENT_DB;

  if (category) {
    const normalizedCategory = category.toLowerCase();
    candidates = candidates.filter(
      (element: PeriodicElement) => element.category && element.category.toLowerCase().includes(normalizedCategory),
    );
  }
  if (block) {
    const normalizedBlock = block.toLowerCase();
    candidates = candidates.filter(
      (element: PeriodicElement) => element.block && element.block.toLowerCase() === normalizedBlock,
    );
  }

  const ranked = candidates
    .filter((element: PeriodicElement) => element[propKey] !== null)
    .sort((a: PeriodicElement, b: PeriodicElement) => {
      const valA = a[propKey];
      const valB = b[propKey];
      if (valA === null || valA === undefined || valB === null || valB === undefined) return 0;
      if (typeof valA === "number" && typeof valB === "number") {
        return order === "asc" ? valA - valB : valB - valA;
      }
      return 0;
    })
    .slice(0, limit);

  return {
    property,
    propertyLabel: RANKABLE_PROPERTIES[propKey],
    order,
    count: ranked.length,
    note: "Data from Bowserinator Periodic Table JSON (CC BY-SA 3.0).",
    elements: ranked.map((element: PeriodicElement) => ({
      atomicNumber: element.atomic_number,
      symbol: element.symbol,
      name: element.name,
      value: element[propKey],
      category: element.category,
    })),
  };
}

/**
 * Get all unique element categories, blocks, and phases.
 */
export function getElementCategories() {
  ensureLoaded();

  const categories = [
    ...new Set(ELEMENT_DB.map((element: PeriodicElement) => element.category).filter(Boolean)),
  ].sort();
  const blocks = [
    ...new Set(ELEMENT_DB.map((element: PeriodicElement) => element.block).filter(Boolean)),
  ].sort();
  const phases = [
    ...new Set(ELEMENT_DB.map((element: PeriodicElement) => element.phase_at_stp).filter(Boolean)),
  ].sort();

  return {
    totalElements: ELEMENT_DB.length,
    categories,
    blocks,
    phases,
    rankableProperties: Object.entries(RANKABLE_PROPERTIES).map(
      ([key, label]) => ({ key, label }),
    ),
  };
}
