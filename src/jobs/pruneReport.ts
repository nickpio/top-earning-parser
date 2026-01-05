import fs from "node:fs";
import path from "node:path";
import { pruneGameData } from "../transform/pruneGameData";

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

function latestEnrichedFile(dir: string): string {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("_enriched.json"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No *_enriched.json files found in ${dir}`);
  }
  return path.join(dir, files[files.length - 1]);
}

async function main() {
  const inDir = getArg("--inDir") ?? path.resolve(process.cwd(), "reports");
  const outDir = getArg("--outDir") ?? inDir;
  const fileArg = getArg("--file"); // optional explicit file

  fs.mkdirSync(outDir, { recursive: true });

  const inputPath = fileArg ? path.resolve(fileArg) : latestEnrichedFile(inDir);

  const raw = fs.readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) throw new Error(`Input JSON is not an array: ${inputPath}`);

  const pruned = pruneGameData(parsed);

  const baseName = path.basename(inputPath).replace(/_enriched\.json$/i, "_enriched_pruned.json");
  const outPath = path.join(outDir, baseName);

  fs.writeFileSync(outPath, JSON.stringify(pruned, null, 2), "utf8");

  console.log(`Pruned ${parsed.length} rows`);
  console.log(`Wrote: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});