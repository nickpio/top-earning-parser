export type FetchRetryOpts = {
    maxRetries?: number;        // default 6
    baseDelayMs?: number;       // default 400
    maxDelayMs?: number;        // default 15_000
    retryOnStatuses?: number[]; // default [429, 500, 502, 503, 504]
  };
  
  function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
  
  function jitter(ms: number) {
    // +/- 25%
    const j = ms * 0.25 * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(ms + j));
  }
  
  function parseRetryAfterSeconds(h: string | null): number | null {
    if (!h) return null;
    const n = Number(h);
    if (Number.isFinite(n) && n > 0) return n;
    return null;
  }
  
  export async function fetchJsonWithRetry<T>(
    url: string,
    init?: RequestInit,
    opts?: FetchRetryOpts
  ): Promise<T> {
    const maxRetries = opts?.maxRetries ?? 6;
    const baseDelayMs = opts?.baseDelayMs ?? 400;
    const maxDelayMs = opts?.maxDelayMs ?? 15_000;
    const retryOn = new Set(opts?.retryOnStatuses ?? [429, 500, 502, 503, 504]);
  
    let attempt = 0;
  
    while (true) {
      const res = await fetch(url, init);
  
      if (res.ok) {
        return (await res.json()) as T;
      }
  
      const status = res.status;
      const shouldRetry = retryOn.has(status) && attempt < maxRetries;
  
      if (!shouldRetry) {
        const text = await res.text().catch(() => "");
        throw new Error(`GET ${url} -> ${status} ${res.statusText}\n${text.slice(0, 300)}`);
      }
  
      // If server gives Retry-After, respect it (seconds)
      const ra = parseRetryAfterSeconds(res.headers.get("retry-after"));
      const backoff =
        ra != null
          ? ra * 1000
          : Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  
      await sleep(jitter(backoff));
      attempt += 1;
    }
  }