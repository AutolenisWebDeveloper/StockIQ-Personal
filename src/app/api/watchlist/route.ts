import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getQueue } from "@/queue/queues";
import { Job } from "@/queue/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  // Kick a cold fetch so a freshly-added ticker populates without waiting for EOD.
  await getQueue(Job.ColdFetch).add(Job.ColdFetch, { ticker: t });
  return NextResponse.json({ ok: true, ticker: t });
}
