// Local indicator math, computed from ADJUSTED OHLCV (never raw close). No
// vendor indicator calls. Each function returns aligned arrays (null until the
// lookback window is satisfied) so they can be upserted per (ticker, ts).

export interface Bar { ts: Date; high: number; low: number; close: number; adjClose: number; }

function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    if (prev === null) {
      // seed with SMA of first `period` values
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += values[j];
      prev = s / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    if (i <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (i === period) {
        avgGain /= period;
        avgLoss /= period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return out;
}

function atr(bars: Bar[], period = 14): (number | null)[] {
  const tr: number[] = new Array(bars.length).fill(0);
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      tr[i] = bars[i].high - bars[i].low;
    } else {
      const prevClose = bars[i - 1].close;
      tr[i] = Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - prevClose),
        Math.abs(bars[i].low - prevClose)
      );
    }
  }
  // Wilder smoothing
  const out: (number | null)[] = new Array(bars.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1) continue;
    if (prev === null) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += tr[j];
      prev = s / period;
    } else {
      prev = (prev * (period - 1) + tr[i]) / period;
    }
    out[i] = prev;
  }
  return out;
}

export interface IndicatorRow {
  ts: Date;
  rsi14: number | null;
  macd: number | null;
  macd_signal: number | null;
  atr14: number | null;
  bb_upper: number | null;
  bb_lower: number | null;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  rel_strength: number | null;
}

/**
 * Compute the full indicator set from adjusted bars. `relStrength` is supplied
 * per-bar by the caller (ticker return vs sector ETF + SPY) since it needs other
 * series; pass an aligned array or omit for null.
 */
export function computeIndicators(bars: Bar[], relStrength?: (number | null)[]): IndicatorRow[] {
  const adj = bars.map((b) => b.adjClose);
  const ema12 = ema(adj, 12);
  const ema26 = ema(adj, 26);
  const macd: (number | null)[] = adj.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? (ema12[i]! - ema26[i]!) : null
  );
  // signal = EMA9 of macd over the defined region
  const macdDefined = macd.map((v) => v ?? 0);
  const signalRaw = ema(macdDefined, 9);
  const ma20 = sma(adj, 20);
  const ma50 = sma(adj, 50);
  const ma200 = sma(adj, 200);
  const rsi14 = rsi(adj, 14);
  const atr14 = atr(bars, 14);

  // Bollinger (20, 2σ) on adjusted close
  const bbUpper: (number | null)[] = new Array(adj.length).fill(null);
  const bbLower: (number | null)[] = new Array(adj.length).fill(null);
  for (let i = 19; i < adj.length; i++) {
    const window = adj.slice(i - 19, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / 20;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / 20;
    const sd = Math.sqrt(variance);
    bbUpper[i] = mean + 2 * sd;
    bbLower[i] = mean - 2 * sd;
  }

  return bars.map((b, i) => ({
    ts: b.ts,
    rsi14: rsi14[i],
    macd: macd[i],
    macd_signal: macd[i] != null ? signalRaw[i] : null,
    atr14: atr14[i],
    bb_upper: bbUpper[i],
    bb_lower: bbLower[i],
    ma20: ma20[i],
    ma50: ma50[i],
    ma200: ma200[i],
    rel_strength: relStrength?.[i] ?? null,
  }));
}
