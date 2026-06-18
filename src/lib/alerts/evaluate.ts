import { sql } from "../db";
import type { AlertType } from "./types";

// Alert evaluation. Each alert has a type + condition_json + ticker; we evaluate
// it against the current deterministic engine state and return a fired message
// (or null). Conditions read only from the DB — no fabrication.

export interface AlertRow {
  id: number;
  type: AlertType;
  ticker: string | null;
  condition_json: Record<string, unknown> | null;
  channel: "email" | "telegram";
}

async function latestPrice(ticker: string): Promise<number | null> {
  const [r] = await sql<{ adj_close: string }[]>`SELECT adj_close FROM stock_prices WHERE ticker = ${ticker} ORDER BY ts DESC LIMIT 1`;
  return r ? Number(r.adj_close) : null;
}

export async function evaluateAlert(a: AlertRow): Promise<string | null> {
  const t = a.ticker;
  const cond = a.condition_json ?? {};
  switch (a.type) {
    case "price_above": {
      if (!t) return null;
      const price = await latestPrice(t);
      const level = Number(cond.level);
      return price != null && level && price >= level ? `${t} ${price.toFixed(2)} rose above ${level}` : null;
    }
    case "price_below": {
      if (!t) return null;
      const price = await latestPrice(t);
      const level = Number(cond.level);
      return price != null && level && price <= level ? `${t} ${price.toFixed(2)} fell below ${level}` : null;
    }
    case "conviction_band": {
      if (!t) return null;
      const rows = await sql<{ band: string | null }[]>`
        SELECT band FROM conviction_scores WHERE ticker = ${t} AND band IS NOT NULL ORDER BY ts DESC LIMIT 2`;
      return rows.length === 2 && rows[0].band !== rows[1].band
        ? `${t} conviction band changed ${rows[1].band} → ${rows[0].band}`
        : null;
    }
    case "opportunity": {
      if (!t) return null;
      const [r] = await sql<{ type: string; polarity: string }[]>`
        SELECT type, polarity FROM opportunity_signals WHERE ticker = ${t} AND detected_at > now() - interval '1 day'
        ORDER BY detected_at DESC LIMIT 1`;
      if (!r) return null;
      if (cond.polarity && cond.polarity !== r.polarity) return null;
      return `${t} new opportunity signal: ${r.type} (${r.polarity})`;
    }
    case "earnings_near": {
      if (!t) return null;
      const [r] = await sql<{ next_earnings_date: string | null }[]>`SELECT next_earnings_date FROM stocks WHERE ticker = ${t}`;
      if (!r?.next_earnings_date) return null;
      const days = Number(cond.days ?? 7);
      const dd = (new Date(r.next_earnings_date).getTime() - Date.now()) / 86400_000;
      return dd >= 0 && dd <= days ? `${t} earnings in ${Math.round(dd)} day(s)` : null;
    }
    case "thesis_break": {
      if (!t) return null;
      const [r] = await sql<{ status: string | null }[]>`
        SELECT status FROM thesis_tracker WHERE ticker = ${t} ORDER BY last_reviewed DESC NULLS LAST, created_at DESC LIMIT 1`;
      return r?.status === "invalidated" ? `${t} thesis invalidated` : null;
    }
    default:
      return null;
  }
}
