// src/jobs/pruneReport.ts

import fs from "node:fs";
import path from "node:path";
import { pruneGameData } from "../transform/pruneGameData";

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function defaultInputFile(): string {
  const dir = path.resolve(process.cwd(), "reports");
  const files = fs
    .readdirSync(dir)
    .filter(f => f.endsWith("_enriched.json"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No *_enriched.json files found in ${dir}`);
  }
  return path.join(dir, files[files.length - 1]);
}

async function main() {
  // Usage:
  // npx tsx src/jobs/pruneReport.ts --file reports/2026-01-05_top-earning_top1500_enriched.json
  const inputPath = getArg("--file") ?? defaultInputFile();

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`Input JSON is not an array: ${inputPath}`);
  }

  const pruned = pruneGameData(parsed);

  const outPath = inputPath.replace(/\.json$/i, "_pruned.json");
  fs.writeFileSync(outPath, JSON.stringify(pruned, null, 2), "utf8");

  console.log(`Pruned ${parsed.length} rows`);
  console.log(`Wrote: ${path.relative(process.cwd(), outPath)}`);
  console.log(pruned.slice(0, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});