import type { ComponentProps } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ThesisManager } from "@/components/phase5/ThesisManager";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ThesisPage() {
  let theses: ComponentProps<typeof ThesisManager>["theses"] = [];
  try {
    theses = (await sql`
      SELECT id, ticker, thesis_statement, key_assumptions_json, risks_json, target_price,
             target_horizon, status, created_at, last_reviewed
      FROM thesis_tracker ORDER BY created_at DESC LIMIT 100`) as unknown as ComponentProps<typeof ThesisManager>["theses"];
  } catch {
    /* DB unavailable → empty */
  }
  return (
    <AppShell title="Thesis Tracker" subtitle="Statements, assumptions, and validation status.">
      <ThesisManager theses={theses} />
    </AppShell>
  );
}
