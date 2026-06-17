import { AppShell } from "@/components/shell/AppShell";
import { getDashboardData, type DashboardData } from "@/lib/dashboard/queries";
import { MorningBrief } from "@/components/dashboard/MorningBrief";
import { RankingColumn } from "@/components/dashboard/RankingCards";
import { ResearchQueue } from "@/components/dashboard/ResearchQueue";
import { WatchlistRankings } from "@/components/dashboard/WatchlistRankings";
import { ThesisHealth } from "@/components/dashboard/ThesisHealth";
import {
  EarningsRadar, FilingAlerts, InsiderActivity, InstitutionalActivity, MarketPulse,
} from "@/components/dashboard/ActivityPanels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY: DashboardData = {
  rows: [], topBuys: [], topSells: [], filings: [], insiders: [], institutions: [],
  earnings: [], pulse: [], brief: { highestConviction: null, highestRisk: null, topEarnings: null, newFiling: null }, hasData: false,
};

export default async function DashboardPage() {
  let data: DashboardData = EMPTY;
  let dbError = false;
  try {
    data = await getDashboardData();
  } catch {
    dbError = true;
  }

  return (
    <AppShell title="Good Morning, Markist" subtitle="Here's what matters today." alerts={8}>
      <div className="space-y-5">
        {dbError && (
          <div className="rounded-card border border-warn/40 bg-warn-soft px-4 py-2 text-[13px] text-warn">
            Database unavailable — run <span className="num">npm run migrate &amp;&amp; npm run seed</span> (and ingestion + compute) to populate.
          </div>
        )}

        <MorningBrief brief={data.brief} />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <RankingColumn title="Top 3 Buy Opportunities" rows={data.topBuys} side="buy" action={{ label: "View all Buy Rankings", href: "/buy-rankings" }} />
          <RankingColumn title="Top 3 Sell / Reduce" rows={data.topSells} side="sell" action={{ label: "View all Sell Rankings", href: "/sell-rankings" }} />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-4"><ResearchQueue data={data} /></div>
          <div className="lg:col-span-5"><WatchlistRankings rows={data.rows} /></div>
          <div className="lg:col-span-3"><ThesisHealth rows={data.rows} /></div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
          <EarningsRadar rows={data.earnings} />
          <FilingAlerts rows={data.filings} />
          <InsiderActivity rows={data.insiders} />
          <InstitutionalActivity rows={data.institutions} />
          <MarketPulse rows={data.pulse} />
        </div>
      </div>
    </AppShell>
  );
}
