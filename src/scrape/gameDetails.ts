// src/scrape/gameDetails.ts
// Fetches: name, description, playing (current players), visits (total visits)
// Source: https://games.roblox.com/v1/games?universeIds=...  [oai_citation:2‡Developer Forum | Roblox](https://devforum.roblox.com/t/how-to-get-robloxs-game-info-such-as-likes-visits-and-favourites/2472813?utm_source=chatgpt.com)

export type GameDetails = {
    universeId: number;
    name: string;
    description: string;
    playing: number; // current player count
    visits: number;  // total visits
  };
  
  type GamesApiResponse = {
    data: Array<{
      id: number; // universeId
      name: string;
      description: string;
      playing: number;
      visits: number;
    }>;
  };
  
  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
  
  async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        // Roblox generally works without special headers, but these help avoid random 403s on some infra.
        "accept": "application/json",
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
  
  export async function fetchGameDetailsByUniverseIds(
    universeIds: number[],
    opts?: { batchSize?: number; concurrency?: number }
  ): Promise<GameDetails[]> {
    const batchSize = Math.min(Math.max(opts?.batchSize ?? 50, 1), 100); // keep sane
    const concurrency = Math.min(Math.max(opts?.concurrency ?? 3, 1), 8);
  
    const uniq = Array.from(new Set(universeIds)).filter((n) => Number.isFinite(n) && n > 0);
    const batches = chunk(uniq, batchSize);
  
    const results: GameDetails[] = [];
    let idx = 0;
  
    async function worker() {
      while (idx < batches.length) {
        const my = idx++;
        const ids = batches[my];
        const url = `https://games.roblox.com/v1/games?universeIds=${ids.join(",")}`;
        const json = await fetchJson<GamesApiResponse>(url);
  
        for (const g of json.data ?? []) {
          results.push({
            universeId: g.id,
            name: g.name ?? "",
            description: g.description ?? "",
            playing: Number(g.playing ?? 0),
            visits: Number(g.visits ?? 0),
          });
        }
      }
    }
  
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  
    // Preserve input order (useful if you keep rank elsewhere)
    const order = new Map<number, number>();
    uniq.forEach((id, i) => order.set(id, i));
    results.sort((a, b) => (order.get(a.universeId) ?? 1e9) - (order.get(b.universeId) ?? 1e9));
  
    return results;
  }