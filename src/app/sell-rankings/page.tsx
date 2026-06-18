import { AppShell } from "@/components/shell/AppShell";
import { getDashboardSafe } from "@/lib/dashboard/queries";
import { RankingTable } from "@/components/pages/RankingTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function SellRankingsPage() {
  const data = await getDashboardSafe();
  const rows = data.rows
    .filter((r) => r.action.tone === "sell")
    .sort((a, b) => (a.conviction ?? 101) - (b.conviction ?? 101));

  return (
    <AppShell title="Sell Rankings" subtitle="Names with a sell/reduce action, weakest conviction first.">
      <RankingTable
        rows={rows}
        highlight="conviction"
        emptyMsg="No sell-rated names yet. Once conviction is computed, sell/reduce candidates rank here."
      />
    </AppShell>
  );
}
