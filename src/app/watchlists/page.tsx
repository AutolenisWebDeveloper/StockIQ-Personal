import { AppShell } from "@/components/shell/AppShell";
import { getDashboardSafe } from "@/lib/dashboard/queries";
import { WatchlistManager } from "@/components/pages/WatchlistManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function WatchlistsPage() {
  const data = await getDashboardSafe();
  return (
    <AppShell title="Watchlists" subtitle="The tickers you track — this set is the universe the engines compute over.">
      <WatchlistManager rows={data.rows} />
    </AppShell>
  );
}
