"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Plus } from "lucide-react";
import type { TickerRow } from "@/lib/dashboard/queries";
import { ActionPill, RiskText, fmtNum } from "@/components/ui/primitives";

export function WatchlistManager({ rows }: { rows: TickerRow[] }) {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: t }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Could not add ticker.");
      } else {
        setTicker("");
        router.refresh();
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: string) {
    await fetch("/api/watchlist", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticker: t }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">Add a ticker</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="h-9 w-32 rounded-lg border border-line bg-surface px-3 text-[13px] uppercase num focus:border-info focus:outline-none"
            placeholder="e.g. NVDA"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button
            onClick={add}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-info px-3 text-[13px] font-semibold text-surface disabled:opacity-50"
          >
            <Plus size={15} /> {busy ? "Adding…" : "Add"}
          </button>
          {error && <span className="text-[12px] text-sell">{error}</span>}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Adding a ticker queues a cold fetch so prices and fundamentals populate without waiting for the nightly run.
        </p>
      </section>

      <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted">Your watchlist is empty. Add a ticker above to begin tracking.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
                <th className="px-5 py-3 font-medium">Ticker</th>
                <th className="px-2 py-3 text-right font-medium">Price</th>
                <th className="px-2 py-3 text-center font-medium">Action</th>
                <th className="px-2 py-3 text-right font-medium">Conviction</th>
                <th className="px-2 py-3 text-right font-medium">Risk</th>
                <th className="px-5 py-3 text-right font-medium">Remove</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ticker} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
                  <td className="px-5 py-2.5">
                    <Link href={`/reports/${r.ticker}`} className="text-[13px] font-bold text-ink hover:text-info">{r.ticker}</Link>
                    <div className="max-w-[14rem] truncate text-[11px] text-muted">{r.name ?? ""}</div>
                  </td>
                  <td className="num px-2 py-2.5 text-right text-[13px] text-ink">{r.price != null ? `$${fmtNum(r.price)}` : "—"}</td>
                  <td className="px-2 py-2.5 text-center"><ActionPill label={r.action.action} tone={r.action.tone} /></td>
                  <td className="num px-2 py-2.5 text-right text-[13px] font-semibold text-ink">{fmtNum(r.conviction, 0)}</td>
                  <td className="px-2 py-2.5 text-right"><RiskText label={r.risk.label} /></td>
                  <td className="px-5 py-2.5 text-right">
                    <button onClick={() => remove(r.ticker)} className="text-muted hover:text-sell" title={`Remove ${r.ticker}`}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
