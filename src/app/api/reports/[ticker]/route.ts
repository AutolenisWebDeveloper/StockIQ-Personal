import { NextResponse } from "next/server";
import { getLatestReport } from "@/lib/ai/decision-report";
import { getQueue } from "@/queue/queues";
import { Job } from "@/queue/jobs";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: latest decision report for a ticker.
export async function GET(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const report = await getLatestReport(ticker);
  return NextResponse.json({ ticker: ticker.toUpperCase(), report });
}

// POST: enqueue (re)generation of the decision report. Heavy LLM work runs in
// the worker off the request path.
export async function POST(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().trim();
  await sql`INSERT INTO stocks (ticker) VALUES (${t}) ON CONFLICT (ticker) DO NOTHING`;
  await getQueue(Job.GenerateReport).add(Job.GenerateReport, { tickers: [t] });
  return NextResponse.json({ ok: true, ticker: t, enqueued: "generate-report" });
}
