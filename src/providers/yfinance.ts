import type {
  MarketDataProvider,
  AnalystProvider,
  EstimatesProvider,
  NewsProvider,
  EarningsCalProvider,
  OHLCV,
  Quote,
  ConsensusSnapshot,
  Estimate,
  NewsItem,
  EarningsDate,
  CorporateActionEvent,
} from "./types";
import { fetchJson } from "../lib/http";

// Yahoo Finance (unofficial public JSON endpoints). Covers prices+events,
// analyst consensus, forward estimates, headlines and the next-earnings date.
// These are best-effort, delayed, free-stack sources → Medium/Low confidence.

const CHART = "https://query1.finance.yahoo.com/v8/finance/chart";
const SUMMARY = "https://query2.finance.yahoo.com/v10/finance/quoteSummary";
const SEARCH = "https://query2.finance.yahoo.com/v1/finance/search";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; StockIQ-Personal/1.0)" };

interface ChartResp {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
      events?: {
        splits?: Record<string, { date: number; numerator: number; denominator: number }>;
        dividends?: Record<string, { date: number; amount: number }>;
      };
    }>;
  };
}

export class YFinanceProvider
  implements MarketDataProvider, AnalystProvider, EstimatesProvider, NewsProvider, EarningsCalProvider
{
  name = "yfinance";

  private async chart(ticker: string, from: Date, to: Date): Promise<ChartResp | null> {
    const p1 = Math.floor(from.getTime() / 1000);
    const p2 = Math.floor(to.getTime() / 1000);
    const url = `${CHART}/${encodeURIComponent(ticker)}?period1=${p1}&period2=${p2}&interval=1d&events=div%2Csplit`;
    return fetchJson<ChartResp>(url, { provider: "yfinance", headers: UA });
  }

  async getDailyOHLCV(ticker: string, from: Date, to: Date): Promise<OHLCV[]> {
    const data = await this.chart(ticker, from, to);
    const r = data?.chart?.result?.[0];
    const ts = r?.timestamp;
    const q = r?.indicators?.quote?.[0];
    const adj = r?.indicators?.adjclose?.[0]?.adjclose;
    if (!ts || !q?.close) return [];
    const out: OHLCV[] = [];
    for (let i = 0; i < ts.length; i++) {
      const close = q.close[i];
      if (close == null) continue;
      out.push({
        ts: new Date(ts[i] * 1000),
        open: q.open?.[i] ?? close,
        high: q.high?.[i] ?? close,
        low: q.low?.[i] ?? close,
        close,
        adjClose: adj?.[i] ?? close,
        volume: q.volume?.[i] ?? 0,
      });
    }
    return out;
  }

  async getQuote(ticker: string): Promise<Quote> {
    const to = new Date();
    const from = new Date(to.getTime() - 7 * 86400_000);
    const bars = await this.getDailyOHLCV(ticker, from, to);
    const last = bars.at(-1);
    if (!last) throw new Error(`yfinance.getQuote: no data for ${ticker}`);
    return { ticker: ticker.toUpperCase(), price: last.close, asOf: last.ts, source: this.name };
  }

  async getCorporateActions(ticker: string, from: Date, to: Date): Promise<CorporateActionEvent[]> {
    const data = await this.chart(ticker, from, to);
    const ev = data?.chart?.result?.[0]?.events;
    const out: CorporateActionEvent[] = [];
    for (const s of Object.values(ev?.splits ?? {})) {
      out.push({
        type: "split",
        exDate: new Date(s.date * 1000),
        ratio: s.denominator ? s.numerator / s.denominator : null,
        details: { numerator: s.numerator, denominator: s.denominator },
      });
    }
    for (const d of Object.values(ev?.dividends ?? {})) {
      out.push({ type: "dividend", exDate: new Date(d.date * 1000), ratio: null, details: { amount: d.amount } });
    }
    return out;
  }

  private async summary(ticker: string, modules: string[]): Promise<any> {
    const url = `${SUMMARY}/${encodeURIComponent(ticker)}?modules=${modules.join("%2C")}`;
    return fetchJson<any>(url, { provider: "yfinance", headers: UA, okStatuses: [404] });
  }

  async getConsensus(ticker: string): Promise<ConsensusSnapshot> {
    const data = await this.summary(ticker, ["financialData"]);
    const fd = data?.quoteSummary?.result?.[0]?.financialData;
    return {
      consensusRating: fd?.recommendationKey ?? null,
      numAnalysts: fd?.numberOfAnalystOpinions?.raw ?? null,
      targetMean: fd?.targetMeanPrice?.raw ?? null,
      targetHigh: fd?.targetHighPrice?.raw ?? null,
      targetLow: fd?.targetLowPrice?.raw ?? null,
      asOf: new Date(),
    };
  }

  async getEstimates(ticker: string): Promise<Estimate[]> {
    const data = await this.summary(ticker, ["earningsTrend"]);
    const trends: any[] = data?.quoteSummary?.result?.[0]?.earningsTrend?.trend ?? [];
    const out: Estimate[] = [];
    for (const t of trends) {
      // periods: 0q (current qtr), +1q, 0y (current yr), +1y
      if (!t?.endDate) continue;
      const epsEst = t?.earningsEstimate?.avg?.raw ?? null;
      const revEst = t?.revenueEstimate?.avg?.raw ?? null;
      if (epsEst == null && revEst == null) continue;
      out.push({
        periodEnd: new Date(t.endDate),
        epsEstimate: epsEst,
        revenueEstimate: revEst,
        numAnalysts: t?.earningsEstimate?.numberOfAnalysts?.raw ?? null,
      });
    }
    return out;
  }

  async getHeadlines(ticker: string, limit: number): Promise<NewsItem[]> {
    const url = `${SEARCH}?q=${encodeURIComponent(ticker)}&newsCount=${limit}&quotesCount=0`;
    const data = await fetchJson<any>(url, { provider: "yfinance", headers: UA });
    const news: any[] = data?.news ?? [];
    return news.map((n) => ({
      title: n.title ?? "",
      url: n.link ?? "",
      body: null,
      publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000) : null,
      source: n.publisher ?? "yahoo",
    }));
  }

  async getNextEarningsDate(ticker: string): Promise<EarningsDate> {
    const data = await this.summary(ticker, ["calendarEvents"]);
    const dates: any[] = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate ?? [];
    const first = dates[0]?.raw;
    return { nextEarningsDate: first ? new Date(first * 1000) : null };
  }
}
