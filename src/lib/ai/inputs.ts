import { sql } from "../db";
import { computeSizing } from "../engines/sizing";

// Assemble the DETERMINISTIC_INPUTS payload (decision-report spec §3) from the
// deterministic engine tables. Every number the report cites comes from here;
// anything genuinely unavailable in the current build is left null → the report
// renders it as UNAVAILABLE (never fabricated).

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
function macdLabel(macd: number | null, signal: number | null): string | null {
  if (macd == null || signal == null) return null;
  return macd > signal ? "bullish" : macd < signal ? "bearish" : "neutral";
}

export interface AssembledInputs {
  ticker: string;
  company: string | null;
  asof: string;
  inputs: Record<string, unknown>;
}

export async function assembleInputs(ticker: string): Promise<AssembledInputs> {
  const [stock] = await sql<{ name: string | null; next_earnings_date: string | null }[]>`
    SELECT name, next_earnings_date FROM stocks WHERE ticker = ${ticker}`;
  const [price] = await sql<{ adj_close: string; ts: string }[]>`
    SELECT adj_close, ts FROM stock_prices WHERE ticker = ${ticker} ORDER BY ts DESC LIMIT 1`;
  const [conv] = await sql<any[]>`
    SELECT composite, band, fundamental_score, earnings_score, analyst_score,
           institutional_score, insider_score, technical_score
    FROM conviction_scores WHERE ticker = ${ticker} ORDER BY ts DESC LIMIT 1`;
  const [val] = await sql<any[]>`
    SELECT fwd_pe, ttm_pe, peg, ps, ev_ebitda, fcf_yield, hist_pe_pctile, peer_pe,
           bull_target, base_target, bear_target, scenario_probs_json, prob_weighted_fv, verdict
    FROM valuations WHERE ticker = ${ticker} ORDER BY ts DESC LIMIT 1`;
  const [lvl] = await sql<any[]>`
    SELECT trend, support_json, resistance_json, breakout, breakdown, atr14,
           stop_suggested, entry_zone_json, exit_zone_json, risk_reward, key_level, expected_move_json
    FROM technical_levels WHERE ticker = ${ticker} ORDER BY ts DESC LIMIT 1`;
  const [ind] = await sql<any[]>`
    SELECT rsi14, macd, macd_signal FROM technical_indicators WHERE ticker = ${ticker} ORDER BY ts DESC LIMIT 1`;
  const est = await sql<any[]>`
    SELECT eps_estimate, revenue_estimate, estimate_ts FROM earnings_estimates
    WHERE ticker = ${ticker} AND eps_estimate IS NOT NULL
    ORDER BY estimate_ts DESC LIMIT 4`;
  const [inst] = await sql<{ net: string | null }[]>`
    SELECT SUM(change_pct) AS net FROM institutional_holdings WHERE ticker = ${ticker}`;
  const [insider] = await sql<{ net: string | null }[]>`
    SELECT SUM(CASE WHEN txn_type = 'buy' THEN COALESCE(value, shares*price) ELSE -COALESCE(value, shares*price) END) AS net
    FROM insider_transactions WHERE ticker = ${ticker} AND txn_date > now() - interval '90 days'`;
  const [fin] = await sql<any[]>`
    SELECT total_debt, op_margin FROM financials WHERE ticker = ${ticker} ORDER BY period_end DESC LIMIT 1`;

  const priceVal = price ? Number(price.adj_close) : null;
  const composite = n(conv?.composite);
  const atr = n(lvl?.atr14);
  const atrPct = atr != null && priceVal ? atr / priceVal : null;

  // estimate-revision trend (latest vs oldest of recent batch)
  let revisionTrend: string | null = null;
  if (est.length >= 2) {
    const d = Number(est[0].eps_estimate) - Number(est[est.length - 1].eps_estimate);
    revisionTrend = d > 0 ? "up" : d < 0 ? "down" : "flat";
  }

  // earnings risk heuristic (deterministic): proximity + realized vol
  const nextEarnings = stock?.next_earnings_date ?? null;
  const daysToEarnings = nextEarnings ? Math.round((new Date(nextEarnings).getTime() - Date.now()) / 86400_000) : null;
  let earningsRisk: "Low" | "Medium" | "High" | null = null;
  if (daysToEarnings != null && daysToEarnings >= 0) {
    const near = daysToEarnings <= 14;
    const volatile = atrPct != null && atrPct >= 0.04;
    earningsRisk = near && volatile ? "High" : near || volatile ? "Medium" : "Low";
  }

  const instNet = n(inst?.net);
  const verdict = val?.verdict ?? null;

  const sizing = computeSizing({
    band: conv?.band ?? null,
    entry: Array.isArray(lvl?.entry_zone_json) ? n(lvl.entry_zone_json[1]) ?? priceVal : priceVal,
    stop: n(lvl?.stop_suggested),
    earningsRisk,
    daysToEarnings,
  });

  const riskFlags: string[] = [];
  if (verdict === "over") riskFlags.push("valuation");
  if (n(fin?.total_debt) != null && n(fin?.total_debt)! > 0) riskFlags.push("debt");
  if (n(fin?.op_margin) != null && n(fin?.op_margin)! < 0.05) riskFlags.push("margin");
  if (lvl?.trend === "downtrend") riskFlags.push("technical");
  if (earningsRisk === "High") riskFlags.push("earnings");

  const inputs = {
    ticker,
    asof: new Date().toISOString(),
    price: priceVal != null ? { value: priceVal, source: "stooq|yfinance", confidence: "High" } : null,

    conviction: composite != null
      ? {
          composite,
          band: conv.band,
          subscores: {
            fundamental: n(conv.fundamental_score), earnings: n(conv.earnings_score),
            analyst: n(conv.analyst_score), institutional: n(conv.institutional_score),
            insider: n(conv.insider_score), technical: n(conv.technical_score),
          },
          confidence_10: Math.round(composite / 10),
        }
      : null,

    valuation: val
      ? {
          fwd_pe: n(val.fwd_pe), ttm_pe: n(val.ttm_pe), peg: n(val.peg), ps: n(val.ps),
          ev_ebitda: n(val.ev_ebitda), fcf_yield: n(val.fcf_yield),
          hist_pe_percentile: n(val.hist_pe_pctile), peer_pe: n(val.peer_pe),
          bull_target: n(val.bull_target), base_target: n(val.base_target), bear_target: n(val.bear_target),
          scenario_probs: val.scenario_probs_json ?? null,
          prob_weighted_fv: n(val.prob_weighted_fv), verdict, confidence: "Medium",
        }
      : null,

    levels: lvl
      ? {
          trend: lvl.trend, rsi14: n(ind?.rsi14), macd: macdLabel(n(ind?.macd), n(ind?.macd_signal)),
          volume_vs_avg: null, support: lvl.support_json ?? [], resistance: lvl.resistance_json ?? [],
          breakout: n(lvl.breakout), breakdown: n(lvl.breakdown), atr14: atr,
          stop_suggested: n(lvl.stop_suggested), entry_zone: lvl.entry_zone_json ?? null,
          exit_zone: lvl.exit_zone_json ?? null, risk_reward: n(lvl.risk_reward),
          key_level: n(lvl.key_level), confidence: "Medium",
        }
      : null,

    expected_move: lvl?.expected_move_json?.move_1w
      ? {
          one_week: n(lvl.expected_move_json.move_1w?.pct), one_month: null, three_month: null,
          method: "atr_proxy", confidence: "Low",
        }
      : null,

    earnings: {
      date: nextEarnings, consensus_eps: est[0] ? n(est[0].eps_estimate) : null,
      consensus_rev: est[0] ? n(est[0].revenue_estimate) : null, guidance: null,
      beat_miss_history: null, estimate_revision_trend: revisionTrend,
      p_beat: null, p_meet: null, p_miss: null,
      p_guide_raise: null, p_guide_maintain: null, p_guide_lower: null,
      earnings_risk: earningsRisk, confidence: "Medium",
    },

    options: null, // no options feed in this build → renders UNAVAILABLE

    ownership: {
      institutional_signal: instNet == null ? null : instNet > 0 ? "Bullish" : instNet < 0 ? "Bearish" : "Neutral",
      inst_lag_days: 45, insider_net_90d: n(insider?.net), short_interest: null,
      days_to_cover: null, confidence: "Medium",
    },

    probability: {
      horizon_3m: null, horizon_12m: null, expected_12m_return: null, method: "heuristic",
    },

    position_sizing: sizing,
    risk_flags: riskFlags,
    citations: [] as { id: string; title: string; filed: string }[],
  };

  return { ticker, company: stock?.name ?? null, asof: inputs.asof, inputs };
}
