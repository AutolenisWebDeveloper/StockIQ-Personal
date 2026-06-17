import { Worker } from "bullmq";
import { connection } from "./lib/redis";
import { Job } from "./queue/jobs";

const workers = Object.values(Job).map((name) =>
  new Worker(name, async (job) => {
    // Phase 0: no-op. Phase 1+ wires real handlers per the cadence matrix.
    console.log(`[worker] received ${name}#${job.id} (no-op in Phase 0)`);
  }, { connection })
);

async function shutdown() {
  console.log("[worker] shutting down…");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
console.log(`[worker] online; ${workers.length} queues registered`);
