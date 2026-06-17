import { getActiveUniverse } from "../../lib/universe";
import { computeLevels } from "../../lib/engines/levels";
import { computeValuation } from "../../lib/engines/valuation";
import { computeConviction } from "../../lib/engines/conviction";
import { computeOpportunity } from "../../lib/engines/opportunity";
import { withRun } from "../runlog";

// compute job: runs the four engines per ticker in dependency order —
// levels → valuation → conviction → opportunity (opportunity consumes the
// conviction Δ). One compute-day per run (ts = today 00:00Z); idempotent.
function todayTs(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function runCompute(tickers?: string[]): Promise<void> {
  const universe = tickers ?? (await getActiveUniverse());
  const ts = todayTs();
  for (const ticker of universe) {
    await withRun("compute", ticker, async () => {
      await computeLevels(ticker, ts);
      await computeValuation(ticker, ts);
      await computeConviction(ticker, ts);
      const opps = await computeOpportunity(ticker, ts);
      return { rowsWritten: 3 + opps };
    });
  }
}
