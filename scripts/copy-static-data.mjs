// Copies static dataset directories (src/fetchers/**/data) into dist/.
// tsc only emits compiled .ts outputs, so without this step the runtime
// image ships no CSV datasets and every static-dataset tool returns
// empty results (or 500s) in production.
import { cpSync, globSync, statSync } from "fs";
import { join, sep } from "path";

const dataDirectories = globSync(join("src", "fetchers", "**", "data")).filter(
  (entry) => statSync(entry).isDirectory(),
);

if (dataDirectories.length === 0) {
  console.error(
    "copy-static-data: no data directories found under src/fetchers — refusing to produce a dataset-less build",
  );
  process.exit(1);
}

for (const directory of dataDirectories) {
  const target = join("dist", directory.split(sep).slice(1).join(sep));
  cpSync(directory, target, { recursive: true });
  console.log(`copy-static-data: ${directory} → ${target}`);
}
