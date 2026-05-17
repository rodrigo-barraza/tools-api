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

function parseCSVLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

const ELEMENT_DB = [];
let loaded = false;

function ensureLoaded() {
  if (loaded) return;
  loaded = true;

  const csvPath = join(__dirname, "data", "digest_elements.csv");
  const raw = readFileSync(csvPath, "utf-8");
  const lines = raw.split("\n").filter((l) => l.trim());
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
    headers.forEach((h, index) => {
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

function normalizeSearch(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function formatElement(element) {
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
 * @param {string} query - Search term (e.g. "iron", "Fe", "26")
 * @param {object} opts
 * @param {number} [opts.limit=10] - Max results
 * @param {string} [opts.category] - Filter by category (e.g. "noble gas", "transition metal")
 * @param {string} [opts.block] - Filter by block (s, p, d, f)
 * @returns {object} Search results
 */
export function searchElements(query, opts: Record<string, any> = {}) {
  ensureLoaded();

  const { limit = 10, category, block } = opts;
  const q = normalizeSearch(query);

  if (!q) return { count: 0, query, elements: [] };

  let candidates = ELEMENT_DB;

  if (category) {
    const c = category.toLowerCase();
    candidates = candidates.filter(
      (element) => element.category && element.category.toLowerCase().includes(c),
    );
  }
  if (block) {
    const b = block.toLowerCase();
    candidates = candidates.filter(
      (element) => element.block && element.block.toLowerCase() === b,
    );
  }

  // Try atomic number match first
  const numQuery = parseInt(q, 10);

  const scored = candidates
    .map((element) => {
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
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    count: scored.length,
    query,
    note: "Data from Bowserinator Periodic Table JSON (CC BY-SA 3.0). Temperatures in Kelvin, densities in g/cm³.",
    elements: scored.map((s) => formatElement(s.el)),
  };
}

/**
 * Get element by exact symbol.
 * @param {string} symbol - Element symbol (e.g. "Fe", "Au", "H")
 * @returns {object|null}
 */
export function getElementBySymbol(symbol) {
  ensureLoaded();

  const s = symbol.trim();
  const element = ELEMENT_DB.find(
    (e) => e.symbol && e.symbol.toLowerCase() === s.toLowerCase(),
  );

  if (!element) return null;
  return formatElement(element);
}

/**
 * Rank elements by a numeric property (highest first by default).
 * @param {string} property - Property to rank by
 * @param {object} opts
 * @param {number} [opts.limit=10] - Max results
 * @param {string} [opts.order="desc"] - "asc" or "desc"
 * @param {string} [opts.category] - Filter by category
 * @param {string} [opts.block] - Filter by block
 * @returns {object} Ranked results
 */
export function rankElementsByProperty(property, opts: Record<string, any> = {}) {
  ensureLoaded();

  const { limit = 10, order = "desc", category, block } = opts;

  if (!RANKABLE_PROPERTIES[property]) {
    return {
      error: `Unknown property: "${property}"`,
      availableProperties: Object.entries(RANKABLE_PROPERTIES).map(
        ([key, label]) => ({ key, label }),
      ),
    };
  }

  let candidates = ELEMENT_DB;

  if (category) {
    const c = category.toLowerCase();
    candidates = candidates.filter(
      (element) => element.category && element.category.toLowerCase().includes(c),
    );
  }
  if (block) {
    const b = block.toLowerCase();
    candidates = candidates.filter(
      (element) => element.block && element.block.toLowerCase() === b,
    );
  }

  const ranked = candidates
    .filter((element) => element[property] !== null)
    .sort((a, b) =>
      order === "asc" ? a[property] - b[property] : b[property] - a[property],
    )
    .slice(0, limit);

  return {
    property,
    propertyLabel: RANKABLE_PROPERTIES[property],
    order,
    count: ranked.length,
    note: "Data from Bowserinator Periodic Table JSON (CC BY-SA 3.0).",
    elements: ranked.map((element) => ({
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
 * @returns {object} Available taxonomy filters
 */
export function getElementCategories() {
  ensureLoaded();

  const categories = [
    ...new Set(ELEMENT_DB.map((e) => e.category).filter(Boolean)),
  ].sort();
  const blocks = [
    ...new Set(ELEMENT_DB.map((e) => e.block).filter(Boolean)),
  ].sort();
  const phases = [
    ...new Set(ELEMENT_DB.map((e) => e.phase_at_stp).filter(Boolean)),
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
