import { sql } from "../lib/db";

// Observability: every run opens/closes an ingestion_runs row. `withRun` never
// throws — a per-ticker source failure is logged as 'failed'/'degraded' and the
// surrounding job keeps going (one dead source ≠ a dead run).

export type RunStatus = "success" | "degraded" | "failed";

export interface RunResult {
  rowsWritten: number;
  status?: RunStatus; // default 'success'
  error?: string | null;
}

export async function withRun(
  jobName: string,
  ticker: string | null,
  fn: () => Promise<RunResult>
): Promise<RunResult> {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ingestion_runs (job_name, ticker, status)
    VALUES (${jobName}, ${ticker}, 'running')
    RETURNING id`;
  try {
    const r = await fn();
    await sql`
      UPDATE ingestion_runs
      SET finished_at = now(), status = ${r.status ?? "success"},
          rows_written = ${r.rowsWritten}, error = ${r.error ?? null}
      WHERE id = ${row.id}`;
    return r;
  } catch (e) {
    await sql`
      UPDATE ingestion_runs
      SET finished_at = now(), status = 'failed', error = ${String(e)}
      WHERE id = ${row.id}`;
    return { rowsWritten: 0, status: "failed", error: String(e) };
  }
}
