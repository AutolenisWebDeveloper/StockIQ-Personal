// Position-sizing calculator (deterministic — §6 of the decision-report spec).
// The LLM never picks the size; it only explains this output.

export interface SizingInput {
  band: string | null; // conviction band
  entry: number | null;
  stop: number | null;
  earningsRisk: string | null; // Low | Medium | High
  daysToEarnings: number | null;
}

export interface Sizing {
  suggested_pct: number;
  suggested_usd_per_100k: number;
  cash_pct: number;
  timing: "buy_now" | "scale_in" | "wait_pullback" | "wait_post_earnings" | "none";
  portfolio_risk_pct: number | null;
}

const BASE_BY_BAND: Record<string, number> = {
  "Very Bullish": 15,
  Bullish: 8,
  Neutral: 0,
  Bearish: 0,
};

const RISK_BUDGET_PCT = 2; // long-term core R% (fixed-fractional)
const CONCENTRATION_CAP_PCT = 20;

function round(n: number, dp = 1): number {
  return Math.round(n * 10 ** dp) / 10 ** dp;
}

export function computeSizing(i: SizingInput): Sizing {
  const base = BASE_BY_BAND[i.band ?? ""] ?? 0;

  // fixed-fractional risk cap: size so position% × (entry−stop)/entry ≤ R%
  let pct = base;
  if (i.entry != null && i.stop != null && i.entry > 0 && i.entry > i.stop) {
    const perUnitRisk = (i.entry - i.stop) / i.entry; // fraction
    if (perUnitRisk > 0) pct = Math.min(base, RISK_BUDGET_PCT / perUnitRisk);
  }

  let timing: Sizing["timing"] = pct > 0 ? "buy_now" : "none";

  // earnings overlay: high risk within 10 days → halve + wait
  if (i.earningsRisk === "High" && i.daysToEarnings != null && i.daysToEarnings <= 10 && pct > 0) {
    pct = pct / 2;
    timing = "wait_post_earnings";
  }

  pct = Math.min(pct, CONCENTRATION_CAP_PCT);

  const portfolio_risk_pct =
    i.entry != null && i.stop != null && i.entry > 0 && i.entry > i.stop
      ? (pct * (i.entry - i.stop)) / i.entry
      : null;

  return {
    suggested_pct: round(pct),
    suggested_usd_per_100k: round(pct * 1000, 0),
    cash_pct: round(100 - pct),
    timing,
    portfolio_risk_pct: portfolio_risk_pct == null ? null : round(portfolio_risk_pct, 2),
  };
}
