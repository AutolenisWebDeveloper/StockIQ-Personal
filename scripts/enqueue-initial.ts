import { getQueue } from "../src/queue/queues";
import { Job } from "../src/queue/jobs";

// One-shot kickoff of the full ingestion + compute sweep over the active
// universe (the watchlist tickers seeded by `npm run seed`). The repeatable
// cron jobs registered by the worker still run on their normal cadence; this
// just primes the database immediately so the dashboard populates without
// waiting for the nightly schedule. Safe to re-run — every job is idempotent.
//
// Run where REDIS_URL (Upstash) is set — i.e. a Railway one-off, or locally
// with the env exported. The worker must be running to process what we enqueue.

// Ingestion first: these pull prices/fundamentals/filings/macro for the
// universe. prices-eod cascades into compute per-ticker on its own.
const INGEST: Job[] = [
  Job.PricesEod,
  Job.Fundamentals,
  Job.EarningsCalendar,
  Job.ConsensusSnapshot,
  Job.EstimateSnapshot,
  Job.Macro,
  Job.NewsHeadlines,
  Job.FilingsPoll,
];

// Derived work: give ingestion a head start so these operate on fresh rows.
const DERIVED: Job[] = [
  Job.Compute, // full-universe deterministic recompute (belt-and-suspenders vs. the per-ticker cascade)
  Job.EmbedFilings, // chunk + embed any filings that landed (RAG)
];
const DERIVED_DELAY_MS = 90_000;

async function main() {
  for (const job of INGEST) {
    await getQueue(job).add(job, {});
    console.log(`[bootstrap] enqueued ${job}`);
  }
  for (const job of DERIVED) {
    await getQueue(job).add(job, {}, { delay: DERIVED_DELAY_MS });
    console.log(`[bootstrap] enqueued ${job} (delay ${DERIVED_DELAY_MS / 1000}s)`);
  }
  console.log(
    `[bootstrap] enqueued ${INGEST.length + DERIVED.length} kickoff jobs — the worker will process them`
  );
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
