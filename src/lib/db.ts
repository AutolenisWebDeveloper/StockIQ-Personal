import postgres from "postgres";

// postgres.js singleton. Reuse across Next.js hot reloads in dev so we do not
// exhaust connections; create one pool per process in production.
const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

export const sql =
  globalForDb.sql ?? postgres(process.env.DATABASE_URL!, { max: 10 });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
