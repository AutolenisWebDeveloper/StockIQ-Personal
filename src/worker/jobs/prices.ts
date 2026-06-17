import { sql } from "../../lib/db";
import { getActiveUniverse } from "../../lib/universe";
import { marketChain, withFallback } from "../../providers/registry";
import { computeIndicators, type Bar } from "../../lib/indicators";
import { upsertCorporateActions, recomputeAdjClose } from "../../lib/corporate-actions";
import { sectorEtf, MARKET_ETF } from "../../lib/sectors";
import { withRun } from "../runlog";
import { getQueue } from "../../queue/queues";
import { Job } from "../../queue/jobs";

const HISTORY_YEARS = 3;
const REL_WINDOW = 63; // ~3 trading months

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Memoized benchmark adjusted-close series (date → adjClose) for a job run.
function makeBenchLoader() {
  const cache = new Map<string, Map<string, number>>();
  return async function getBench(symbol: string): Promise<Map<string, number>> {
    const hit = cache.get(symbol);
    if (hit) return hit;
    const to = new Date();
    const from = new Date(to.getTime() - HISTORY_YEARS * 365 * 86400_000);
    const map = new Map<string, number>();
    try {
      const res = await withFallback(marketChain, (p) => p.getDailyOHLCV(symbol, from, to), {
        method: "getDailyOHLCV",
        ticker: symbol,
        args: ["bench"],
        ttlSec: 3600,
      });
      for (const b of res.value) map.set(dayKey(b.ts), b.adjClose);
    } catch {
      /* benchmark unavailable → rel_strength stays null */
    }
    cache.set(symbol, map);
    return map;
  };
}

function computeRelStrength(bars: Bar[], benchMaps: Map<string, number>[]): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = REL_WINDOW; i < bars.length; i++) {
    const tickerRet = bars[i].adjClose / bars[i - REL_WINDOW].adjClose - 1;
    const benchRets: number[] = [];
    for (const bm of benchMaps) {
      const a = bm.get(dayKey(bars[i].ts));
      const b = bm.get(dayKey(bars[i - REL_WINDOW].ts));
      if (a != null && b != null && b !== 0) benchRets.push(a / b - 1);
    }
    if (benchRets.length) {
      out[i] = tickerRet - benchRets.reduce((x, y) => x + y, 0) / benchRets.length;
    }
  }
  return out;
}

async function processTicker(ticker: string, getBench: ReturnType<typeof makeBenchLoader>) {
  const to = new Date();
  const from = new Date(to.getTime() - HISTORY_YEARS * 365 * 86400_000);

  // 1) OHLCV via Stooq → yfinance, cached + last-good on total failure.
  const res = await withFallback(marketChain, (p) => p.getDailyOHLCV(ticker, from, to), {
    method: "getDailyOHLCV",
    ticker,
    args: [dayKey(from), dayKey(to)],
    ttlSec: 3600,
  });
  const ohlcv = res.value;
  if (ohlcv.length) {
    const rows = ohlcv.map((b) => ({
      ticker,
      ts: b.ts.toISOString(),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      adj_close: b.adjClose,
      volume: b.volume,
    }));
    await sql`
      INSERT INTO stock_prices ${sql(rows, "ticker", "ts", "open", "high", "low", "close", "adj_close", "volume")}
      ON CONFLICT (ticker, ts) DO UPDATE SET
        open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
        close = EXCLUDED.close, adj_close = EXCLUDED.adj_close, volume = EXCLUDED.volume`;
  }

  // 2) Corporate actions: detect (yfinance split/div feed) then re-adjust history.
  const caProvider = marketChain.find((p) => typeof p.getCorporateActions === "function");
  if (caProvider?.getCorporateActions) {
    try {
      const events = await caProvider.getCorporateActions(ticker, from, to);
      await upsertCorporateActions(ticker, events);
    } catch {
      /* corp-action feed down → adj_close recompute below still runs on known splits */
    }
  }
  await recomputeAdjClose(ticker);

  // 3) Indicators off the (now adjusted) series + rel_strength vs SPY + sector ETF.
  const dbBars = await sql<{ ts: string; high: string; low: string; close: string; adj_close: string }[]>`
    SELECT ts, high, low, close, adj_close FROM stock_prices WHERE ticker = ${ticker} ORDER BY ts`;
  const [stock] = await sql<{ sector: string | null }[]>`SELECT sector FROM stocks WHERE ticker = ${ticker}`;

  if (dbBars.length > 1) {
    const bars: Bar[] = dbBars.map((r) => ({
      ts: new Date(r.ts),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      adjClose: Number(r.adj_close),
    }));
    const benchMaps: Map<string, number>[] = [await getBench(MARKET_ETF)];
    const etf = sectorEtf(stock?.sector);
    if (etf) benchMaps.push(await getBench(etf));

    const ind = computeIndicators(bars, computeRelStrength(bars, benchMaps));
    const indRows = ind
      .filter((r) => r.rsi14 != null || r.ma20 != null) // skip warmup-only rows
      .map((r) => ({
        ticker,
        ts: r.ts.toISOString(),
        rsi14: r.rsi14,
        macd: r.macd,
        macd_signal: r.macd_signal,
        atr14: r.atr14,
        bb_upper: r.bb_upper,
        bb_lower: r.bb_lower,
        ma20: r.ma20,
        ma50: r.ma50,
        ma200: r.ma200,
        rel_strength: r.rel_strength,
      }));
    if (indRows.length) {
      await sql`
        INSERT INTO technical_indicators ${sql(
          indRows,
          "ticker",
          "ts",
          "rsi14",
          "macd",
          "macd_signal",
          "atr14",
          "bb_upper",
          "bb_lower",
          "ma20",
          "ma50",
          "ma200",
          "rel_strength"
        )}
        ON CONFLICT (ticker, ts) DO UPDATE SET
          rsi14 = EXCLUDED.rsi14, macd = EXCLUDED.macd, macd_signal = EXCLUDED.macd_signal,
          atr14 = EXCLUDED.atr14, bb_upper = EXCLUDED.bb_upper, bb_lower = EXCLUDED.bb_lower,
          ma20 = EXCLUDED.ma20, ma50 = EXCLUDED.ma50, ma200 = EXCLUDED.ma200,
          rel_strength = EXCLUDED.rel_strength`;
    }
  }

  return { degraded: res.degraded, rows: ohlcv.length };
}

/** prices-eod handler. Defaults to the active universe; cold-fetch passes [ticker]. */
export async function runPrices(tickers?: string[]): Promise<void> {
  const universe = tickers ?? (await getActiveUniverse());
  const getBench = makeBenchLoader();
  for (const ticker of universe) {
    const res = await withRun("prices-eod", ticker, async () => {
      const r = await processTicker(ticker, getBench);
      return { rowsWritten: r.rows, status: r.degraded ? "degraded" : "success" };
    });
    // Phase 2 chain: recompute the deterministic engines once prices land.
    if (res.status !== "failed") {
      await getQueue(Job.Compute).add(Job.Compute, { tickers: [ticker] });
    }
  }
}
