import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await sql`
    SELECT id, ticker, action, decision_date, price_at_decision, conviction_at_decision,
           thesis_snapshot, rationale, conviction_level, lessons_learned, outcome_return_vs_spy
    FROM investment_journal ORDER BY decision_date DESC NULLS LAST, id DESC LIMIT 100`;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const b = await req.json();
  const t = b.ticker ? String(b.ticker).toUpperCase().trim() : null;
  if (!t || !b.action || !b.decision_date) {
    return NextResponse.json({ error: "ticker, action, decision_date required" }, { status: 400 });
  }
  await sql`INSERT INTO stocks (ticker) VALUES (${t}) ON CONFLICT (ticker) DO NOTHING`;
  await sql`
    INSERT INTO investment_journal
      (ticker, action, decision_date, price_at_decision, conviction_at_decision,
       thesis_snapshot, rationale, conviction_level, lessons_learned)
    VALUES (${t}, ${b.action}, ${b.decision_date}, ${b.price_at_decision ?? null},
            ${b.conviction_at_decision ?? null}, ${b.thesis_snapshot ?? null}, ${b.rationale ?? null},
            ${b.conviction_level ?? null}, ${b.lessons_learned ?? null})`;
  return NextResponse.json({ ok: true });
}
