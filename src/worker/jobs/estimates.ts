import { sql } from "../../lib/db";
import { getActiveUniverse } from "../../lib/universe";
import { estimatesChain, withFallback } from "../../providers/registry";
import { withRun } from "../runlog";

// Append-only PIT: estimate_ts = today's date, so revisions accrue over time
// (the Phase-2 estimate-revision signal). Unique (ticker, period_end, estimate_ts).
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function processTicker(ticker: string): Promise<{ rows: number; degraded: boolean }> {
  const res = await withFallback(estimatesChain, (p) => p.getEstimates(ticker), {
    method: "getEstimates",
    ticker,
    args: [],
    ttlSec: 3600,
  });
  const ets = today();
  const rows = res.value.map((e) => ({
    ticker,
    period_end: dayKey(e.periodEnd),
    eps_estimate: e.epsEstimate,
    revenue_estimate: e.revenueEstimate,
    num_analysts: e.numAnalysts,
    estimate_ts: ets,
  }));
  if (rows.length) {
    await sql`
      INSERT INTO earnings_estimates ${sql(
        rows,
        "ticker",
        "period_end",
        "eps_estimate",
        "revenue_estimate",
        "num_analysts",
        "estimate_ts"
      )}
      ON CONFLICT (ticker, period_end, estimate_ts) DO UPDATE SET
        eps_estimate = EXCLUDED.eps_estimate, revenue_estimate = EXCLUDED.revenue_estimate,
        num_analysts = EXCLUDED.num_analysts`;
  }
  return { rows: rows.length, degraded: res.degraded };
}

export async function runEstimates(tickers?: string[]): Promise<void> {
  const universe = tickers ?? (await getActiveUniverse());
  for (const ticker of universe) {
    await withRun("estimate-snapshot", ticker, async () => {
      const r = await processTicker(ticker);
      return { rowsWritten: r.rows, status: r.degraded ? "degraded" : "success" };
    });
  }
}
