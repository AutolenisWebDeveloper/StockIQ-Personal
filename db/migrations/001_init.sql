-- Extensions (the -ha image ships both)
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS vector;

-- ============ Identity / control ============
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlists (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  watchlist_id BIGINT NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (watchlist_id, ticker)
);

-- ============ Reference ============
CREATE TABLE IF NOT EXISTS stocks (
  ticker TEXT PRIMARY KEY,
  name TEXT, sector TEXT, industry TEXT, exchange TEXT, cik TEXT,
  beta NUMERIC, market_cap NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_refreshed TIMESTAMPTZ
);  -- 52w hi/lo + avg volume are DERIVED from stock_prices, never stored

CREATE TABLE IF NOT EXISTS corporate_actions (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('split','dividend','ticker_change','delisting','merger')),
  ex_date DATE NOT NULL, ratio NUMERIC, details_json JSONB,
  UNIQUE (ticker, type, ex_date)
);

-- ============ Time-series (TimescaleDB hypertables) ============
CREATE TABLE IF NOT EXISTS stock_prices (
  ticker TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL,
  open NUMERIC, high NUMERIC, low NUMERIC, close NUMERIC, adj_close NUMERIC, volume BIGINT,
  PRIMARY KEY (ticker, ts)
);
SELECT create_hypertable('stock_prices', 'ts', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS technical_indicators (
  ticker TEXT NOT NULL, ts TIMESTAMPTZ NOT NULL,
  rsi14 NUMERIC, macd NUMERIC, macd_signal NUMERIC, atr14 NUMERIC,
  bb_upper NUMERIC, bb_lower NUMERIC, ma20 NUMERIC, ma50 NUMERIC, ma200 NUMERIC, rel_strength NUMERIC,
  PRIMARY KEY (ticker, ts)
);
SELECT create_hypertable('technical_indicators', 'ts', if_not_exists => TRUE);

-- ============ Filings + AI (declared early; soft-referenced by *_filing_id) ============
CREATE TABLE IF NOT EXISTS sec_filings (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  cik TEXT, form_type TEXT, filed_at TIMESTAMPTZ,
  accession_no TEXT UNIQUE, url TEXT, processed BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS filing_chunks (
  id BIGSERIAL PRIMARY KEY,
  filing_id BIGINT NOT NULL REFERENCES sec_filings(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL, text TEXT NOT NULL, embedding vector(1536),
  UNIQUE (filing_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS filing_chunks_embedding_idx
  ON filing_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS ai_reports (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN
    ('exec_summary','filing_diff','earnings','risk','deep','decision')),
  model TEXT, content_md TEXT, sources_json JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_reports_lookup_idx ON ai_reports (ticker, report_type, generated_at DESC);

CREATE TABLE IF NOT EXISTS news_articles (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  title TEXT, url TEXT UNIQUE, body TEXT, published_at TIMESTAMPTZ, source TEXT
);

CREATE TABLE IF NOT EXISTS news_sentiment (
  article_id BIGINT PRIMARY KEY REFERENCES news_articles(id) ON DELETE CASCADE,
  score NUMERIC CHECK (score BETWEEN -1 AND 1),
  label TEXT CHECK (label IN ('bullish','neutral','bearish')),
  rationale TEXT, model TEXT
);

-- ============ Fundamentals / earnings ============
CREATE TABLE IF NOT EXISTS financials (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  period_end DATE NOT NULL, period_type TEXT NOT NULL CHECK (period_type IN ('Q','FY')),
  revenue NUMERIC, operating_income NUMERIC, net_income NUMERIC, eps NUMERIC, fcf NUMERIC,
  gross_margin NUMERIC, op_margin NUMERIC, total_debt NUMERIC, cash NUMERIC, roic NUMERIC,
  source_filing_id BIGINT REFERENCES sec_filings(id) ON DELETE SET NULL,
  UNIQUE (ticker, period_end, period_type)
);

CREATE TABLE IF NOT EXISTS earnings (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  period_end DATE NOT NULL,
  eps_actual NUMERIC, eps_estimate NUMERIC, revenue_actual NUMERIC, revenue_estimate NUMERIC,
  surprise_pct NUMERIC, report_date DATE, guidance_json JSONB,
  UNIQUE (ticker, period_end)
);

CREATE TABLE IF NOT EXISTS earnings_estimates (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  period_end DATE NOT NULL, eps_estimate NUMERIC, revenue_estimate NUMERIC, num_analysts INT,
  estimate_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ticker, period_end, estimate_ts)
);  -- revisions stored over time (append)

-- ============ Analyst ============
CREATE TABLE IF NOT EXISTS analyst_consensus_snapshots (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  consensus_rating TEXT, num_analysts INT,
  target_mean NUMERIC, target_high NUMERIC, target_low NUMERIC,
  UNIQUE (ticker, ts)
);  -- free-stack primary; self-diff drives Analyst sub-score

-- deferred (need firm-attributed feed); tables exist, unused in v1
CREATE TABLE IF NOT EXISTS analysts (id BIGSERIAL PRIMARY KEY, name TEXT, firm TEXT);
CREATE TABLE IF NOT EXISTS analyst_ratings (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  analyst_id BIGINT REFERENCES analysts(id),
  rating TEXT, action TEXT CHECK (action IN ('initiate','upgrade','downgrade','maintain')),
  rating_date DATE
);
CREATE TABLE IF NOT EXISTS price_targets (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  analyst_id BIGINT REFERENCES analysts(id),
  target NUMERIC, prior_target NUMERIC, target_date DATE
);
CREATE TABLE IF NOT EXISTS analyst_performance (
  analyst_id BIGINT REFERENCES analysts(id),
  ticker TEXT NOT NULL, rating_date DATE,
  forward_return_3m NUMERIC, forward_return_6m NUMERIC, forward_return_12m NUMERIC, hit BOOLEAN,
  PRIMARY KEY (analyst_id, ticker, rating_date)
);

-- ============ Ownership ============
CREATE TABLE IF NOT EXISTS insider_transactions (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  insider_name TEXT, role TEXT, txn_type TEXT CHECK (txn_type IN ('buy','sell')),
  shares NUMERIC, price NUMERIC, value NUMERIC, txn_date DATE,
  filing_id BIGINT REFERENCES sec_filings(id) ON DELETE SET NULL,
  UNIQUE (ticker, insider_name, txn_date, txn_type, shares, price)
);

CREATE TABLE IF NOT EXISTS institutional_holdings (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  holder_name TEXT, shares NUMERIC, value NUMERIC,
  change_shares NUMERIC, change_pct NUMERIC, report_period DATE,
  UNIQUE (ticker, holder_name, report_period)
);  -- 13F, 45-day lag (flag in UI)

-- ============ Scoring (APPEND-ONLY — never UPDATE) ============
CREATE TABLE IF NOT EXISTS conviction_scores (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  fundamental_score NUMERIC, earnings_score NUMERIC, analyst_score NUMERIC,
  institutional_score NUMERIC, insider_score NUMERIC, technical_score NUMERIC,
  news_signal NUMERIC,                 -- stored, NOT in composite
  composite NUMERIC, band TEXT, weights_json JSONB
);
CREATE INDEX IF NOT EXISTS conviction_scores_lookup_idx ON conviction_scores (ticker, ts DESC);

-- score_history is satisfied by append-only semantics; expose as a view (no physical dup)
CREATE OR REPLACE VIEW score_history AS SELECT * FROM conviction_scores;

CREATE TABLE IF NOT EXISTS probability_models (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  horizon TEXT CHECK (horizon IN ('3m','6m','12m')),
  bull_prob NUMERIC, base_prob NUMERIC, bear_prob NUMERIC, method TEXT, features_json JSONB
);

CREATE TABLE IF NOT EXISTS opportunity_signals (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  type TEXT NOT NULL, polarity TEXT CHECK (polarity IN ('positive','negative')),
  strength NUMERIC, detected_at TIMESTAMPTZ NOT NULL DEFAULT now(), source TEXT
);
CREATE INDEX IF NOT EXISTS opportunity_signals_feed_idx ON opportunity_signals (ticker, detected_at DESC);

-- ============ Decision-report engines (feed §7.5 flagship) ============
CREATE TABLE IF NOT EXISTS valuations (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  fwd_pe NUMERIC, ttm_pe NUMERIC, peg NUMERIC, ps NUMERIC, ev_ebitda NUMERIC, fcf_yield NUMERIC,
  hist_pe_pctile NUMERIC, peer_pe NUMERIC,
  bull_target NUMERIC, base_target NUMERIC, bear_target NUMERIC,
  scenario_probs_json JSONB, prob_weighted_fv NUMERIC,
  verdict TEXT CHECK (verdict IN ('under','fair','over'))
);

CREATE TABLE IF NOT EXISTS technical_levels (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  trend TEXT, support_json JSONB, resistance_json JSONB,
  breakout NUMERIC, breakdown NUMERIC, atr14 NUMERIC, stop_suggested NUMERIC,
  entry_zone_json JSONB, exit_zone_json JSONB, risk_reward NUMERIC, key_level NUMERIC
);

CREATE TABLE IF NOT EXISTS options_snapshots (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  put_call_ratio NUMERIC, iv30 NUMERIC, iv_rank NUMERIC,
  expected_move_1w NUMERIC, expected_move_1m NUMERIC, max_pain NUMERIC,
  top_call_strikes_json JSONB, top_put_strikes_json JSONB,
  short_interest NUMERIC, days_to_cover NUMERIC,
  signal TEXT, source TEXT, confidence TEXT
);  -- unofficial/delayed → Medium-Low confidence

CREATE TABLE IF NOT EXISTS earnings_predictions (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  period_end DATE,
  p_beat NUMERIC, p_meet NUMERIC, p_miss NUMERIC,
  p_guide_raise NUMERIC, p_guide_maintain NUMERIC, p_guide_lower NUMERIC,
  expected_move_earnings NUMERIC, earnings_risk TEXT, method TEXT, features_json JSONB
);

-- ============ Decision journal / thesis ============
CREATE TABLE IF NOT EXISTS investment_journal (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  action TEXT CHECK (action IN ('buy','add','trim','sell','review')),
  decision_date DATE NOT NULL, price_at_decision NUMERIC, conviction_at_decision NUMERIC,
  thesis_snapshot TEXT, rationale TEXT,
  conviction_level INT CHECK (conviction_level BETWEEN 1 AND 5),
  lessons_learned TEXT, outcome_return_vs_spy NUMERIC
);

CREATE TABLE IF NOT EXISTS thesis_tracker (
  id BIGSERIAL PRIMARY KEY,
  ticker TEXT NOT NULL REFERENCES stocks(ticker) ON DELETE CASCADE,
  thesis_statement TEXT,
  key_assumptions_json JSONB,           -- [{assumption, validation_status, last_checked, evidence}]
  risks_json JSONB, target_price NUMERIC, target_horizon TEXT,
  status TEXT CHECK (status IN ('active','validated','invalidated','exited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_reviewed TIMESTAMPTZ
);

-- ============ Portfolio / alerts / ops ============
CREATE TABLE IF NOT EXISTS portfolios (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id BIGSERIAL PRIMARY KEY,
  portfolio_id BIGINT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL REFERENCES stocks(ticker),
  shares NUMERIC, cost_basis NUMERIC, opened_at DATE
);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL, ticker TEXT, condition_json JSONB,
  channel TEXT CHECK (channel IN ('email','telegram')),
  active BOOLEAN NOT NULL DEFAULT true, last_fired_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  alert_id BIGINT REFERENCES alerts(id) ON DELETE SET NULL,
  ticker TEXT, message TEXT, sent_at TIMESTAMPTZ NOT NULL DEFAULT now(), channel TEXT
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL, ticker TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
  status TEXT, rows_written INT, error TEXT
);
CREATE INDEX IF NOT EXISTS ingestion_runs_health_idx ON ingestion_runs (job_name, started_at DESC);
