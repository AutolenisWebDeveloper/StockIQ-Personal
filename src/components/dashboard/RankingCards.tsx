import Link from "next/link";
import type { TickerRow } from "@/lib/dashboard/queries";
import { Sparkline, ActionPill, AiBadge, Empty, fmtNum } from "@/components/ui/primitives";

function ScoreRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted">{label}</span>
      <span className={`num font-semibold ${accent ? "text-ink" : "text-ink"}`}>{value}</span>
    </div>
  );
}

function RankingCard({ row, rank, side }: { row: TickerRow; rank: number; side: "buy" | "sell" }) {
  const badge = side === "buy" ? "bg-buy text-surface" : "bg-sell text-surface";
  return (
    <div className="flex flex-col rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${badge}`}>{rank}</span>
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-ink">{row.ticker}</div>
          <div className="truncate text-[11px] text-muted">{row.name ?? row.ticker}</div>
        </div>
      </div>

      <div className={`mt-2 text-[13px] font-bold ${row.action.tone === "buy" ? "text-buy" : "text-sell"}`}>{row.action.action}</div>

      <div className="mt-2 space-y-1">
        <ScoreRow label="Conviction" value={fmtNum(row.conviction, 0)} />
        <ScoreRow label="Opportunity" value={fmtNum(row.opportunity, 0)} />
        <ScoreRow label="Risk" value={row.risk.label} />
      </div>

      <div className="mt-3"><Sparkline data={row.spark} tone={side} /></div>

      <div className="mt-3 flex items-center gap-1 text-[11px] uppercase tracking-[0.05em] text-muted">
        {side === "buy" ? "Why we like it" : "Why we're cautious"} <AiBadge />
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">Narrative lands in Phase 3 (LLM composes around these engine values).</p>

      <Link href={`/reports/${row.ticker}`} className={`mt-3 text-[12px] font-semibold ${side === "buy" ? "text-buy" : "text-sell"}`}>
        View Report →
      </Link>
    </div>
  );
}

export function RankingColumn({
  title,
  rows,
  side,
  action,
}: {
  title: string;
  rows: TickerRow[];
  side: "buy" | "sell";
  action: { label: string; href: string };
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className={`text-[13px] font-bold uppercase tracking-[0.04em] ${side === "buy" ? "text-buy" : "text-sell"}`}>{title}</h2>
        <Link href={action.href} className="text-[12px] font-medium text-muted hover:text-ink">{action.label} →</Link>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-4"><Empty>No ranked names yet — run ingestion + compute.</Empty></div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {rows.map((r, i) => <RankingCard key={r.ticker} row={r} rank={i + 1} side={side} />)}
        </div>
      )}
    </div>
  );
}
