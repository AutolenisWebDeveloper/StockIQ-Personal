import { sql } from "../db";
import {
  compositeToAction,
  riskFrom,
  opportunityFrom,
  thesisTone,
  type ActionLabel,
  type RiskScore,
  type ThesisView,
} from "./scoring";

// Dashboard data layer. Every panel that maps to Phase 1–2 outputs is wired to
// real queries here; AI panels (Phase 3) are handled in the components as
// labelled placeholders. All queries are defensive — an empty DB yields empty
// arrays and the UI renders its empty states.

export interface TickerRow {
  ticker: string;
  name: string | null;
  price: number | null;
  changePct: number | null;
  spark: number[];
  conviction: number | null;
  band: string | null;
  action: ActionLabel;
  opportunity: number;
  risk: RiskScore;
  thesis: ThesisView;
  nextEarnings: string | null;
  expectedMovePct: number | null;
}

export interface FilingRow { ticker: string; formType: string; filedAt: string | null; url: string | null; }
export interface InsiderRow { ticker: string; name: string | null; role: string | null; type: string | null; value: number | null; date: string | null; }
export interface InstitutionRow { ticker: string; holder: string | null; changePct: number | null; period: string | null; }
export interface PulseRow { label: string; value: number | null; changePct: number | null; }

export interface DashboardData {
  rows: TickerRow[];
  topBuys: TickerRow[];
  topSells: TickerRow[];
  filings: FilingRow[];
  insiders: InsiderRow[];
  institutions: InstitutionRow[];
  earnings: TickerRow[];
  pulse: PulseRow[];
  brief: {
    highestConviction: TickerRow | null;
    highestRisk: TickerRow | null;
    topEarnings: TickerRow | null;
    newFiling: FilingRow | null;
  };
  hasData: boolean;
}

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export async function getDashboardData(): Promise<DashboardData> {
  const stocks = await sql<{ ticker: string; name: string | null; next_earnings_date: string | null }[]>`
    SELECT s.ticker, s.name, s.next_earnings_date
    FROM stocks s JOIN watchlist_items wi ON wi.ticker = s.ticker
    GROUP BY s.ticker, s.name, s.next_earnings_date
    ORDER BY s.ticker`;
  const tickers = stocks.map((s) => s.ticker);

  const empty: DashboardData = {
    rows: [], topBuys: [], topSells: [], filings: [], insiders: [], institutions: [],
    earnings: [], pulse: await marketPulse(), brief: { highestConviction: null, highestRisk: null, topEarnings: null, newFiling: null }, hasData: false,
  };
  if (!tickers.length) return empty;

  const [priceRows, conv, tech, val, opps, thesis, filings, insiders, institutions, pulse] = await Promise.all([
    sql<{ ticker: string; ts: string; adj_close: string }[]>`
      SELECT ticker, ts, adj_close FROM stock_prices
      WHERE ticker = ANY(${tickers}) AND ts > now() - interval '90 days' ORDER BY ticker, ts`,
    sql<{ ticker: string; composite: string | null; band: string | null }[]>`
      SELECT DISTINCT ON (ticker) ticker, composite, band FROM conviction_scores
      WHERE ticker = ANY(${tickers}) ORDER BY ticker, ts DESC`,
    sql<{ ticker: string; atr14: string | null; trend: string | null; expected_move_json: any }[]>`
      SELECT DISTINCT ON (ticker) ticker, atr14, trend, expected_move_json FROM technical_levels
      WHERE ticker = ANY(${tickers}) ORDER BY ticker, ts DESC`,
    sql<{ ticker: string; verdict: string | null }[]>`
      SELECT DISTINCT ON (ticker) ticker, verdict FROM valuations
      WHERE ticker = ANY(${tickers}) ORDER BY ticker, ts DESC`,
    sql<{ ticker: string; polarity: string; strength: string | null }[]>`
      SELECT ticker, polarity, strength FROM opportunity_signals
      WHERE ticker = ANY(${tickers}) AND detected_at > now() - interval '30 days'`,
    sql<{ ticker: string; status: string | null }[]>`
      SELECT DISTINCT ON (ticker) ticker, status FROM thesis_tracker
      WHERE ticker = ANY(${tickers}) ORDER BY ticker, last_reviewed DESC NULLS LAST`,
    sql<{ ticker: string; form_type: string | null; filed_at: string | null; url: string | null }[]>`
      SELECT ticker, form_type, filed_at, url FROM sec_filings
      WHERE ticker = ANY(${tickers}) ORDER BY filed_at DESC NULLS LAST LIMIT 6`,
    sql<{ ticker: string; insider_name: string | null; role: string | null; txn_type: string | null; value: string | null; txn_date: string | null }[]>`
      SELECT ticker, insider_name, role, txn_type, value, txn_date FROM insider_transactions
      WHERE ticker = ANY(${tickers}) ORDER BY txn_date DESC NULLS LAST LIMIT 6`,
    sql<{ ticker: string; holder_name: string | null; change_pct: string | null; report_period: string | null }[]>`
      SELECT ticker, holder_name, change_pct, report_period FROM institutional_holdings
      WHERE ticker = ANY(${tickers}) ORDER BY report_period DESC NULLS LAST LIMIT 6`,
    marketPulse(),
  ]);

  // group prices per ticker
  const priceByTicker = new Map<string, { ts: string; c: number }[]>();
  for (const r of priceRows) {
    const arr = priceByTicker.get(r.ticker) ?? [];
    arr.push({ ts: r.ts, c: Number(r.adj_close) });
    priceByTicker.set(r.ticker, arr);
  }
  const convByT = new Map(conv.map((r) => [r.ticker, r]));
  const techByT = new Map(tech.map((r) => [r.ticker, r]));
  const valByT = new Map(val.map((r) => [r.ticker, r]));
  const oppByT = new Map<string, { polarity: string; strength: number | null }[]>();
  for (const o of opps) {
    const arr = oppByT.get(o.ticker) ?? [];
    arr.push({ polarity: o.polarity, strength: n(o.strength) });
    oppByT.set(o.ticker, arr);
  }
  const thesisByT = new Map(thesis.map((r) => [r.ticker, r]));

  const rows: TickerRow[] = stocks.map((s) => {
    const prices = priceByTicker.get(s.ticker) ?? [];
    const closes = prices.map((p) => p.c);
    const price = closes.at(-1) ?? null;
    const prev = closes.at(-2) ?? null;
    const changePct = price != null && prev != null && prev !== 0 ? ((price - prev) / prev) * 100 : null;
    const c = convByT.get(s.ticker);
    const t = techByT.get(s.ticker);
    const v = valByT.get(s.ticker);
    const composite = n(c?.composite);
    const atr = n(t?.atr14);
    const atrPct = atr != null && price != null && price !== 0 ? atr / price : null;
    const em = t?.expected_move_json;
    return {
      ticker: s.ticker,
      name: s.name,
      price,
      changePct,
      spark: closes.slice(-30),
      conviction: composite,
      band: c?.band ?? null,
      action: compositeToAction(composite, c?.band ?? null),
      opportunity: opportunityFrom(oppByT.get(s.ticker) ?? []),
      risk: riskFrom({ atrPct, trend: t?.trend ?? null, verdict: v?.verdict ?? null }),
      thesis: thesisTone(thesisByT.get(s.ticker)?.status ?? null),
      nextEarnings: s.next_earnings_date,
      expectedMovePct: n(em?.move_1w?.pct),
    };
  });

  const byConvDesc = [...rows].sort((a, b) => (b.conviction ?? -1) - (a.conviction ?? -1));
  const topBuys = byConvDesc.filter((r) => r.action.tone === "buy").slice(0, 3);
  const topSells = [...rows].sort((a, b) => (a.conviction ?? 101) - (b.conviction ?? 101)).filter((r) => r.action.tone === "sell").slice(0, 3);
  const earnings = rows.filter((r) => r.nextEarnings).sort((a, b) => (a.nextEarnings! < b.nextEarnings! ? -1 : 1)).slice(0, 5);

  const filingRows: FilingRow[] = filings.map((f) => ({ ticker: f.ticker, formType: f.form_type ?? "—", filedAt: f.filed_at, url: f.url }));
  const highestRisk = [...rows].sort((a, b) => b.risk.score - a.risk.score)[0] ?? null;

  return {
    rows: byConvDesc,
    topBuys,
    topSells,
    filings: filingRows,
    insiders: insiders.map((i) => ({ ticker: i.ticker, name: i.insider_name, role: i.role, type: i.txn_type, value: n(i.value), date: i.txn_date })),
    institutions: institutions.map((i) => ({ ticker: i.ticker, holder: i.holder_name, changePct: n(i.change_pct), period: i.report_period })),
    earnings,
    pulse,
    brief: {
      highestConviction: topBuys[0] ?? byConvDesc[0] ?? null,
      highestRisk,
      topEarnings: earnings[0] ?? null,
      newFiling: filingRows[0] ?? null,
    },
    hasData: true,
  };
}

async function marketPulse(): Promise<PulseRow[]> {
  // indices from stock_prices (if those tickers were ingested) + 10Y from FRED.
  const idx = await sql<{ ticker: string; adj_close: string; ts: string }[]>`
    SELECT ticker, adj_close, ts FROM stock_prices
    WHERE ticker = ANY(${["SPY", "QQQ", "DIA"]}) ORDER BY ticker, ts DESC`;
  const latest = new Map<string, number[]>();
  for (const r of idx) {
    const arr = latest.get(r.ticker) ?? [];
    if (arr.length < 2) arr.push(Number(r.adj_close));
    latest.set(r.ticker, arr);
  }
  const out: PulseRow[] = ["SPY", "QQQ", "DIA"].map((t) => {
    const a = latest.get(t);
    const value = a?.[0] ?? null;
    const prev = a?.[1] ?? null;
    return { label: t, value, changePct: value != null && prev != null && prev !== 0 ? ((value - prev) / prev) * 100 : null };
  });
  const [tenY] = await sql<{ value: string | null }[]>`
    SELECT value FROM macro_series WHERE series_id = 'DGS10' ORDER BY ts DESC LIMIT 1`;
  out.push({ label: "10Y Yield", value: n(tenY?.value), changePct: null });
  return out;
}

export const EMPTY_DASHBOARD: DashboardData = {
  rows: [], topBuys: [], topSells: [], filings: [], insiders: [], institutions: [],
  earnings: [], pulse: [],
  brief: { highestConviction: null, highestRisk: null, topEarnings: null, newFiling: null },
  hasData: false,
};

// Convenience wrapper so pages don't each repeat the try/catch + EMPTY fallback.
export async function getDashboardSafe(): Promise<DashboardData> {
  try {
    return await getDashboardData();
  } catch {
    return EMPTY_DASHBOARD;
  }
}
