// src/jobs/exportPrunedToOds.ts
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

type PrunedGameRow = {
  universeId: number;
  name: string;
  developer: string | null;
  ageDays: number | null;
  players: number;
  visits: number;
  paidAccess: boolean | null;
  paidAccessPrice: number | null;
  gamePassCount: number | null;
  avgGamePassPrice: number | null;
};

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function latestPrunedReport(): string {
  const dir = path.resolve(process.cwd(), "reports");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("_pruned.json"))
    .sort();

  if (files.length === 0) {
    throw new Error(`No *_pruned.json files found in ${dir}`);
  }
  return path.join(dir, files[files.length - 1]);
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function safeInt(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 0;
}

function safeNullableInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function safeNullableString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function safeNullableBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function normalizeRow(r: any): PrunedGameRow {
  return {
    universeId: safeInt(r?.universeId),
    name: safeString(r?.name),
    developer: safeNullableString(r?.developer),
    ageDays: safeNullableInt(r?.ageDays),
    players: safeInt(r?.players),
    visits: safeInt(r?.visits),
    paidAccess: safeNullableBool(r?.paidAccess),
    paidAccessPrice: safeNullableInt(r?.paidAccessPrice),
    gamePassCount: safeNullableInt(r?.gamePassCount),
    avgGamePassPrice: safeNullableInt(r?.avgGamePassPrice),
  };
}

function buildWorkbook(rows: PrunedGameRow[]) {
  // Sort for readability (optional):
  // players desc, then visits desc
  const sorted = [...rows].sort((a, b) => {
    if (b.players !== a.players) return b.players - a.players;
    return b.visits - a.visits;
  });

  // Make an AOA to control column order + headers
  const aoa: (string | number | boolean | null)[][] = [
    [
      "Universe ID",
      "Name",
      "Developer",
      "Age (days)",
      "Players (now)",
      "Visits",
      "Paid Access",
      "Paid Access Price",
      "Game Passes",
      "Avg Pass Price",
    ],
    ...sorted.map((r) => [
      r.universeId,
      r.name,
      r.developer,
      r.ageDays,
      r.players,
      r.visits,
      r.paidAccess,
      r.paidAccessPrice,
      r.gamePassCount,
      r.avgGamePassPrice,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths (viewer-dependent for ODS, but helps)
  (ws as any)["!cols"] = [
    { wch: 12 }, // Universe ID
    { wch: 42 }, // Name
    { wch: 22 }, // Developer
    { wch: 10 }, // Age
    { wch: 14 }, // Players
    { wch: 16 }, // Visits
    { wch: 12 }, // Paid Access
    { wch: 16 }, // Paid Access Price
    { wch: 12 }, // Game Passes
    { wch: 14 }, // Avg Pass Price
  ];

  // Autofilter on header row (works best in XLSX; ODS may vary by app)
  (ws as any)["!autofilter"] = { ref: "A1:J1" };

  // Apply integer formats to numeric columns (mostly honored in XLSX; ODS varies)
  // Columns: A, D, E, F, H, I, J => 0-based indexes: 0,3,4,5,7,8,9
  const intCols = new Set([0, 3, 4, 5, 7, 8, 9]);

  const range = XLSX.utils.decode_range(ws["!ref"]!);
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = 0; c <= range.e.c; c++) {
      if (!intCols.has(c)) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = (ws as any)[addr];
      if (cell && typeof cell.v === "number") cell.z = "0";
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pruned");
  return wb;
}

async function main() {
  const inputPath = getArg("--file") ?? latestPrunedReport();

  const raw = fs.readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`Input JSON is not an array: ${inputPath}`);
  }

  const rows = parsed.map(normalizeRow);

  const wb = buildWorkbook(rows);

  const outPath = inputPath.replace(/_pruned\.json$/i, "_pruned.ods");
  ensureDir(path.dirname(outPath));
  XLSX.writeFile(wb, outPath);

  console.log(`Exported ${rows.length} rows -> ${path.relative(process.cwd(), outPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});