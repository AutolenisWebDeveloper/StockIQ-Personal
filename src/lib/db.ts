import postgres from "postgres";

// postgres.js singleton. Reuse across Next.js hot reloads in dev so we do not
// exhaust connections; create one pool per process in production.
//
// Managed Postgres (Neon) requires TLS. Use the DIRECT (unpooled) endpoint for
// long-lived servers — DDL + prepared statements break on the pooled endpoint,
// so when a `-pooler` host is detected we disable prepared statements.
const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

const url = process.env.DATABASE_URL ?? "";
const needsSsl = /sslmode=require/.test(url) || /\.neon\.tech/.test(url);
const isPooled = /-pooler\./.test(url);

export const sql =
  globalForDb.sql ??
  postgres(url, {
    max: 10,
    ...(needsSsl ? { ssl: "require" as const } : {}),
    ...(isPooled ? { prepare: false } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
