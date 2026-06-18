import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await sql`
    SELECT id, name, type, ticker, condition_json, channel, active, last_fired_at, created_at
    FROM alerts ORDER BY created_at DESC`;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { name, type, ticker, condition, channel } = await req.json();
  if (!type || (channel !== "email" && channel !== "telegram")) {
    return NextResponse.json({ error: "type and a valid channel are required" }, { status: 400 });
  }
  const t = ticker ? String(ticker).toUpperCase().trim() : null;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO alerts (name, type, ticker, condition_json, channel, active)
    VALUES (${name ?? null}, ${type}, ${t}, ${condition ? JSON.stringify(condition) : null}, ${channel}, true)
    RETURNING id`;
  return NextResponse.json({ ok: true, id: row.id });
}
