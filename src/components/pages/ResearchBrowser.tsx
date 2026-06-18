"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { TickerRow } from "@/lib/dashboard/queries";
import { ActionPill, RiskText, fmtNum } from "@/components/ui/primitives";

export function ResearchBrowser({ rows }: { rows: TickerRow[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s) return rows;
    return rows.filter((r) => r.ticker.includes(s) || (r.name ?? "").toUpperCase().includes(s));
  }, [q, rows]);

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] focus:border-info focus:outline-none"
          placeholder="Search ticker or company…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted">
            {rows.length === 0 ? "No tickers tracked yet — add some on the Watchlists page." : "No matches."}
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
                <th className="px-5 py-3 font-medium">Ticker</th>
                <th className="px-2 py-3 text-right font-medium">Price</th>
                <th className="px-2 py-3 text-center font-medium">Action</th>
                <th className="px-2 py-3 text-right font-medium">Conviction</th>
                <th className="px-2 py-3 text-right font-medium">Opportunity</th>
                <th className="px-2 py-3 text-right font-medium">Risk</th>
                <th className="px-5 py-3 text-right font-medium">Report</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.ticker} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
                  <td className="px-5 py-2.5">
                    <Link href={`/reports/${r.ticker}`} className="text-[13px] font-bold text-ink hover:text-info">{r.ticker}</Link>
                    <div className="max-w-[16rem] truncate text-[11px] text-muted">{r.name ?? ""}</div>
                  </td>
                  <td className="num px-2 py-2.5 text-right text-[13px] text-ink">{r.price != null ? `$${fmtNum(r.price)}` : "—"}</td>
                  <td className="px-2 py-2.5 text-center"><ActionPill label={r.action.action} tone={r.action.tone} /></td>
                  <td className="num px-2 py-2.5 text-right text-[13px] font-semibold text-ink">{fmtNum(r.conviction, 0)}</td>
                  <td className="num px-2 py-2.5 text-right text-[13px] text-ink">{fmtNum(r.opportunity, 0)}</td>
                  <td className="px-2 py-2.5 text-right"><RiskText label={r.risk.label} /></td>
                  <td className="px-5 py-2.5 text-right">
                    <Link href={`/reports/${r.ticker}`} className="text-[12px] font-semibold text-info hover:underline">Open →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
