import { createHash } from "node:crypto";
import { connection } from "./redis";

// Provider response cache with a never-expiring "last-good" mirror.
// Key shape: provider:method:ticker:argsHash  (per the Phase 1 spec).
// - The TTL cache serves fresh responses cheaply.
// - The lastGood mirror never expires and carries an `asOf`, so when every
//   provider in a fallback chain fails we can still serve the last-good value
//   (stamped) instead of throwing into the job runner.

export interface LastGood<T> {
  asOf: string; // ISO timestamp of when this value was fetched
  value: T;
}

function argsHash(args: unknown[]): string {
  return createHash("sha1").update(JSON.stringify(args)).digest("hex").slice(0, 12);
}

export function cacheKey(provider: string, method: string, ticker: string, args: unknown[]): string {
  return `cache:${provider}:${method}:${ticker}:${argsHash(args)}`;
}
function lastGoodKey(provider: string, method: string, ticker: string, args: unknown[]): string {
  return `lastgood:${provider}:${method}:${ticker}:${argsHash(args)}`;
}

export async function readCache<T>(key: string): Promise<T | null> {
  const raw = await connection.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function writeCache<T>(key: string, value: T, ttlSec: number): Promise<void> {
  await connection.set(key, JSON.stringify(value), "EX", ttlSec);
}

export async function writeLastGood<T>(
  provider: string,
  method: string,
  ticker: string,
  args: unknown[],
  value: T
): Promise<void> {
  const payload: LastGood<T> = { asOf: new Date().toISOString(), value };
  await connection.set(lastGoodKey(provider, method, ticker, args), JSON.stringify(payload));
}

export async function readLastGood<T>(
  provider: string,
  method: string,
  ticker: string,
  args: unknown[]
): Promise<LastGood<T> | null> {
  const raw = await connection.get(lastGoodKey(provider, method, ticker, args));
  return raw ? (JSON.parse(raw) as LastGood<T>) : null;
}
