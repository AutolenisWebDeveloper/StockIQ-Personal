import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getQueue } from "@/queue/queues";
import { Job } from "@/queue/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// On-demand cold fetch for an untracked ticker. Enqueues the cold-fetch job
// (prices + fundamentals + latest filings); the worker does the heavy lifting
// off the request path.
export async function POST(req: Request) {
  const { ticker } = await req.json();
  if (!ticker || typeof ticker !== "string") {
    return NextResponse.json({ error: "ticker required" }, { status: 400 });
  }
  const t = ticker.toUpperCase().trim();
  await sql`INSERT INTO stocks (ticker) VALUES (${t}) ON CONFLICT (ticker) DO NOTHING`;
  await getQueue(Job.ColdFetch).add(Job.ColdFetch, { ticker: t });
  return NextResponse.json({ ok: true, ticker: t, enqueued: "cold-fetch" });
}
