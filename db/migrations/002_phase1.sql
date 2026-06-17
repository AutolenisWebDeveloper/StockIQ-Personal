-- Phase 1 schema additions (flagged for operator sign-off in the PR).
-- §3 did not define landing spots for two Phase-1 feeds; add minimally only.

-- FRED macro landing table.
CREATE TABLE IF NOT EXISTS macro_series (
  series_id TEXT NOT NULL,
  ts        DATE NOT NULL,
  value     NUMERIC,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, ts)
);
CREATE INDEX IF NOT EXISTS macro_series_lookup_idx ON macro_series (series_id, ts DESC);

-- earnings-calendar flag (consumed by Phase 5 alerts + Phase 2 levels expected-move).
ALTER TABLE stocks ADD COLUMN IF NOT EXISTS next_earnings_date DATE;
