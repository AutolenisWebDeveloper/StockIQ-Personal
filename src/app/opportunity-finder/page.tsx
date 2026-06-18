import { AppShell } from "@/components/shell/AppShell";
import { getDashboardSafe } from "@/lib/dashboard/queries";
import { RankingTable } from "@/components/pages/RankingTable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function OpportunityFinderPage() {
  const data = await getDashboardSafe();
  // Surface the strongest opportunity signals first; ties broken by conviction.
  const rows = [...data.rows].sort(
    (a, b) => b.opportunity - a.opportunity || (b.conviction ?? -1) - (a.conviction ?? -1),
  );

  return (
    <AppShell title="Opportunity Finder" subtitle="Tracked names ranked by detected opportunity-signal strength.">
      <RankingTable
        rows={rows}
        highlight="opportunity"
        emptyMsg="No opportunity signals yet. Pullbacks, breakouts, and other setups detected by the engine surface here."
      />
    </AppShell>
  );
}
