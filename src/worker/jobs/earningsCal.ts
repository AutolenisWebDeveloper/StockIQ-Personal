import { sql } from "../../lib/db";
import { getActiveUniverse } from "../../lib/universe";
import { earningsCalChain, withFallback } from "../../providers/registry";
import { withRun } from "../runlog";

// yfinance next-earnings date → stocks.next_earnings_date (Phase 2 expected-move,
// Phase 5 alerts).
async function processTicker(ticker: string): Promise<{ rows: number; degraded: boolean }> {
  const res = await withFallback(earningsCalChain, (p) => p.getNextEarningsDate(ticker), {
    method: "getNextEarningsDate",
    ticker,
    args: [],
    ttlSec: 21600,
  });
  const d = res.value.nextEarningsDate;
  await sql`
    UPDATE stocks SET next_earnings_date = ${d ? d.toISOString().slice(0, 10) : null}
    WHERE ticker = ${ticker}`;
  return { rows: d ? 1 : 0, degraded: res.degraded };
}

export async function runEarningsCalendar(tickers?: string[]): Promise<void> {
  const universe = tickers ?? (await getActiveUniverse());
  for (const ticker of universe) {
    await withRun("earnings-calendar", ticker, async () => {
      const r = await processTicker(ticker);
      return { rowsWritten: r.rows, status: r.degraded ? "degraded" : "success" };
    });
  }
}
