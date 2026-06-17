import { sql } from "../db";

// Engine 4 — Technical Levels (deterministic, no options, no LLM).
// Support/resistance from swing pivots + MA confluence + classic pivots; trend
// from the MA stack + MACD; ATR-based expected move (1d / 1w / to-next-earnings).
// All math runs off ADJUSTED close so a split leaves no artificial gap.

interface PriceBar { ts: Date; high: number; low: number; close: number; }

function round(n: number | null, dp = 2): number | null {
  return n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp;
}

// local swing pivots: a bar that is the extreme within ±w neighbours
function swings(bars: PriceBar[], w = 5): { highs: number[]; lows: number[] } {
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = w; i < bars.length - w; i++) {
    const slice = bars.slice(i - w, i + w + 1);
    const h = bars[i].high;
    const l = bars[i].low;
    if (h === Math.max(...slice.map((b) => b.high))) highs.push(h);
    if (l === Math.min(...slice.map((b) => b.low))) lows.push(l);
  }
  return { highs, lows };
}

export interface LevelsResult {
  trend: string;
  atr14: number | null;
  expectedMove: Record<string, unknown>;
}

export async function computeLevels(ticker: string, ts: Date): Promise<LevelsResult> {
  const rows = await sql<{ ts: string; high: string; low: string; adj_close: string }[]>`
    SELECT ts, high, low, adj_close FROM stock_prices
    WHERE ticker = ${ticker} ORDER BY ts DESC LIMIT 252`;
  const bars: PriceBar[] = rows
    .map((r) => ({ ts: new Date(r.ts), high: Number(r.high), low: Number(r.low), close: Number(r.adj_close) }))
    .reverse();

  const [ind] = await sql<
    { ma50: string | null; ma200: string | null; macd: string | null; macd_signal: string | null; atr14: string | null }[]
  >`
    SELECT ma50, ma200, macd, macd_signal, atr14 FROM technical_indicators
    WHERE ticker = ${ticker} ORDER BY ts DESC LIMIT 1`;
  const [stk] = await sql<{ next_earnings_date: string | null }[]>`
    SELECT next_earnings_date FROM stocks WHERE ticker = ${ticker}`;

  const price = bars.at(-1)?.close ?? null;
  const atr14 = ind?.atr14 != null ? Number(ind.atr14) : null;
  const ma50 = ind?.ma50 != null ? Number(ind.ma50) : null;
  const ma200 = ind?.ma200 != null ? Number(ind.ma200) : null;
  const macd = ind?.macd != null ? Number(ind.macd) : null;
  const macdSig = ind?.macd_signal != null ? Number(ind.macd_signal) : null;

  // trend from MA stack + MACD
  let trend = "sideways";
  if (price != null && ma50 != null && ma200 != null) {
    const up = price > ma50 && ma50 > ma200 && (macd == null || macdSig == null || macd >= macdSig);
    const down = price < ma50 && ma50 < ma200 && (macd == null || macdSig == null || macd <= macdSig);
    trend = up ? "uptrend" : down ? "downtrend" : "sideways";
  }

  // support/resistance = swing pivots + MA confluence, split by side of price
  const { highs, lows } = swings(bars);
  const hi52 = bars.length ? Math.max(...bars.map((b) => b.high)) : null;
  const lo52 = bars.length ? Math.min(...bars.map((b) => b.low)) : null;
  const candidates = [...highs, ...lows, ma50, ma200, hi52, lo52].filter(
    (v): v is number => v != null && Number.isFinite(v)
  );
  const resistance = price != null ? [...new Set(candidates.filter((v) => v > price))].sort((a, b) => a - b) : [];
  const support = price != null ? [...new Set(candidates.filter((v) => v < price))].sort((a, b) => b - a) : [];

  // classic pivots off the last bar
  const last = bars.at(-1);
  let pivots: Record<string, number> | null = null;
  if (last) {
    const p = (last.high + last.low + last.close) / 3;
    pivots = {
      pivot: round(p)!,
      r1: round(2 * p - last.low)!,
      s1: round(2 * p - last.high)!,
      r2: round(p + (last.high - last.low))!,
      s2: round(p - (last.high - last.low))!,
    };
  }

  const breakout = resistance[0] ?? null; // nearest resistance above
  const breakdown = support[0] ?? null; // nearest support below
  const stopSuggested = price != null && atr14 != null ? price - 1.5 * atr14 : null;
  const riskReward =
    price != null && breakout != null && stopSuggested != null && price - stopSuggested > 0
      ? (breakout - price) / (price - stopSuggested)
      : null;

  // ATR-based expected move (NOT options-implied) over √horizon
  function move(days: number) {
    if (atr14 == null || price == null) return null;
    const abs = atr14 * Math.sqrt(days);
    return { abs: round(abs), pct: round((abs / price) * 100) };
  }
  let daysToEarnings: number | null = null;
  if (stk?.next_earnings_date) {
    const d = (new Date(stk.next_earnings_date).getTime() - ts.getTime()) / 86400_000;
    daysToEarnings = d > 0 ? Math.round((d * 5) / 7) : null; // ~business days
  }
  const earningsMove = daysToEarnings ? move(daysToEarnings) : null;
  const expectedMove = {
    method: "ATR(14) × √horizon (deterministic, not options-implied)",
    move_1d: move(1),
    move_1w: move(5),
    move_to_earnings: earningsMove ? { ...earningsMove, business_days: daysToEarnings } : null,
  };

  await sql`
    INSERT INTO technical_levels
      (ticker, ts, trend, support_json, resistance_json, breakout, breakdown, atr14,
       stop_suggested, entry_zone_json, exit_zone_json, risk_reward, key_level, method, expected_move_json)
    VALUES (
      ${ticker}, ${ts.toISOString()}, ${trend},
      ${JSON.stringify(support.slice(0, 5).map((v) => round(v)))},
      ${JSON.stringify(resistance.slice(0, 5).map((v) => round(v)))},
      ${round(breakout)}, ${round(breakdown)}, ${round(atr14)},
      ${round(stopSuggested)},
      ${JSON.stringify(breakdown != null && price != null ? [round(breakdown), round(price)] : null)},
      ${JSON.stringify(price != null && breakout != null ? [round(price), round(breakout)] : null)},
      ${round(riskReward)},
      ${round(breakout ?? breakdown)},
      ${"swing pivots + MA confluence + classic pivots; ATR expected move"},
      ${JSON.stringify({ ...expectedMove, pivots, hi52: round(hi52), lo52: round(lo52), confidence: "Medium" })}
    )
    ON CONFLICT (ticker, ts) DO UPDATE SET
      trend = EXCLUDED.trend, support_json = EXCLUDED.support_json, resistance_json = EXCLUDED.resistance_json,
      breakout = EXCLUDED.breakout, breakdown = EXCLUDED.breakdown, atr14 = EXCLUDED.atr14,
      stop_suggested = EXCLUDED.stop_suggested, entry_zone_json = EXCLUDED.entry_zone_json,
      exit_zone_json = EXCLUDED.exit_zone_json, risk_reward = EXCLUDED.risk_reward,
      key_level = EXCLUDED.key_level, method = EXCLUDED.method, expected_move_json = EXCLUDED.expected_move_json`;

  return { trend, atr14, expectedMove };
}
