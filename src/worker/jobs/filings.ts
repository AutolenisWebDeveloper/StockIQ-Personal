import { sql } from "../../lib/db";
import { getActiveUniverse } from "../../lib/universe";
import { filingsChain } from "../../providers/registry";
import { withRun } from "../runlog";
import type { Filing } from "../../providers/types";

const edgar = filingsChain[0];

function dayKey(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

async function storeForm4(ticker: string, filing: Filing, filingId: number): Promise<number> {
  const txns = await edgar.getForm4(filing);
  let n = 0;
  for (const t of txns) {
    const inserted = await sql`
      INSERT INTO insider_transactions
        (ticker, insider_name, role, txn_type, shares, price, value, txn_date, filing_id)
      VALUES (${ticker}, ${t.insiderName}, ${t.role}, ${t.txnType}, ${t.shares}, ${t.price},
              ${t.value}, ${dayKey(t.txnDate)}, ${filingId})
      ON CONFLICT (ticker, insider_name, txn_date, txn_type, shares, price) DO NOTHING
      RETURNING id`;
    n += inserted.length;
  }
  return n;
}

async function store13F(ticker: string, filing: Filing): Promise<number> {
  const holdings = await edgar.get13F(filing);
  let n = 0;
  for (const h of holdings) {
    const inserted = await sql`
      INSERT INTO institutional_holdings (ticker, holder_name, shares, value, report_period)
      VALUES (${ticker}, ${h.holderName}, ${h.shares}, ${h.value}, ${dayKey(h.reportPeriod)})
      ON CONFLICT (ticker, holder_name, report_period) DO NOTHING
      RETURNING id`;
    n += inserted.length;
  }
  return n;
}

async function processTicker(ticker: string): Promise<{ rows: number }> {
  const [last] = await sql<{ accession_no: string }[]>`
    SELECT accession_no FROM sec_filings WHERE ticker = ${ticker}
    ORDER BY filed_at DESC NULLS LAST LIMIT 1`;
  const filings = await edgar.pollSubmissions(ticker, last?.accession_no ?? null);

  let rows = 0;
  for (const f of filings) {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO sec_filings (ticker, cik, form_type, filed_at, accession_no, url, processed)
      VALUES (${ticker}, ${f.cik}, ${f.formType}, ${f.filedAt.toISOString()}, ${f.accessionNo}, ${f.url}, false)
      ON CONFLICT (accession_no) DO NOTHING
      RETURNING id`;
    if (!row) continue; // already had it
    rows++;
    if (f.formType === "4") rows += await storeForm4(ticker, f, row.id);
    else if (f.formType.startsWith("13F")) rows += await store13F(ticker, f);
  }
  return { rows };
}

export async function runFilings(tickers?: string[]): Promise<void> {
  const universe = tickers ?? (await getActiveUniverse());
  for (const ticker of universe) {
    await withRun("filings-poll", ticker, async () => {
      const r = await processTicker(ticker);
      return { rowsWritten: r.rows };
    });
  }
}
