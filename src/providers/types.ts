export interface OHLCV { ts: Date; open: number; high: number; low: number; close: number; adjClose: number; volume: number; }
export interface Quote { ticker: string; price: number; asOf: Date; source: string; }
export interface IncomeStatement { periodEnd: Date; periodType: "Q" | "FY"; revenue: number; netIncome: number; eps: number; }
export interface Estimate { periodEnd: Date; epsEstimate: number; revenueEstimate: number; numAnalysts: number; }
export interface PriceTarget { mean: number; high: number; low: number; asOf: Date; }
export interface Transcript { periodEnd: Date; text: string; }

export interface MarketDataProvider {
  name: string;
  getDailyOHLCV(ticker: string, from: Date, to: Date): Promise<OHLCV[]>;
  getQuote(ticker: string): Promise<Quote>;
}
export interface FundamentalsProvider {
  name: string;
  getIncomeStatements(ticker: string, limit: number): Promise<IncomeStatement[]>;
  getAnalystEstimates(ticker: string): Promise<Estimate[]>;
  getPriceTargets(ticker: string): Promise<PriceTarget>;
  getTranscripts(ticker: string, limit: number): Promise<Transcript[]>;
}
