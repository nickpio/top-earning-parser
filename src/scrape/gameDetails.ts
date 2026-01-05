// src/scrape/gameDetails.ts
import { fetchJsonWithRetry } from "./http";
import { RateLimiter } from "./limiter";

export type GameDetails = {
  universeId: number;
  name: string;
  description: string;
  playing: number;
  visits: number;

  creatorName?: string;
  creatorType?: "User" | "Group" | string;
  creatorId?: number;

  created?: string;
  rootPlaceId?: number;

  price?: number;
  isPaidAccess?: boolean;
};

type GamesApiResponse = {
  data: Array<{
    id: number;
    name: string;
    description: string;
    playing: number;
    visits: number;

    creator?: { id?: number; name?: string; type?: string };
    created?: string;
    rootPlaceId?: number;

    price?: number;
    isPaidAccess?: boolean;
  }>;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function getGamesBatch(universeIds: number[]): Promise<GamesApiResponse> {
  const url = `https://games.roblox.com/v1/games?universeIds=${universeIds.join(",")}`;

  return fetchJsonWithRetry<GamesApiResponse>(
    url,
    {
      headers: {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:146.0) Gecko/20100101 Firefox/146.0",
      },
    },
    {
      maxRetries: 7,
      baseDelayMs: 600,
      maxDelayMs: 30_000,
      retryOnStatuses: [429, 500, 502, 503, 504],
    }
  );
}

export async function fetchGameDetailsByUniverseIds(
  universeIds: number[],
  opts?: {
    batchSize?: number;      // default 50
    concurrency?: number;    // default 2
    minIntervalMs?: number;  // default 250 (global pacing)
  }
): Promise<GameDetails[]> {
  const batchSize = Math.min(Math.max(opts?.batchSize ?? 50, 1), 50); // keep at 50
  const concurrency = Math.min(Math.max(opts?.concurrency ?? 2, 1), 4);
  const limiter = new RateLimiter(opts?.minIntervalMs ?? 250);

  const uniq = Array.from(new Set(universeIds)).filter((n) => Number.isFinite(n) && n > 0);
  const batches = chunk(uniq, batchSize);

  const results: GameDetails[] = [];
  let idx = 0;

  async function worker() {
    while (idx < batches.length) {
      const my = idx++;
      const ids = batches[my];

      // ✅ global rate limit: spreads requests out across workers
      await limiter.wait();

      const json = await getGamesBatch(ids);

      for (const g of json.data ?? []) {
        results.push({
          universeId: g.id,
          name: g.name ?? "",
          description: g.description ?? "",
          playing: Number(g.playing ?? 0),
          visits: Number(g.visits ?? 0),

          creatorName: g.creator?.name,
          creatorType: g.creator?.type,
          creatorId: typeof g.creator?.id === "number" ? g.creator.id : undefined,

          created: g.created,
          rootPlaceId: typeof g.rootPlaceId === "number" ? g.rootPlaceId : undefined,

          price: typeof (g as any).price === "number" ? (g as any).price : undefined,
          isPaidAccess: typeof (g as any).isPaidAccess === "boolean" ? (g as any).isPaidAccess : undefined,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // Preserve input order
  const order = new Map<number, number>();
  uniq.forEach((id, i) => order.set(id, i));
  results.sort((a, b) => (order.get(a.universeId) ?? 1e9) - (order.get(b.universeId) ?? 1e9));

  return results;
}