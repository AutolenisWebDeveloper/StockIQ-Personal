// Provider contracts. Phase 0 established MarketDataProvider + FundamentalsProvider;
// Phase 1 adds the analyst/estimates/news/earnings-calendar/filings/macro
// capabilities and the DTOs the jobs persist. Every value that crosses this
// boundary carries enough provenance (source + as-of) to satisfy truth discipline.

// ---------- core market DTOs ----------
export interface OHLCV { ts: Date; open: number; high: number; low: number; close: number; adjClose: number; volume: number; }
export interface Quote { ticker: string; price: number; asOf: Date; source: string; }

// ---------- fundamentals DTOs ----------
export interface IncomeStatement {
  periodEnd: Date; periodType: "Q" | "FY";
  revenue: number | null; operatingIncome: number | null; netIncome: number | null;
  eps: number | null; fcf: number | null;
  grossMargin: number | null; opMargin: number | null; roic: number | null;
  sourceAccession?: string;
}
export interface BalanceSheetFacts {
  periodEnd: Date; periodType: "Q" | "FY";
  totalDebt: number | null; cash: number | null;
}

// ---------- analyst / estimates DTOs ----------
export interface ConsensusSnapshot {
  consensusRating: string | null; numAnalysts: number | null;
  targetMean: number | null; targetHigh: number | null; targetLow: number | null;
  asOf: Date;
}
export interface Estimate {
  periodEnd: Date; epsEstimate: number | null; revenueEstimate: number | null; numAnalysts: number | null;
}
export interface PriceTarget { mean: number; high: number; low: number; asOf: Date; }
export interface Transcript { periodEnd: Date; text: string; }

// ---------- news / earnings calendar DTOs ----------
export interface NewsItem { title: string; url: string; body: string | null; publishedAt: Date | null; source: string; }
export interface EarningsDate { nextEarningsDate: Date | null; }

// ---------- filings DTOs ----------
export interface Filing {
  cik: string; formType: string; filedAt: Date; accessionNo: string; url: string;
}
export interface InsiderTxn {
  insiderName: string | null; role: string | null; txnType: "buy" | "sell";
  shares: number | null; price: number | null; value: number | null; txnDate: Date | null;
}
export interface InstHolding {
  holderName: string; shares: number | null; value: number | null; reportPeriod: Date;
}

// ---------- macro DTOs ----------
export interface MacroPoint { ts: Date; value: number | null; }

// ---------- corporate-actions DTOs ----------
export interface CorporateActionEvent {
  type: "split" | "dividend"; exDate: Date; ratio: number | null; details?: Record<string, unknown>;
}

// ================= capability interfaces =================

export interface MarketDataProvider {
  name: string;
  getDailyOHLCV(ticker: string, from: Date, to: Date): Promise<OHLCV[]>;
  getQuote(ticker: string): Promise<Quote>;
  // Optional split/dividend feed (yfinance provides it; Stooq does not).
  getCorporateActions?(ticker: string, from: Date, to: Date): Promise<CorporateActionEvent[]>;
}

export interface FundamentalsProvider {
  name: string;
  getIncomeStatements(ticker: string, limit: number): Promise<IncomeStatement[]>;
  getBalanceSheetFacts(ticker: string, limit: number): Promise<BalanceSheetFacts[]>;
}

export interface AnalystProvider {
  name: string;
  getConsensus(ticker: string): Promise<ConsensusSnapshot>;
}

export interface EstimatesProvider {
  name: string;
  getEstimates(ticker: string): Promise<Estimate[]>;
}

export interface NewsProvider {
  name: string;
  getHeadlines(ticker: string, limit: number): Promise<NewsItem[]>;
}

export interface EarningsCalProvider {
  name: string;
  getNextEarningsDate(ticker: string): Promise<EarningsDate>;
}

export interface FilingsProvider {
  name: string;
  // returns CIK for a ticker (cached ticker→CIK map)
  resolveCik(ticker: string): Promise<string | null>;
  // filings since a given accession watermark (null → recent window)
  pollSubmissions(ticker: string, sinceAccession: string | null): Promise<Filing[]>;
  getForm4(filing: Filing): Promise<InsiderTxn[]>;
  get13F(filing: Filing): Promise<InstHolding[]>;
}

export interface MacroProvider {
  name: string;
  getSeries(seriesId: string, from: Date): Promise<MacroPoint[]>;
}
