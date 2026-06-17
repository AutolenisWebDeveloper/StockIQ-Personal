import { sql } from "../db";
import { fetchText } from "../http";
import { htmlToText, chunkText } from "./chunk";
import { embed, embedOne, toVectorLiteral } from "../ai/embeddings";

// Filing RAG store: fetch a filing's primary document, chunk + embed it into
// filing_chunks (pgvector), and retrieve the most relevant chunks for a ticker.

const MAX_CHUNKS_PER_FILING = 40; // bound cost on very large filings

export interface RetrievedChunk {
  text: string;
  accessionNo: string | null;
  formType: string | null;
  filedAt: string | null;
  url: string | null;
}

/** Embed one filing (idempotent on filing_chunks natural key). Returns chunks written. */
export async function embedFiling(filingId: number, url: string | null): Promise<number> {
  if (!url) return 0;
  const html = await fetchText(url, { provider: "sec", okStatuses: [404] });
  if (!html) return 0;
  const text = htmlToText(html);
  const chunks = chunkText(text).slice(0, MAX_CHUNKS_PER_FILING);
  if (!chunks.length) return 0;

  const vectors = await embed(chunks);
  let written = 0;
  for (let i = 0; i < chunks.length; i++) {
    const inserted = await sql`
      INSERT INTO filing_chunks (filing_id, chunk_index, text, embedding)
      VALUES (${filingId}, ${i}, ${chunks[i]}, ${toVectorLiteral(vectors[i])}::vector)
      ON CONFLICT (filing_id, chunk_index) DO NOTHING
      RETURNING id`;
    written += inserted.length;
  }
  return written;
}

/** Semantic retrieval over a ticker's filing chunks (cosine distance via pgvector). */
export async function retrieve(ticker: string, query: string, k = 8): Promise<RetrievedChunk[]> {
  const qvec = toVectorLiteral(await embedOne(query));
  return sql<RetrievedChunk[]>`
    SELECT fc.text,
           sf.accession_no AS "accessionNo", sf.form_type AS "formType",
           sf.filed_at AS "filedAt", sf.url
    FROM filing_chunks fc
    JOIN sec_filings sf ON sf.id = fc.filing_id
    WHERE sf.ticker = ${ticker}
    ORDER BY fc.embedding <=> ${qvec}::vector
    LIMIT ${k}`;
}
