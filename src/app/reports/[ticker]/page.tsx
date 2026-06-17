import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppShell } from "@/components/shell/AppShell";
import { GenerateButton } from "@/components/reports/GenerateButton";
import { getLatestReport, isStale } from "@/lib/ai/decision-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker: raw } = await params;
  const ticker = raw.toUpperCase();

  let report = null;
  try {
    report = await getLatestReport(ticker);
  } catch {
    report = null;
  }

  return (
    <AppShell title={`${ticker} — Decision Report`} subtitle="Buy / hold / sell / wait / reduce — for both horizons." alerts={8}>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between rounded-card border border-line bg-surface px-5 py-3 shadow-card">
          <div className="text-[12px] text-muted">
            {report?.generatedAt ? (
              <>
                Generated {new Date(report.generatedAt).toLocaleString()} · model {report.model ?? "—"}
                {isStale(report.generatedAt) && <span className="ml-2 text-warn">stale (&gt;24h)</span>}
              </>
            ) : (
              "No report yet for this ticker."
            )}
          </div>
          <GenerateButton ticker={ticker} hasReport={!!report?.contentMd} />
        </div>

        {report?.contentMd ? (
          <article className="prose-report rounded-card border border-line bg-surface px-7 py-6 shadow-card">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.contentMd}</ReactMarkdown>
          </article>
        ) : (
          <div className="rounded-card border border-line bg-surface p-10 text-center shadow-card">
            <p className="text-[13px] text-muted">
              The Decision Report composes a buy/hold/sell/wait/reduce call around the deterministic engine
              values (composition law: engines compute every number; the AI only narrates, and renders
              anything unavailable as <span className="font-mono">UNAVAILABLE</span>). Generate one to begin.
            </p>
            <p className="mt-2 text-[11px] text-muted">
              Requires a running worker plus ANTHROPIC_API_KEY (reasoning) and OPENAI_API_KEY (filing RAG).
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
