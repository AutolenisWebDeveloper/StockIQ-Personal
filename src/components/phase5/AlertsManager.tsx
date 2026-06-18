"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, BellRing } from "lucide-react";
import { ALERT_TYPES, type AlertType } from "@/lib/alerts/types";

interface Alert {
  id: number; name: string | null; type: AlertType; ticker: string | null;
  condition_json: Record<string, unknown> | null; channel: string; active: boolean; last_fired_at: string | null;
}
interface Notif { id: number; ticker: string | null; message: string; channel: string | null; sent_at: string; read_at: string | null; }

const field = "h-9 rounded-lg border border-line bg-surface px-3 text-[13px] focus:border-info focus:outline-none";

export function AlertsManager({ alerts, notifications }: { alerts: Alert[]; notifications: Notif[] }) {
  const router = useRouter();
  const [type, setType] = useState<AlertType>("price_above");
  const [ticker, setTicker] = useState("");
  const [level, setLevel] = useState("");
  const [days, setDays] = useState("7");
  const [channel, setChannel] = useState("email");
  const meta = ALERT_TYPES.find((t) => t.type === type)!;

  async function create() {
    const condition: Record<string, unknown> = {};
    if (meta.needsLevel) condition.level = Number(level);
    if (meta.needsDays) condition.days = Number(days);
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: meta.label, type, ticker: ticker || null, condition, channel }),
    });
    setTicker(""); setLevel("");
    router.refresh();
  }
  async function toggle(a: Alert) {
    await fetch(`/api/alerts/${a.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !a.active }) });
    router.refresh();
  }
  async function remove(id: number) {
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    router.refresh();
  }
  async function markRead() {
    await fetch("/api/notifications", { method: "POST" });
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-5">
        <section className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">New alert</h2>
          <div className="flex flex-wrap items-end gap-2">
            <select className={field} value={type} onChange={(e) => setType(e.target.value as AlertType)}>
              {ALERT_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            <input className={`${field} w-24 num uppercase`} placeholder="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />
            {meta.needsLevel && <input className={`${field} w-24 num`} placeholder="Level" value={level} onChange={(e) => setLevel(e.target.value)} />}
            {meta.needsDays && <input className={`${field} w-20 num`} placeholder="Days" value={days} onChange={(e) => setDays(e.target.value)} />}
            <select className={field} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">email</option>
              <option value="telegram">telegram</option>
            </select>
            <button onClick={create} className="h-9 rounded-lg bg-info px-3 text-[13px] font-semibold text-surface">Add alert</button>
          </div>
        </section>

        <section className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">Alerts</h2>
          {alerts.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">No alerts yet.</p>
          ) : (
            <table className="w-full">
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-b border-line/70 last:border-0">
                    <td className="py-2 text-[13px] font-medium text-ink">{ALERT_TYPES.find((t) => t.type === a.type)?.label ?? a.type}</td>
                    <td className="num py-2 text-[12px] text-ink">{a.ticker ?? "—"}</td>
                    <td className="py-2 text-[12px] text-muted">{a.channel}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => toggle(a)} className={`rounded px-2 py-0.5 text-[11px] font-semibold ${a.active ? "bg-buy-soft text-buy" : "bg-paper text-muted"}`}>
                        {a.active ? "active" : "paused"}
                      </button>
                    </td>
                    <td className="py-2 pl-3 text-right"><button onClick={() => remove(a.id)} className="text-muted hover:text-sell"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">Notifications</h2>
          <button onClick={markRead} className="text-[12px] text-muted hover:text-ink">Mark all read</button>
        </div>
        {notifications.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">No notifications.</p>
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => (
              <li key={n.id} className="flex items-start gap-2">
                <BellRing size={14} className={n.read_at ? "mt-0.5 text-muted" : "mt-0.5 text-info"} />
                <div>
                  <div className={`text-[12px] ${n.read_at ? "text-muted" : "text-ink"}`}>{n.message}</div>
                  <div className="text-[10px] text-muted">{new Date(n.sent_at).toLocaleString()} · {n.channel}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
