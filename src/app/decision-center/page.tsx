import { AppShell } from "@/components/shell/AppShell";
import { getDashboardSafe } from "@/lib/dashboard/queries";
import { RankingTable } from "@/components/pages/RankingTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function Stat({ label, value, tone = "ink" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-5 py-4 shadow-card">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={`num mt-1 text-2xl font-bold text-${tone}`}>{value}</div>
    </div>
  );
}

export default async function DecisionCenterPage() {
  const data = await getDashboardSafe();
  const rows = data.rows; // already sorted by conviction desc
  const buys = rows.filter((r) => r.action.tone === "buy").length;
  const sells = rows.filter((r) => r.action.tone === "sell").length;
  const holds = rows.length - buys - sells;

  return (
    <AppShell title="Decision Center" subtitle="Every tracked name, ranked by conviction with action, opportunity, and risk.">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Tracked" value={rows.length} />
          <Stat label="Buy / Add" value={buys} tone="buy" />
          <Stat label="Hold" value={holds} tone="muted" />
          <Stat label="Sell / Reduce" value={sells} tone="sell" />
        </div>
        <RankingTable rows={rows} highlight="conviction" emptyMsg="No tracked names yet — add tickers on the Watchlists page to populate the Decision Center." />
      </div>
    </AppShell>
  );
}
