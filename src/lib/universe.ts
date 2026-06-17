import { sql } from "./db";

// Active universe = watchlist_items ∪ on-demand tickers. Every Phase-1 job
// iterates ONLY this set — never the whole market.

export async function getActiveUniverse(): Promise<string[]> {
  const rows = await sql<{ ticker: string }[]>`
    SELECT DISTINCT ticker FROM watchlist_items ORDER BY ticker`;
  return rows.map((r) => r.ticker);
}

/** Ensure a ticker exists in `stocks` (on-demand cold fetch + watchlist add). */
export async function ensureStock(ticker: string): Promise<void> {
  await sql`INSERT INTO stocks (ticker) VALUES (${ticker}) ON CONFLICT (ticker) DO NOTHING`;
}
