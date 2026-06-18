import Link from "next/link";
import type { TickerRow } from "@/lib/dashboard/queries";
import { ActionPill, RiskText, StatusDot, Sparkline, fmtNum, fmtPct } from "@/components/ui/primitives";

// Full-width ranking table shared by Decision Center, Buy/Sell Rankings, and the
// Opportunity Finder. Every column is a deterministic engine output; ordering is
// chosen by the caller. Server component (no client hooks) so it can be rendered
// directly by page server components.
export function RankingTable({
  rows,
  highlight = "conviction",
  emptyMsg = "No tickers yet — add some on the Watchlists page.",
}: {
  rows: TickerRow[];
  highlight?: "conviction" | "opportunity" | "risk";
  emptyMsg?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface p-10 text-center shadow-card">
        <p className="text-[13px] text-muted">{emptyMsg}</p>
      </div>
    );
  }
  const hl = (col: "conviction" | "opportunity" | "risk") =>
    highlight === col ? "bg-paper/60" : "";

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
            <th className="px-5 py-3 font-medium">#</th>
            <th className="px-2 py-3 font-medium">Ticker</th>
            <th className="px-2 py-3 font-medium">Trend</th>
            <th className="px-2 py-3 text-right font-medium">Price</th>
            <th className="px-2 py-3 text-right font-medium">Chg</th>
            <th className="px-2 py-3 text-center font-medium">Action</th>
            <th className={`px-2 py-3 text-right font-medium ${hl("conviction")}`}>Conviction</th>
            <th className={`px-2 py-3 text-right font-medium ${hl("opportunity")}`}>Opportunity</th>
            <th className={`px-2 py-3 text-right font-medium ${hl("risk")}`}>Risk</th>
            <th className="px-5 py-3 text-right font-medium">Thesis</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.ticker} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
              <td className="num px-5 py-2.5 text-[12px] text-muted">{i + 1}</td>
              <td className="px-2 py-2.5">
                <Link href={`/reports/${r.ticker}`} className="text-[13px] font-bold text-ink hover:text-info">
                  {r.ticker}
                </Link>
                <div className="max-w-[12rem] truncate text-[11px] text-muted">{r.name ?? ""}</div>
              </td>
              <td className="w-[120px] px-2 py-2.5"><Sparkline data={r.spark} tone={r.action.tone} /></td>
              <td className="num px-2 py-2.5 text-right text-[13px] text-ink">
                {r.price != null ? `$${fmtNum(r.price)}` : "—"}
              </td>
              <td className={`num px-2 py-2.5 text-right text-[12px] ${(r.changePct ?? 0) >= 0 ? "text-buy" : "text-sell"}`}>
                {fmtPct(r.changePct)}
              </td>
              <td className="px-2 py-2.5 text-center"><ActionPill label={r.action.action} tone={r.action.tone} /></td>
              <td className={`num px-2 py-2.5 text-right text-[13px] font-semibold text-ink ${hl("conviction")}`}>
                {fmtNum(r.conviction, 0)}
              </td>
              <td className={`num px-2 py-2.5 text-right text-[13px] text-ink ${hl("opportunity")}`}>
                {fmtNum(r.opportunity, 0)}
              </td>
              <td className={`px-2 py-2.5 text-right ${hl("risk")}`}><RiskText label={r.risk.label} /></td>
              <td className="px-5 py-2.5 text-right"><StatusDot tone={r.thesis.tone} label={r.thesis.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
