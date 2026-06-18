import Link from "next/link";
import { FileText } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { getDashboardSafe } from "@/lib/dashboard/queries";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ReportRow {
  ticker: string;
  report_type: string;
  model: string | null;
  generated_at: string | Date | null;
}

const TYPE_LABEL: Record<string, string> = {
  decision: "Decision Report",
  exec_summary: "Exec Summary",
  filing_diff: "Filing Diff",
  earnings: "Earnings",
  risk: "Risk",
  deep: "Deep Dive",
};

function fmtWhen(d: string | Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

export default async function ReportsPage() {
  const data = await getDashboardSafe();
  let recent: ReportRow[] = [];
  try {
    recent = (await sql`
      SELECT ticker, report_type, model, generated_at
      FROM ai_reports ORDER BY generated_at DESC LIMIT 50`) as unknown as ReportRow[];
  } catch {
    /* DB unavailable → empty */
  }

  return (
    <AppShell title="Reports" subtitle="Generated AI Decision Reports and per-ticker access.">
      <div className="space-y-5">
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <h2 className="border-b border-line px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">
            Recently generated
          </h2>
          {recent.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted">
              No reports generated yet. Open any ticker below and generate its Decision Report.
            </p>
          ) : (
            <table className="w-full">
              <tbody>
                {recent.map((r, i) => (
                  <tr key={`${r.ticker}-${i}`} className="border-b border-line/70 last:border-0 hover:bg-paper/40">
                    <td className="px-5 py-2.5">
                      <Link href={`/reports/${r.ticker}`} className="text-[13px] font-bold text-ink hover:text-info">{r.ticker}</Link>
                    </td>
                    <td className="px-2 py-2.5 text-[12px] text-ink">{TYPE_LABEL[r.report_type] ?? r.report_type}</td>
                    <td className="px-2 py-2.5 text-[12px] text-muted">{r.model ?? "—"}</td>
                    <td className="px-5 py-2.5 text-right text-[12px] text-muted">{fmtWhen(r.generated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">By ticker</h2>
          {data.rows.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">Add tickers on the Watchlists page to generate reports.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.rows.map((r) => (
                <Link
                  key={r.ticker}
                  href={`/reports/${r.ticker}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-paper px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-info hover:text-info"
                >
                  <FileText size={13} /> {r.ticker}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
