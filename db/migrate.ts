import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

// Preflight. pgvector is REQUIRED (used by filing_chunks.embedding). TimescaleDB
// is OPTIONAL: the locked Docker stack ships it and the schema upgrades the
// time-series tables to hypertables, but managed Postgres (e.g. Neon) lacks it
// and falls back to plain tables. We hard-fail only on a missing 'vector' so the
// migration never dies mid-DDL with a cryptic control-file error.
async function preflight() {
  const available = await sql<{ name: string }[]>`
    SELECT name FROM pg_available_extensions WHERE name = ANY(${sql.array(["timescaledb", "vector"])})`;
  const have = new Set(available.map((r) => r.name));

  if (!have.has("vector")) {
    console.error(
      `\n[migrate] Connected Postgres is missing the required 'vector' (pgvector) extension.\n` +
        `StockIQ stores filing embeddings in a vector(1536) column, so pgvector is mandatory.\n` +
        `Fix: use a Postgres with pgvector — the locked 'timescale/timescaledb-ha:pg16' image,\n` +
        `or a managed provider that offers it (Neon: 'CREATE EXTENSION vector;').\n`
    );
    await sql.end();
    process.exit(1);
  }

  if (!have.has("timescaledb")) {
    console.warn(
      `[migrate] timescaledb not available — proceeding with plain (non-hypertable) ` +
        `time-series tables. This is expected on Neon/managed Postgres.`
    );
  }
}

async function main() {
  await preflight();
  await sql`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const done = await sql`SELECT 1 FROM _migrations WHERE name = ${f}`;
    if (done.length) {
      console.log(`skip ${f}`);
      continue;
    }
    const ddl = await readFile(join(dir, f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`INSERT INTO _migrations (name) VALUES (${f})`;
    });
    console.log(`applied ${f}`);
  }
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
