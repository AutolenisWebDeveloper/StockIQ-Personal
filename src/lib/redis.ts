import IORedis from "ioredis";

// ioredis singleton used both by the app (health ping) and BullMQ. BullMQ
// requires `maxRetriesPerRequest: null` on its connection.
const globalForRedis = globalThis as unknown as {
  connection?: IORedis;
};

export const connection =
  globalForRedis.connection ??
  new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null, // BullMQ requirement
    lazyConnect: true, // connect on first command, not at import (clean builds)
  });

if (process.env.NODE_ENV !== "production") globalForRedis.connection = connection;
