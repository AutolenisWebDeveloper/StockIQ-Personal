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
  const watchlistId =
    wl?.id ?? (await sql`SELECT id FROM watchlists ORDER BY id LIMIT 1`)[0].id;
  const ticker = process.env.SEED_TICKER ?? "AAPL";
  await sql`INSERT INTO stocks (ticker) VALUES (${ticker}) ON CONFLICT (ticker) DO NOTHING`;
  await sql`INSERT INTO watchlist_items (watchlist_id, ticker) VALUES (${watchlistId}, ${ticker})
    ON CONFLICT DO NOTHING`;
  console.log(`seeded watchlist ${watchlistId} with ${ticker}`);
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
