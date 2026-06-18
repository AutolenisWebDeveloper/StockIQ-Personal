import type { ComponentProps } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { AlertsManager } from "@/components/phase5/AlertsManager";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  let alerts: ComponentProps<typeof AlertsManager>["alerts"] = [];
  let notifications: ComponentProps<typeof AlertsManager>["notifications"] = [];
  try {
    alerts = (await sql`
      SELECT id, name, type, ticker, condition_json, channel, active, last_fired_at
      FROM alerts ORDER BY created_at DESC`) as unknown as ComponentProps<typeof AlertsManager>["alerts"];
    notifications = (await sql`
      SELECT id, ticker, message, channel, sent_at, read_at FROM notifications
      ORDER BY sent_at DESC LIMIT 30`) as unknown as ComponentProps<typeof AlertsManager>["notifications"];
  } catch {
    /* DB unavailable → empty */
  }
  return (
    <AppShell title="Alerts" subtitle="Price, conviction, opportunity, earnings, and thesis triggers.">
      <AlertsManager alerts={alerts} notifications={notifications} />
    </AppShell>
  );
}
