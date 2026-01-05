// src/tools/sniffChartsApi.ts
//
// Purpose:
// - Opens the Roblox Top Earning chart page in Playwright
// - Logs *JSON* network responses that are likely to contain the chart data
// - Writes matching payload previews to ./tmp/sniff/ for easy inspection
//
// Run:
//   npx playwright install chromium
//   npx tsx src/tools/sniffChartsApi.ts
//
// Notes:
// - Roblox pages are JS-rendered; this uses a real browser.
// - If the chart uses infinite scroll, we scroll a bit to trigger more requests.

import { chromium, type Response } from "playwright";
import * as fs from "node:fs";
import * as path from "node:path";
import crypto from "node:crypto";

const TARGET_URL =
  "https://www.roblox.com/charts/top-earning?country=all&device=computer";

type SniffOptions = {
  headless: boolean;
  maxJsonResponses: number;
  scrollPasses: number;
  scrollPixels: number;
  scrollDelayMs: number;
  idleWaitMs: number;
  outDir: string;
};

const DEFAULTS: SniffOptions = {
  headless: true,
  maxJsonResponses: 60, // stop after capturing this many JSON responses
  scrollPasses: 8,
  scrollPixels: 2200,
  scrollDelayMs: 900,
  idleWaitMs: 2500,
  outDir: path.resolve(process.cwd(), "tmp", "sniff"),
};

function safeFilename(input: string, maxLen = 120) {
  // Strip protocol, query, and unsafe chars
  const noProto = input.replace(/^https?:\/\//, "");
  const base = noProto.replace(/[?#].*$/, "");
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned.slice(0, maxLen);
}

function sha1(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 10);
}

function looksRelevantJson(url: string) {
  const u = url.toLowerCase();

  // General Roblox API domains
  if (u.includes("apis.roblox.com")) return true;
  if (u.includes("games.roblox.com")) return true;
  if (u.includes("catalog.roblox.com")) return true;
  if (u.includes("develop.roblox.com")) return true;

  // Chart/Discover/explore patterns
  if (u.includes("/charts/")) return true;
  if (u.includes("top-earning")) return true;
  if (u.includes("explore-api")) return true;
  if (u.includes("discovery")) return true;
  if (u.includes("/games/")) return true;

  return false;
}

function isJsonResponse(res: Response) {
  const ct = (res.headers()["content-type"] ?? "").toLowerCase();
  return ct.includes("application/json") || ct.includes("application/problem+json");
}

async function tryReadJson(res: Response): Promise<unknown | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function main() {
  const opts: SniffOptions = {
    ...DEFAULTS,
    headless: process.env.HEADLESS
      ? process.env.HEADLESS !== "0" && process.env.HEADLESS.toLowerCase() !== "false"
      : DEFAULTS.headless,
    maxJsonResponses: process.env.MAX_JSON ? Number(process.env.MAX_JSON) : DEFAULTS.maxJsonResponses,
    scrollPasses: process.env.SCROLL_PASSES ? Number(process.env.SCROLL_PASSES) : DEFAULTS.scrollPasses,
  };

  fs.mkdirSync(opts.outDir, { recursive: true });

  const browser = await chromium.launch({ headless: opts.headless });
  const context = await browser.newContext({
    // Default UA is fine. You can set one if you want.
    // userAgent: "Mozilla/5.0 ...",
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  let jsonCount = 0;
  const seenUrls = new Set<string>();

  page.on("response", async (res) => {
    if (jsonCount >= opts.maxJsonResponses) return;

    const url = res.url();
    if (!looksRelevantJson(url)) return;
    if (!isJsonResponse(res)) return;

    // Avoid spamming duplicates (same URL repeatedly)
    // NOTE: Some APIs include cursors/timestamps; remove that if you want.
    if (seenUrls.has(url)) return;
    seenUrls.add(url);

    const status = res.status();
    const json = await tryReadJson(res);
    if (json == null) return;

    jsonCount += 1;

    // Write payload to disk
    const fileBase = `${String(jsonCount).padStart(3, "0")}_${safeFilename(url)}_${sha1(url)}.json`;
    const outPath = path.join(opts.outDir, fileBase);
    fs.writeFileSync(outPath, JSON.stringify(json, null, 2), "utf8");

    // Print a small preview + where it was saved
    const preview = JSON.stringify(json);
    const previewShort = preview.length > 450 ? `${preview.slice(0, 450)}…` : preview;

    console.log(`[JSON ${jsonCount}/${opts.maxJsonResponses}] ${status} ${url}`);
    console.log(`  saved: ${path.relative(process.cwd(), outPath)}`);
    console.log(`  preview: ${previewShort}\n`);
  });

  console.log(`Opening: ${TARGET_URL}`);
  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });

  // Let the page settle and fire initial requests
  await page.waitForTimeout(opts.idleWaitMs);

  // Scroll to trigger lazy loading / pagination requests
  for (let i = 0; i < opts.scrollPasses && jsonCount < opts.maxJsonResponses; i++) {
    await page.mouse.wheel(0, opts.scrollPixels);
    await page.waitForTimeout(opts.scrollDelayMs);
  }

  // One last settle
  await page.waitForTimeout(opts.idleWaitMs);

  console.log(`Done. Captured ${jsonCount} JSON response(s).`);
  console.log(`Check: ${path.relative(process.cwd(), opts.outDir)}/`);

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error("sniffChartsApi failed:", err);
  process.exit(1);
});