import { sql } from "../db";

// Engine 2 — Opportunity (a screener feed, NOT a recommendation). Change/momentum
// detectors over the time series. Each fire is append-only + idempotent on
// (ticker, type, detected_at::day) with structured evidence_json.

const CONVICTION_DELTA_THRESHOLD = 10;
const VOLUME_SPIKE_X = 2;

interface Signal {
  type: string;
  polarity: "positive" | "negative";
  strength: number;
  source: string;
  evidence: Record<string, unknown>;
}

async function detect(ticker: string): Promise<Signal[]> {
  const out: Signal[] = [];

  // 1) conviction Δ over the last two compute-days
  const conv = await sql<{ composite: string | null; ts: string }[]>`
    SELECT composite, ts FROM conviction_scores WHERE ticker = ${ticker} AND composite IS NOT NULL
    ORDER BY ts DESC LIMIT 2`;
  if (conv.length === 2) {
    const d = Number(conv[0].composite) - Number(conv[1].composite);
    if (Math.abs(d) >= CONVICTION_DELTA_THRESHOLD) {
      out.push({
        type: "conviction_delta",
        polarity: d > 0 ? "positive" : "negative",
        strength: Math.abs(d),
        source: "conviction_scores",
        evidence: { from: Number(conv[1].composite), to: Number(conv[0].composite), delta: d },
      });
    }
  }

  // 2) price breakout / breakdown vs 52-week extremes
  const bars = await sql<{ adj_close: string }[]>`
    SELECT adj_close FROM stock_prices WHERE ticker = ${ticker} ORDER BY ts DESC LIMIT 252`;
  if (bars.length >= 20) {
    const closes = bars.map((b) => Number(b.adj_close));
    const price = closes[0];
    const hi = Math.max(...closes);
    const lo = Math.min(...closes);
    if (price >= 0.99 * hi) {
      out.push({
        type: "price_breakout",
        polarity: "positive",
        strength: ((price - lo) / lo) * 100,
        source: "stock_prices",
        evidence: { price, hi52: hi, pct_of_high: price / hi },
      });
    } else if (price <= 1.01 * lo) {
      out.push({
        type: "price_breakdown",
        polarity: "negative",
        strength: ((hi - price) / hi) * 100,
        source: "stock_prices",
        evidence: { price, lo52: lo, pct_above_low: price / lo },
      });
    }
  }

  // 3) volume spike vs 20-day average
  const vol = await sql<{ volume: string | null; adj_close: string }[]>`
    SELECT volume, adj_close FROM stock_prices WHERE ticker = ${ticker} ORDER BY ts DESC LIMIT 21`;
  if (vol.length === 21 && vol[0].volume != null) {
    const today = Number(vol[0].volume);
    const avg = vol.slice(1).reduce((s, r) => s + Number(r.volume ?? 0), 0) / 20;
    if (avg > 0 && today >= VOLUME_SPIKE_X * avg) {
      const up = Number(vol[0].adj_close) >= Number(vol[1].adj_close);
      out.push({
        type: "volume_spike",
        polarity: up ? "positive" : "negative",
        strength: today / avg,
        source: "stock_prices",
        evidence: { volume: today, avg20: Math.round(avg), ratio: today / avg },
      });
    }
  }

  // 4) insider cluster buy (≥2 distinct insiders buying in 14 days)
  const cluster = await sql<{ buyers: string; total: string | null }[]>`
    SELECT COUNT(DISTINCT insider_name) AS buyers, SUM(COALESCE(value, shares * price)) AS total
    FROM insider_transactions
    WHERE ticker = ${ticker} AND txn_type = 'buy' AND txn_date > now() - interval '14 days'`;
  if (cluster[0] && Number(cluster[0].buyers) >= 2) {
    out.push({
      type: "insider_cluster_buy",
      polarity: "positive",
      strength: Number(cluster[0].buyers),
      source: "insider_transactions (Form 4)",
      evidence: { distinct_buyers: Number(cluster[0].buyers), total_value: Number(cluster[0].total ?? 0) },
    });
  }

  // 5) consensus upgrade/downgrade (snapshot self-diff)
  const ratings = await sql<{ consensus_rating: string | null }[]>`
    SELECT consensus_rating FROM analyst_consensus_snapshots WHERE ticker = ${ticker} AND consensus_rating IS NOT NULL
    ORDER BY ts DESC LIMIT 2`;
  if (ratings.length === 2 && ratings[0].consensus_rating !== ratings[1].consensus_rating) {
    const order = ["strong_sell", "sell", "underperform", "hold", "neutral", "outperform", "buy", "strong_buy"];
    const idx = (r: string | null) => order.indexOf((r ?? "").toLowerCase().replace(/\s+/g, "_"));
    const up = idx(ratings[0].consensus_rating) > idx(ratings[1].consensus_rating);
    out.push({
      type: "consensus_change",
      polarity: up ? "positive" : "negative",
      strength: Math.abs(idx(ratings[0].consensus_rating) - idx(ratings[1].consensus_rating)),
      source: "analyst_consensus_snapshots",
      evidence: { from: ratings[1].consensus_rating, to: ratings[0].consensus_rating },
    });
  }

  return out;
}

export async function computeOpportunity(ticker: string, ts: Date): Promise<number> {
  const signals = await detect(ticker);
  for (const s of signals) {
    await sql`
      INSERT INTO opportunity_signals (ticker, type, polarity, strength, detected_at, source, evidence_json)
      VALUES (${ticker}, ${s.type}, ${s.polarity}, ${Math.round(s.strength * 100) / 100},
              ${ts.toISOString()}, ${s.source}, ${JSON.stringify(s.evidence)})
      ON CONFLICT (ticker, type, detected_at) DO UPDATE SET
        polarity = EXCLUDED.polarity, strength = EXCLUDED.strength,
        source = EXCLUDED.source, evidence_json = EXCLUDED.evidence_json`;
  }
  return signals.length;
}
