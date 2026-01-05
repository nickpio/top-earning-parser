// src/jobs/runPipeline.ts
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function runTS(scriptRelPath: string, args: string[] = []) {
  return new Promise<void>((resolve, reject) => {
    const script = path.resolve(process.cwd(), scriptRelPath);

    // Use local npx tsx so it works without global installs
    const p = spawn("npx", ["tsx", script, ...args], { stdio: "inherit" });

    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`npx tsx ${scriptRelPath} ${args.join(" ")} -> ${code}`))
    );
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const runDate = process.env.RUN_DATE ?? todayISO();

  const baseDir = path.resolve(process.cwd(), "runs", runDate);
  const rawDir = path.join(baseDir, "raw");
  const prunedDir = path.join(baseDir, "pruned");

  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(prunedDir, { recursive: true });

  await runTS("src/jobs/topEarning1500Enriched.ts", ["--outDir", rawDir]);
  await runTS("src/jobs/pruneReport.ts", ["--inDir", rawDir, "--outDir", prunedDir]);
  await runTS("src/jobs/exportPrunedToOds.ts", ["--inDir", prunedDir, "--outDir", prunedDir]);

  console.log(`✅ Run complete: ${baseDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});