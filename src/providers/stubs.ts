import type { MarketDataProvider, FundamentalsProvider } from "./types";

// Phase 0: every provider method throws NotImplemented. The *contract* (ordered
// fallback + cache + last-good) is established now; Phase 1 swaps these stubs
// for real Stooq→yfinance (prices) and EDGAR (fundamentals/filings) impls.
const notImpl = (who: string): never => {
  throw new Error(`NotImplemented: ${who} (Phase 1+)`);
};

export const stooqStub: MarketDataProvider = {
  name: "stooq",
  async getDailyOHLCV() { return notImpl("stooq.getDailyOHLCV"); },
  async getQuote() { return notImpl("stooq.getQuote"); },
};
export const yfinanceStub: MarketDataProvider = {
  name: "yfinance",
  async getDailyOHLCV() { return notImpl("yfinance.getDailyOHLCV"); },
  async getQuote() { return notImpl("yfinance.getQuote"); },
};
export const edgarFundamentalsStub: FundamentalsProvider = {
  name: "edgar",
  async getIncomeStatements() { return notImpl("edgar.getIncomeStatements"); },
  async getAnalystEstimates() { return notImpl("edgar.getAnalystEstimates"); },
  async getPriceTargets() { return notImpl("edgar.getPriceTargets"); },
  async getTranscripts() { return notImpl("edgar.getTranscripts"); },
};
