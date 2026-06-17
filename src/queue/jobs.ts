// Canonical Phase 1 job names (one BullMQ queue each). Phase 0's placeholder
// set is replaced by the real ingestion topology from the cadence matrix.
export enum Job {
  PricesEod = "prices-eod", // EOD OHLCV + technicals + corporate-actions
  Fundamentals = "fundamentals",
  FilingsPoll = "filings-poll",
  ConsensusSnapshot = "consensus-snapshot",
  EstimateSnapshot = "estimate-snapshot",
  Macro = "macro",
  NewsHeadlines = "news-headlines",
  EarningsCalendar = "earnings-calendar",
  ColdFetch = "cold-fetch", // on-demand untracked ticker
  Compute = "compute", // Phase 2: deterministic engines (levels/valuation/conviction/opportunity)
}
