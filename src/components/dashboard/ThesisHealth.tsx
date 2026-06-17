import { ArrowUp, ArrowDown, ArrowRight } from "lucide-react";
import type { TickerRow } from "@/lib/dashboard/queries";
import { Panel, AiBadge, Empty } from "@/components/ui/primitives";

function Trend({ pct }: { pct: number | null }) {
  if (pct == null) return <ArrowRight size={14} className="text-muted" />;
  if (pct > 0.1) return <ArrowUp size={14} className="text-buy" />;
  if (pct < -0.1) return <ArrowDown size={14} className="text-sell" />;
  return <ArrowRight size={14} className="text-muted" />;
}

export function ThesisHealth({ rows }: { rows: TickerRow[] }) {
  const list = rows.filter((r) => r.conviction != null).slice(0, 6);
  return (
    <Panel title="Thesis Health" action={{ label: "View all", href: "/thesis-tracker" }}>
      <div className="mb-2 flex items-center gap-1 text-[10px] text-muted">
        assumption validation is <AiBadge label="Phase 3" /> — health shown as the conviction proxy
      </div>
      {list.length === 0 ? (
        <Empty>No theses yet.</Empty>
      ) : (
        <table className="w-full">
          <tbody>
            {list.map((r) => {
              const score = r.conviction ?? 0;
              const tone = score >= 66 ? "bg-buy" : score >= 40 ? "bg-warn" : "bg-sell";
              return (
                <tr key={r.ticker} className="border-b border-line/70 last:border-0">
                  <td className="py-2 text-[13px] font-bold text-ink">{r.ticker}</td>
                  <td className="w-28 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-paper">
                        <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${score}%` }} />
                      </div>
                      <span className="num text-[12px] text-muted">{score.toFixed(0)}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right text-[12px] text-muted">{r.thesis.status}</td>
                  <td className="py-2 pl-3 text-right"><Trend pct={r.changePct} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
