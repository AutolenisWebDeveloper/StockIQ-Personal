"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Entry {
  id: number; ticker: string; action: string; decision_date: string | null;
  price_at_decision: string | null; conviction_level: number | null; rationale: string | null; lessons_learned: string | null;
}
const field = "h-9 rounded-lg border border-line bg-surface px-3 text-[13px] focus:border-info focus:outline-none";
const ACTIONS = ["buy", "add", "trim", "sell", "review"];
const tone: Record<string, string> = { buy: "text-buy", add: "text-buy", trim: "text-warn", sell: "text-sell", review: "text-muted" };

export function JournalManager({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [action, setAction] = useState("buy");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [price, setPrice] = useState("");
  const [conviction, setConviction] = useState("3");
  const [rationale, setRationale] = useState("");

  async function add() {
    await fetch("/api/journal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticker, action, decision_date: date,
        price_at_decision: price ? Number(price) : null,
        conviction_level: Number(conviction), rationale: rationale || null,
      }),
    });
    setTicker(""); setPrice(""); setRationale("");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">Log a decision</h2>
        <div className="flex flex-wrap items-end gap-2">
          <input className={`${field} w-24 num uppercase`} placeholder="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />
          <select className={field} value={action} onChange={(e) => setAction(e.target.value)}>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select>
          <input className={`${field} num`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className={`${field} w-24 num`} placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
          <select className={field} value={conviction} onChange={(e) => setConviction(e.target.value)} title="Conviction 1–5">
            {[1, 2, 3, 4, 5].map((c) => <option key={c} value={c}>conv {c}</option>)}
          </select>
          <input className={`${field} min-w-[16rem] flex-1`} placeholder="Rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} />
          <button onClick={add} className="h-9 rounded-lg bg-info px-3 text-[13px] font-semibold text-surface">Log</button>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">No journal entries yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
                <th className="pb-2 font-medium">Date</th><th className="pb-2 font-medium">Ticker</th>
                <th className="pb-2 font-medium">Action</th><th className="pb-2 text-right font-medium">Price</th>
                <th className="pb-2 text-right font-medium">Conv</th><th className="pb-2 font-medium">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-line/70 align-top last:border-0">
                  <td className="num py-2 text-[12px] text-muted">{e.decision_date?.slice(0, 10) ?? "—"}</td>
                  <td className="py-2"><Link href={`/reports/${e.ticker}`} className="text-[13px] font-bold text-ink hover:text-info">{e.ticker}</Link></td>
                  <td className={`py-2 text-[12px] font-semibold ${tone[e.action] ?? "text-ink"}`}>{e.action}</td>
                  <td className="num py-2 text-right text-[12px] text-ink">{e.price_at_decision != null ? `$${Number(e.price_at_decision).toFixed(2)}` : "—"}</td>
                  <td className="num py-2 text-right text-[12px] text-muted">{e.conviction_level ?? "—"}</td>
                  <td className="py-2 text-[12px] text-muted">{e.rationale ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
