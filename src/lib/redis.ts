import IORedis, { type RedisOptions } from "ioredis";

// ioredis singleton used both by the app (health ping) and BullMQ. BullMQ
// requires `maxRetriesPerRequest: null` on its connection.
//
// Managed Redis (Upstash) uses a TLS endpoint (`rediss://`). ioredis enables
// TLS automatically for the `rediss://` scheme, but Upstash also wants
// `enableReadyCheck: false`; we set it for any TLS endpoint.
const globalForRedis = globalThis as unknown as {
  connection?: IORedis;
};

const url = process.env.REDIS_URL ?? "";
const isTls = url.startsWith("rediss://");

const options: RedisOptions = {
  maxRetriesPerRequest: null, // BullMQ requirement
  lazyConnect: true, // connect on first command, not at import (clean builds)
  ...(isTls ? { tls: {}, enableReadyCheck: false } : {}),
};

export const connection = globalForRedis.connection ?? new IORedis(url, options);

if (process.env.NODE_ENV !== "production") globalForRedis.connection = connection;
