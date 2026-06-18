import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getPortfolio } from "@/lib/portfolio/math";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getPortfolio());
}

export async function POST(req: Request) {
  const { ticker, shares, costBasis, openedAt } = await req.json();
  const t = ticker ? String(ticker).toUpperCase().trim() : null;
  if (!t || shares == null) return NextResponse.json({ error: "ticker and shares required" }, { status: 400 });

  let [pf] = await sql<{ id: number }[]>`SELECT id FROM portfolios ORDER BY id LIMIT 1`;
  if (!pf) [pf] = await sql<{ id: number }[]>`INSERT INTO portfolios (name) VALUES ('Core') RETURNING id`;
  await sql`INSERT INTO stocks (ticker) VALUES (${t}) ON CONFLICT (ticker) DO NOTHING`;
  await sql`
    INSERT INTO portfolio_holdings (portfolio_id, ticker, shares, cost_basis, opened_at)
    VALUES (${pf.id}, ${t}, ${Number(shares)}, ${costBasis != null ? Number(costBasis) : null}, ${openedAt || null})`;
  return NextResponse.json({ ok: true });
}
