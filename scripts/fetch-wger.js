import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log(`Downloading exercises from WGER API...`);
  let url = "https://wger.de/api/v2/exerciseinfo/?limit=100";
  const exercises = [];

  while (url) {
    console.log(`Fetching ${url}...`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Error fetching: ${response.status} ${response.statusText}`);
      break;
    }
    const data = await response.json();
    exercises.push(...data.results);
    url = data.next;
    
    // Slight pause to not hammer their API
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`Downloaded ${exercises.length} total raw objects.`);

  const outputPath = path.join(
    __dirname,
    "../fetchers/health/data/digest_exercises_wger.csv"
  );

  const headers = [
    "id",
    "name",
    "force", // Wger doesn't easily expose force without another endpoint, we'll leave empty or try to infer
    "level",
    "mechanic", // Wger doesn't easily expose compound/isolation natively in this endpoint
    "equipment",
    "category",
    "primary_muscles",
    "secondary_muscles",
    "instructions"
  ];

  function escapeCSV(val) {
    if (val === null || val === undefined) return "";
    let str = String(val);
    if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  const lines = [headers.join(",")];
  let processed = 0;

  for (const ex of exercises) {
    // We only care about exercises that have an English translation for name/description
    // The main object sometimes defaults to German or has an English translation in the 'translations' array.
    // language '2' is English in WGER. 
    const enTrans = ex.translations.find(t => t.language === 2);
    // If no explicit english translation, we'll try to use the root if it is english (we'll just use root if no translation found, many are just root)
    const name = enTrans ? enTrans.name : ex.name;
    const description = enTrans ? enTrans.description : (ex.description || "");

    if (!name) continue; // skip if totally empty name

    // Clean up HTML tags from description (Wger uses <p> etc.)
    const cleanInstructions = description.replace(/<[^>]*>?/gm, ' ').replace(/\s\s+/g, ' ').trim();

    const category = ex.category ? ex.category.name : "";
    const primaryMuscles = (ex.muscles || []).map(m => m.name_en || m.name);
    const secondaryMuscles = (ex.muscles_secondary || []).map(m => m.name_en || m.name);
    const equipment = (ex.equipment || []).map(e => e.name).join(", "); // We'll just take the first or join

    const row = [
      escapeCSV(`wger_${ex.id}`), // id
      escapeCSV(name),            // name
      escapeCSV(""),              // force
      escapeCSV(""),              // level
      escapeCSV(""),              // mechanic
      escapeCSV(equipment),       // equipment
      escapeCSV(category),        // category
      escapeCSV(primaryMuscles.join("|")),   // primary
      escapeCSV(secondaryMuscles.join("|")), // secondary
      escapeCSV(cleanInstructions)           // instructions
    ];
    lines.push(row.join(","));
    processed++;
  }

  fs.writeFileSync(outputPath, lines.join("\n"));
  console.log(`Wrote ${processed} WGER exercises to ${outputPath}`);
}

main().catch(console.error);
