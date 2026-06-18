import { sql } from "../../lib/db";
import { evaluateAlert, type AlertRow } from "../../lib/alerts/evaluate";
import { deliver } from "../../lib/delivery/notify";
import { withRun } from "../runlog";

// Evaluate active alerts against current engine state; on fire, record a
// notification, deliver it (email/telegram), and stamp last_fired_at. A 12h
// re-fire window prevents an alert from spamming on every run.
const REFIRE_WINDOW_HOURS = 12;

export async function runAlertsEval(): Promise<void> {
  await withRun("alerts-eval", null, async () => {
    const alerts = await sql<(AlertRow & { last_fired_at: string | null })[]>`
      SELECT id, type, ticker, condition_json, channel, last_fired_at
      FROM alerts WHERE active = true`;
    let fired = 0;
    for (const a of alerts) {
      if (a.last_fired_at && Date.now() - new Date(a.last_fired_at).getTime() < REFIRE_WINDOW_HOURS * 3600_000) {
        continue;
      }
      let msg: string | null = null;
      try {
        msg = await evaluateAlert(a);
      } catch {
        continue; // a bad single alert never kills the run
      }
      if (!msg) continue;
      await sql`
        INSERT INTO notifications (alert_id, ticker, message, channel)
        VALUES (${a.id}, ${a.ticker}, ${msg}, ${a.channel})`;
      await deliver(a.channel, "StockIQ alert", msg);
      await sql`UPDATE alerts SET last_fired_at = now() WHERE id = ${a.id}`;
      fired++;
    }
    return { rowsWritten: fired };
  });
}
