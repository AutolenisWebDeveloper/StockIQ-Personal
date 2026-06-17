import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { connection } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql`SELECT 1`;
    await connection.ping();
    return NextResponse.json({ status: "ok", db: "up", redis: "up" });
  } catch (e) {
    return NextResponse.json({ status: "degraded", error: String(e) }, { status: 503 });
  }
}
