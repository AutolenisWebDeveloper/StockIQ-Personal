"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { PortfolioView } from "@/lib/portfolio/math";

const field = "h-9 rounded-lg border border-line bg-surface px-3 text-[13px] focus:border-info focus:outline-none";
const money = (v: number | null) => (v == null ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const pct = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

export function PortfolioManager({ pf }: { pf: PortfolioView }) {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");

  async function add() {
    await fetch("/api/portfolio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker, shares: Number(shares), costBasis: cost ? Number(cost) : null }),
    });
    setTicker(""); setShares(""); setCost("");
    router.refresh();
  }
  async function remove(id: number) {
    await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total value", value: money(pf.totalValue) },
          { label: "Total cost", value: money(pf.totalCost) },
          { label: "Unrealized P/L", value: `${money(pf.totalPlDollar)} (${pct(pf.totalPlPct)})`, tone: pf.totalPlDollar >= 0 ? "text-buy" : "text-sell" },
          { label: "Concentration", value: pf.concentrationPct != null ? `${pf.concentrationPct.toFixed(0)}%` : "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="text-[11px] uppercase tracking-[0.05em] text-muted">{s.label}</div>
            <div className={`num mt-1 text-[16px] font-semibold ${s.tone ?? "text-ink"}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">Add holding</h2>
        <div className="flex flex-wrap items-end gap-2">
          <input className={`${field} w-24 num uppercase`} placeholder="Ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} />
          <input className={`${field} w-24 num`} placeholder="Shares" value={shares} onChange={(e) => setShares(e.target.value)} />
          <input className={`${field} w-28 num`} placeholder="Cost basis" value={cost} onChange={(e) => setCost(e.target.value)} />
          <button onClick={add} className="h-9 rounded-lg bg-info px-3 text-[13px] font-semibold text-surface">Add</button>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        {pf.holdings.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">No holdings yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
                <th className="pb-2 font-medium">Ticker</th>
                <th className="pb-2 text-right font-medium">Shares</th>
                <th className="pb-2 text-right font-medium">Price</th>
                <th className="pb-2 text-right font-medium">Value</th>
                <th className="pb-2 text-right font-medium">P/L</th>
                <th className="pb-2 text-right font-medium">Weight</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {pf.holdings.map((h) => (
                <tr key={h.id} className="border-b border-line/70 last:border-0">
                  <td className="py-2"><Link href={`/reports/${h.ticker}`} className="text-[13px] font-bold text-ink hover:text-info">{h.ticker}</Link></td>
                  <td className="num py-2 text-right text-[12px] text-ink">{h.shares}</td>
                  <td className="num py-2 text-right text-[12px] text-ink">{h.price != null ? `$${h.price.toFixed(2)}` : "—"}</td>
                  <td className="num py-2 text-right text-[12px] text-ink">{money(h.marketValue)}</td>
                  <td className={`num py-2 text-right text-[12px] ${(h.plDollar ?? 0) >= 0 ? "text-buy" : "text-sell"}`}>{h.plPct != null ? pct(h.plPct) : "—"}</td>
                  <td className="num py-2 text-right text-[12px] text-muted">{h.weightPct != null ? `${h.weightPct.toFixed(0)}%` : "—"}</td>
                  <td className="py-2 pl-3 text-right"><button onClick={() => remove(h.id)} className="text-muted hover:text-sell"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
