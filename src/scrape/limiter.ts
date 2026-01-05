function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
  
  export class RateLimiter {
    private nextAllowedAt = 0;
  
    constructor(private minIntervalMs: number) {}
  
    async wait() {
      const now = Date.now();
      const waitMs = Math.max(0, this.nextAllowedAt - now);
      this.nextAllowedAt = Math.max(this.nextAllowedAt, now) + this.minIntervalMs;
      if (waitMs > 0) await sleep(waitMs);
    }
  }