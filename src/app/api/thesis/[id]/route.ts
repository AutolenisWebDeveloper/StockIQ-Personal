import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["active", "validated", "invalidated", "exited"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (body.status && STATUSES.includes(body.status)) {
    await sql`UPDATE thesis_tracker SET status = ${body.status}, last_reviewed = now() WHERE id = ${Number(id)}`;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM thesis_tracker WHERE id = ${Number(id)}`;
  return NextResponse.json({ ok: true });
}
