import type { DashboardData } from "@/lib/dashboard/queries";
import { Panel, Empty } from "@/components/ui/primitives";

type Priority = "Critical" | "High" | "Medium";
const tag: Record<Priority, string> = {
  Critical: "bg-sell-soft text-sell",
  High: "bg-warn-soft text-warn",
  Medium: "bg-paper text-muted",
};

interface Item { ticker: string; name: string | null; reason: string; priority: Priority; action: string; }

function build(data: DashboardData): Item[] {
  const items = new Map<string, Item>();
  const days = (d: string) => (new Date(d).getTime() - Date.now()) / 86400_000;

  for (const e of data.earnings) {
    if (!e.nextEarnings) continue;
    const dd = days(e.nextEarnings);
    if (dd <= 2) items.set(e.ticker, { ticker: e.ticker, name: e.name, reason: dd <= 1 ? "Earnings Tomorrow" : "Earnings Soon", priority: "Critical", action: "Priority" });
  }
  for (const f of data.filings.slice(0, 3)) {
    if (!items.has(f.ticker)) items.set(f.ticker, { ticker: f.ticker, name: null, reason: `New ${f.formType} Filed`, priority: "High", action: "Investigate" });
  }
  for (const r of data.rows) {
    if (items.size >= 5) break;
    if (!items.has(r.ticker) && (r.opportunity >= 70 || r.opportunity <= 30)) {
      items.set(r.ticker, { ticker: r.ticker, name: r.name, reason: r.opportunity >= 70 ? "Opportunity signal" : "Risk signal", priority: "Medium", action: "Monitor" });
    }
  }
  return [...items.values()].slice(0, 5);
}

export function ResearchQueue({ data }: { data: DashboardData }) {
  const items = build(data);
  return (
    <Panel title="Research Queue" action={{ label: "View all", href: "/research" }}>
      {items.length === 0 ? (
        <Empty>Nothing queued — no imminent earnings, filings, or signals.</Empty>
      ) : (
        <ol className="space-y-1.5">
          {items.map((it, i) => (
            <li key={it.ticker} className="flex items-center gap-3 rounded-lg px-1 py-1.5">
              <span className="num w-4 text-[12px] text-muted">{i + 1}</span>
              <div className="w-24 shrink-0">
                <div className="text-[13px] font-bold text-ink">{it.ticker}</div>
                {it.name && <div className="truncate text-[11px] text-muted">{it.name}</div>}
              </div>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tag[it.priority]}`}>{it.priority}</span>
              <span className="flex-1 truncate text-[12px] text-muted">{it.reason}</span>
              <span className="text-[12px] text-muted">{it.action}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
