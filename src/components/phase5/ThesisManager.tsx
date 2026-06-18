"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";

interface Thesis {
  id: number; ticker: string; thesis_statement: string | null;
  key_assumptions_json: { assumption: string; validation_status: string }[] | null;
  target_price: string | null; target_horizon: string | null; status: string; last_reviewed: string | null;
}
const field = "h-9 rounded-lg border border-line bg-surface px-3 text-[13px] focus:border-info focus:outline-none";
const STATUSES = ["active", "validated", "invalidated", "exited"];
const statusTone: Record<string, string> = { active: "bg-buy-soft text-buy", validated: "bg-buy-soft text-buy", invalidated: "bg-sell-soft text-sell", exited: "bg-paper text-muted" };

export function ThesisManager({ theses }: { theses: Thesis[] }) {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [statement, setStatement] = useState("");
  const [assumptions, setAssumptions] = useState("");
  const [target, setTarget] = useState("");
  const [horizon, setHorizon] = useState("");

  async function add() {
    await fetch("/api/thesis", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticker, thesis_statement: statement,
        assumptions: assumptions.split("\n").map((s) => s.trim()).filter(Boolean),
        target_price: target ? Number(target) : null, target_horizon: horizon || null,
      }),
    });
    setTicker(""); setStatement(""); setAssumptions(""); setTarget(""); setHorizon("");
    router.refresh();
  }
  async function setStatus(id: number, status: string) {
    await fetch(`/api/thesis/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    router.refresh();
  }
  async function remove(id: number) {
    await fetch(`/api/thesis/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">New thesis</h2>
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <input className={`${field} w-24 num uppercase`} placeholder="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />
            <input className={`${field} w-28 num`} placeholder="Target $" value={target} onChange={(e) => setTarget(e.target.value)} />
            <input className={`${field} w-32`} placeholder="Horizon (e.g. 12m)" value={horizon} onChange={(e) => setHorizon(e.target.value)} />
          </div>
          <input className={`${field} w-full`} placeholder="Thesis statement" value={statement} onChange={(e) => setStatement(e.target.value)} />
          <textarea className="w-full rounded-lg border border-line bg-surface p-3 text-[13px] focus:border-info focus:outline-none" rows={3} placeholder="Key assumptions (one per line)" value={assumptions} onChange={(e) => setAssumptions(e.target.value)} />
          <button onClick={add} className="h-9 rounded-lg bg-info px-3 text-[13px] font-semibold text-surface">Add thesis</button>
        </div>
      </section>

      {theses.length === 0 ? (
        <p className="rounded-card border border-line bg-surface py-8 text-center text-[13px] text-muted shadow-card">No theses yet.</p>
      ) : (
        theses.map((th) => (
          <section key={th.id} className="rounded-card border border-line bg-surface p-5 shadow-card">
            <div className="flex items-start justify-between">
              <div>
                <Link href={`/reports/${th.ticker}`} className="text-[15px] font-bold text-ink hover:text-info">{th.ticker}</Link>
                <span className={`ml-2 rounded px-2 py-0.5 text-[11px] font-semibold ${statusTone[th.status] ?? "bg-paper text-muted"}`}>{th.status}</span>
                {th.target_price && <span className="num ml-2 text-[12px] text-muted">target ${Number(th.target_price).toFixed(2)} {th.target_horizon ?? ""}</span>}
              </div>
              <button onClick={() => remove(th.id)} className="text-muted hover:text-sell"><Trash2 size={15} /></button>
            </div>
            <p className="mt-2 text-[13px] text-ink">{th.thesis_statement}</p>
            {th.key_assumptions_json && th.key_assumptions_json.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-[12px] text-muted">
                {th.key_assumptions_json.map((a, i) => <li key={i}>{a.assumption}</li>)}
              </ul>
            )}
            <div className="mt-3 flex items-center gap-1.5">
              <span className="text-[11px] text-muted">set status:</span>
              {STATUSES.map((s) => (
                <button key={s} onClick={() => setStatus(th.id, s)} disabled={s === th.status}
                  className={`rounded px-2 py-0.5 text-[11px] ${s === th.status ? "bg-paper text-muted" : "border border-line text-ink hover:bg-paper"}`}>{s}</button>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
