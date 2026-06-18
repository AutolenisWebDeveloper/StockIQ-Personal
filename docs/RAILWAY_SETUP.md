# StockIQ Personal — Railway Setup (web + worker)

## 1. Connect your repo

Railway Dashboard → New Project → Deploy from GitHub repo → select your StockIQ repo.
Railway creates one service by default — that becomes `web`.

## 2. Create the worker service

Inside the same project:
Settings → New Service → GitHub repo (same repo) → name it `worker`.

Both services share the same codebase; they differ only in their start command.

## 3. Configure each service

### web
Settings → General:
- Build command: `npm ci && npm run build`
- Start command: `npm run start`   (runs `next start`, which binds Railway's `$PORT`)
- Health check path: `/api/health`

### worker
Settings → General:
- Build command: `npm ci && npm run build`
- Start command: `node dist/worker/index.js`
  (or `npx tsx src/worker/index.ts` during dev if you haven't set up a dist build step)
- Health check: leave blank (worker is not HTTP)
- Restart policy: Always (critical — worker must stay up)

## 4. Set environment variables

Railway Dashboard → each service → Variables → Raw Editor → paste from .env.example with real values.

Both `web` and `worker` need the full variable set.
Use Railway's "shared variables" feature to avoid duplicating them:
Project Settings → Shared Variables → add all vars → reference as ${{shared.VAR_NAME}} in each service.

## 5. Critical wiring checks before first deploy

### BullMQ + Upstash
`src/lib/redis.ts` already builds the BullMQ-safe connection: `maxRetriesPerRequest: null`,
and for `rediss://` (Upstash) it auto-enables `tls: {}` + `enableReadyCheck: false`. Just set
`REDIS_URL` to the Upstash **TCP+TLS** endpoint (rediss://), NOT the REST URL.

Without `maxRetriesPerRequest: null` the worker throws on startup:
`Error: maxRetriesPerRequest must be null for BullMQ` — this repo sets it for you.

### Neon direct endpoint
`DATABASE_URL` must be the DIRECT (unpooled) Neon connection string — host format:
`ep-xxx-xxx.us-east-2.aws.neon.tech` (no `-pooler` in the hostname).

`src/lib/db.ts` enables TLS (`ssl: 'require'`) automatically for `sslmode=require` / `*.neon.tech`,
and falls back to `prepare: false` if it ever detects a `-pooler` host. Direct is still correct —
pooled breaks DDL (migrations) on long-lived servers.

### Migrations
The **web service auto-runs migrations on boot** (start command `npm run migrate && npm run start`),
so a fresh deploy creates the schema before serving. Migrations are idempotent (each file is
recorded in `_migrations` and skipped thereafter) and the service runs a single replica, so there's
no race. Mirror this start command in the Railway dashboard (web service → Settings → Start Command)
if it isn't picked up from `railway.toml`.

To run it manually instead (one-off Railway run or local):
`DATABASE_URL=<neon-direct> npm run migrate`.

**Extensions:** `pgvector` is **required** (filing embeddings use `vector(1536)`) — enable it in the
Neon console with `CREATE EXTENSION vector;`. `timescaledb` is **optional**: Neon does not offer it,
and the migration tolerates its absence by keeping `stock_prices` / `technical_indicators` as plain
(non-hypertable) tables. On the locked `timescale/timescaledb-ha:pg16` Docker stack the same migration
auto-upgrades them to hypertables. The preflight hard-fails only on a missing `vector`.

### Auth (deferred)
Caddy's basic-auth gate does not exist on Railway. App-level JWT auth is Phase 4 and is
intentionally NOT included yet — keep the web service private (no public domain / Railway
private networking) until the gate lands, or add it before exposing the URL.

## 6. Deploy order

1. Deploy `web` first — confirm `/api/health` returns 200 (DB + Redis connected)
2. Deploy `worker` — confirm it starts without the BullMQ `maxRetriesPerRequest` error
3. Tail logs on both services for 60 seconds

## 7. Verify worker is alive

The worker logs queue registration on startup. Confirm in Railway → worker → Logs:
```
[worker] online; 10 queues registered
[schedule] registered 9 repeatable jobs
```
(10 queues = the 9 Phase-1 jobs + the Phase-2 `compute` queue.)

If you see the BullMQ error instead, check REDIS_URL is the rediss:// TCP endpoint.

## Stack summary (final)

| Piece          | Provider  | Purpose                          |
|----------------|-----------|----------------------------------|
| Database       | Neon      | Postgres + pgvector + TimescaleDB|
| Redis / Queue  | Upstash   | BullMQ queues + response cache   |
| Web service    | Railway   | Next.js App Router               |
| Worker service | Railway   | BullMQ job processor             |
| Email          | Resend    | Alerts (Phase 5)                 |

Total monthly cost at Phase 1: ~$5–20 (Railway hobby plan + Neon free tier + Upstash free tier).
LLM costs are near-zero until Phase 3.
