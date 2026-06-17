import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { Tone } from "@/lib/dashboard/scoring";

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-line bg-surface shadow-card ${className}`}>
      <div className="flex items-center justify-between px-5 pt-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink">{title}</h2>
        {action && (
          <Link href={action.href} className="text-[12px] font-medium text-muted hover:text-ink">
            {action.label} →
          </Link>
        )}
      </div>
      <div className="px-5 pb-4 pt-3">{children}</div>
    </section>
  );
}

const toneText: Record<Tone, string> = { buy: "text-buy", hold: "text-muted", sell: "text-sell" };
const toneSoft: Record<Tone, string> = { buy: "bg-buy-soft text-buy", hold: "bg-paper text-muted", sell: "bg-sell-soft text-sell" };

export function ActionPill({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${toneSoft[tone]}`}>{label}</span>;
}

export function RiskText({ label }: { label: "Low" | "Medium" | "High" }) {
  const c = label === "High" ? "text-sell" : label === "Medium" ? "text-warn" : "text-buy";
  return <span className={`text-[12px] font-medium ${c}`}>{label}</span>;
}

export function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  const dot = tone === "buy" ? "bg-buy" : tone === "sell" ? "bg-sell" : "bg-warn";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export function Sparkline({ data, tone }: { data: number[]; tone: Tone }) {
  if (data.length < 2) return <div className="h-9" />;
  const w = 120;
  const h = 36;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / span) * h}`)
    .join(" ");
  const stroke = tone === "sell" ? "#C0392B" : tone === "hold" ? "#8A8678" : "#1E9E6A";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Marks Phase-3 (AI) content that isn't wired to a real engine yet. */
export function AiBadge({ label = "AI" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-info">
      <Sparkles size={10} /> {label}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-muted">{children}</p>;
}

export function fmtNum(v: number | null, dp = 2): string {
  return v == null ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
export function fmtPct(v: number | null, dp = 2): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`;
}
export function fmtMoney(v: number | null): string {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}
