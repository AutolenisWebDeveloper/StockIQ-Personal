# StockIQ Personal — Phase 0 Foundation Scaffold

A **single-user, personal** stock-research tool. This repository currently
contains the **Phase 0** runnable skeleton: a Next.js app + a BullMQ worker +
Postgres (TimescaleDB + pgvector) + Redis behind a Caddy basic-auth gate, with
the full database schema migrated, stubbed provider interfaces, empty job
registrations, and a green health check — such that one ticker can be added to
a watchlist.

> Phase 0 builds **no business logic**. Providers are stubs that throw; job
> handlers are no-ops; there is no scoring, valuation, AI, or data fetching.
> See `docs/StockIQ-Phase0-Scaffold-Master-Prompt.md` for the authoritative
> Phase 0 spec, and `docs/StockIQ-Personal-Build-Spec.md` for full intent.

## Stack (locked)

| Layer | Choice |
|---|---|
| Frontend + API | Next.js (App Router) + TypeScript + TailwindCSS |
| Worker | Node + TypeScript + BullMQ (separate container, shared codebase) |
| DB | PostgreSQL 16 via `timescale/timescaledb-ha:pg16` (TimescaleDB + pgvector) |
| Vector | pgvector `vector(1536)`, HNSW cosine index |
| Cache/Queue | Redis 7 |
| DB client | `postgres` (postgres.js) — thin typed wrapper, no ORM |
| Migrations | Ordered raw `.sql` + tiny postgres.js runner |
| Reverse proxy / TLS / auth | Caddy 2 (`basic_auth`) |

## Quick start

```bash
cp .env.example .env
# Generate the Caddy basic-auth hash and paste into AUTH_PASSWORD_HASH:
docker run --rm caddy:2 caddy hash-password --plaintext 'your-password'
# Then bring everything up (migrate + seed run idempotently at web boot):
docker compose up --build
```

The app is served behind Caddy (basic-auth) at `https://localhost`.
Health check: `GET /api/health` → `200 {status:"ok"}`.

### Local setup helper

A tiny helper script is included to create a local `.env` from `.env.example` and optionally inject the Caddy and seed password hashes non-interactively.

Usage (from the project root):

```bash
# non-interactive: provide the hashes + user-agent via env vars
AUTH_HASH='$2b$12$4OYczcFymTTenmyBd0n/zu8LYiwxDeE5w2a1EN6.TTJVuJDzrUawK' \
  SEED_HASH='$2b$12$4OYczcFymTTenmyBd0n/zu8LYiwxDeE5w2a1EN6.TTJVuJDzrUawK' \
  SEC_USER_AGENT='StockIQ Personal you@example.com' \
  sh scripts/init-local.sh

# interactive: the script will create .env but won't overwrite existing values
sh scripts/init-local.sh
```

The script only writes to `.env` and never commits secrets. After creating `.env` run the Docker commands in the Quick start to build, migrate and seed the database.

### Acceptance feature

```bash
curl -k -u operator:your-password -X POST https://localhost/api/watchlist \
  -H 'content-type: application/json' -d '{"ticker":"NVDA"}'
curl -k -u operator:your-password https://localhost/api/watchlist   # includes NVDA + seeded AAPL
```

Re-POSTing `NVDA` returns `200` and creates no duplicate (idempotent upsert).

## Local development (without Docker)

Requires a reachable Postgres (with TimescaleDB + pgvector) and Redis, and a
`.env` with `DATABASE_URL` / `REDIS_URL` pointing at them.

```bash
npm install
npm run migrate   # applies db/migrations/*.sql (idempotent)
npm run seed      # single user + default watchlist + 1 ticker (idempotent)
npm run dev       # Next.js app on :3000
npm run worker    # BullMQ worker (9 queues, no-op handlers)
```

## Layout

```
db/migrations/001_init.sql   ALL tables, hypertables, vector index (authoritative)
db/migrate.ts                ordered-SQL runner (idempotent, _migrations bookkeeping)
db/seed.ts                   single user + watchlist + 1 ticker
src/lib/                     db / redis singletons, zod env loader
src/providers/               MarketData + Fundamentals contracts, ordered-fallback registry, throwing stubs
src/queue/                   job-name enum + BullMQ Queue handles (registrations only)
src/worker.ts                BullMQ worker bootstrap + graceful shutdown
src/app/                     layout, globals, watchlist view, /api/health, /api/watchlist
```

## Phase 0 Definition of Done

1. `docker compose up --build` → postgres, redis, web, worker, caddy all healthy.
2. Migration applies `001_init.sql`; all schema tables exist (`\dt`) + `score_history` view (`\dv`).
3. Extensions `timescaledb` + `vector` present.
4. Hypertables `stock_prices` + `technical_indicators` present.
5. HNSW index on `filing_chunks.embedding`.
6. `GET /api/health` (through Caddy basic-auth) → `200 {status:"ok"}`.
7. `POST /api/watchlist {"ticker":"NVDA"}` → `200`; `GET` includes NVDA + seed; re-POST is idempotent.
8. Worker logs `online; 9 queues registered`; exits cleanly on `SIGTERM`.
9. Re-running `docker compose up` re-runs migrate+seed with `skip` lines, no dupes.

## Handoff to Phase 1

Phase 1 replaces the throwing stubs in `src/providers/stubs.ts` with real
Stooq→yfinance (prices) and EDGAR (fundamentals/filings) implementations and
wires the `daily_prices` + `filings` handlers per the spec's cadence matrix —
without touching the schema or the composition invariant (engines compute every
number; the LLM only narrates).
