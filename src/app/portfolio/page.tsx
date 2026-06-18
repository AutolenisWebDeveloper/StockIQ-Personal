import { AppShell } from "@/components/shell/AppShell";
import { PortfolioManager } from "@/components/phase5/PortfolioManager";
import { getPortfolio, type PortfolioView } from "@/lib/portfolio/math";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  let pf: PortfolioView = { id: null, name: "Portfolio", holdings: [], totalValue: 0, totalCost: 0, totalPlDollar: 0, totalPlPct: null, concentrationPct: null };
  try {
    pf = await getPortfolio();
  } catch {
    /* DB unavailable → empty */
  }
  return (
    <AppShell title="Portfolio" subtitle="Holdings, market value, P/L, and concentration.">
      <PortfolioManager pf={pf} />
    </AppShell>
  );
}
