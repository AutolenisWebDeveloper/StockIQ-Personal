import Link from "next/link";
import type { TickerRow } from "@/lib/dashboard/queries";
import { Panel, ActionPill, RiskText, StatusDot, Empty, fmtNum } from "@/components/ui/primitives";

export function WatchlistRankings({ rows }: { rows: TickerRow[] }) {
  return (
    <Panel title="Watchlist Rankings" action={{ label: "View full watchlist", href: "/watchlists" }}>
      {rows.length === 0 ? (
        <Empty>Add a ticker to begin tracking.</Empty>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
              <th className="pb-2 font-medium">Ticker</th>
              <th className="pb-2 text-right font-medium">Price</th>
              <th className="pb-2 text-center font-medium">Action</th>
              <th className="pb-2 text-right font-medium">Conviction</th>
              <th className="pb-2 text-right font-medium">Opportunity</th>
              <th className="pb-2 text-right font-medium">Risk</th>
              <th className="pb-2 text-right font-medium">Thesis</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker} className="border-b border-line/70 last:border-0">
                <td className="py-2.5">
                  <Link href={`/reports/${r.ticker}`} className="text-[13px] font-bold text-ink hover:text-info">{r.ticker}</Link>
                  <div className="truncate text-[11px] text-muted">{r.name ?? ""}</div>
                </td>
                <td className="num py-2.5 text-right text-[13px] text-ink">{r.price != null ? `$${fmtNum(r.price)}` : "—"}</td>
                <td className="py-2.5 text-center"><ActionPill label={r.action.action} tone={r.action.tone} /></td>
                <td className="num py-2.5 text-right text-[13px] font-semibold text-ink">{fmtNum(r.conviction, 0)}</td>
                <td className="num py-2.5 text-right text-[13px] text-ink">{fmtNum(r.opportunity, 0)}</td>
                <td className="py-2.5 text-right"><RiskText label={r.risk.label} /></td>
                <td className="py-2.5 text-right"><StatusDot tone={r.thesis.tone} label={r.thesis.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
