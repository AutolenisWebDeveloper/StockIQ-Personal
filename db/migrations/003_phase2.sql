-- Phase 2 schema additions (flagged for operator sign-off in the PR).
-- §3 already defines conviction_scores, opportunity_signals, valuations,
-- technical_levels. These are the only genuinely-absent columns + the PIT
-- uniqueness needed for daily idempotent upserts (one row/ticker/compute-day).

-- Conviction: which cohort the percentiles were ranked against.
ALTER TABLE conviction_scores ADD COLUMN IF NOT EXISTS cohort_used TEXT;
-- PIT idempotency: upsert key (ticker, ts) — ts is the compute-day at 00:00Z.
CREATE UNIQUE INDEX IF NOT EXISTS conviction_scores_pit_idx ON conviction_scores (ticker, ts);

-- Opportunity: structured evidence behind each fired signal.
ALTER TABLE opportunity_signals ADD COLUMN IF NOT EXISTS evidence_json JSONB;
-- idempotent on (ticker, type, detected_at::day)
CREATE UNIQUE INDEX IF NOT EXISTS opportunity_signals_pit_idx
  ON opportunity_signals (ticker, type, detected_at);

-- Valuation: the method + the raw inputs/provenance behind the band.
ALTER TABLE valuations ADD COLUMN IF NOT EXISTS method TEXT;
ALTER TABLE valuations ADD COLUMN IF NOT EXISTS inputs_json JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS valuations_pit_idx ON valuations (ticker, ts);

-- Technical levels: ATR-based expected move + the method note.
ALTER TABLE technical_levels ADD COLUMN IF NOT EXISTS method TEXT;
ALTER TABLE technical_levels ADD COLUMN IF NOT EXISTS expected_move_json JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS technical_levels_pit_idx ON technical_levels (ticker, ts);
