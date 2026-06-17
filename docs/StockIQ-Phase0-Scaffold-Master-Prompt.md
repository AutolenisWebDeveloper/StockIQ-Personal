# StockIQ Personal — Phase 0 Foundation Scaffold (Agent Master Prompt)

**Format:** Emergent / autonomous-coding-agent master prompt.
**Companion source of truth:** `StockIQ-Personal-Build-Spec.md` (v1.3) + `decision-report-template.md`. Where this prompt and the spec disagree, the spec wins for *intent*; this prompt wins for *Phase 0 concrete artifacts*.
**Scope of this prompt:** Phase 0 (Foundation) ONLY. Produce a booting skeleton. Do not implement business logic.

---

## 0. Mission (one line)

Stand up the runnable skeleton of a **single-user, personal** stock-research tool: a Next.js app + a BullMQ worker + Postgres (TimescaleDB + pgvector) + Redis behind a Caddy basic-auth gate, with the full database schema migrated, stubbed provider interfaces, empty job registrations, and a green health check — such that one ticker can be added to a watchlist.

---

## 1. Operating context (read before writing any code)

This is a **personal tool for one human operator. It is not a product.** Internalize these consequences:

- **No** registration, multi-user auth, password reset, email verification.
- **No** billing, subscriptions, Stripe, tiers, entitlements.
- **No** marketing pages, Terms, Privacy, RIA/compliance scaffolding.
- **No** multi-tenancy, RLS, SOC2, GDPR tooling.
- The active universe is a **watchlist (target 100–300 tickers) + on-demand lookups**, never the whole market.

If you find yourself building any of the above, stop — it is out of scope and a defect.

---

## 2. Non-negotiable invariants (carry into every later phase)

1. **Composition principle (architectural law):** In later phases the deterministic engines compute *every number*; the LLM only narrates around injected values. Phase 0 builds nothing that violates this — but lay the structure (engine outputs are tables; AI reads them) so it holds later.
2. **Truth discipline:** Every externally sourced value is stored with provenance (source, as-of timestamp). Missing ⇒ explicitly null/`UNAVAILABLE`, never a fabricated default.
3. **Idempotency:** All writes are upserts on natural keys. Re-running any job changes nothing on a second pass.
4. **Point-in-time integrity:** Score/estimate tables are **append-only**. Never `UPDATE`/overwrite a scored row — insert a new timestamped row. This is what makes future backtests honest.
5. **Graceful degradation:** Every external source call routes through a provider interface with ordered fallback + cache; a dead source serves last-good with an as-of stamp and logs to `ingestion_runs` — it never crashes a run. (Interfaces are stubbed in Phase 0; the *contract* is established now.)

---

## 3. Tech stack (locked — do not substitute)

| Layer | Choice |
|---|---|
| Frontend + API | Next.js (App Router) + TypeScript + TailwindCSS; API via Route Handlers |
| Worker | Node + TypeScript + **BullMQ** (separate container, shared codebase) |
| DB | PostgreSQL 16 via **`timescale/timescaledb-ha:pg16`** (bundles TimescaleDB + pgvector) |
| Vector | pgvector (`vector(1536)`), HNSW cosine index |
| Cache/Queue | Redis 7 |
| DB client | `postgres` (postgres.js) — thin typed wrapper, no heavy ORM |
| Migrations | Ordered raw `.sql` files + a tiny `postgres.js` runner |
| Reverse proxy / TLS / auth gate | Caddy 2 (`basic_auth`) |
| AI (later) | Anthropic (reasoning) + OpenAI (`text-embedding-3-small`) — keys only in Phase 0 |
| Email (later) | Resend |
| Deploy | Docker Compose on one VPS (or local) |

---

## 4. Target repository structure (create exactly this)

```
stockiq/
├─ docker-compose.yml
├─ Caddyfile
├─ .env.example
├─ .gitignore
├─ package.json
├─ tsconfig.json
├─ next.config.mjs
├─ tailwind.config.ts
├─ postcss.config.mjs
├─ Dockerfile.web
├─ Dockerfile.worker
├─ db/
│  ├─ migrate.ts                  # ordered-SQL runner (idempotent)
│  ├─ seed.ts                     # seeds single user + default watchlist + 1 ticker
│  └─ migrations/
│     └─ 001_init.sql             # ALL tables, hypertables, vector index (authoritative below)
├─ src/
│  ├─ lib/
│  │  ├─ db.ts                    # postgres.js singleton
│  │  ├─ redis.ts                 # ioredis singleton (BullMQ connection)
│  │  └─ env.ts                   # zod-validated env loader
│  ├─ providers/
│  │  ├─ types.ts                 # MarketDataProvider, FundamentalsProvider contracts
│  │  ├─ registry.ts              # ordered-fallback registry (Phase 0: returns stubs)
│  │  └─ stubs.ts                 # NotImplemented stub providers
│  ├─ queue/
│  │  ├─ queues.ts                # queue names + BullMQ Queue handles
│  │  └─ jobs.ts                  # job name enum (registrations only, no logic)
│  ├─ worker.ts                   # BullMQ Worker bootstrap + graceful shutdown
│  └─ app/
│     ├─ layout.tsx
│     ├─ globals.css
│     ├─ page.tsx                 # minimal watchlist view (server component)
│     └─ api/
│        ├─ health/route.ts       # GET -> checks db + redis, returns 200/503
│        └─ watchlist/route.ts    # GET list items; POST add { ticker }
```

---

## 5. Authoritative file contents

> Create these verbatim (adapt only obvious version pins). They encode the Phase-0 decisions and remove ambiguity.

### 5.1 `docker-compose.yml`

```yaml
services:
  postgres:
    image: timescale/timescaledb-ha:pg16
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/home/postgres/pgdata/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  web:
    build: { context: ., dockerfile: Dockerfile.web }
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    # migrate + seed are idempotent; safe to run on every boot
    command: ["sh", "-c", "npm run migrate && npm run seed && npm run start"]
    expose: ["3000"]

  worker:
    build: { context: ., dockerfile: Dockerfile.worker }
    env_file: .env
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
      web: { condition: service_started }
    command: ["node", "dist/worker.js"]

  caddy:
    image: caddy:2
    depends_on: [web]
    ports: ["80:80", "443:443"]
    environment:
      APP_DOMAIN: ${APP_DOMAIN}
      AUTH_USER: ${AUTH_USER}
      AUTH_PASSWORD_HASH: ${AUTH_PASSWORD_HASH}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddydata:/data
      - caddyconfig:/config

volumes:
  pgdata:
  redisdata:
  caddydata:
  caddyconfig:
```

### 5.2 `Caddyfile`

```
{$APP_DOMAIN:localhost} {
	basic_auth {
		{$AUTH_USER} {$AUTH_PASSWORD_HASH}
	}
	reverse_proxy web:3000
}
```

> `AUTH_PASSWORD_HASH` is a bcrypt hash generated with `docker run --rm caddy:2 caddy hash-password --plaintext '<pw>'`. On `localhost`, Caddy serves internal TLS; on a real `APP_DOMAIN` it provisions Let's Encrypt automatically.

### 5.3 `.env.example` (every key the spec §10 will eventually need; Phase 0 uses the infra + auth subset)

```bash
# --- infra (required Phase 0) ---
APP_DOMAIN=localhost
AUTH_USER=operator
AUTH_PASSWORD_HASH=               # caddy hash-password output (bcrypt)
POSTGRES_USER=stockiq
POSTGRES_PASSWORD=change-me
POSTGRES_DB=stockiq
DATABASE_URL=postgres://stockiq:change-me@postgres:5432/stockiq
REDIS_URL=redis://redis:6379

# --- single-user app account (seeded; no registration) ---
SEED_USER_EMAIL=you@example.com
SEED_USER_PASSWORD_HASH=          # bcrypt; app-level session lands in Phase 4
SEED_WATCHLIST_NAME=Core
SEED_TICKER=AAPL

# --- data sources (Phase 1+; present now so config is stable) ---
SEC_USER_AGENT=StockIQ-Personal/1.0 (you@example.com)   # SEC requires a descriptive UA
FRED_API_KEY=
ALPHAVANTAGE_API_KEY=             # supplementary only — never in a per-ticker loop
FINNHUB_API_KEY=                  # optional future analyst plug

# --- AI (Phase 3+) ---
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# --- delivery (Phase 5) ---
RESEND_API_KEY=
TELEGRAM_BOT_TOKEN=               # optional
```

### 5.4 `db/migrations/001_init.sql` (authoritative full schema)

```sql
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
```

### 5.5 `db/migrate.ts` (idempotent ordered-SQL runner)

```ts
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

async function main() {
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  const files = (await readdir(dir)).filter(f => f.endsWith(".sql")).sort();
  for (const f of files) {
    const done = await sql`SELECT 1 FROM _migrations WHERE name = ${f}`;
    if (done.length) { console.log(`skip ${f}`); continue; }
    const ddl = await readFile(join(dir, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`INSERT INTO _migrations (name) VALUES (${f})`;
    });
    console.log(`applied ${f}`);
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

### 5.6 `db/seed.ts` (single user + default watchlist + one ticker — idempotent)

```ts
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

async function main() {
  await sql`INSERT INTO users (email, password_hash)
    VALUES (${process.env.SEED_USER_EMAIL!}, ${process.env.SEED_USER_PASSWORD_HASH ?? "PLACEHOLDER"})
    ON CONFLICT (email) DO NOTHING`;
  const [wl] = await sql`INSERT INTO watchlists (name)
    SELECT ${process.env.SEED_WATCHLIST_NAME ?? "Core"}
    WHERE NOT EXISTS (SELECT 1 FROM watchlists)
    RETURNING id`;
  const watchlistId = wl?.id ?? (await sql`SELECT id FROM watchlists ORDER BY id LIMIT 1`)[0].id;
  const ticker = process.env.SEED_TICKER ?? "AAPL";
  await sql`INSERT INTO stocks (ticker) VALUES (${ticker}) ON CONFLICT (ticker) DO NOTHING`;
  await sql`INSERT INTO watchlist_items (watchlist_id, ticker) VALUES (${watchlistId}, ${ticker})
    ON CONFLICT DO NOTHING`;
  console.log(`seeded watchlist ${watchlistId} with ${ticker}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

### 5.7 `src/providers/types.ts` (the contract that makes every source a 1-file swap)

```ts
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
```

### 5.8 `src/providers/stubs.ts` + `registry.ts` (ordered-fallback shape; Phase 0 throws NotImplemented)

```ts
// stubs.ts
import type { MarketDataProvider, FundamentalsProvider } from "./types";
const notImpl = (who: string) => { throw new Error(`NotImplemented: ${who} (Phase 1+)`); };

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
```

```ts
// registry.ts — ordered fallback: try each provider, fall through on throw.
import type { MarketDataProvider } from "./types";
import { stooqStub, yfinanceStub } from "./stubs";

const marketChain: MarketDataProvider[] = [stooqStub, yfinanceStub];

export async function withFallback<T>(
  chain: { name: string }[],
  call: (p: any) => Promise<T>
): Promise<T> {
  let lastErr: unknown;
  for (const p of chain) {
    try { return await call(p); }
    catch (e) { lastErr = e; /* Phase 1: log to ingestion_runs, serve last-good */ }
  }
  throw lastErr;
}
export const providers = { market: marketChain };
```

### 5.9 `src/queue/queues.ts` + `jobs.ts` (registrations only — NO logic)

```ts
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
```

```ts
// queues.ts
import { Queue } from "bullmq";
import { connection } from "../lib/redis";
import { Job } from "./jobs";

export const queues = Object.fromEntries(
  Object.values(Job).map((name) => [name, new Queue(name, { connection })])
) as Record<Job, Queue>;
```

### 5.10 `src/worker.ts` (bootstrap + graceful shutdown; handlers stubbed)

```ts
import { Worker } from "bullmq";
import { connection } from "./lib/redis";
import { Job } from "./queue/jobs";

const workers = Object.values(Job).map((name) =>
  new Worker(name, async (job) => {
    // Phase 0: no-op. Phase 1+ wires real handlers per the cadence matrix.
    console.log(`[worker] received ${name}#${job.id} (no-op in Phase 0)`);
  }, { connection })
);

async function shutdown() {
  console.log("[worker] shutting down…");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
console.log(`[worker] online; ${workers.length} queues registered`);
```

### 5.11 `src/app/api/health/route.ts`

```ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { connection } from "@/lib/redis";

export async function GET() {
  try {
    await sql`SELECT 1`;
    await connection.ping();
    return NextResponse.json({ status: "ok", db: "up", redis: "up" });
  } catch (e) {
    return NextResponse.json({ status: "degraded", error: String(e) }, { status: 503 });
  }
}
```

### 5.12 `src/app/api/watchlist/route.ts` (the acceptance feature: add a ticker)

```ts
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET() {
  const rows = await sql`
    SELECT wi.ticker, wi.added_at FROM watchlist_items wi
    JOIN watchlists w ON w.id = wi.watchlist_id
    ORDER BY w.id LIMIT 1 OFFSET 0`;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { ticker } = await req.json();
  if (!ticker || typeof ticker !== "string") {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }
  const t = ticker.toUpperCase().trim();
  const [wl] = await sql`SELECT id FROM watchlists ORDER BY id LIMIT 1`;
  if (!wl) return NextResponse.json({ error: "no watchlist" }, { status: 409 });
  await sql`INSERT INTO stocks (ticker) VALUES (${t}) ON CONFLICT (ticker) DO NOTHING`;
  await sql`INSERT INTO watchlist_items (watchlist_id, ticker) VALUES (${wl.id}, ${t})
    ON CONFLICT DO NOTHING`;
  return NextResponse.json({ ok: true, ticker: t });
}
```

### 5.13 `package.json` scripts (the operative subset)

```jsonc
{
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build && tsc -p tsconfig.worker.json",
    "start": "next start -p 3000",
    "worker": "tsx src/worker.ts",
    "migrate": "tsx db/migrate.ts",
    "seed": "tsx db/seed.ts"
  },
  "dependencies": {
    "next": "^15", "react": "^19", "react-dom": "^19",
    "postgres": "^3", "ioredis": "^5", "bullmq": "^5", "zod": "^3"
  },
  "devDependencies": {
    "typescript": "^5", "tsx": "^4", "tailwindcss": "^3",
    "@types/node": "^22", "@types/react": "^19"
  }
}
```

> `Dockerfile.web` builds Next.js (`npm ci && npm run build`) and uses `node`+`tsx` for migrate/seed at boot. `Dockerfile.worker` shares the image and runs the compiled worker (or `tsx src/worker.ts`). `src/lib/db.ts` exports a `postgres()` singleton; `src/lib/redis.ts` exports an `ioredis` `connection` with `maxRetriesPerRequest: null` (BullMQ requirement); `src/lib/env.ts` zod-validates required keys at startup and fails fast.

---

## 6. Definition of Done (Phase 0 acceptance gate)

The agent must self-verify ALL of the following and report results. Phase 0 is not complete until every check passes:

1. `docker compose up --build` brings up postgres, redis, web, worker, caddy with **all health checks green**.
2. Migration runner applies `001_init.sql` and **every table in §5.4 exists** — verify with:
   `docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\dt"` (expect 38 tables) and `\dv` (expect `score_history` view).
3. **Extensions present:** `SELECT extname FROM pg_extension;` includes `timescaledb` and `vector`.
4. **Hypertables present:** `SELECT hypertable_name FROM timescaledb_information.hypertables;` returns `stock_prices` and `technical_indicators`.
5. **Vector index present:** `\d filing_chunks` shows the HNSW index on `embedding`.
6. **Health check green:** `GET /api/health` (through Caddy, with basic-auth) returns `200 {status:"ok"}`.
7. **Acceptance feature works:** `POST /api/watchlist {"ticker":"NVDA"}` returns `200`, then `GET /api/watchlist` includes `NVDA` and the seeded ticker. Re-POSTing `NVDA` returns `200` and creates no duplicate (idempotency proof).
8. **Worker online:** worker logs `online; 9 queues registered` and exits cleanly on `SIGTERM`.
9. **Idempotent boot:** stopping and re-running `docker compose up` re-runs migrate+seed with `skip` lines and no errors/dupes.

Report the output of checks 2–4 and 7 verbatim.

---

## 7. Explicitly OUT of scope for Phase 0 (do NOT build — these are later phases)

- Any real data fetching (Stooq/yfinance/EDGAR/FRED) — providers are **stubs that throw**.
- Any indicator math, scoring, valuation, probability, options, or position-sizing logic.
- Any AI/RAG/embedding calls; any report generation.
- Any cron schedules / job handlers with real work (registrations only).
- Any frontend beyond a minimal watchlist read view + the health/watchlist routes.
- App-level login session/JWT (Caddy basic-auth is the Phase-0 gate; JWT is Phase 4).
- Alerts, email, Telegram, portfolio math, journal/thesis logic.

If a task seems to require these, it belongs to Phase 1–5 — leave a `// TODO(phaseN)` and move on.

---

## 8. Handoff note to Phase 1

On completion, the next agent inherits: a migrated schema, a provider registry with ordered-fallback plumbing, a 9-queue BullMQ topology, and `ingestion_runs` ready for observability. Phase 1's first move is to replace the stubs in `src/providers/stubs.ts` with real Stooq→yfinance (prices) and EDGAR (fundamentals/filings) implementations and wire the `daily_prices` + `filings` handlers per the spec's cadence matrix — without touching the schema or the composition invariant.

*End of Phase 0 master prompt.*
