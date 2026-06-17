// Sector → sector-ETF map, keyed off stocks.sector. Used by rel_strength
// (ticker return vs sector ETF + SPY). Benchmark for the whole tape is SPY.

export const SECTOR_ETF: Record<string, string> = {
  "Technology": "XLK",
  "Information Technology": "XLK",
  "Financials": "XLF",
  "Financial Services": "XLF",
  "Health Care": "XLV",
  "Healthcare": "XLV",
  "Energy": "XLE",
  "Consumer Discretionary": "XLY",
  "Consumer Cyclical": "XLY",
  "Consumer Staples": "XLP",
  "Consumer Defensive": "XLP",
  "Industrials": "XLI",
  "Materials": "XLB",
  "Basic Materials": "XLB",
  "Utilities": "XLU",
  "Real Estate": "XLRE",
  "Communication Services": "XLC",
};

export const MARKET_ETF = "SPY";

export function sectorEtf(sector: string | null | undefined): string | null {
  if (!sector) return null;
  return SECTOR_ETF[sector] ?? null;
}
