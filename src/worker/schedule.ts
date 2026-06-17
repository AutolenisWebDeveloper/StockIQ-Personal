import { getQueue } from "../queue/queues";
import { Job } from "../queue/jobs";

// Repeatable-job registration (the cadence matrix). Cron patterns; market-time
// jobs run in America/New_York. Re-registering is idempotent (BullMQ dedupes
// repeatables by repeat key).
interface Schedule {
  job: Job;
  pattern: string;
  tz?: string;
}

const SCHEDULES: Schedule[] = [
  { job: Job.PricesEod, pattern: "5 22 * * 1-5", tz: "America/New_York" }, // daily ~22:05 ET
  { job: Job.ConsensusSnapshot, pattern: "10 22 * * 1-5", tz: "America/New_York" },
  { job: Job.EstimateSnapshot, pattern: "12 22 * * 1-5", tz: "America/New_York" },
  { job: Job.EarningsCalendar, pattern: "30 6 * * *" }, // daily
  { job: Job.FilingsPoll, pattern: "0 * * * *" }, // hourly
  { job: Job.NewsHeadlines, pattern: "0 */3 * * *" }, // every 3h
  { job: Job.Fundamentals, pattern: "0 6 * * 0" }, // weekly (Sun) + event-driven elsewhere
  { job: Job.Macro, pattern: "0 8 * * *" }, // daily
  { job: Job.Compute, pattern: "20 22 * * 1-5", tz: "America/New_York" }, // daily full-universe recompute after EOD
  { job: Job.EmbedFilings, pattern: "30 * * * *" }, // hourly, after filings-poll (RAG ingest)
  // generate-report is on-demand only (LLM cost) — enqueued from the API/dashboard.
];

export async function registerSchedules(): Promise<void> {
  for (const s of SCHEDULES) {
    await getQueue(s.job).add(
      s.job,
      {},
      { repeat: { pattern: s.pattern, ...(s.tz ? { tz: s.tz } : {}) } }
    );
  }
  console.log(`[schedule] registered ${SCHEDULES.length} repeatable jobs`);
}
