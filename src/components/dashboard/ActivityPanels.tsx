import Link from "next/link";
import { FileText } from "lucide-react";
import type { DashboardData } from "@/lib/dashboard/queries";
import { Panel, AiBadge, Empty, RiskText, fmtMoney, fmtNum, fmtPct } from "@/components/ui/primitives";

function shortDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}

export function EarningsRadar({ rows }: { rows: DashboardData["earnings"] }) {
  return (
    <Panel title="Earnings Radar" action={{ label: "View calendar", href: "/calendar" }}>
      {rows.length === 0 ? (
        <Empty>No upcoming earnings on the watchlist.</Empty>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.ticker} className="flex items-center gap-3">
              <span className="num w-4 text-[12px] text-muted">{i + 1}</span>
              <div className="w-20"><span className="text-[13px] font-bold text-ink">{r.ticker}</span></div>
              <span className="flex-1 text-[12px] text-muted">{shortDate(r.nextEarnings)}</span>
              <span className="num text-[12px] text-ink">{r.expectedMovePct != null ? `±${r.expectedMovePct.toFixed(1)}%` : "—"}</span>
              <span className="w-14 text-right"><RiskText label={r.risk.label} /></span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function FilingAlerts({ rows }: { rows: DashboardData["filings"] }) {
  return (
    <Panel title="Filing Alerts" action={{ label: "View all", href: "/research" }}>
      {rows.length === 0 ? (
        <Empty>No recent filings.</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((f, i) => (
            <li key={`${f.ticker}-${i}`} className="flex items-center gap-3">
              <FileText size={15} className="text-muted" />
              <div className="w-28">
                <div className="text-[13px] font-bold text-ink">{f.ticker}</div>
                <div className="text-[11px] text-muted">{f.formType} · {shortDate(f.filedAt)}</div>
              </div>
              <span className="flex-1" />
              {f.url ? (
                <Link href={f.url} target="_blank" className="inline-flex items-center gap-1 rounded bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info">View</Link>
              ) : null}
              <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-muted">summary <AiBadge /></span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function InsiderActivity({ rows }: { rows: DashboardData["insiders"] }) {
  return (
    <Panel title="Insider Activity" action={{ label: "View all", href: "/research" }}>
      {rows.length === 0 ? (
        <Empty>No recent Form 4 activity.</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((it, i) => (
            <li key={i} className="flex items-center gap-3">
              <div className="w-24">
                <div className="text-[13px] font-bold text-ink">{it.ticker}</div>
                <div className="truncate text-[11px] text-muted">{it.role ?? it.name ?? "insider"}</div>
              </div>
              <span className={`text-[12px] font-semibold ${it.type === "buy" ? "text-buy" : "text-sell"}`}>{it.type === "buy" ? "Buy" : "Sell"}</span>
              <span className="num flex-1 text-right text-[12px] text-ink">{fmtMoney(it.value)}</span>
              <span className="w-12 text-right text-[11px] text-muted">{shortDate(it.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function InstitutionalActivity({ rows }: { rows: DashboardData["institutions"] }) {
  return (
    <Panel title="Institutional Activity" action={{ label: "View all", href: "/research" }}>
      {rows.length === 0 ? (
        <Empty>No recent 13F changes (45-day lag).</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((it, i) => {
            const up = (it.changePct ?? 0) >= 0;
            return (
              <li key={i} className="flex items-center gap-3">
                <div className="w-24"><div className="text-[13px] font-bold text-ink">{it.ticker}</div></div>
                <span className="flex-1 truncate text-[12px] text-muted">{it.holder ?? "—"}</span>
                <span className={`num text-[12px] font-medium ${up ? "text-buy" : "text-sell"}`}>{fmtPct(it.changePct)}</span>
                <span className="w-16 text-right text-[11px] text-muted">{up ? "Increased" : "Decreased"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function MarketPulse({ rows }: { rows: DashboardData["pulse"] }) {
  return (
    <Panel title="Market Pulse">
      <ul className="space-y-2">
        {rows.map((p) => {
          const up = (p.changePct ?? 0) >= 0;
          return (
            <li key={p.label} className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-ink">{p.label}</span>
              <span className="flex items-center gap-3">
                <span className="num text-[12px] text-ink">{fmtNum(p.value)}</span>
                <span className={`num w-14 text-right text-[12px] ${up ? "text-buy" : "text-sell"}`}>{p.changePct != null ? fmtPct(p.changePct) : ""}</span>
              </span>
            </li>
          );
        })}
        <li className="flex items-center justify-between border-t border-line pt-2">
          <span className="flex items-center gap-1 text-[12px] text-muted">Fear &amp; Greed <AiBadge label="Phase 3" /></span>
          <span className="text-[12px] text-muted">—</span>
        </li>
      </ul>
    </Panel>
  );
}
