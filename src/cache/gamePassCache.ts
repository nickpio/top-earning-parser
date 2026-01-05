import * as fs from "node:fs";
import * as path from "node:path";

export type GamePassStats = {
  gamePassCount: number;
  avgGamePassPrice: number | null;
};

type CacheEntry = {
  fetchedAt: string; // ISO
  stats: GamePassStats;
};

type CacheFile = {
  version: 1;
  entries: Record<string, CacheEntry>; // key = universeId as string
};

const DEFAULT_PATH = path.resolve(process.cwd(), "data", "gamePassCache.json");

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function loadGamePassCache(filePath = DEFAULT_PATH): CacheFile {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as CacheFile;
    if (!parsed || parsed.version !== 1 || typeof parsed.entries !== "object") {
      return { version: 1, entries: {} };
    }
    return parsed;
  } catch {
    return { version: 1, entries: {} };
  }
}

export function saveGamePassCache(cache: CacheFile, filePath = DEFAULT_PATH) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2), "utf8");
}

export function isFresh(entry: CacheEntry | undefined, maxAgeDays: number): boolean {
  if (!entry?.fetchedAt) return false;
  const t = Date.parse(entry.fetchedAt);
  if (!Number.isFinite(t)) return false;
  const ageMs = Date.now() - t;
  return ageMs >= 0 && ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

export function getCached(
  cache: CacheFile,
  universeId: number,
  maxAgeDays: number
): GamePassStats | null {
  const entry = cache.entries[String(universeId)];
  return isFresh(entry, maxAgeDays) ? entry.stats : null;
}

export function setCached(cache: CacheFile, universeId: number, stats: GamePassStats) {
  cache.entries[String(universeId)] = {
    fetchedAt: new Date().toISOString(),
    stats,
  };
}

export function splitUniverseIdsByCacheFreshness(
  cache: CacheFile,
  universeIds: number[],
  maxAgeDays: number
): { fresh: number[]; staleOrMissing: number[] } {
  const fresh: number[] = [];
  const staleOrMissing: number[] = [];

  for (const id of universeIds) {
    const entry = cache.entries[String(id)];
    if (isFresh(entry, maxAgeDays)) fresh.push(id);
    else staleOrMissing.push(id);
  }

  return { fresh, staleOrMissing };
}