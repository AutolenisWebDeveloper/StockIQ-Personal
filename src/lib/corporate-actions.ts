import { sql } from "./db";
import type { CorporateActionEvent } from "../providers/types";

// Corporate-action handling: store splits/dividends, then recompute adj_close for
// the full raw series so indicators (which run off adj_close) show no artificial
// gap across a split. On a NEW split, the entire prior history is re-adjusted.

/** Upsert detected events; returns how many *new* split rows were inserted. */
export async function upsertCorporateActions(
  ticker: string,
  events: CorporateActionEvent[]
): Promise<{ newSplits: number }> {
  let newSplits = 0;
  for (const e of events) {
    const exDate = e.exDate.toISOString().slice(0, 10);
    const inserted = await sql`
      INSERT INTO corporate_actions (ticker, type, ex_date, ratio, details_json)
      VALUES (${ticker}, ${e.type}, ${exDate}, ${e.ratio}, ${e.details ? JSON.stringify(e.details) : null})
      ON CONFLICT (ticker, type, ex_date) DO NOTHING
      RETURNING id`;
    if (inserted.length && e.type === "split") newSplits++;
  }
  return { newSplits };
}

/**
 * Recompute adj_close for every bar from the stored split ratios. A bar's
 * adjustment factor is the product of ratios for all splits with ex_date strictly
 * after the bar — so pre-split prices are divided down to post-split scale.
 */
export async function recomputeAdjClose(ticker: string): Promise<number> {
  const splits = await sql<{ ex_date: string; ratio: string }[]>`
    SELECT ex_date, ratio FROM corporate_actions
    WHERE ticker = ${ticker} AND type = 'split' AND ratio IS NOT NULL
    ORDER BY ex_date`;
  const prices = await sql<{ ts: string; close: string }[]>`
    SELECT ts, close FROM stock_prices WHERE ticker = ${ticker} ORDER BY ts`;
  if (!prices.length) return 0;

  const parsedSplits = splits.map((s) => ({ exDate: new Date(s.ex_date).getTime(), ratio: Number(s.ratio) }));

  const tsArr: string[] = [];
  const adjArr: number[] = [];
  for (const p of prices) {
    const t = new Date(p.ts).getTime();
    let factor = 1;
    for (const s of parsedSplits) if (s.exDate > t) factor *= s.ratio;
    tsArr.push(new Date(p.ts).toISOString());
    adjArr.push(Number(p.close) / factor);
  }

  await sql`
    UPDATE stock_prices sp SET adj_close = u.adj
    FROM unnest(${tsArr}::timestamptz[], ${adjArr}::numeric[]) AS u(ts, adj)
    WHERE sp.ticker = ${ticker} AND sp.ts = u.ts`;

  return prices.length;
}
