import { sql } from "../../lib/db";
import { getActiveUniverse } from "../../lib/universe";
import { newsChain, withFallback } from "../../providers/registry";
import { withRun } from "../runlog";

// yfinance headlines + EDGAR 8-K (the 8-K spine is already landed in sec_filings
// by filings-poll; surface recent ones into the news feed). Upsert on url.
async function processTicker(ticker: string): Promise<{ rows: number; degraded: boolean }> {
  const res = await withFallback(newsChain, (p) => p.getHeadlines(ticker, 20), {
    method: "getHeadlines",
    ticker,
    args: [20],
    ttlSec: 1800,
  });

  let rows = 0;
  for (const n of res.value) {
    if (!n.url) continue;
    const inserted = await sql`
      INSERT INTO news_articles (ticker, title, url, body, published_at, source)
      VALUES (${ticker}, ${n.title}, ${n.url}, ${n.body}, ${n.publishedAt?.toISOString() ?? null}, ${n.source})
      ON CONFLICT (url) DO NOTHING
      RETURNING id`;
    rows += inserted.length;
  }

  // recent 8-K filings as news items (material-event spine)
  const eightKs = await sql<{ accession_no: string; filed_at: string; url: string }[]>`
    SELECT accession_no, filed_at, url FROM sec_filings
    WHERE ticker = ${ticker} AND form_type = '8-K' AND filed_at > now() - interval '14 days'`;
  for (const f of eightKs) {
    const inserted = await sql`
      INSERT INTO news_articles (ticker, title, url, published_at, source)
      VALUES (${ticker}, ${`8-K filed (${f.accession_no})`}, ${f.url}, ${f.filed_at}, ${"SEC EDGAR"})
      ON CONFLICT (url) DO NOTHING
      RETURNING id`;
    rows += inserted.length;
  }

  return { rows, degraded: res.degraded };
}

export async function runNews(tickers?: string[]): Promise<void> {
  const universe = tickers ?? (await getActiveUniverse());
  for (const ticker of universe) {
    await withRun("news-headlines", ticker, async () => {
      const r = await processTicker(ticker);
      return { rowsWritten: r.rows, status: r.degraded ? "degraded" : "success" };
    });
  }
}
