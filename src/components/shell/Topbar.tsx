import { Search, Calendar, Bell } from "lucide-react";

function nowET(): string {
  const d = new Date();
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return `${date}  ${time} ET`;
}

export function Topbar({ title, subtitle, alerts = 0 }: { title: string; subtitle?: string; alerts?: number }) {
  return (
    <header className="flex items-start justify-between gap-6 px-8 pb-2 pt-7">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4 pt-1">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            placeholder="Search ticker or company..."
            className="h-9 w-72 rounded-lg border border-line bg-surface pl-9 pr-12 text-[13px] text-ink placeholder:text-muted focus:border-info focus:outline-none focus:ring-2 focus:ring-info/20"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">⌘ K</kbd>
        </div>
        <button className="flex items-center gap-2 text-[13px] font-medium text-muted hover:text-ink">
          <Calendar size={17} strokeWidth={1.9} /> Calendar
        </button>
        <button className="relative flex items-center gap-2 text-[13px] font-medium text-muted hover:text-ink">
          <Bell size={17} strokeWidth={1.9} /> Alerts
          {alerts > 0 && (
            <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-sell px-1 text-[10px] font-semibold text-surface">
              {alerts}
            </span>
          )}
        </button>
        <span className="num whitespace-nowrap pl-2 text-[12px] text-muted">{nowET()}</span>
      </div>
    </header>
  );
}
