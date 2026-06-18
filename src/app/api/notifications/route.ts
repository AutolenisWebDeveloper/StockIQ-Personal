import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const notifications = await sql`
    SELECT id, ticker, message, channel, sent_at, read_at FROM notifications
    ORDER BY sent_at DESC LIMIT 30`;
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM notifications WHERE read_at IS NULL`;
  return NextResponse.json({ notifications, unread: count });
}

// mark all read
export async function POST() {
  await sql`UPDATE notifications SET read_at = now() WHERE read_at IS NULL`;
  return NextResponse.json({ ok: true });
}
