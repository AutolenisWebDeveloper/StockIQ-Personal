import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await sql`
    SELECT id, ticker, thesis_statement, key_assumptions_json, risks_json, target_price,
           target_horizon, status, created_at, last_reviewed
    FROM thesis_tracker ORDER BY created_at DESC LIMIT 100`;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const b = await req.json();
  const t = b.ticker ? String(b.ticker).toUpperCase().trim() : null;
  if (!t || !b.thesis_statement) {
    return NextResponse.json({ error: "ticker and thesis_statement required" }, { status: 400 });
  }
  await sql`INSERT INTO stocks (ticker) VALUES (${t}) ON CONFLICT (ticker) DO NOTHING`;
  // key_assumptions: array of strings → [{assumption, validation_status:'holding'}]
  const assumptions = Array.isArray(b.assumptions)
    ? b.assumptions.filter(Boolean).map((a: string) => ({ assumption: a, validation_status: "holding", last_checked: null, evidence: null }))
    : [];
  await sql`
    INSERT INTO thesis_tracker
      (ticker, thesis_statement, key_assumptions_json, risks_json, target_price, target_horizon, status)
    VALUES (${t}, ${b.thesis_statement}, ${JSON.stringify(assumptions)},
            ${b.risks ? JSON.stringify(b.risks) : null}, ${b.target_price ?? null},
            ${b.target_horizon ?? null}, ${"active"})`;
  return NextResponse.json({ ok: true });
}
