// queues.ts
import { Queue } from "bullmq";
import { connection } from "../lib/redis";
import { Job } from "./jobs";

export const queues = Object.fromEntries(
  Object.values(Job).map((name) => [name, new Queue(name, { connection })])
) as Record<Job, Queue>;
