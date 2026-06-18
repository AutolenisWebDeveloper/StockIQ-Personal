import { AppShell } from "@/components/shell/AppShell";
import { getDashboardSafe } from "@/lib/dashboard/queries";
import { ResearchBrowser } from "@/components/pages/ResearchBrowser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const data = await getDashboardSafe();
  return (
    <AppShell title="Research" subtitle="Browse your tracked names and jump into a Decision Report.">
      <ResearchBrowser rows={data.rows} />
    </AppShell>
  );
}
