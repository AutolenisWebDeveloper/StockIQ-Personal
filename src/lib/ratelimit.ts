// Per-provider rate limiting. A simple async token-bucket: each provider gets a
// max requests-per-second budget; callers `await limiter.take()` before a call.
// SEC EDGAR is the hard one (≤ 10 req/s with a descriptive UA) — non-negotiable.

class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private readonly ratePerSec: number, private readonly burst: number) {
    this.tokens = burst;
    this.last = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.last) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerSec);
    this.last = now;
  }

  async take(): Promise<void> {
    // Loop until a token is available, sleeping the minimum necessary interval.
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const deficit = 1 - this.tokens;
      const waitMs = Math.ceil((deficit / this.ratePerSec) * 1000);
      await sleep(waitMs);
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Fixed per-provider budgets. Free public sources: stay polite.
const buckets: Record<string, TokenBucket> = {
  sec: new TokenBucket(8, 8), // SEC hard cap is 10/s; leave headroom
  stooq: new TokenBucket(3, 3),
  yfinance: new TokenBucket(2, 2),
  fred: new TokenBucket(5, 5),
};

export function limiter(provider: keyof typeof buckets | string): TokenBucket {
  return (buckets[provider] ??= new TokenBucket(2, 2));
}

/** Retry with exponential backoff. Throws the last error if all attempts fail. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; label?: string } = {}
): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === retries) break;
      await sleep(baseMs * 2 ** attempt);
    }
  }
  throw lastErr;
}
