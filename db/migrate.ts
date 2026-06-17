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
