import { sql } from "../db";
import { resolveCohort, cohortPercentile } from "./cohort";

// Engine 1 — Conviction Score (research-priority signal, NOT a buy signal).
// Six sector-relative percentile sub-scores combined by fixed weights, with
// drop+renormalize when a sub-score's inputs are unavailable. News is EXCLUDED
// from the composite — news_signal is computed and stored alongside. Append-only
// PIT (one row/ticker/compute-day). Every number is reproducible from the DB.

const WEIGHTS = {
  fundamental: 25,
  earnings: 25,
  analyst: 15,
  institutional: 15,
  insider: 10,
  technical: 10,
} as const;
type SubName = keyof typeof WEIGHTS;

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function band(total: number): string {
  return total < 40 ? "Bearish" : total < 60 ? "Neutral" : total < 80 ? "Bullish" : "Very Bullish";
}

// ---------------- metric extractors (ticker → number | null) ----------------
async function revGrowth(t: string): Promise<number | null> {
  const r = await sql<{ revenue: string }[]>`
    SELECT revenue FROM financials WHERE ticker = ${t} AND period_type = 'FY' AND revenue IS NOT NULL
    ORDER BY period_end DESC LIMIT 2`;
  if (r.length < 2) return null;
  const [cur, prev] = [Number(r[0].revenue), Number(r[1].revenue)];
  return prev !== 0 ? (cur - prev) / Math.abs(prev) : null;
}
async function marginTrend(t: string): Promise<number | null> {
  const r = await sql<{ op_margin: string | null }[]>`
    SELECT op_margin FROM financials WHERE ticker = ${t} AND period_type = 'FY' AND op_margin IS NOT NULL
    ORDER BY period_end DESC LIMIT 2`;
  if (r.length < 2) return null;
  return Number(r[0].op_margin) - Number(r[1].op_margin);
}
async function grossMarginLevel(t: string): Promise<number | null> {
  const [r] = await sql<{ gross_margin: string | null }[]>`
    SELECT gross_margin FROM financials WHERE ticker = ${t} AND gross_margin IS NOT NULL
    ORDER BY period_end DESC LIMIT 1`;
  return r?.gross_margin != null ? Number(r.gross_margin) : null;
}
async function roicMetric(t: string): Promise<number | null> {
  const [r] = await sql<{ roic: string | null }[]>`
    SELECT roic FROM financials WHERE ticker = ${t} AND roic IS NOT NULL ORDER BY period_end DESC LIMIT 1`;
  return r?.roic != null ? Number(r.roic) : null;
}
async function epsGrowth(t: string): Promise<number | null> {
  const r = await sql<{ eps: string }[]>`
    SELECT eps FROM financials WHERE ticker = ${t} AND period_type = 'FY' AND eps IS NOT NULL
    ORDER BY period_end DESC LIMIT 2`;
  if (r.length < 2) return null;
  const [cur, prev] = [Number(r[0].eps), Number(r[1].eps)];
  return prev !== 0 ? (cur - prev) / Math.abs(prev) : null;
}
async function estRevision(t: string): Promise<number | null> {
  // latest vs earliest estimate for the furthest-out period (PIT self-diff)
  const [period] = await sql<{ period_end: string }[]>`
    SELECT period_end FROM earnings_estimates WHERE ticker = ${t}
    ORDER BY period_end DESC LIMIT 1`;
  if (!period) return null;
  const r = await sql<{ eps_estimate: string | null; estimate_ts: string }[]>`
    SELECT eps_estimate, estimate_ts FROM earnings_estimates
    WHERE ticker = ${t} AND period_end = ${period.period_end} AND eps_estimate IS NOT NULL
    ORDER BY estimate_ts`;
  if (r.length < 2) return null;
  const first = Number(r[0].eps_estimate);
  const last = Number(r[r.length - 1].eps_estimate);
  return first !== 0 ? (last - first) / Math.abs(first) : null;
}
const RATING_MAP: Record<string, number> = {
  strong_buy: 5, buy: 4, outperform: 4, hold: 3, neutral: 3, underperform: 2, sell: 2, strong_sell: 1,
};
async function latestPrice(t: string): Promise<number | null> {
  const [r] = await sql<{ adj_close: string }[]>`SELECT adj_close FROM stock_prices WHERE ticker = ${t} ORDER BY ts DESC LIMIT 1`;
  return r ? Number(r.adj_close) : null;
}
async function ratingScore(t: string): Promise<number | null> {
  const [r] = await sql<{ consensus_rating: string | null }[]>`
    SELECT consensus_rating FROM analyst_consensus_snapshots WHERE ticker = ${t} ORDER BY ts DESC LIMIT 1`;
  const k = r?.consensus_rating?.toLowerCase().replace(/\s+/g, "_");
  return k && RATING_MAP[k] != null ? RATING_MAP[k] : null;
}
async function targetUpside(t: string): Promise<number | null> {
  const [r] = await sql<{ target_mean: string | null }[]>`
    SELECT target_mean FROM analyst_consensus_snapshots WHERE ticker = ${t} ORDER BY ts DESC LIMIT 1`;
  const price = await latestPrice(t);
  if (r?.target_mean == null || price == null || price === 0) return null;
  return (Number(r.target_mean) - price) / price;
}
async function targetRevision(t: string): Promise<number | null> {
  const r = await sql<{ target_mean: string | null }[]>`
    SELECT target_mean FROM analyst_consensus_snapshots WHERE ticker = ${t} AND target_mean IS NOT NULL
    ORDER BY ts DESC LIMIT 2`;
  if (r.length < 2) return null;
  const [cur, prev] = [Number(r[0].target_mean), Number(r[1].target_mean)];
  return prev !== 0 ? (cur - prev) / Math.abs(prev) : null;
}
async function instNet(t: string): Promise<number | null> {
  const [r] = await sql<{ net: string | null }[]>`
    SELECT SUM(change_shares) AS net FROM institutional_holdings
    WHERE ticker = ${t} AND report_period = (SELECT MAX(report_period) FROM institutional_holdings WHERE ticker = ${t})`;
  return r?.net != null ? Number(r.net) : null;
}
async function insiderNet(t: string): Promise<number | null> {
  const r = await sql<{ txn_type: string; v: string | null }[]>`
    SELECT txn_type, SUM(COALESCE(value, shares * price)) AS v FROM insider_transactions
    WHERE ticker = ${t} AND txn_date > now() - interval '90 days' GROUP BY txn_type`;
  if (!r.length) return null;
  let net = 0;
  for (const row of r) net += (row.txn_type === "buy" ? 1 : -1) * Number(row.v ?? 0);
  return net;
}
async function techBlend(t: string): Promise<number | null> {
  const [r] = await sql<
    { ma200: string | null; rel_strength: string | null; macd: string | null; macd_signal: string | null; rsi14: string | null }[]
  >`SELECT ma200, rel_strength, macd, macd_signal, rsi14 FROM technical_indicators WHERE ticker = ${t} ORDER BY ts DESC LIMIT 1`;
  if (!r) return null;
  const price = await latestPrice(t);
  const parts: number[] = [];
  if (price != null && r.ma200 != null) parts.push(price / Number(r.ma200) - 1);
  if (r.rel_strength != null) parts.push(Number(r.rel_strength));
  if (r.macd != null && r.macd_signal != null) parts.push((Number(r.macd) - Number(r.macd_signal)) * 0.01);
  if (r.rsi14 != null) parts.push((Number(r.rsi14) - 50) / 100);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

// ---------------- sub-score assembly (percentile-average within cohort) ----------------
async function subScore(
  target: string,
  cohort: string[],
  comps: { fn: (t: string) => Promise<number | null>; higherIsBetter?: boolean }[]
): Promise<number | null> {
  const pcts: number[] = [];
  for (const c of comps) {
    const p = await cohortPercentile(target, cohort, c.fn, c.higherIsBetter ?? true);
    if (p != null) pcts.push(p);
  }
  return pcts.length ? avg(pcts) : null;
}

async function newsSignal(t: string): Promise<number | null> {
  // trailing sentiment; news_sentiment is populated in Phase 3 → typically null now.
  const [r] = await sql<{ s: string | null }[]>`
    SELECT AVG(ns.score) AS s FROM news_sentiment ns
    JOIN news_articles na ON na.id = ns.article_id
    WHERE na.ticker = ${t} AND na.published_at > now() - interval '30 days'`;
  return r?.s != null ? Number(r.s) : null;
}

export interface ConvictionResult {
  total: number;
  band: string;
  subs: Record<SubName, number | null>;
  weights: Partial<Record<SubName, number>>;
  cohortUsed: string;
  newsSignal: number | null;
}

export async function computeConviction(ticker: string, ts: Date): Promise<ConvictionResult> {
  const { tickers: cohort, cohortUsed } = await resolveCohort(ticker);

  const subs: Record<SubName, number | null> = {
    fundamental: await subScore(ticker, cohort, [
      { fn: revGrowth },
      { fn: marginTrend },
      { fn: grossMarginLevel },
      { fn: roicMetric },
    ]),
    earnings: await subScore(ticker, cohort, [{ fn: epsGrowth }, { fn: estRevision }]),
    analyst: await subScore(ticker, cohort, [{ fn: ratingScore }, { fn: targetUpside }, { fn: targetRevision }]),
    institutional: await subScore(ticker, cohort, [{ fn: instNet }]),
    insider: await subScore(ticker, cohort, [{ fn: insiderNet }]),
    technical: await subScore(ticker, cohort, [{ fn: techBlend }]),
  };

  // drop + renormalize: keep present sub-scores, renormalize weights to sum 1.0
  const present = (Object.keys(WEIGHTS) as SubName[]).filter((k) => subs[k] != null);
  const weightSum = present.reduce((s, k) => s + WEIGHTS[k], 0);
  const weights: Partial<Record<SubName, number>> = {};
  let total = 0;
  for (const k of present) {
    const w = WEIGHTS[k] / weightSum;
    weights[k] = Math.round(w * 1000) / 1000;
    total += subs[k]! * w;
  }
  total = present.length ? Math.round(total * 100) / 100 : 0;

  const news = await newsSignal(ticker);

  await sql`
    INSERT INTO conviction_scores
      (ticker, ts, fundamental_score, earnings_score, analyst_score, institutional_score,
       insider_score, technical_score, news_signal, composite, band, weights_json, cohort_used)
    VALUES (
      ${ticker}, ${ts.toISOString()},
      ${subs.fundamental}, ${subs.earnings}, ${subs.analyst}, ${subs.institutional},
      ${subs.insider}, ${subs.technical}, ${news}, ${total}, ${band(total)},
      ${JSON.stringify(weights)}, ${cohortUsed}
    )
    ON CONFLICT (ticker, ts) DO UPDATE SET
      fundamental_score = EXCLUDED.fundamental_score, earnings_score = EXCLUDED.earnings_score,
      analyst_score = EXCLUDED.analyst_score, institutional_score = EXCLUDED.institutional_score,
      insider_score = EXCLUDED.insider_score, technical_score = EXCLUDED.technical_score,
      news_signal = EXCLUDED.news_signal, composite = EXCLUDED.composite, band = EXCLUDED.band,
      weights_json = EXCLUDED.weights_json, cohort_used = EXCLUDED.cohort_used`;

  return { total, band: band(total), subs, weights, cohortUsed, newsSignal: news };
}
