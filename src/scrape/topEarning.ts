// src/scrape/topEarning.ts
//
// Robust fetch of top-earning universeIds from Roblox explore-api.
// - Reads the `games` array of each page in chart order (falls back to a
//   document-order deep scan for universeId fields)
// - Logs + writes the raw JSON to tmp/explore-dumps on failure
//
// Usage:
//   const { items } = await fetchTopEarningUniverseIds({ limit: 100 });
//   // items: [{ rank, universeId }, ...]
//

import * as fs from "node:fs";
import * as path from "node:path";

export type TopEarningItem = {
  rank: number; // 1-based
  universeId: number;
};

type ExploreApiResponse = Record<string, unknown>;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function toPosInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0 && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) return n;
  }
  return null;
}

function safeSlug(s: string) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

/**
 * Extract universeIds from a sort-content page **in chart order**.
 *
 * Prefers the documented `games` array (sponsored tiles excluded). Falls back to
 * a document-order deep scan for any property named "universeId" (or variants).
 * Order matters: the position in this list is the Top-Earning rank, which the
 * index engine uses to infer monetization intensity.
 */
function extractUniverseIdsInOrder(payload: any): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  const push = (v: unknown) => {
    const n = toPosInt(v);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  };

  if (Array.isArray(payload?.games)) {
    for (const g of payload.games) {
      if (g && typeof g === "object" && !(g as any).isSponsored) push((g as any).universeId);
    }
    if (out.length) return out;
  }

  const keys = new Set(["universeid", "universeId", "universeID", "universe_id"]);
  const visited = new Set<any>();
  const walk = (node: any) => {
    if (!node || typeof node !== "object" || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (keys.has(k) || keys.has(k.toLowerCase())) push(v);
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(payload);
  return out;
}

/**
 * Try to locate pagination token in common places.
 * If your dump shows the exact key, we can lock this down.
 */
function extractNextPageToken(payload: any): string | undefined {
  const candidates = [
    payload?.nextPageToken,
    payload?.NextPageToken,
    payload?.nextPageCursor,
    payload?.nextCursor,
    payload?.cursor,
    payload?.pageToken, // sometimes echoed, sometimes used
    payload?.data?.nextPageToken,
    payload?.content?.nextPageToken,
    payload?.sortContent?.nextPageToken,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return undefined;
}

function buildExploreUrl(opts: {
  country: string;
  device: string;
  sortId: string;
  pageToken?: string;
  cpuCores: number;
  maxResolution: string;
  maxMemory: number;
  networkType: string;
  sessionId: string;
}) {
  const u = new URL("https://apis.roblox.com/explore-api/v1/get-sort-content");
  u.searchParams.set("country", opts.country);
  u.searchParams.set("device", opts.device);
  u.searchParams.set("sortId", opts.sortId);

  // Keep these because Roblox appears to send them (from your sniff)
  u.searchParams.set("cpuCores", String(opts.cpuCores));
  u.searchParams.set("maxResolution", opts.maxResolution);
  u.searchParams.set("maxMemory", String(opts.maxMemory));
  u.searchParams.set("networkType", opts.networkType);
  u.searchParams.set("sessionId", opts.sessionId);

  if (opts.pageToken) u.searchParams.set("pageToken", opts.pageToken);
  return u.toString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:146.0) Gecko/20100101 Firefox/146.0",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}\n${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

function dumpPayload(tag: string, payload: unknown) {
  const dir = path.resolve(process.cwd(), "tmp", "explore-dumps");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${tag}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return file;
}

export async function fetchTopEarningUniverseIds(params?: {
  limit?: number;      // default 100
  country?: string;    // default "all"
  device?: string;     // default "computer"
  throttleMs?: number; // polite delay
}): Promise<{ items: TopEarningItem[] }> {
  const limit = Math.max(1, Math.min(params?.limit ?? 100, 1000));
  const country = params?.country ?? "all";
  const device = params?.device ?? "computer";
  const throttleMs = Math.max(0, params?.throttleMs ?? 250);

  // Node 18+ has crypto.randomUUID; if not, fallback
  const sessionId =
    (globalThis as any).crypto?.randomUUID?.() ??
    `sess_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  let pageToken: string | undefined = undefined;
  const universeIds: number[] = [];
  const seen = new Set<number>();

  for (let page = 0; page < 50 && universeIds.length < limit; page++) {
    const url = buildExploreUrl({
      country,
      device,
      sortId: "top-earning",
      pageToken,
      cpuCores: 10,
      maxResolution: "1400x900",
      maxMemory: 8192,
      networkType: "4g",
      sessionId,
    });

    const json = await fetchJson<ExploreApiResponse>(url);

    const ids = extractUniverseIdsInOrder(json);

    if (ids.length === 0) {
      const tag = safeSlug(`top-earning_page${page}_no-ids`);
      const dumped = dumpPayload(tag, json);
      const topKeys = Object.keys(json ?? {});
      throw new Error(
        `Could not extract universeIds (page ${page}).\n` +
          `Dumped response to: ${dumped}\n` +
          `Top-level keys: ${topKeys.join(", ")}\n` +
          `URL: ${url}`
      );
    }

    for (const id of ids) {
      if (universeIds.length >= limit) break;
      if (!seen.has(id)) {
        seen.add(id);
        universeIds.push(id);
      }
    }

    const next = extractNextPageToken(json);
    pageToken = next;

    // If no pagination token, we can’t fetch more pages
    if (!pageToken) break;
    if (throttleMs) await sleep(throttleMs);
  }

  const items: TopEarningItem[] = universeIds.slice(0, limit).map((universeId, i) => ({
    rank: i + 1,
    universeId,
  }));

  return { items };
}