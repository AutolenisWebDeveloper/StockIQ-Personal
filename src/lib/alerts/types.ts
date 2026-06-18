// Client-safe alert metadata (no DB imports) — shared by the evaluator and UI.
export type AlertType =
  | "price_above"
  | "price_below"
  | "conviction_band"
  | "opportunity"
  | "earnings_near"
  | "thesis_break";

export const ALERT_TYPES: { type: AlertType; label: string; needsLevel?: boolean; needsDays?: boolean }[] = [
  { type: "price_above", label: "Price rises above" , needsLevel: true },
  { type: "price_below", label: "Price falls below", needsLevel: true },
  { type: "conviction_band", label: "Conviction band changes" },
  { type: "opportunity", label: "New opportunity signal" },
  { type: "earnings_near", label: "Earnings within N days", needsDays: true },
  { type: "thesis_break", label: "Thesis invalidated" },
];
