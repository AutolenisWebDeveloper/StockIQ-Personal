import { sql } from "../../lib/db";
import { getActiveUniverse } from "../../lib/universe";
import { analystChain, withFallback } from "../../providers/registry";
import { withRun } from "../runlog";

// Append-only PIT: one snapshot per ticker per day (ts = today's date). The
// self-diff over days is the Phase-2 Analyst signal — never overwrite history.
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function processTicker(ticker: string): Promise<{ rows: number; degraded: boolean }> {
  const res = await withFallback(analystChain, (p) => p.getConsensus(ticker), {
    method: "getConsensus",
    ticker,
    args: [],
    ttlSec: 3600,
  });
  const c = res.value;
  await sql`
    INSERT INTO analyst_consensus_snapshots
      (ticker, ts, consensus_rating, num_analysts, target_mean, target_high, target_low)
    VALUES (${ticker}, ${today()}, ${c.consensusRating}, ${c.numAnalysts},
            ${c.targetMean}, ${c.targetHigh}, ${c.targetLow})
    ON CONFLICT (ticker, ts) DO UPDATE SET
      consensus_rating = EXCLUDED.consensus_rating, num_analysts = EXCLUDED.num_analysts,
      target_mean = EXCLUDED.target_mean, target_high = EXCLUDED.target_high,
      target_low = EXCLUDED.target_low`;
  return { rows: 1, degraded: res.degraded };
}

export async function runConsensus(tickers?: string[]): Promise<void> {
  const universe = tickers ?? (await getActiveUniverse());
  for (const ticker of universe) {
    await withRun("consensus-snapshot", ticker, async () => {
      const r = await processTicker(ticker);
      return { rowsWritten: r.rows, status: r.degraded ? "degraded" : "success" };
    });
  }
}
