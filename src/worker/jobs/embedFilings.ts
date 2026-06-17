import { sql } from "../../lib/db";
import { getActiveUniverse } from "../../lib/universe";
import { embedFiling } from "../../lib/rag/store";
import { withRun } from "../runlog";

// Embed newly-landed filings into filing_chunks (RAG). Bounded per run to keep
// embedding cost predictable; marks filings processed so re-runs are no-ops.
const MAX_FILINGS_PER_TICKER = 5;

export async function runEmbedFilings(tickers?: string[]): Promise<void> {
  const universe = tickers ?? (await getActiveUniverse());
  for (const ticker of universe) {
    await withRun("embed-filings", ticker, async () => {
      const filings = await sql<{ id: number; url: string | null }[]>`
        SELECT id, url FROM sec_filings
        WHERE ticker = ${ticker} AND processed = false AND url IS NOT NULL
        ORDER BY filed_at DESC NULLS LAST LIMIT ${MAX_FILINGS_PER_TICKER}`;
      let rows = 0;
      for (const f of filings) {
        rows += await embedFiling(f.id, f.url);
        await sql`UPDATE sec_filings SET processed = true WHERE id = ${f.id}`;
      }
      return { rowsWritten: rows };
    });
  }
}
