import { Sparkles, CalendarDays, Crosshair, AlertTriangle, BarChart3, FileText } from "lucide-react";
import type { DashboardData } from "@/lib/dashboard/queries";
import { AiBadge } from "@/components/ui/primitives";

function Cell({ icon, label, value, sub, badge }: { icon: React.ReactNode; label: string; value: string; sub?: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-5 py-1">
      <div className="mt-0.5 text-muted">{icon}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.05em] text-muted">{label} {badge}</div>
        <div className="truncate text-[15px] font-semibold text-ink">{value}</div>
        {sub && <div className="truncate text-[11px] text-muted">{sub}</div>}
      </div>
    </div>
  );
}

export function MorningBrief({ brief }: { brief: DashboardData["brief"] }) {
  return (
    <section className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <Sparkles size={15} className="text-brand" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink">AI Morning Brief</span>
      </div>
      <div className="grid grid-cols-2 gap-y-3 py-4 md:grid-cols-3 lg:grid-cols-6">
        <Cell icon={<BarChart3 size={18} />} label="Market Regime" value="—" sub="Phase 3" badge={<AiBadge />} />
        <Cell icon={<CalendarDays size={18} />} label="Major Events" value="—" sub="Phase 3" badge={<AiBadge />} />
        <Cell
          icon={<Crosshair size={18} />}
          label="Highest Conviction"
          value={brief.highestConviction?.ticker ?? "—"}
          sub={brief.highestConviction?.conviction != null ? `Score ${brief.highestConviction.conviction.toFixed(0)}` : "no data"}
        />
        <Cell
          icon={<AlertTriangle size={18} />}
          label="Highest Risk"
          value={brief.highestRisk?.ticker ?? "—"}
          sub={brief.highestRisk ? `Risk ${brief.highestRisk.risk.label}` : "no data"}
        />
        <Cell
          icon={<BarChart3 size={18} />}
          label="Top Earnings"
          value={brief.topEarnings?.ticker ?? "—"}
          sub={brief.topEarnings?.nextEarnings ?? "none scheduled"}
        />
        <Cell
          icon={<FileText size={18} />}
          label="New Filing"
          value={brief.newFiling ? `${brief.newFiling.ticker} ${brief.newFiling.formType}` : "—"}
          sub={brief.newFiling?.filedAt ? new Date(brief.newFiling.filedAt).toLocaleDateString() : "none"}
        />
      </div>
    </section>
  );
}
