import type { ComponentProps } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { JournalManager } from "@/components/phase5/JournalManager";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function JournalPage() {
  let entries: ComponentProps<typeof JournalManager>["entries"] = [];
  try {
    entries = (await sql`
      SELECT id, ticker, action, decision_date, price_at_decision, conviction_at_decision,
             thesis_snapshot, rationale, conviction_level, lessons_learned, outcome_return_vs_spy
      FROM investment_journal ORDER BY decision_date DESC NULLS LAST, id DESC LIMIT 100`) as unknown as ComponentProps<typeof JournalManager>["entries"];
  } catch {
    /* DB unavailable → empty */
  }
  return (
    <AppShell title="Journal" subtitle="Decision log — what you did, why, and what you learned.">
      <JournalManager entries={entries} />
    </AppShell>
  );
}
