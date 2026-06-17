// jobs.ts — canonical job names (Phase 1 fills handlers)
export enum Job {
  DailyPrices = "daily_prices",
  Fundamentals = "fundamentals",
  Filings = "filings",
  AnalystSnapshot = "analyst_snapshot",
  Macro = "macro",
  News = "news",
  Options = "options",
  ConvictionRecompute = "conviction_recompute",
  ColdFetch = "cold_fetch",
}
