export type PaidAccessInfo = {
    paidAccess: boolean | null; // null = unknown
    paidAccessPrice: number | null;
  };
  
  type PlaceDetails = Array<{
    placeId?: number;
    price?: number; // often exists on some place detail endpoints
  }>;
  
  async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:146.0) Gecko/20100101 Firefox/146.0",
      },
    });
    if (!res.ok) return (await Promise.reject(new Error(`GET ${url} -> ${res.status}`))) as never;
    return (await res.json()) as T;
  }
  
  // Fallback: https://games.roblox.com/v1/games/multiget-place-details?placeIds=...  [oai_citation:5‡Developer Forum | Roblox](https://devforum.roblox.com/t/need-help-retrieving-information-on-games-using-the-public-api/3124427?utm_source=chatgpt.com)
  export async function fetchPaidAccessFromPlaceDetails(rootPlaceId: number): Promise<PaidAccessInfo> {
    try {
      const url = `https://games.roblox.com/v1/games/multiget-place-details?placeIds=${rootPlaceId}`;
      const json = await fetchJson<PlaceDetails>(url);
      const first = Array.isArray(json) ? json[0] : undefined;
  
      const price = typeof first?.price === "number" && Number.isFinite(first.price) ? first.price : null;
      if (price == null) return { paidAccess: null, paidAccessPrice: null };
      return { paidAccess: price > 0, paidAccessPrice: price };
    } catch {
      return { paidAccess: null, paidAccessPrice: null };
    }
  }