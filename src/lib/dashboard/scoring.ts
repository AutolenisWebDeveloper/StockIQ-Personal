// Deterministic UI derivations from Phase 1–2 data. No fabrication: these are
// transparent mappings/blends of stored values, used only for presentation.

export type Tone = "buy" | "hold" | "sell";

export interface ActionLabel {
  action: string;
  tone: Tone;
}

/** Map a conviction composite (0–100) + band to a buy/hold/sell action label. */
export function compositeToAction(composite: number | null, band: string | null): ActionLabel {
  if (composite == null) return { action: "—", tone: "hold" };
  if (composite >= 80) return { action: "STRONG BUY", tone: "buy" };
  if (composite >= 60) return { action: "BUY", tone: "buy" };
  if (composite >= 40) return { action: "HOLD", tone: "hold" };
  if (composite >= 30) return { action: "REDUCE", tone: "sell" };
  return { action: "SELL", tone: "sell" };
}

export interface RiskScore {
  score: number; // 0–100 (higher = riskier)
  label: "Low" | "Medium" | "High";
}

/**
 * Risk = blend of realized volatility (ATR % of price), trend, and valuation
 * verdict. All inputs are deterministic engine outputs.
 */
export function riskFrom(opts: {
  atrPct: number | null; // atr14 / price
  trend: string | null;
  verdict: string | null; // valuation: under/fair/over
}): RiskScore {
  let score = 40;
  if (opts.atrPct != null) score = Math.min(100, opts.atrPct * 1200); // ~3% ATR → ~36; 8% → 96
  if (opts.trend === "downtrend") score += 15;
  else if (opts.trend === "uptrend") score -= 8;
  if (opts.verdict === "over") score += 12;
  else if (opts.verdict === "under") score -= 6;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 66 ? "High" : score >= 40 ? "Medium" : "Low";
  return { score, label };
}

/**
 * Opportunity (0–100) from recent opportunity_signals: 50 baseline, shifted by
 * net signed strength of the last 30 days (capped).
 */
export function opportunityFrom(signals: { polarity: string; strength: number | null }[]): number {
  let net = 0;
  for (const s of signals) {
    const mag = Math.min(20, Number(s.strength ?? 0));
    net += (s.polarity === "positive" ? 1 : -1) * mag;
  }
  return Math.max(0, Math.min(100, Math.round(50 + net)));
}

export interface ThesisView {
  status: string;
  tone: Tone;
}

export function thesisTone(status: string | null): ThesisView {
  switch (status) {
    case "validated":
      return { status: "Confirmed", tone: "buy" };
    case "active":
      return { status: "Intact", tone: "buy" };
    case "invalidated":
      return { status: "Broken", tone: "sell" };
    case "exited":
      return { status: "Exited", tone: "hold" };
    default:
      return { status: "—", tone: "hold" };
  }
}
