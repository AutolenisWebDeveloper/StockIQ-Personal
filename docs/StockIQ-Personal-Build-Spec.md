# StockIQ Personal — Build Specification

**Type:** Internal, single-user investment research tool (personal use only)
**Status:** Build-ready (v1.3). All open architectural and methodology decisions are resolved below.
**Audience:** Coding agent (autonomous build) + operator.
**Companion artifact:** `decision-report-template.md` — the flagship per-ticker Decision Report schema + generation prompt (see §7.5).
**v1.1 changes:** Merged two high-value modules from the alternate personal-use direction — **Investment Journal** and **Thesis Tracker with Automated Thesis Monitoring** — reweighted the Conviction Score toward fundamentals/earnings (news removed from the composite), and formalized the **Opportunity Engine** signal taxonomy.
**v1.2 changes:** Replaced the paid FMP data stack with a **free stack** (SEC EDGAR + Stooq + yfinance + FRED; Alpha Vantage supplementary). Indicators computed locally; analyst data via self-diffed consensus snapshots; earnings analysis sourced from EDGAR 8-K/MD&A instead of transcripts; explicit EOD (non-real-time) architecture; provider-fallback reliability layer made mandatory.
**v1.3 changes:** Integrated the **Decision Report** (personal buy/sell/trade decision) as the flagship output — built on a *composition principle* (deterministic engines compute every number; the LLM only narrates). Added the supporting engines: **valuation, technical-levels, expected-move, earnings-event probability, options/short-interest (yfinance), and a position-sizing calculator** for the "$100k today" allocation.

---

## 0. Scope Decision (read first)

This is a **personal tool for one user (you).** It is not a product, not multi-tenant, not sold, and not published. That single fact removes a large amount of work the original vision document implied. Build the following understanding into every decision:

**Explicitly OUT of scope — do not build:**
- Investment-adviser / RIA compliance, disclaimers, Terms of Service, Privacy Policy (no third parties, no advice-for-compensation).
- Public marketing module: Landing, Pricing, Features, About, Contact pages.
- Registration, multi-user auth, password-reset flows, email verification.
- Subscriptions, billing, Stripe, the `subscriptions` table, Pro/Premium tiers, feature-gating/entitlements.
- Multi-tenancy, Row-Level Security, SOC 2, GDPR/CCPA tooling.
- Data **redistribution** concerns (you consume data; you never republish it).
- Human-in-the-loop content review workflows, enterprise eval harnesses.

**Core simplification — the universe is your watchlist, not the market.**
The original spec implied processing all US equities (~6,000 tickers), which drives cost and compute to absurd levels. For personal use, the **active universe = tickers on your watchlist(s) + any ticker you open on-demand.** Target 100–300 tracked tickers. Full ingestion runs only against this set. On-demand lookup of an untracked ticker triggers a just-in-time fetch + score. This cuts data cost, LLM cost, and job volume by 1–2 orders of magnitude.

**Single-user auth:** One account. Either (a) a single hard-coded credential behind HTTP basic auth at the reverse proxy, or (b) one row in a `users` table with a password hash and a single JWT session. Recommendation: **(b)** for clean session handling, but no registration UI — seed the account via a CLI/env at deploy time.

---

## 1. Target Architecture

Lean into the operator's existing stack familiarity (Next.js + PostgreSQL + Vercel/Resend) while right-sizing for a single user.

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + TailwindCSS | Familiar; SSR for fast detail pages |
| Backend API | Next.js Route Handlers (API routes) | One user → no need for a separate NestJS service; collapse it in |
| Worker | Node worker process (BullMQ) **or** Python worker | Heavy data/AI jobs run off the request path |
| Primary DB | PostgreSQL 16 + **TimescaleDB** extension | TimescaleDB hypertables for `stock_prices` / `technical_indicators` |
| Vector store | **pgvector** extension (same Postgres) | Filing RAG without a second datastore |
| Cache / Queue | Redis 7 (BullMQ + cache) | Repeatable cron jobs, response caching |
| AI | Anthropic (Claude) primary + OpenAI (embeddings/fallback) | Claude for reasoning/reports; OpenAI `text-embedding-3-small` for vectors |
| Email/Alerts | **Resend** | Operator already runs Resend; reuse |
| Deploy | **Docker Compose on one small VPS** (4 vCPU / 8 GB) | Cheapest, simplest for single-user; Postgres+Redis+web+worker in one compose file |

**Why not NestJS + separate service:** With one user there is no scaling pressure. A monolithic Next.js app + one BullMQ worker container is dramatically less to operate. Keep the worker as a separate process (not separate service) so long jobs never block the UI.

**Deployment topology (docker-compose):** `web` (Next.js), `worker` (BullMQ), `postgres` (with timescaledb + pgvector), `redis`, `caddy` (reverse proxy + TLS + basic-auth gate). Nightly `pg_dump` to object storage (Backblaze B2 / S3) for backups.

---

## 2. Data Sourcing — Free Stack (v1.2)

Decision: power v1 entirely on free / near-free sources. **Accepted tradeoffs:** no firm-attributed analyst events, no professional earnings transcripts, no real-time exchange data. None of these is required for an EOD personal research-priority tool.

**Critical role assignment** (the trap to avoid): Alpha Vantage's free tier (~25 requests/day) **cannot** sit in any per-ticker loop — it is supplementary only. The real backbone is **EDGAR + Stooq + locally-computed indicators**, with **yfinance** as the opportunistic fill. All unofficial sources sit behind a provider interface with ordered fallback because they break without notice.

| Source | Role | Reliability | Key constraint |
|---|---|---|---|
| **SEC EDGAR** | Backbone: filings (10-K/Q, DEF 14A), insider (Form 4), institutional (13F), XBRL actuals, **8-K = material-event spine** | High (official) | 10 req/s; descriptive `User-Agent` required |
| **Stooq** | **Primary** daily / historical OHLCV (bulk CSV endpoints) | Good (unofficial, stable) | EOD; CSV; no SLA |
| **yfinance** | Secondary prices/quotes; **consensus rating + mean/high/low price target**; forward estimates; earnings dates; profiles | Medium (unofficial, breaks on Yahoo backend changes) | Throttled → must wrap in fallback + cache |
| **FRED** | Macro / regime layer: rates, CPI, unemployment, GDP, Treasury yields | High (official) | Free API key |
| **Alpha Vantage** | Supplementary only (occasional ad-hoc lookups) | Medium | **~25 req/day free → never in a loop** |
| **Yahoo (web)** | Last-resort validation | Low | Unofficial |

**Backbone assignments:**
- **Prices / history** → Stooq primary, yfinance fallback.
- **Technical indicators** → **computed locally** from OHLCV (RSI/MACD/ATR/Bollinger/MAs/relative strength). No vendor indicator calls → no rate limits, you own the math.
- **Fundamentals / actuals** → EDGAR XBRL primary; yfinance for convenience fields.
- **Earnings actuals + surprise** → EDGAR XBRL + stored estimates; yfinance earnings history opportunistically.
- **Analyst** → yfinance consensus snapshot, **self-diffed over time** (see §5.1) to substitute for firm-attributed upgrades/downgrades.
- **Macro / regime** → FRED.
- **Material news** → EDGAR 8-K spine + yfinance headlines for color (AI-scored sentiment).

**Reliability layer (now mandatory, not optional):** every external call goes through the provider interface with ordered fallback (e.g., Stooq → yfinance for prices), aggressive caching, retries, and a **"serve last-good data with an explicit as-of timestamp"** policy. A broken yfinance must degrade gracefully and never crash ingestion. `ingestion_runs` tracks per-source health.

**Irreducible gap + optional plug:** the one thing the free stack cannot cleanly supply is *event-level, firm-attributed* analyst actions ("Goldman upgraded, raised PT to $X on [date]"). Consensus + self-diffed trend covers ~80% of that value. If it later proves it matters, the cheapest single plug is **Finnhub's free tier** (recommendation trends) added behind the provider interface — *before* paying for FMP/Benzinga.

**Decision:** Build v1 on **EDGAR + Stooq + yfinance + FRED** (Alpha Vantage supplementary). Keep the provider interface below so any source is a 1-file swap.

**Provider interface contract (illustrative):**
```ts
interface MarketDataProvider {
  getDailyOHLCV(ticker: string, from: Date, to: Date): Promise<OHLCV[]>;
  getQuote(ticker: string): Promise<Quote>;
}
interface FundamentalsProvider {
  getIncomeStatements(ticker: string, limit: number): Promise<IncomeStatement[]>;
  getAnalystEstimates(ticker: string): Promise<Estimate[]>;
  getPriceTargets(ticker: string): Promise<PriceTarget[]>;
  getTranscripts(ticker: string, limit: number): Promise<Transcript[]>;
}
```

---

## 3. Data Model

Drop SaaS tables. Keep the analytical core. Add tables that close the original spec's gaps: corporate actions, ingestion tracking (idempotency/freshness), point-in-time score history (for honest backtests), and filing vector chunks.

**Identity / control**
- `users` — single row (id, email, password_hash, created_at). No registration flow.
- `watchlists` (id, name) / `watchlist_items` (watchlist_id, ticker, added_at). **Drives the active universe.**

**Reference**
- `stocks` (ticker PK, name, sector, industry, exchange, cik, beta, market_cap, is_active, first_seen, last_refreshed) — 52-week high/low and average volume are **derived** from `stock_prices` (not stored redundantly)
- `corporate_actions` (ticker, type [split|dividend|ticker_change|delisting|merger], ex_date, ratio, details_json) — **new; required for price accuracy**

**Time-series (TimescaleDB hypertables)**
- `stock_prices` (ticker, ts, open, high, low, close, adj_close, volume) — hypertable on `ts`
- `technical_indicators` (ticker, ts, rsi14, macd, macd_signal, atr14, bb_upper, bb_lower, ma20, ma50, ma200, rel_strength) — hypertable

**Fundamentals / earnings**
- `financials` (ticker, period_end, period_type [Q|FY], revenue, operating_income, net_income, eps, fcf, gross_margin, op_margin, total_debt, cash, roic, source_filing_id)
- `earnings` (ticker, period_end, eps_actual, eps_estimate, revenue_actual, revenue_estimate, surprise_pct, report_date, guidance_json)
- `earnings_estimates` (ticker, period_end, eps_estimate, revenue_estimate, num_analysts, estimate_ts) — store revisions over time

**Analyst**
- `analyst_consensus_snapshots` (ticker, ts, consensus_rating, num_analysts, target_mean, target_high, target_low) — **free-stack primary** (yfinance, snapshotted daily); the self-diff of this series drives the Analyst sub-score and the "consensus improved/deteriorated" Opportunity signal
- `analysts` (id, name, firm) — **optional/deferred** (needs Finnhub/paid feed for firm attribution)
- `analyst_ratings` (id, ticker, analyst_id, rating, action [initiate|upgrade|downgrade|maintain], rating_date) — optional/deferred
- `price_targets` (id, ticker, analyst_id, target, prior_target, target_date) — optional/deferred
- `analyst_performance` (analyst_id, ticker, rating_date, forward_return_3m, forward_return_6m, forward_return_12m, hit [bool]) — **self-computed; deferred until firm-attributed feed exists**

**Ownership**
- `insider_transactions` (id, ticker, insider_name, role, txn_type [buy|sell], shares, price, value, txn_date, filing_id) — from Form 4
- `institutional_holdings` (id, ticker, holder_name, shares, value, change_shares, change_pct, report_period) — from 13F (45-day lag)

**Filings + AI**
- `sec_filings` (id, ticker, cik, form_type, filed_at, accession_no, url, processed [bool])
- `filing_chunks` (id, filing_id, chunk_index, text, embedding vector(1536)) — **pgvector; RAG**
- `ai_reports` (id, ticker, report_type [exec_summary|filing_diff|earnings|risk|deep], model, content_md, sources_json, generated_at)
- `news_articles` (id, ticker, title, url, body, published_at, source)
- `news_sentiment` (article_id, score [-1..1], label [bullish|neutral|bearish], rationale, model)

**Scoring**
- `conviction_scores` (ticker, ts, fundamental_score, earnings_score, analyst_score, institutional_score, insider_score, technical_score, news_signal, composite, band, weights_json) — **append-only, point-in-time.** `news_signal` is stored for reference but is **not** part of the composite (see §5.2).
- `score_history` — same as above but never overwritten (for backtesting). Treat `conviction_scores` as append-only and you get this for free.
- `probability_models` (ticker, ts, horizon [3m|6m|12m], bull_prob, base_prob, bear_prob, method, features_json)
- `opportunity_signals` (id, ticker, type, polarity [positive|negative], strength, detected_at, source) — **new; change/momentum detection feeding the Opportunity Engine (§5.5)**

**Decision-report engines (v1.3 — feed the flagship report, §7.5)**
- `valuations` (ticker, ts, fwd_pe, ttm_pe, peg, ps, ev_ebitda, fcf_yield, hist_pe_pctile, peer_pe, bull_target, base_target, bear_target, scenario_probs_json, prob_weighted_fv, verdict [under|fair|over]) — valuation engine output
- `technical_levels` (ticker, ts, trend, support_json, resistance_json, breakout, breakdown, atr14, stop_suggested, entry_zone_json, exit_zone_json, risk_reward, key_level) — actionable levels (beyond raw indicators)
- `options_snapshots` (ticker, ts, put_call_ratio, iv30, iv_rank, expected_move_1w, expected_move_1m, max_pain, top_call_strikes_json, top_put_strikes_json, short_interest, days_to_cover, signal, source [yfinance], confidence) — **unofficial/delayed → Medium-Low confidence; max pain computed, gamma wall not stored (approximation only)**
- `earnings_predictions` (ticker, period_end, p_beat, p_meet, p_miss, p_guide_raise, p_guide_maintain, p_guide_lower, expected_move_earnings, earnings_risk, method, features_json) — earnings-event model output

**Decision journal / thesis (personal-use core — merged from alternate v2 direction)**
- `investment_journal` (id, ticker, action [buy|add|trim|sell|review], decision_date, price_at_decision, conviction_at_decision, thesis_snapshot, rationale, conviction_level [1–5], lessons_learned, outcome_return_vs_spy) — captures **why** at decision time; AI generates a decision-review on closed positions.
- `thesis_tracker` (id, ticker, thesis_statement, key_assumptions_json [array of {assumption, validation_status [holding|at_risk|broken], last_checked, evidence}], risks_json, target_price, target_horizon, status [active|validated|invalidated|exited], created_at, last_reviewed) — assumptions monitored automatically by the AI layer (§7).

**Portfolio / alerts / ops**
- `portfolios` (id, name) / `portfolio_holdings` (portfolio_id, ticker, shares, cost_basis, opened_at)
- `alerts` (id, type, ticker, condition_json, channel [email|telegram], active, last_fired_at)
- `notifications` (id, alert_id, ticker, message, sent_at, channel)
- `ingestion_runs` (id, job_name, ticker, started_at, finished_at, status, rows_written, error) — **new; freshness + idempotency observability**

---

## 4. Ingestion Pipeline

**Cadence matrix (concrete schedules; all jobs scoped to the active universe = watchlist + on-demand):**

| Job | Schedule | Source | Notes |
|---|---|---|---|
| Daily prices (EOD) + technicals | Daily, after US close (~22:00 ET) | **Stooq** primary → yfinance fallback | Indicators **computed locally** from OHLCV |
| Fundamentals refresh | Weekly + event-driven on new 10-K/Q | **EDGAR XBRL** (+ yfinance convenience) | Canonical numbers from XBRL |
| Filings + material events | Hourly | **SEC EDGAR** submissions API | 8-K = material-news spine; detect Form 4 fast |
| Analyst consensus snapshot | Daily | **yfinance** | Snapshot + diff for trend signal (§5.1) |
| Forward estimate snapshot | Daily | **yfinance** | For self-computed revision trend |
| 13F institutional | Weekly check (quarterly data, **45-day lag**) | **SEC 13F** | Diff vs prior period |
| Insider (Form 4) | Hourly with filings poll | **SEC** | Within 2 business days of trade |
| News headlines | Every 2–4 h | **yfinance + EDGAR 8-K** | Then LLM-score sentiment |
| Earnings calendar | Daily | **yfinance** | Flags upcoming reports for alerts |
| Options + short interest | Daily (watchlist) + pre-earnings | **yfinance** `option_chain` | Put/call, IV, expected move, max pain, short interest — **Medium-Low confidence, unofficial/delayed** |
| Macro / regime | Daily | **FRED** | Rates, CPI, yields, unemployment, GDP |
| Conviction recompute | After EOD price + on any new filing/snapshot | internal | Append new row to `conviction_scores` |

**All source calls route through the provider interface with ordered fallback + cache; failures log to `ingestion_runs` and degrade gracefully (serve last-good with as-of timestamp) — never crash the run.**

**Engineering requirements:**
- **Idempotency:** All writes are upserts keyed on natural keys (ticker+ts, accession_no, etc.). Every run logs to `ingestion_runs`.
- **Corporate actions:** Apply splits/dividends to produce `adj_close`. Store raw + adjusted. On a detected split, backfill-adjust history. **This is non-negotiable for correct technicals and returns.**
- **Point-in-time integrity:** Never overwrite scores or estimates — append with timestamps. Required so any backtest avoids look-ahead bias.
- **On-demand fetch:** Opening an untracked ticker enqueues a synchronous-ish "cold fetch" (prices + fundamentals + latest filings + score) with a loading state, then caches it.
- **Failure handling:** BullMQ retries (exponential backoff, max 3), dead-letter logging to `ingestion_runs.status='failed'`, and a simple admin page listing recent failures.

---

## 5. Conviction Scoring Engine (core IP — fully specified)

> **Framing (adopted from v2):** The Conviction Score is a **research-priority score — what deserves your attention — not a buy signal and not advice.** It ranks where to spend research time. Treat it as triage, not a trade trigger.

Each sub-score is **0–100, computed as a sector-relative percentile** of its underlying features (so a bank is compared to banks, not to SaaS). Raw feature → winsorize at 5th/95th pct → percentile-rank within sector cohort → 0–100. Where a sector cohort is too thin (<8 names in your universe), fall back to absolute thresholds defined per feature.

### 5.1 Sub-scores

**Fundamental Score (25%)** — features (equal-weighted percentile, then averaged):
- Revenue growth YoY, EPS growth YoY, FCF margin, gross-margin trend (Δ over 4q), operating-margin trend, ROIC, inverse net-debt/EBITDA (lower leverage = higher score).

**Earnings Score (25%):**
- EPS beat rate (last 8 quarters, EDGAR XBRL actuals vs stored estimates), average surprise magnitude, revenue beat rate, **estimate-revision trend** (net up vs down, trailing 90d), guidance direction (raise/maintain/cut). *Free-stack sourcing:* revision trend is **self-computed** by snapshotting yfinance forward estimates daily and diffing (flagged best-effort, since the source is unofficial — so it never silently dominates the weight); guidance is **AI-parsed from the EDGAR 8-K earnings exhibit / 10-Q MD&A.** Revision trend remains the most predictive feature when available.

**Analyst Score (15%):**
- *Free-stack inputs:* consensus rating (yfinance) mapped to 0–100, **consensus-trend delta** (self-computed by snapshotting consensus daily and diffing — substitutes for the firm-attributed upgrades/downgrades the free stack can't supply), price-target implied upside vs current price (yfinance mean target), target dispersion (high/low spread; tighter = more conviction). Firm-level `analysts` attribution and `analyst_performance` accuracy are **optional/deferred** (require Finnhub free tier or a paid feed).

**Institutional Score (15%):**
- Net change in shares held by major holders QoQ, ratio of holders increasing vs decreasing positions, new initiations by notable funds. **Flag the 45-day lag in the UI.**

**Insider Score (10%):**
- Net insider buy/sell value trailing 6–12 mo, **role-weighted** (CEO/CFO buys ×3, director ×1.5, other ×1), cluster-buying bonus (≥3 insiders buying within 30d). Sells are weighted lightly (insiders sell for many non-signal reasons).

**Technical Score (10%):**
- Price vs MA50/MA200 (uptrend stack), RSI regime (penalize >75 overbought and <30 only if no reversal), MACD posture, **relative strength vs sector + SPY**, ATR-normalized trend slope. Acts as a regime/timing filter, not a fundamental driver.

**News Signal (not in composite):**
- Recency-weighted mean of LLM sentiment over trailing 14d (decay: weight = 0.5^(days/7)). **Computed and displayed, but excluded from the composite** — news is too reflexive and noisy to be a durable scored component for a long-horizon research-priority score. It lives in the Opportunity Engine (§5.5) and the AI sentiment surface instead.

### 5.2 Composite

```
composite = Σ (sub_score_i × weight_i)
weights = {fundamental:0.25, earnings:0.25, analyst:0.15,
           institutional:0.15, insider:0.10, technical:0.10}
```

**Why this weighting (changed in v1.1):** Fundamentals and earnings are the durable drivers of long-horizon outperformance and now carry half the score; analyst/institutional sentiment is corroborating, not leading; technicals are a light timing filter; **news was removed from the composite** (kept as a signal). This is the v2 direction's instinct, retained with this spec's percentile methodology.

**Missing-data rule:** If a component has no data (e.g., no analyst coverage), drop its weight and **renormalize remaining weights to sum to 1.0.** Record the effective weights in `weights_json`. A no-coverage micro-cap is scored on the components that exist, not penalized to zero.

**Bands:** 0–39 Bearish · 40–59 Neutral · 60–79 Bullish · 80–100 Very Bullish.

**Storage:** Append a row to `conviction_scores` on every recompute. Never mutate.

---

## 5.5 Opportunity Engine (change & momentum signals)

Distinct from the Conviction Score (a *state* snapshot), the Opportunity Engine detects **change** — the signals that flag a stock for fresh research. Formalized from the v2 signal taxonomy.

**Positive signals (research-up):** analyst upgrade or new buy initiation · net EPS estimate revisions up (trailing 90d) · insider cluster buying · institutional accumulation (13F net adds / new initiations) · revenue growth *accelerating* QoQ · EPS growth accelerating · guidance raised.

**Negative signals (thesis-risk):** downgrade · net estimate cuts · insider cluster selling · institutional distribution · revenue growth decelerating · guidance cut.

**Mechanics:** each signal is event-detected during ingestion and written to `opportunity_signals` (ticker, type, polarity, strength, detected_at, source). Signals surface on the Dashboard "Recent Changes" feed and the Opportunity Finder, feed the daily AI digest, and can trigger alerts. The key value: a stock with *rising estimates + insider buying + institutional accumulation* becomes a high-priority research flag **before** its Conviction Score has fully moved — change leads state.

---

## 6. Probability Engine (honest method, not a fabricated number)

The original "Bull 65%" with no model is indefensible — fix it with a real, cold-start-capable method.

**Cold start (Phase 5a, until you have history):** Deterministic mapping from composite + key risk flags to a base-rate prior. E.g., a calibration table: composite 80–100 → bull 0.55 / base 0.30 / bear 0.15, adjusted by ±debt-risk, ±valuation-risk flags. Clearly labeled as a heuristic prior.

**Trained model (Phase 5b, once ≥6–12 mo of PIT history exists):** Train a **calibrated gradient-boosted classifier** (or logistic regression) on your stored point-in-time features predicting `P(stock outperforms SPY over horizon H)`. Output calibrated probabilities (Platt/isotonic). Three horizons: 3m, 6m, 12m. Bull/base/bear derived from predicted return distribution terciles.

**Guardrails (even for personal use):**
- Always display the method (`heuristic` vs `model_v1`) and the feature snapshot in `features_json`.
- Never present a probability as certainty in the UI; show it as a model estimate with the horizon.
- Backtest with strict PIT data; report calibration (reliability curve) and base-rate comparison so you know if the number means anything.

**Earnings-event sub-model (feeds the Decision Report):** beat / meet / miss probabilities from the historical beat rate (base rate) adjusted by estimate-revision trend and consensus dispersion; guidance raise / maintain / lower from guidance history + revision trend; expected post-earnings move from the options straddle (if available) else historical post-earnings realized move. Honest, labeled, confidence-tagged — never an LLM guess. Written to `earnings_predictions`.

---

## 6.5 Deterministic Report Engines (the numbers behind the Decision Report)

These compute **every figure** the Decision Report (§7.5) presents, so price targets, probabilities, and levels are calculated — never LLM-generated.

- **Valuation engine** → forward/trailing P/E, PEG, P/S, EV/EBITDA, FCF yield; vs own history (percentile) and peers; bull/base/bear targets from multiple-based scenarios; probability-weighted fair value; under/fair/over verdict. Writes `valuations`. Confidence: Medium.
- **Technical-levels engine** → support/resistance (swing detection), breakout/breakdown, ATR-based stop, entry/exit zones, risk/reward, key level. Extends the indicator layer into *actionable* levels. Writes `technical_levels`. Confidence: Medium.
- **Expected-move engine** → 1w/1m/3m from the options straddle IV (yfinance) when available, else an ATR/realized-vol proxy. Confidence: Medium (options) / Low (proxy).
- **Options & short-interest** → from yfinance `option_chain`: put/call ratio, IV, IV rank, largest strikes, max pain, short interest, days-to-cover. Writes `options_snapshots`. **Unofficial/delayed → Medium-Low; gamma wall and whisper numbers are Unavailable.**
- **Position-sizing calculator** → conviction-band base size × fixed-fractional risk cap (entry-to-stop), earnings overlay, concentration guardrail (≤ ~15–20% one name). Produces the "$100k today" allocation. Full method in `decision-report-template.md` §6.

---

## 7. AI Intelligence Layer (grounded)

All AI outputs must be **retrieval-grounded and cited** so you can verify before acting on money.

**RAG over filings:**
1. On new filing, chunk (≈800 tokens, 100 overlap), embed (`text-embedding-3-small`), store in `filing_chunks`.
2. For any AI report, retrieve top-k relevant chunks + structured data (financials, ratings) and pass as context.
3. Require the model to cite chunk/source IDs; persist them in `ai_reports.sources_json`. Surface citations in the UI.

**Report types:**
- **Executive Summary** — what happened / why it matters / bull case / bear case / most likely outcome. Grounded in latest filing + earnings + news.
- **Filing Diff** ("what changed") — compare current 10-Q/10-K against the prior period's chunks; surface new risk factors, changed language, guidance shifts. This is the highest-value AI feature and was only implied in the original doc.
- **Earnings Explainer** — beat/miss attribution vs estimates and prior quarter, sourced from the **EDGAR 8-K earnings exhibit + 10-Q MD&A** (free, reliable) rather than call transcripts; guidance parsed from the 8-K press-release exhibit. Transcripts are optional manual-paste if you want call color.
- **Risk Extraction** — valuation / debt / regulatory / competitive / execution, each with a source citation.
- **Automated Thesis Monitoring** *(merged v2 + this spec's RAG = the standout personal feature)* — for any ticker with an active `thesis_tracker` entry, on each new filing / earnings / material news the AI evaluates every stated assumption against the new evidence and updates its `validation_status` (holding / at_risk / broken) with a **cited rationale**. Any assumption moving to at_risk or broken triggers an alert. This turns the grounded RAG layer into a watchdog for your own theses — directly answering "Am I still right?"
- **Journal Decision-Review** — on a closed `investment_journal` position, the AI compares the entry thesis snapshot against what actually happened (return vs SPY, which assumptions held/broke) and drafts a "what this trade taught me" note for `lessons_learned`.
- **Decision Report (flagship)** — the full personal buy/sell/trade decision report (dashboard + short-term + long-term + earnings setup + options/institutional + valuation + risk + action plan + "$100k today"). Composes all engines per the **composition principle**; fully specified in §7.5 and `decision-report-template.md`.

**Cost & quality controls:**
- Run AI **only on watchlist + on-demand**, **incrementally** (only new/changed filings), and **cache** in `ai_reports`.
- Tiered models: cheaper model for bulk sentiment and routine summaries; frontier model (Claude) for deep reports and filing diffs.
- **Prompt-injection defense:** filing/news text is untrusted data — wrap it in clearly delimited data blocks, instruct the model to treat it as content-to-analyze not instructions, and never let retrieved text alter system behavior.
- **Verification by design:** because every claim is cited to a source chunk, you can spot-check rather than trust blindly. No enterprise eval harness required at this scale.

---

## 7.5 Decision Report (flagship output)

The headline deliverable: the per-ticker report that tells you what to **do** — buy / hold / sell / wait / reduce, short-term trade vs long-term invest, likely earnings direction, key price levels, what could lose you money, and the smartest move today. It is the headline tab of Stock Detail and the standalone "AI Research Report" page.

**Composition principle (architectural invariant):** the deterministic engines — §5 conviction, §6 probability + earnings-event, §6.5 valuation/levels/expected-move/options/position-sizing — compute **every number**. The LLM composes the dashboard and the plain-English recommendation *around those injected values*, and adds only qualitative judgment (catalysts, competitive position, management) grounded in **cited** filings. The model never fabricates a figure. This is what makes a report you can risk real money on rather than confident-sounding noise.

**Truth discipline:** every number carries Source · Date · Confidence (High/Medium/Low/Unavailable); unverifiable fields render `UNAVAILABLE — not verified from accessible sources.` Verified facts, analyst estimates, company guidance, assumptions, and personal analysis are visually separated.

**Free-stack confidence reality (built into the report):** price/fundamentals/filings/insider = High · valuation/levels/consensus/13F/earnings-date = Medium · options/IV/expected-move/short-interest (yfinance) = Low · whisper numbers / firm-attributed analyst events / gamma wall / real-time = Unavailable.

**Generation:** on-demand frontier-model call; the app assembles a `DETERMINISTIC_INPUTS` payload from the engines + RAG filing chunks, injects them into the template prompt, and caches the result in `ai_reports` (`report_type='decision'`). Regenerated on new earnings/filing or staleness (24 h default; immediately pre-earnings). **Full schema, input contract, prompt, and position-sizing method: `decision-report-template.md`.**

**Position sizing / "$100k today":** the `position_sizing` engine (§6.5) computes suggested $ in / $ cash / timing under a conviction-band base size, a fixed-fractional risk cap (entry-to-stop), an earnings overlay, and a concentration guardrail. The LLM explains the result; it does not choose the size. Labeled personal research, not advice.

---

## 8. Frontend (single-user, watchlist-first)

**Pages to build (everything else from the original 32-page list is cut):**

1. **Login** (single account; no registration).
2. **Dashboard** — your watchlist ranked by conviction, market summary (SPY/QQQ/DIA), today's changes (new filings, rating changes, score moves, upcoming earnings), AI "what changed today" digest.
3. **Stock Detail** — the workhorse, headlined by the **Decision Report (§7.5)**. Tabs: **Decision Report (flagship)**, Overview (conviction breakdown + AI exec summary with citations), Fundamentals, Earnings (history + guidance + beat/meet/miss probabilities), Analysts (consensus + targets + trend), Ownership (insider + institutional, lag flags), Trade Setup (technical levels + options/expected-move, with confidence tags), News (with sentiment), Filings (list + AI diff), Technicals, Risks, Valuation.
4. **Compare** — N tickers side-by-side across sub-scores and key fundamentals.
5. **Screener** — filter your universe by score band, sub-scores, growth, valuation, technicals, insider buying.
6. **Opportunity Finder** — AI surfaces watchlist names with improving scores / positive revision trends / cluster insider buying.
7. **Portfolio** — holdings, performance vs SPY, portfolio-level conviction, concentration/sector exposure.
8. **Investment Journal** *(v2 merge)* — log buy/add/trim/sell/review decisions with a thesis snapshot + rationale + conviction-at-decision; AI decision-review on closed positions. This is how the tool compounds *your* skill over time, not just the stocks'.
9. **Thesis Tracker** *(v2 merge)* — per-holding thesis with assumptions shown in live validation status (holding / at-risk / broken), risks, and target. Auto-updated by §7 Automated Thesis Monitoring; broken assumptions surface here and in alerts.
10. **Alerts** — manage alert rules.
11. **Settings** — API-key/connection status, watchlist management, alert + model preferences.
12. **Admin/Ops** (private) — `ingestion_runs` status, failed jobs, manual re-fetch trigger.

**UX requirements:** Every data point shows an **"as of" timestamp.** Empty states for thin/no-coverage tickers. Conviction breakdown shows the effective (renormalized) weights when components are missing.

---

## 9. Alerts & Delivery

**Channels:** Resend (email) primary; optional Telegram bot for push. (`notifications` table logs every send.)

**Alert types + triggers:**
- Conviction band change (e.g., crosses into Bullish/Very Bullish).
- New analyst upgrade/downgrade or price-target revision > X%.
- Insider cluster buy detected.
- New 8-K / 10-K / 10-Q filed (with AI one-line summary in the alert).
- Earnings within N days.
- Technical trigger (e.g., price crosses MA200, RSI extremes).

Alert evaluation runs on each conviction recompute and on new filing/rating events.

---

## 10. Observability & Ops (right-sized)

- **Structured logging** (pino) + error capture to console/file; optional Sentry free tier.
- **`ingestion_runs` dashboard** is your data-health monitor — last success per job, row counts, failures.
- **Backups:** nightly `pg_dump` → Backblaze B2 / S3, 14-day retention.
- **Secrets:** `.env` injected via Docker; never commit. Keys: `FRED_API_KEY`, `ALPHAVANTAGE_API_KEY` (optional/supplementary), `FINNHUB_API_KEY` (optional, future analyst plug), `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `SEC_USER_AGENT`, `DATABASE_URL`, `REDIS_URL`, `AUTH_PASSWORD_HASH`, `TELEGRAM_BOT_TOKEN` (optional). (No FMP/Polygon keys — free stack.)
- **Rate-limit handling:** central per-provider limiter with backoff — **SEC 10 req/s**, **Alpha Vantage ~25/day (keep out of loops)**, yfinance/Stooq throttle-and-cache. Ordered fallback on failure.

---

## 11. Build Phases (sequenced for an autonomous agent)

**Phase 0 — Foundation**
- Docker Compose (postgres+timescale+pgvector, redis, web, worker, caddy). Migrations for all tables. Seed single user. Provider interfaces stubbed. **Acceptance:** app boots, DB migrated, health check green, one ticker can be added to a watchlist.

**Phase 1 — Ingestion (watchlist-scoped)**
- EOD prices (Stooq→yfinance) + locally-computed technicals, fundamentals (EDGAR XBRL), SEC filings poll (8-K/Form 4/13F), analyst consensus snapshots (yfinance), macro (FRED), news headlines. Corporate-action adjustment. Provider-fallback + caching. `ingestion_runs` logging. **Acceptance:** for a watchlist of 5 tickers, all tables populate on schedule; re-running a job is idempotent; a split is correctly adjusted; **killing yfinance mid-run degrades gracefully (last-good served, run logged, no crash).**

**Phase 2 — Scoring Engine + Opportunity signals + valuation/levels**
- Sub-scores with sector-relative percentiles, missing-data renormalization, fundamentals-weighted composite + bands, append-only `conviction_scores`. **Opportunity Engine** signal detection writing `opportunity_signals`. **Valuation + technical-levels engines** (§6.5) writing `valuations` and `technical_levels`. **Acceptance:** scores compute for all watchlist tickers; a no-coverage ticker scores on remaining components with renormalized weights recorded; signals detected and queryable; valuation verdict + support/resistance/stop levels computed.

**Phase 3 — AI Layer (RAG) + Thesis Monitoring + Decision Report**
- Filing chunking/embedding, retrieval, exec summary, filing diff, earnings explainer, risk extraction, news sentiment — all cited. **Automated Thesis Monitoring**; Journal decision-review. **Decision Report (§7.5):** options/expected-move ingestion (yfinance), `DETERMINISTIC_INPUTS` assembly, template-prompt generation, caching in `ai_reports`. Cost controls + caching. **Acceptance:** opening a stock shows a grounded AI summary with working citations; filing diff surfaces real changes; a contradicting filing flips a thesis assumption to at_risk/broken with a cited reason; **the Decision Report renders the full dashboard with every number traceable to an engine input and any missing feed shown as `UNAVAILABLE`.**

**Phase 4 — Frontend**
- Dashboard, Stock Detail (all tabs incl. **Decision Report** + Trade Setup), Compare, Screener, Opportunity Finder, **Investment Journal, Thesis Tracker**, Settings, Admin/Ops. "As of" timestamps everywhere. **Acceptance:** full research + decision + journaling + thesis-tracking workflow usable end-to-end on the watchlist.

**Phase 5 — Probability, earnings-event, position sizing, Alerts, Portfolio**
- 5a: heuristic probability prior + earnings-event base-rate model + **position-sizing calculator** ("$100k today"). 5b: trained calibrated classifier once history exists, with backtest + calibration report. Alerts engine + Resend/Telegram delivery. Portfolio tracking + portfolio-level conviction/risk. **Acceptance:** alerts fire and deliver; probability + earnings-event outputs show method + confidence; position-sizing produces $-in/cash/timing with the risk cap honored; portfolio performance computes vs SPY.

---

## 12. Decisions Log (swap-points)

| Decision | Chosen | Swap if… |
|---|---|---|
| Universe | Watchlist + on-demand | You later want full-market screening (then add a nightly bulk tier and budget for it) |
| Conviction weighting | Fundamentals/earnings-led (25/25), news excluded | You shift to shorter horizons → raise technical/news weight |
| Probability Engine | Heuristic → trained classifier (Phase 5, optional) | The v2 direction cut it entirely — a defensible choice; keep deferred if it never earns trust |
| Search | Postgres FTS to start | Heavier fuzzy/typeahead needs → add Typesense (v2's choice) |
| Options data | yfinance `option_chain` (Medium-Low confidence) | Need reliable options/IV/greeks → paid (ORATS / CBOE / Polygon options) |
| Decision Report numbers | Computed by deterministic engines; LLM composes/narrates only | **Architectural invariant — do not let the model invent figures** |
| Data stack | Free: **EDGAR + Stooq + yfinance + FRED** (Alpha Vantage supplementary) | Analyst events matter → add **Finnhub free tier**, then FMP/Benzinga only if still needed |
| Prices / indicators | Stooq primary, yfinance fallback; indicators **computed locally** | Need intraday/real-time → licensed exchange feed (out of scope for personal EOD use) |
| Compute topology | Single VPS + Docker Compose | Reliability needs → managed Postgres (Neon/Supabase) + Vercel + worker host |
| Time-series store | TimescaleDB | If you stay tiny, plain Postgres tables also fine |

---

## 13. Cost Envelope (single user, indicative monthly)

- Data: **$0** — EDGAR, Stooq, FRED, yfinance, Alpha Vantage are all free (FRED/AV keys free).
- LLM (watchlist-scoped, incremental, cached): ~$10–40 — **now the dominant cost.** A full **Decision Report** is a frontier-model call (~$0.10–0.50 each); cache aggressively and regenerate only on new earnings/filing or staleness.
- VPS: ~$20–40 (or **$0** if run locally on your own machine).
- Resend / backups: ~$0–10.
- **Total: roughly $30–90/month** (LLM + VPS), or near-$0 infra if self-run locally. Optional later: Finnhub free tier ($0) for analyst events; a paid data feed only if the analyst gap bites.

---

*End of specification. This document is decision-complete: an agent can build Phases 0–5 without further architectural input. The only inputs required at build time are API keys and your initial watchlist.*
