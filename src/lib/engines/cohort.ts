import { sql } from "../db";

// Sector cohort resolution + percentile ranking — the shared basis for every
// sector-relative sub-score. Cohort = active-universe tickers sharing
// stocks.sector; fall back to the full active universe if the sector cohort has
// < 8 members. We record which cohort was used so scores are auditable.

const MIN_COHORT = 8;

export interface Cohort {
  tickers: string[]; // includes the target ticker
  cohortUsed: string; // sector name, or 'active-universe'
}

/** Active universe = watchlist_items ∪ the target ticker (on-demand). */
async function activeUniverse(target: string): Promise<string[]> {
  const rows = await sql<{ ticker: string }[]>`
    SELECT DISTINCT ticker FROM watchlist_items
    UNION SELECT ${target}`;
  return rows.map((r) => r.ticker);
}

export async function resolveCohort(ticker: string): Promise<Cohort> {
  const universe = await activeUniverse(ticker);
  const [self] = await sql<{ sector: string | null }[]>`SELECT sector FROM stocks WHERE ticker = ${ticker}`;
  const sector = self?.sector ?? null;

  if (sector) {
    const peers = await sql<{ ticker: string }[]>`
      SELECT ticker FROM stocks
      WHERE sector = ${sector} AND ticker = ANY(${universe})`;
    const cohort = [...new Set([...peers.map((p) => p.ticker), ticker])];
    if (cohort.length >= MIN_COHORT) return { tickers: cohort, cohortUsed: sector };
  }
  // fallback: full active universe
  return { tickers: universe, cohortUsed: "active-universe" };
}

/**
 * Percentile rank (0–100) of `value` within `population` (nulls dropped).
 * Uses the midpoint convention for ties. Returns null if value is null or the
 * population is empty.
 */
export function percentileRank(value: number | null, population: (number | null)[]): number | null {
  if (value == null) return null;
  const pop = population.filter((v): v is number => v != null);
  if (pop.length === 0) return null;
  let below = 0;
  let equal = 0;
  for (const v of pop) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return ((below + 0.5 * equal) / pop.length) * 100;
}

/**
 * Compute a metric for every cohort member, then return the target's percentile
 * rank for that metric. `higherIsBetter=false` inverts (e.g., debt/equity).
 */
export async function cohortPercentile(
  target: string,
  cohort: string[],
  metric: (ticker: string) => Promise<number | null>,
  higherIsBetter = true
): Promise<number | null> {
  const values = await Promise.all(cohort.map((t) => metric(t)));
  const targetVal = values[cohort.indexOf(target)] ?? null;
  const pct = percentileRank(targetVal, values);
  if (pct == null) return null;
  return higherIsBetter ? pct : 100 - pct;
}
