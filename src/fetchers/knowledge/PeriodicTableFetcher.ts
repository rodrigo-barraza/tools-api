import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../../logger.ts";

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

function parseCSVLine(line: any) {
  const fields: any[] = [];
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

const ELEMENT_DB: any[] = [];
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;

  const csvPath = join(__dirname, "data", "digest_elements.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l: any) => l.trim());
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

    const row: Record<string, any> = {};
    headers.forEach((h: any, index: any) => {
      const value = values[index] || "";
      if (NUMERIC_FIELDS.has(h)) {
        const num = parseFloat(value);
        row[h] = isNaN(num) ? null : num;
      } else {
        row[h] = value || null;
      }
    });

    ELEMENT_DB.push(row);
  }

  logger.info(`⚛️  Periodic Table loaded: ${ELEMENT_DB.length} elements`);
}

// ─── Helpers ───────────────────────────────────────────────────

function normalizeSearch(str: any) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function formatElement(element: any) {
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

// ─── Public API ────────────────────────────────────────────────

/**
 * Search elements by name, symbol, or atomic number.


 */
export function searchElements(query: any, opts: Record<string, any> = {}) {
  ensureLoaded();

  const { limit = 10, category, block } = opts;
  const q = normalizeSearch(query);

  if (!q) return { count: 0, query, elements: [] };

  let candidates = ELEMENT_DB;

  if (category) {
    const c = category.toLowerCase();
    candidates = candidates.filter(
      (element: any) => element.category && element.category.toLowerCase().includes(c),
    );
  }
  if (block) {
    const b = block.toLowerCase();
    candidates = candidates.filter(
      (element: any) => element.block && element.block.toLowerCase() === b,
    );
  }

  // Try atomic number match first
  const numQuery = parseInt(q, 10);

  const scored = candidates
    .map((element: any) => {
      let score = 0;
      const name = normalizeSearch(element.name || "");
      const symbol = (element.symbol || "").toLowerCase();
      const cat = normalizeSearch(element.category || "");

      // Exact symbol match
      if (symbol === q) score += 100;
      // Exact name match
      else if (name === q) score += 90;
      // Atomic number match
      else if (!isNaN(numQuery) && element.atomic_number === numQuery) score += 95;
      // Name starts with query
      else if (name.startsWith(q)) score += 60;
      // Symbol starts with query
      else if (symbol.startsWith(q)) score += 55;
      // Name contains query
      else if (name.includes(q)) score += 30;
      // Category contains query
      else if (cat.includes(q)) score += 15;
      // Summary contains query
      else if (
        element.summary &&
        normalizeSearch(element.summary).includes(q)
      )
        score += 5;

      return { element, score };
    })
    .filter((s: any) => s.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit);

  return {
    count: scored.length,
    query,
    note: "Data from Bowserinator Periodic Table JSON (CC BY-SA 3.0). Temperatures in Kelvin, densities in g/cm³.",
    elements: scored.map((s: any) => formatElement(s.element)),
  };
}

/**
 * Get element by exact symbol.


 */
export function getElementBySymbol(symbol: any) {
  ensureLoaded();

  const s = symbol.trim();
  const element = ELEMENT_DB.find(
    (e: any) => e.symbol && e.symbol.toLowerCase() === s.toLowerCase(),
  );

  if (!element) return null;
  return formatElement(element);
}

/**
 * Rank elements by a numeric property (highest first by default).


 */
export function rankElementsByProperty(property: any, opts: Record<string, any> = {}) {
  ensureLoaded();

  const { limit = 10, order = "desc", category, block } = opts;

  // @ts-expect-error - TS7053: implicit any index
  if (!RANKABLE_PROPERTIES[property]) {
    return {
      error: `Unknown property: "${property}"`,
      availableProperties: Object.entries(RANKABLE_PROPERTIES).map(
        ([key, label]: any) => ({ key, label }),
      ),
    };
  }

  let candidates = ELEMENT_DB;

  if (category) {
    const c = category.toLowerCase();
    candidates = candidates.filter(
      (element: any) => element.category && element.category.toLowerCase().includes(c),
    );
  }
  if (block) {
    const b = block.toLowerCase();
    candidates = candidates.filter(
      (element: any) => element.block && element.block.toLowerCase() === b,
    );
  }

  const ranked = candidates
    .filter((element: any) => element[property] !== null)
    .sort((a: any, b: any) =>
      order === "asc" ? a[property] - b[property] : b[property] - a[property],
    )
    .slice(0, limit);

  return {
    property,
    // @ts-expect-error - TS7053: implicit any index
    propertyLabel: RANKABLE_PROPERTIES[property],
    order,
    count: ranked.length,
    note: "Data from Bowserinator Periodic Table JSON (CC BY-SA 3.0).",
    elements: ranked.map((element: any) => ({
      atomicNumber: element.atomic_number,
      symbol: element.symbol,
      name: element.name,
      value: element[property],
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
    ...new Set(ELEMENT_DB.map((e: any) => e.category).filter(Boolean)),
  ].sort();
  const blocks = [
    ...new Set(ELEMENT_DB.map((e: any) => e.block).filter(Boolean)),
  ].sort();
  const phases = [
    ...new Set(ELEMENT_DB.map((e: any) => e.phase_at_stp).filter(Boolean)),
  ].sort();

  return {
    totalElements: ELEMENT_DB.length,
    categories,
    blocks,
    phases,
    rankableProperties: Object.entries(RANKABLE_PROPERTIES).map(
      ([key, label]: any) => ({ key, label }),
    ),
  };
}
