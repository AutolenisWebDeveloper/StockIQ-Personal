import { sql } from "../db";
import { resolveCohort } from "./cohort";

// Engine 3 — Valuation (deterministic, fully transparent). Multiples vs cohort,
// a fair-value band from forward estimates × defensible multiple ranges, and an
// under/fair/over verdict. Every figure carries Source·Date·Confidence; a
// missing input is recorded Unavailable — never 0/fabricated.

function num(v: string | null | undefined): number | null {
  return v == null ? null : Number(v);
}
function round(n: number | null, dp = 2): number | null {
  return n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp;
}

async function latestPrice(ticker: string): Promise<{ price: number | null; asOf: string | null }> {
  const [r] = await sql<{ adj_close: string; ts: string }[]>`
    SELECT adj_close, ts FROM stock_prices WHERE ticker = ${ticker} ORDER BY ts DESC LIMIT 1`;
  return { price: r ? Number(r.adj_close) : null, asOf: r?.ts ?? null };
}

async function ttmEps(ticker: string): Promise<number | null> {
  const q = await sql<{ eps: string | null }[]>`
    SELECT eps FROM financials WHERE ticker = ${ticker} AND period_type = 'Q' AND eps IS NOT NULL
    ORDER BY period_end DESC LIMIT 4`;
  if (q.length === 4) return q.reduce((s, r) => s + Number(r.eps), 0);
  const [fy] = await sql<{ eps: string | null }[]>`
    SELECT eps FROM financials WHERE ticker = ${ticker} AND period_type = 'FY' AND eps IS NOT NULL
    ORDER BY period_end DESC LIMIT 1`;
  return fy?.eps != null ? Number(fy.eps) : null;
}

async function forwardEps(ticker: string): Promise<number | null> {
  // latest estimate batch → the furthest-out (annual) period
  const [r] = await sql<{ eps_estimate: string | null }[]>`
    SELECT eps_estimate FROM earnings_estimates
    WHERE ticker = ${ticker} AND eps_estimate IS NOT NULL
      AND estimate_ts = (SELECT MAX(estimate_ts) FROM earnings_estimates WHERE ticker = ${ticker})
    ORDER BY period_end DESC LIMIT 1`;
  return r?.eps_estimate != null ? Number(r.eps_estimate) : null;
}

async function fwdPe(ticker: string): Promise<number | null> {
  const [{ price }, fe] = await Promise.all([latestPrice(ticker), forwardEps(ticker)]);
  if (price == null || fe == null || fe <= 0) return null;
  return price / fe;
}

export interface ValuationResult {
  verdict: "under" | "fair" | "over" | null;
  hasUnavailable: boolean;
}

export async function computeValuation(ticker: string, ts: Date): Promise<ValuationResult> {
  const { price, asOf } = await latestPrice(ticker);
  const eps = await ttmEps(ticker);
  const fEps = await forwardEps(ticker);

  const ttmPe = price != null && eps != null && eps > 0 ? price / eps : null;
  const fwdPeVal = price != null && fEps != null && fEps > 0 ? price / fEps : null;

  // cohort median forward P/E → peer multiple
  const { tickers: cohort, cohortUsed } = await resolveCohort(ticker);
  const peerPes = (await Promise.all(cohort.map((t) => fwdPe(t)))).filter((v): v is number => v != null);
  peerPes.sort((a, b) => a - b);
  const peerPe = peerPes.length ? peerPes[Math.floor(peerPes.length / 2)] : null;

  // fair-value band: forward EPS (fallback ttm EPS) × defensible multiple range
  const epsForBand = fEps ?? eps;
  const baseMult = peerPe ?? ttmPe;
  let bull: number | null = null;
  let base: number | null = null;
  let bear: number | null = null;
  if (epsForBand != null && epsForBand > 0 && baseMult != null && baseMult > 0) {
    base = epsForBand * baseMult;
    bull = epsForBand * baseMult * 1.2;
    bear = epsForBand * baseMult * 0.8;
  }

  const probs = { bull: 0.25, base: 0.5, bear: 0.25 }; // fixed, documented
  const pwfv =
    bull != null && base != null && bear != null
      ? bull * probs.bull + base * probs.base + bear * probs.bear
      : null;

  let verdict: "under" | "fair" | "over" | null = null;
  if (pwfv != null && price != null) {
    verdict = pwfv > price * 1.1 ? "under" : pwfv < price * 0.9 ? "over" : "fair";
  }

  // provenance: tag each figure Source·Date·Confidence; null inputs → Unavailable
  const U = "UNAVAILABLE — not verified from accessible sources.";
  const inputs = {
    price: price != null ? { value: round(price), source: "stooq/yfinance", asOf, confidence: "Medium" } : U,
    ttm_eps: eps != null ? { value: round(eps, 3), source: "EDGAR XBRL", confidence: "High" } : U,
    forward_eps: fEps != null ? { value: round(fEps, 3), source: "yfinance", confidence: "Medium" } : U,
    ttm_pe: round(ttmPe),
    fwd_pe: round(fwdPeVal),
    peer_pe: peerPe != null ? { value: round(peerPe), basis: cohortUsed, confidence: "Medium" } : U,
    multiples_used: baseMult != null ? { bear: round(baseMult * 0.8), base: round(baseMult), bull: round(baseMult * 1.2) } : U,
    // genuinely unavailable in the free stack without shares-outstanding/EV inputs:
    ps: U,
    pb: U,
    ev_ebitda: U,
    fcf_yield: U,
    hist_pe_pctile: U,
    scenario_probs: probs,
  };
  const hasUnavailable = Object.values(inputs).some((v) => v === U);

  await sql`
    INSERT INTO valuations
      (ticker, ts, fwd_pe, ttm_pe, peg, ps, ev_ebitda, fcf_yield, hist_pe_pctile, peer_pe,
       bull_target, base_target, bear_target, scenario_probs_json, prob_weighted_fv, verdict, method, inputs_json)
    VALUES (
      ${ticker}, ${ts.toISOString()}, ${round(fwdPeVal)}, ${round(ttmPe)}, ${null}, ${null}, ${null}, ${null},
      ${null}, ${round(peerPe)}, ${round(bull)}, ${round(base)}, ${round(bear)},
      ${JSON.stringify(probs)}, ${round(pwfv)}, ${verdict},
      ${"forward-EPS × cohort-median fwd P/E (±20% band); prob-weighted FV; free-stack multiples only"},
      ${JSON.stringify(inputs)}
    )
    ON CONFLICT (ticker, ts) DO UPDATE SET
      fwd_pe = EXCLUDED.fwd_pe, ttm_pe = EXCLUDED.ttm_pe, peer_pe = EXCLUDED.peer_pe,
      bull_target = EXCLUDED.bull_target, base_target = EXCLUDED.base_target, bear_target = EXCLUDED.bear_target,
      scenario_probs_json = EXCLUDED.scenario_probs_json, prob_weighted_fv = EXCLUDED.prob_weighted_fv,
      verdict = EXCLUDED.verdict, method = EXCLUDED.method, inputs_json = EXCLUDED.inputs_json`;

  return { verdict, hasUnavailable };
}
