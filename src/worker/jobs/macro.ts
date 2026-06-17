import { sql } from "../../lib/db";
import { macroChain, withFallback } from "../../providers/registry";
import { FRED_SERIES } from "../../providers/fred";
import { withRun } from "../runlog";

// FRED macro series (not per-ticker). Upsert (series_id, ts).
export async function runMacro(): Promise<void> {
  const from = new Date(Date.now() - 365 * 5 * 86400_000); // 5y window
  await withRun("macro", null, async () => {
    let total = 0;
    let degraded = false;
    for (const seriesId of FRED_SERIES) {
      try {
        const res = await withFallback(macroChain, (p) => p.getSeries(seriesId, from), {
          method: "getSeries",
          ticker: seriesId,
          args: [from.toISOString().slice(0, 10)],
          ttlSec: 21600,
        });
        degraded = degraded || res.degraded;
        const rows = res.value
          .filter((pt) => pt.value != null)
          .map((pt) => ({ series_id: seriesId, ts: pt.ts.toISOString().slice(0, 10), value: pt.value }));
        if (rows.length) {
          await sql`
            INSERT INTO macro_series ${sql(rows, "series_id", "ts", "value")}
            ON CONFLICT (series_id, ts) DO UPDATE SET value = EXCLUDED.value, fetched_at = now()`;
          total += rows.length;
        }
      } catch {
        degraded = true; // one series down ≠ dead run
      }
    }
    return { rowsWritten: total, status: degraded ? "degraded" : "success" };
  });
}
