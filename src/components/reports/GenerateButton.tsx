"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";

// Enqueues report generation, then polls the GET endpoint until a fresh report
// lands (the worker does the LLM work off the request path).
export function GenerateButton({ ticker, hasReport }: { ticker: string; hasReport: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setNote("Queued — the worker is composing the report…");
    try {
      await fetch(`/api/reports/${ticker}`, { method: "POST" });
      const started = Date.now();
      // poll up to ~3 min for the worker to finish
      for (;;) {
        await new Promise((r) => setTimeout(r, 5000));
        const res = await fetch(`/api/reports/${ticker}`, { cache: "no-store" });
        const data = await res.json();
        const gen = data.report?.generatedAt ? new Date(data.report.generatedAt).getTime() : 0;
        if (gen >= started) {
          setNote(null);
          router.refresh();
          break;
        }
        if (Date.now() - started > 180_000) {
          setNote("Still working — refresh in a moment. (Needs a running worker + API keys.)");
          break;
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={generate}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-info px-3 py-1.5 text-[13px] font-semibold text-surface disabled:opacity-60"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {hasReport ? "Regenerate report" : "Generate report"}
      </button>
      {note && <span className="text-[12px] text-muted">{note}</span>}
    </div>
  );
}
