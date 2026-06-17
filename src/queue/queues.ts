// queues.ts — one BullMQ Queue per job, created lazily (on first use) so that
// importing a route during `next build` doesn't open a Redis connection.
// Resilient defaults: exponential backoff, max 3 attempts; failed jobs retained
// for inspection (dead-letter visibility), completed jobs trimmed.
import { Queue } from "bullmq";
import { connection } from "../lib/redis";
import { Job } from "./jobs";

const cache = new Map<Job, Queue>();

export function getQueue(name: Job): Queue {
  let q = cache.get(name);
  if (!q) {
    q = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    });
    cache.set(name, q);
  }
  return q;
}
