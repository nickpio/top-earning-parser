import { fetchGamePassStatsForUniverse, type GamePassStats } from "./gamePasses";
import { RateLimiter } from "./limiter";

export async function fetchGamePassStatsBatch(
  universeIds: number[],
  opts?: { concurrency?: number; minIntervalMs?: number }
): Promise<Map<number, GamePassStats>> {
  // ✅ Tone down: start with 3–5
  const concurrency = Math.min(Math.max(opts?.concurrency ?? 4, 1), 10);

  // ✅ Global pacing: 150–300ms is usually safe-ish
  // 200ms => ~5 requests/second total across all workers
  const limiter = new RateLimiter(opts?.minIntervalMs ?? 200);

  const out = new Map<number, GamePassStats>();
  let idx = 0;

  async function worker() {
    while (idx < universeIds.length) {
      const i = idx++;
      const id = universeIds[i];

      // global throttle
      await limiter.wait();

      try {
        const stats = await fetchGamePassStatsForUniverse(id, {
          pageSize: 100,
          maxPages: 20,
        });
        out.set(id, stats);
      } catch {
        out.set(id, { gamePassCount: 0, avgGamePassPrice: null });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return out;
}