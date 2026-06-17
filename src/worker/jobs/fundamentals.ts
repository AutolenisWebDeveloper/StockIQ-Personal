import { sql } from "../../lib/db";
import { getActiveUniverse } from "../../lib/universe";
import { fundamentalsChain, withFallback } from "../../providers/registry";
import { withRun } from "../runlog";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function processTicker(ticker: string): Promise<{ rows: number; degraded: boolean }> {
  const inc = await withFallback(fundamentalsChain, (p) => p.getIncomeStatements(ticker, 12), {
    method: "getIncomeStatements",
    ticker,
    args: [12],
    ttlSec: 21600,
  });
  const bal = await withFallback(fundamentalsChain, (p) => p.getBalanceSheetFacts(ticker, 12), {
    method: "getBalanceSheetFacts",
    ticker,
    args: [12],
    ttlSec: 21600,
  });

  const balByEnd = new Map(bal.value.map((b) => [dayKey(b.periodEnd), b]));
  const rows = inc.value.map((s) => {
    const b = balByEnd.get(dayKey(s.periodEnd));
    return {
      ticker,
      period_end: dayKey(s.periodEnd),
      period_type: s.periodType,
      revenue: s.revenue,
      operating_income: s.operatingIncome,
      net_income: s.netIncome,
      eps: s.eps,
      fcf: s.fcf,
      gross_margin: s.grossMargin,
      op_margin: s.opMargin,
      total_debt: b?.totalDebt ?? null,
      cash: b?.cash ?? null,
      roic: s.roic,
    };
  });

  if (rows.length) {
    await sql`
      INSERT INTO financials ${sql(
        rows,
        "ticker",
        "period_end",
        "period_type",
        "revenue",
        "operating_income",
        "net_income",
        "eps",
        "fcf",
        "gross_margin",
        "op_margin",
        "total_debt",
        "cash",
        "roic"
      )}
      ON CONFLICT (ticker, period_end, period_type) DO UPDATE SET
        revenue = EXCLUDED.revenue, operating_income = EXCLUDED.operating_income,
        net_income = EXCLUDED.net_income, eps = EXCLUDED.eps, fcf = EXCLUDED.fcf,
        gross_margin = EXCLUDED.gross_margin, op_margin = EXCLUDED.op_margin,
        total_debt = EXCLUDED.total_debt, cash = EXCLUDED.cash, roic = EXCLUDED.roic`;
  }
  return { rows: rows.length, degraded: inc.degraded || bal.degraded };
}

export async function runFundamentals(tickers?: string[]): Promise<void> {
  const universe = tickers ?? (await getActiveUniverse());
  for (const ticker of universe) {
    await withRun("fundamentals", ticker, async () => {
      const r = await processTicker(ticker);
      return { rowsWritten: r.rows, status: r.degraded ? "degraded" : "success" };
    });
  }
}
