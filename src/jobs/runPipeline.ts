// src/jobs/runPipeline.ts
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function runTS(scriptRelPath: string, args: string[] = []) {
  return new Promise<void>((resolve, reject) => {
    const script = path.resolve(process.cwd(), scriptRelPath);

    const p = spawn("npx", ["tsx", script, ...args], { stdio: "inherit" });

    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`npx tsx ${scriptRelPath} ${args.join(" ")} -> ${code}`))
    );
  });
}

function runPython(scriptRelPath: string, args: string[] = []) {
  return new Promise<void>((resolve, reject) => {
    const script = path.resolve(process.cwd(), scriptRelPath);
    const venvPython = path.resolve(process.cwd(), ".venv", "bin", "python");

    // Use venv python if available, otherwise fall back to python3
    const pythonCmd = fs.existsSync(venvPython) ? venvPython : "python3";

    const p = spawn(pythonCmd, [script, ...args], { stdio: "inherit" });

    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`python ${scriptRelPath} ${args.join(" ")} -> ${code}`))
    );
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const runDate = process.env.RUN_DATE ?? todayISO();
  const skipScrape = process.argv.includes("--skip-scrape");
  const skipIndex = process.argv.includes("--skip-index");

  const baseDir = path.resolve(process.cwd(), "runs", runDate);
  const rawDir = path.join(baseDir, "raw");
  const prunedDir = path.join(baseDir, "pruned");

  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(prunedDir, { recursive: true });

  // Step 1: Scrape, prune, and organize data (TypeScript)
  if (!skipScrape) {
    console.log("\n📥 Step 1: Scraping top earning games...");
    await runTS("src/jobs/topEarning1500Enriched.ts", ["--outDir", rawDir]);

    console.log("\n✂️  Step 2: Pruning and organizing data...");
    await runTS("src/jobs/pruneReport.ts", ["--inDir", rawDir, "--outDir", prunedDir]);
    await runTS("src/jobs/exportPrunedToOds.ts", ["--inDir", prunedDir, "--outDir", prunedDir]);
  } else {
    console.log("\n⏭️  Skipping scrape (--skip-scrape)");
  }

  // Step 2: Run index engine computations (Python)
  if (!skipIndex) {
    console.log("\n📊 Step 3: Running index engine (EDR, rolling features, rebalance)...");
    await runPython("run_index_engine.py", ["--runs-dir", "runs", "--rebalance-date", runDate]);
  } else {
    console.log("\n⏭️  Skipping index engine (--skip-index)");
  }

  console.log(`\n✅ Pipeline complete for ${runDate}`);
  console.log(`   Raw data: ${rawDir}`);
  console.log(`   Pruned data: ${prunedDir}`);
  console.log(`   Index exports: index_data/exports/${runDate}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});