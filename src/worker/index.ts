import { Worker } from "bullmq";
import { connection } from "../lib/redis";
import { Job } from "../queue/jobs";
import { runPrices } from "./jobs/prices";
import { runFundamentals } from "./jobs/fundamentals";
import { runFilings } from "./jobs/filings";
import { runConsensus } from "./jobs/consensus";
import { runEstimates } from "./jobs/estimates";
import { runMacro } from "./jobs/macro";
import { runNews } from "./jobs/news";
import { runEarningsCalendar } from "./jobs/earningsCal";
import { runColdFetch } from "./jobs/coldFetch";
import { runCompute } from "./jobs/compute";
import { runEmbedFilings } from "./jobs/embedFilings";
import { runGenerateReport } from "./jobs/generateReport";
import { runAlertsEval } from "./jobs/alertsEval";
import { registerSchedules } from "./schedule";

// data shape jobs may carry: { tickers?: string[] } or { ticker: string }
interface JobData {
  tickers?: string[];
  ticker?: string;
}

const handlers: Record<Job, (data: JobData) => Promise<void>> = {
  [Job.PricesEod]: (d) => runPrices(d.tickers),
  [Job.Fundamentals]: (d) => runFundamentals(d.tickers),
  [Job.FilingsPoll]: (d) => runFilings(d.tickers),
  [Job.ConsensusSnapshot]: (d) => runConsensus(d.tickers),
  [Job.EstimateSnapshot]: (d) => runEstimates(d.tickers),
  [Job.Macro]: () => runMacro(),
  [Job.NewsHeadlines]: (d) => runNews(d.tickers),
  [Job.EarningsCalendar]: (d) => runEarningsCalendar(d.tickers),
  [Job.ColdFetch]: (d) => runColdFetch(d.ticker!),
  [Job.Compute]: (d) => runCompute(d.tickers),
  [Job.EmbedFilings]: (d) => runEmbedFilings(d.tickers),
  [Job.GenerateReport]: (d) => runGenerateReport(d.tickers),
  [Job.AlertsEval]: () => runAlertsEval(),
};

const workers = Object.values(Job).map(
  (name) =>
    new Worker(
      name,
      async (job) => {
        console.log(`[worker] ${name}#${job.id} start`);
        await handlers[name as Job](job.data ?? {});
        console.log(`[worker] ${name}#${job.id} done`);
      },
      { connection }
    )
);

async function shutdown() {
  console.log("[worker] shutting down…");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

registerSchedules().catch((e) => console.error("[schedule] failed", e));

console.log(`[worker] online; ${workers.length} queues registered`);
