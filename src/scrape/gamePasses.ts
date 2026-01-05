// src/scrape/gamePasses.ts
// Uses: https://apis.roblox.com/game-passes/v1/universes/{universeId}/game-passes?...  [oai_citation:4‡Developer Forum | Roblox](https://devforum.roblox.com/t/gamepass-api-endpoint-stopped-returning-results/4050268)
import { fetchJsonWithRetry } from "./http";

export type GamePassStats = {
    gamePassCount: number;
    avgGamePassPrice: number | null; // null if no priced passes
  };
  
  type PassItem = {
    // The API returns a set of fields when passView=Full; price field name can vary.
    price?: number;
    priceInRobux?: number;
    isForSale?: boolean;
    forSale?: boolean;
  };
  
  type PassesResponse = {
    gamePasses?: PassItem[];
    nextPageToken?: string | null;
  };
  
  async function fetchJson<T>(url: string): Promise<T> {
    return fetchJsonWithRetry<T>(
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
        maxRetries: 6,
        baseDelayMs: 500,
        maxDelayMs: 20_000,
        retryOnStatuses: [429, 500, 502, 503, 504],
      }
    );
  }
  
  function getPrice(p: PassItem): number | null {
    const v =
      typeof p.priceInRobux === "number" ? p.priceInRobux :
      typeof p.price === "number" ? p.price :
      null;
    return v != null && Number.isFinite(v) ? v : null;
  }
  
  function isForSale(p: PassItem): boolean {
    const v = (p as any).isForSale ?? (p as any).forSale;
    return Boolean(v);
  }
  
  export async function fetchGamePassStatsForUniverse(
    universeId: number,
    opts?: { pageSize?: number; maxPages?: number; passView?: "Full" | "Basic" }
  ): Promise<GamePassStats> {
    const pageSize = Math.min(Math.max(opts?.pageSize ?? 100, 10), 100);
    const maxPages = Math.min(Math.max(opts?.maxPages ?? 20, 1), 50);
    const passView = opts?.passView ?? "Full";
  
    let pageToken: string | undefined = undefined;
    const passes: PassItem[] = [];
  
    for (let page = 0; page < maxPages; page++) {
      const url =
        `https://apis.roblox.com/game-passes/v1/universes/${universeId}/game-passes` +
        `?passView=${encodeURIComponent(passView)}` +
        `&pageSize=${pageSize}` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
  
      const json = await fetchJson<PassesResponse>(url);
  
      const batch = Array.isArray(json.gamePasses) ? json.gamePasses : [];
      passes.push(...batch);
  
      const next = json.nextPageToken;
      pageToken = typeof next === "string" && next.length > 0 ? next : undefined;
      if (!pageToken) break;
    }
  
    // Count passes (you can decide if you only want "for sale" passes)
    const forSalePasses = passes.filter(isForSale);
  
    const prices = forSalePasses
      .map(getPrice)
      .filter((n): n is number => n != null);
  
    const avg =
      prices.length > 0
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : null;
  
    return {
      gamePassCount: forSalePasses.length,
      avgGamePassPrice: avg,
    };
  }