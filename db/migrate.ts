import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

// Fail fast (and legibly) if we're pointed at a Postgres that lacks the locked
// stack's required extensions. Without this, the migration dies mid-DDL with a
// cryptic "extension timescaledb is not available" control-file error.
async function preflight() {
  const required = ["timescaledb", "vector"];
  const available = await sql<{ name: string }[]>`
    SELECT name FROM pg_available_extensions WHERE name = ANY(${sql.array(required)})`;
  const have = new Set(available.map((r) => r.name));
  const missing = required.filter((n) => !have.has(n));
  if (missing.length) {
    console.error(
      `\n[migrate] Connected Postgres is missing required extension(s): ${missing.join(", ")}.\n` +
        `StockIQ's locked stack requires the 'timescale/timescaledb-ha:pg16' image, which bundles\n` +
        `TimescaleDB + pgvector. You appear to be connected to a plain/managed Postgres instead.\n` +
        `Fix: point DATABASE_URL at the compose 'postgres' service (run 'docker compose up', or\n` +
        `'docker compose exec web npm run migrate'), then re-run.\n`
    );
    await sql.end();
    process.exit(1);
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
