import { AppShell } from "@/components/shell/AppShell";
import { getDashboardSafe } from "@/lib/dashboard/queries";
import { RankingTable } from "@/components/pages/RankingTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BuyRankingsPage() {
  const data = await getDashboardSafe();
  const rows = data.rows
    .filter((r) => r.action.tone === "buy")
    .sort((a, b) => (b.conviction ?? -1) - (a.conviction ?? -1));

  return (
    <AppShell title="Buy Rankings" subtitle="Names with a buy/add action, ranked by conviction.">
      <RankingTable
        rows={rows}
        highlight="conviction"
        emptyMsg="No buy-rated names yet. Once conviction is computed for your watchlist, buy/add candidates rank here."
      />
    </AppShell>
  );
}
