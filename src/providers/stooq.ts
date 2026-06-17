import type { MarketDataProvider, OHLCV, Quote } from "./types";
import { fetchText } from "../lib/http";

// Stooq daily OHLCV via its CSV endpoint. US symbols are suffixed `.us`.
// Columns: Date,Open,High,Low,Close,Volume. Stooq does not provide an adjusted
// close; `adjClose` is seeded equal to `close` and corrected by the
// corporate-actions module after split/dividend detection.

function stooqSymbol(ticker: string): string {
  return `${ticker.toLowerCase()}.us`;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function parseCsv(csv: string): OHLCV[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const out: OHLCV[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, open, high, low, close, volume] = lines[i].split(",");
    if (!date || date === "N/D") continue;
    const c = Number(close);
    if (!Number.isFinite(c)) continue;
    out.push({
      ts: new Date(`${date}T00:00:00Z`),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: c,
      adjClose: c, // raw; corporate-actions adjusts later
      volume: Number(volume) || 0,
    });
  }
  return out;
}

export class StooqProvider implements MarketDataProvider {
  name = "stooq";

  async getDailyOHLCV(ticker: string, from: Date, to: Date): Promise<OHLCV[]> {
    const url = `https://stooq.com/q/d/l/?s=${stooqSymbol(ticker)}&d1=${fmt(from)}&d2=${fmt(to)}&i=d`;
    const csv = await fetchText(url, { provider: "stooq" });
    if (!csv) return [];
    return parseCsv(csv);
  }

  async getQuote(ticker: string): Promise<Quote> {
    // Stooq light quote CSV: symbol,date,time,open,high,low,close,volume
    const url = `https://stooq.com/q/l/?s=${stooqSymbol(ticker)}&f=sd2t2ohlcv&h&e=csv`;
    const csv = await fetchText(url, { provider: "stooq" });
    const lines = (csv ?? "").trim().split(/\r?\n/);
    const cols = lines[1]?.split(",") ?? [];
    const close = Number(cols[6]);
    if (!Number.isFinite(close)) throw new Error(`stooq.getQuote: no data for ${ticker}`);
    return { ticker: ticker.toUpperCase(), price: close, asOf: new Date(), source: this.name };
  }
}
