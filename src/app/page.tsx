import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WatchlistRow = { ticker: string; added_at: string };

async function getWatchlist(): Promise<WatchlistRow[]> {
  // Minimal Phase-0 read: the first watchlist's items. Phase 1+ adds the
  // conviction rank, bands and provenance-tagged values to this ledger.
  return sql<WatchlistRow[]>`
    SELECT wi.ticker, wi.added_at
    FROM watchlist_items wi
    JOIN watchlists w ON w.id = wi.watchlist_id
    WHERE w.id = (SELECT id FROM watchlists ORDER BY id LIMIT 1)
    ORDER BY wi.added_at ASC`;
}

function asOf(): string {
  // mono + slate timestamp, always present (design-direction §6)
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes()
  )} UTC`;
}

export default async function DashboardPage() {
  let rows: WatchlistRow[] = [];
  let dbError: string | null = null;
  try {
    rows = await getWatchlist();
  } catch (e) {
    dbError = String(e);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-baseline justify-between border-b border-rule pb-4">
        <h1 className="font-display text-[20px] font-bold tracking-tight text-ink">
          STOCKIQ
          <span className="ml-3 font-sans text-eyebrow uppercase tracking-[0.08em] text-slate">
            watchlist
          </span>
        </h1>
        <span className="num text-prov text-slate">as of {asOf()}</span>
      </header>

      {dbError ? (
        <p className="mt-8 text-data text-down">
          Database unavailable — run <span className="num">npm run migrate &amp;&amp; npm run seed</span>.
        </p>
      ) : rows.length === 0 ? (
        // Empty states are invitations (design-direction §6)
        <p className="mt-8 text-data text-slate">Add a ticker to begin tracking.</p>
      ) : (
        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-b border-rule text-left text-eyebrow uppercase tracking-[0.08em] text-slate">
              <th className="py-2 font-medium">Ticker</th>
              <th className="py-2 font-medium">Added</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker} className="border-b border-rule">
                <td className="num py-2 text-data font-medium text-ink">{r.ticker}</td>
                <td className="num py-2 text-prov text-slate">
                  {new Date(r.added_at).toISOString().slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <footer className="mt-12 border-t border-rule pt-4 text-prov text-slate">
        Personal research and education only — not personalized financial, legal, or tax advice.
        Verify all numbers independently before acting.
      </footer>
    </main>
  );
}
