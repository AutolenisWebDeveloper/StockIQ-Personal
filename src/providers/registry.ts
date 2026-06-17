// registry.ts — ordered fallback: try each provider, fall through on throw.
import type { MarketDataProvider, FundamentalsProvider } from "./types";
import { stooqStub, yfinanceStub, edgarFundamentalsStub } from "./stubs";

const marketChain: MarketDataProvider[] = [stooqStub, yfinanceStub];
const fundamentalsChain: FundamentalsProvider[] = [edgarFundamentalsStub];

export async function withFallback<T>(
  chain: { name: string }[],
  call: (p: any) => Promise<T>
): Promise<T> {
  let lastErr: unknown;
  for (const p of chain) {
    try { return await call(p); }
    catch (e) { lastErr = e; /* Phase 1: log to ingestion_runs, serve last-good */ }
  }
  throw lastErr;
}
export const providers = { market: marketChain, fundamentals: fundamentalsChain };
