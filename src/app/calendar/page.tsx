import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { getDashboardSafe } from "@/lib/dashboard/queries";
import { ActionPill, fmtPct } from "@/components/ui/primitives";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// next_earnings_date can arrive as a Date (postgres) or string; normalize to YYYY-MM-DD.
function toDay(d: string | Date | null): string | null {
  if (!d) return null;
  return (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
}
function daysUntil(day: string): number {
  const ms = new Date(`${day}T00:00:00Z`).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export default async function CalendarPage() {
  const data = await getDashboardSafe();
  const items = data.rows
    .map((r) => ({ row: r, day: toDay(r.nextEarnings) }))
    .filter((x): x is { row: typeof x.row; day: string } => x.day != null)
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  return (
    <AppShell title="Calendar" subtitle="Upcoming earnings for your tracked names.">
      {items.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-10 text-center shadow-card">
          <p className="text-[13px] text-muted">
            No upcoming earnings dates yet. They populate from the earnings-calendar ingestion job.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.04em] text-muted">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-2 py-3 font-medium">In</th>
                <th className="px-2 py-3 font-medium">Ticker</th>
                <th className="px-2 py-3 text-center font-medium">Action</th>
                <th className="px-5 py-3 text-right font-medium">Expected move</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ row, day }) => {
                const d = daysUntil(day);
                return (
                  <tr key={row.ticker} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
                    <td className="num px-5 py-2.5 text-[13px] text-ink">{day}</td>
                    <td className={`num px-2 py-2.5 text-[12px] ${d <= 3 ? "text-warn font-semibold" : "text-muted"}`}>
                      {d <= 0 ? "today" : `${d}d`}
                    </td>
                    <td className="px-2 py-2.5">
                      <Link href={`/reports/${row.ticker}`} className="text-[13px] font-bold text-ink hover:text-info">
                        {row.ticker}
                      </Link>
                      <div className="max-w-[14rem] truncate text-[11px] text-muted">{row.name ?? ""}</div>
                    </td>
                    <td className="px-2 py-2.5 text-center"><ActionPill label={row.action.action} tone={row.action.tone} /></td>
                    <td className="num px-5 py-2.5 text-right text-[13px] text-ink">
                      {row.expectedMovePct != null ? `±${fmtPct(row.expectedMovePct).replace("+", "")}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
