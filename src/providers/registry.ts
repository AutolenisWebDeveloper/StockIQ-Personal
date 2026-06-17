// Ordered-fallback registry with cache + never-expiring last-good mirror.
// Every external provider call goes through `withFallback`: try each provider in
// order; on throw, fall through to the next; if all fail, serve last-good from
// cache (stamped with its as-of) so a dead source never throws into the runner.
// A successful response is cached (TTL) and mirrored to last-good.

import type {
  MarketDataProvider,
  FundamentalsProvider,
  AnalystProvider,
  EstimatesProvider,
  NewsProvider,
  EarningsCalProvider,
  FilingsProvider,
  MacroProvider,
} from "./types";
import { StooqProvider } from "./stooq";
import { YFinanceProvider } from "./yfinance";
import { EdgarFundamentalsProvider, EdgarFilingsProvider } from "./edgar";
import { FredProvider } from "./fred";
import { cacheKey, readCache, writeCache, writeLastGood, readLastGood, type LastGood } from "../lib/cache";

const yf = new YFinanceProvider();

// fixed fallback chains (order matters)
export const marketChain: MarketDataProvider[] = [new StooqProvider(), yf];
export const fundamentalsChain: FundamentalsProvider[] = [new EdgarFundamentalsProvider()];
export const analystChain: AnalystProvider[] = [yf];
export const estimatesChain: EstimatesProvider[] = [yf];
export const newsChain: NewsProvider[] = [yf];
export const earningsCalChain: EarningsCalProvider[] = [yf];
export const filingsChain: FilingsProvider[] = [new EdgarFilingsProvider()];
export const macroChain: MacroProvider[] = [new FredProvider()];

export interface FallbackResult<T> {
  value: T;
  source: string;
  asOf: Date;
  degraded: boolean; // true → served from last-good after all live calls failed
}

interface FallbackOpts {
  method: string;
  ticker: string; // natural cache scope (use seriesId for macro)
  args: unknown[];
  ttlSec?: number;
  cache?: boolean; // default true
}

/**
 * Try each provider in order; cache + mirror successes; serve last-good on total
 * failure. Returns the value plus provenance (source, asOf, degraded flag).
 */
export async function withFallback<P extends { name: string }, T>(
  chain: P[],
  call: (p: P) => Promise<T>,
  opts: FallbackOpts
): Promise<FallbackResult<T>> {
  const useCache = opts.cache !== false;
  const provider0 = chain[0]?.name ?? "unknown";
  const key = cacheKey(provider0, opts.method, opts.ticker, opts.args);

  if (useCache) {
    const hit = await readCache<FallbackResult<T>>(key);
    if (hit) return { ...hit, asOf: new Date(hit.asOf) };
  }

  let lastErr: unknown;
  for (const p of chain) {
    try {
      const value = await call(p);
      const result: FallbackResult<T> = { value, source: p.name, asOf: new Date(), degraded: false };
      if (useCache) {
        await writeCache(key, result, opts.ttlSec ?? 3600);
        await writeLastGood(provider0, opts.method, opts.ticker, opts.args, value);
      }
      return result;
    } catch (e) {
      lastErr = e; // fall through to next provider
    }
  }

  // every provider failed — serve last-good if we have it, else surface the error
  const lg: LastGood<T> | null = await readLastGood(provider0, opts.method, opts.ticker, opts.args);
  if (lg) {
    return { value: lg.value, source: `${provider0}:last-good`, asOf: new Date(lg.asOf), degraded: true };
  }
  throw lastErr ?? new Error(`withFallback: no providers for ${opts.method}`);
}

export const providers = {
  market: marketChain,
  fundamentals: fundamentalsChain,
  analyst: analystChain,
  estimates: estimatesChain,
  news: newsChain,
  earningsCal: earningsCalChain,
  filings: filingsChain,
  macro: macroChain,
};
