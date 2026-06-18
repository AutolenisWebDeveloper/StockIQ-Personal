import { sql } from "../db";

// Deterministic portfolio math: per-holding market value, unrealized P/L, weight,
// and portfolio totals + concentration. Current price from stock_prices.

export interface Holding {
  id: number;
  ticker: string;
  shares: number;
  costBasis: number | null;
  openedAt: string | null;
  price: number | null;
  marketValue: number | null;
  cost: number | null;
  plDollar: number | null;
  plPct: number | null;
  weightPct: number | null;
}

export interface PortfolioView {
  id: number | null;
  name: string;
  holdings: Holding[];
  totalValue: number;
  totalCost: number;
  totalPlDollar: number;
  totalPlPct: number | null;
  concentrationPct: number | null; // largest single-name weight
}

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

export async function getPortfolio(): Promise<PortfolioView> {
  const [pf] = await sql<{ id: number; name: string }[]>`SELECT id, name FROM portfolios ORDER BY id LIMIT 1`;
  if (!pf) return { id: null, name: "Portfolio", holdings: [], totalValue: 0, totalCost: 0, totalPlDollar: 0, totalPlPct: null, concentrationPct: null };

  const rows = await sql<{ id: number; ticker: string; shares: string | null; cost_basis: string | null; opened_at: string | null }[]>`
    SELECT id, ticker, shares, cost_basis, opened_at FROM portfolio_holdings
    WHERE portfolio_id = ${pf.id} ORDER BY ticker`;

  const tickers = rows.map((r) => r.ticker);
  const priceRows = tickers.length
    ? await sql<{ ticker: string; adj_close: string }[]>`
        SELECT DISTINCT ON (ticker) ticker, adj_close FROM stock_prices
        WHERE ticker = ANY(${tickers}) ORDER BY ticker, ts DESC`
    : [];
  const priceByT = new Map(priceRows.map((r) => [r.ticker, Number(r.adj_close)]));

  let totalValue = 0;
  let totalCost = 0;
  const holdings: Holding[] = rows.map((r) => {
    const shares = n(r.shares) ?? 0;
    const costBasis = n(r.cost_basis);
    const price = priceByT.get(r.ticker) ?? null;
    const marketValue = price != null ? price * shares : null;
    const cost = costBasis != null ? costBasis * shares : null;
    const plDollar = marketValue != null && cost != null ? marketValue - cost : null;
    const plPct = plDollar != null && cost ? (plDollar / cost) * 100 : null;
    if (marketValue != null) totalValue += marketValue;
    if (cost != null) totalCost += cost;
    return { id: r.id, ticker: r.ticker, shares, costBasis, openedAt: r.opened_at, price, marketValue, cost, plDollar, plPct, weightPct: null };
  });

  let concentrationPct: number | null = null;
  for (const h of holdings) {
    h.weightPct = h.marketValue != null && totalValue > 0 ? (h.marketValue / totalValue) * 100 : null;
    if (h.weightPct != null) concentrationPct = Math.max(concentrationPct ?? 0, h.weightPct);
  }

  const totalPlDollar = totalValue - totalCost;
  return {
    id: pf.id,
    name: pf.name,
    holdings,
    totalValue,
    totalCost,
    totalPlDollar,
    totalPlPct: totalCost > 0 ? (totalPlDollar / totalCost) * 100 : null,
    concentrationPct,
  };
}
