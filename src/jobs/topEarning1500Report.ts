// src/jobs/topEarning100Report.ts
import { fetchTopEarningUniverseIds } from "../scrape/topEarning";
import { fetchGameDetailsByUniverseIds } from "../scrape/gameDetails";
import * as fs from "node:fs";
import * as path from "node:path";

type TopEarningRow = {
  rank: number;
  universeId: number;
  name: string;
  description: string;
  playing: number;
  visits: number;
};

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function main() {
  const limit = 1500;

  const { items } = await fetchTopEarningUniverseIds({
    limit,
    country: "all",
    device: "computer",
    throttleMs: 200,
  });

  const universeIds = items.map((x) => x.universeId);
  const details = await fetchGameDetailsByUniverseIds(universeIds, {
    batchSize: 50,
    concurrency: 3,
  });

  const byId = new Map(details.map((d) => [d.universeId, d]));

  const rows: TopEarningRow[] = items.map((it) => {
    const d = byId.get(it.universeId);
    return {
      rank: it.rank,
      universeId: it.universeId,
      name: d?.name ?? "",
      description: d?.description ?? "",
      playing: d?.playing ?? 0,
      visits: d?.visits ?? 0,
    };
  });

  // Save output
  const outDir = path.resolve(process.cwd(), "reports");
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `${todayISO()}_top-earning_top${limit}.json`);
  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), "utf8");

  console.log(`Wrote ${rows.length} rows -> ${path.relative(process.cwd(), outPath)}`);
  console.log(rows.slice(0, 3));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});