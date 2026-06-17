import postgres from "postgres";

// OPT-IN DEMO SEED (not real data). Populates the dashboard with the mockup's
// sample tickers/scores so the UI can be previewed end-to-end without a live
// ingestion + compute run. Idempotent. Run: `npm run seed:demo`.
// Do NOT run against a database that holds real ingested data.

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const today = new Date();
const ts0 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
}

interface Demo {
  ticker: string; name: string; sector: string; price: number; drift: number;
  conviction: number; band: string; verdict: "under" | "fair" | "over"; trend: string;
  atrPct: number; emPct: number; earningsInDays?: number;
}
const DEMO: Demo[] = [
  { ticker: "MELI", name: "MercadoLibre", sector: "Consumer Discretionary", price: 2125.34, drift: 0.004, conviction: 92, band: "Very Bullish", verdict: "under", trend: "uptrend", atrPct: 0.03, emPct: 4.2 },
  { ticker: "NVDA", name: "NVIDIA", sector: "Technology", price: 135.64, drift: 0.005, conviction: 89, band: "Very Bullish", verdict: "fair", trend: "uptrend", atrPct: 0.035, emPct: 6.2, earningsInDays: 14 },
  { ticker: "META", name: "Meta Platforms", sector: "Communication Services", price: 493.42, drift: 0.003, conviction: 87, band: "Very Bullish", verdict: "fair", trend: "uptrend", atrPct: 0.025, emPct: 3.8 },
  { ticker: "AMZN", name: "Amazon", sector: "Consumer Discretionary", price: 187.22, drift: 0.002, conviction: 85, band: "Very Bullish", verdict: "fair", trend: "uptrend", atrPct: 0.028, emPct: 4.1, earningsInDays: 20 },
  { ticker: "TSLA", name: "Tesla", sector: "Consumer Discretionary", price: 178.65, drift: -0.001, conviction: 58, band: "Neutral", verdict: "over", trend: "sideways", atrPct: 0.05, emPct: 7.6, earningsInDays: 27 },
  { ticker: "XYZ", name: "XYZ Corp", sector: "Technology", price: 28.46, drift: -0.004, conviction: 34, band: "Bearish", verdict: "over", trend: "downtrend", atrPct: 0.06, emPct: 8.0 },
  { ticker: "ABC", name: "ABC Inc", sector: "Industrials", price: 42.13, drift: -0.003, conviction: 37, band: "Bearish", verdict: "over", trend: "downtrend", atrPct: 0.045, emPct: 5.0 },
  { ticker: "MU", name: "Micron", sector: "Technology", price: 96.4, drift: 0.001, conviction: 64, band: "Bullish", verdict: "under", trend: "uptrend", atrPct: 0.04, emPct: 8.4, earningsInDays: 1 },
];

function series(end: number, drift: number, n = 30): number[] {
  const out: number[] = [];
  let p = end / (1 + drift) ** n;
  for (let i = 0; i < n; i++) {
    p = p * (1 + drift + Math.sin(i / 3) * 0.004);
    out.push(Number(p.toFixed(2)));
  }
  out[out.length - 1] = end;
  return out;
}

async function main() {
  await sql`INSERT INTO watchlists (name) SELECT 'Demo' WHERE NOT EXISTS (SELECT 1 FROM watchlists)`;
  const [wl] = await sql`SELECT id FROM watchlists ORDER BY id LIMIT 1`;

  for (const d of DEMO) {
    await sql`INSERT INTO stocks (ticker, name, sector, next_earnings_date)
      VALUES (${d.ticker}, ${d.name}, ${d.sector}, ${d.earningsInDays != null ? daysFromNow(d.earningsInDays) : null})
      ON CONFLICT (ticker) DO UPDATE SET name = EXCLUDED.name, sector = EXCLUDED.sector, next_earnings_date = EXCLUDED.next_earnings_date`;
    await sql`INSERT INTO watchlist_items (watchlist_id, ticker) VALUES (${wl.id}, ${d.ticker}) ON CONFLICT DO NOTHING`;

    // price series
    const closes = series(d.price, d.drift);
    const rows = closes.map((c, i) => {
      const ts = new Date(ts0.getTime() - (closes.length - 1 - i) * 86400_000).toISOString();
      return { ticker: d.ticker, ts, open: c, high: c * 1.01, low: c * 0.99, close: c, adj_close: c, volume: 1_000_000 };
    });
    await sql`INSERT INTO stock_prices ${sql(rows, "ticker", "ts", "open", "high", "low", "close", "adj_close", "volume")}
      ON CONFLICT (ticker, ts) DO UPDATE SET close = EXCLUDED.close, adj_close = EXCLUDED.adj_close`;

    await sql`INSERT INTO conviction_scores (ticker, ts, composite, band, weights_json, cohort_used)
      VALUES (${d.ticker}, ${ts0.toISOString()}, ${d.conviction}, ${d.band}, ${"{}"}, ${d.sector})
      ON CONFLICT (ticker, ts) DO UPDATE SET composite = EXCLUDED.composite, band = EXCLUDED.band`;

    await sql`INSERT INTO technical_levels (ticker, ts, trend, atr14, method, expected_move_json)
      VALUES (${d.ticker}, ${ts0.toISOString()}, ${d.trend}, ${d.price * d.atrPct}, ${"demo"},
              ${JSON.stringify({ move_1w: { pct: d.emPct } })})
      ON CONFLICT (ticker, ts) DO UPDATE SET trend = EXCLUDED.trend, atr14 = EXCLUDED.atr14, expected_move_json = EXCLUDED.expected_move_json`;

    await sql`INSERT INTO valuations (ticker, ts, verdict, method) VALUES (${d.ticker}, ${ts0.toISOString()}, ${d.verdict}, ${"demo"})
      ON CONFLICT (ticker, ts) DO UPDATE SET verdict = EXCLUDED.verdict`;
  }

  // a couple of opportunity signals
  await sql`INSERT INTO opportunity_signals (ticker, type, polarity, strength, detected_at, source, evidence_json)
    VALUES ('NVDA','price_breakout','positive',18,${ts0.toISOString()},'demo',${JSON.stringify({ demo: true })})
    ON CONFLICT (ticker, type, detected_at) DO NOTHING`;
  await sql`INSERT INTO opportunity_signals (ticker, type, polarity, strength, detected_at, source, evidence_json)
    VALUES ('TSLA','insider_cluster_buy','positive',2,${ts0.toISOString()},'demo',${JSON.stringify({ demo: true })})
    ON CONFLICT (ticker, type, detected_at) DO NOTHING`;

  // filings
  for (const f of [
    { t: "META", form: "10-Q", accn: "demo-meta-10q" },
    { t: "MELI", form: "8-K", accn: "demo-meli-8k" },
    { t: "NVDA", form: "4", accn: "demo-nvda-4" },
    { t: "AMZN", form: "8-K", accn: "demo-amzn-8k" },
  ]) {
    await sql`INSERT INTO sec_filings (ticker, form_type, filed_at, accession_no, url, processed)
      VALUES (${f.t}, ${f.form}, ${new Date().toISOString()}, ${f.accn}, ${"https://www.sec.gov/"}, false)
      ON CONFLICT (accession_no) DO NOTHING`;
  }

  // insiders
  for (const i of [
    { t: "ABC", name: "Jane Roe", role: "CEO", type: "buy", value: 2_300_000, d: 1 },
    { t: "XYZ", name: "John Doe", role: "CFO", type: "buy", value: 1_120_000, d: 1 },
    { t: "MU", name: "A. Director", role: "Director", type: "buy", value: 680_000, d: 4 },
  ]) {
    await sql`INSERT INTO insider_transactions (ticker, insider_name, role, txn_type, value, txn_date)
      VALUES (${i.t}, ${i.name}, ${i.role}, ${i.type}, ${i.value}, ${daysFromNow(-i.d)})
      ON CONFLICT (ticker, insider_name, txn_date, txn_type, shares, price) DO NOTHING`;
  }

  // institutions
  for (const h of [
    { t: "MELI", pct: 4.21 }, { t: "NVDA", pct: 2.18 }, { t: "AMZN", pct: 1.35 }, { t: "TSLA", pct: -1.02 },
  ]) {
    await sql`INSERT INTO institutional_holdings (ticker, holder_name, change_pct, report_period)
      VALUES (${h.t}, ${"Top Institutions"}, ${h.pct}, ${daysFromNow(-45)})
      ON CONFLICT (ticker, holder_name, report_period) DO UPDATE SET change_pct = EXCLUDED.change_pct`;
  }

  await sql`INSERT INTO macro_series (series_id, ts, value) VALUES ('DGS10', ${daysFromNow(0)}, 4.22)
    ON CONFLICT (series_id, ts) DO UPDATE SET value = EXCLUDED.value`;

  console.log("demo seed complete — open the dashboard");
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
