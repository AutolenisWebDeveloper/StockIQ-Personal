import type { MacroProvider, MacroPoint } from "./types";
import { fetchJson } from "../lib/http";

// FRED (Federal Reserve Economic Data). Requires FRED_API_KEY.

interface FredResp { observations?: Array<{ date: string; value: string }>; }

export class FredProvider implements MacroProvider {
  name = "fred";

  async getSeries(seriesId: string, from: Date): Promise<MacroPoint[]> {
    const key = process.env.FRED_API_KEY;
    if (!key) throw new Error("FRED_API_KEY not set");
    const start = from.toISOString().slice(0, 10);
    const url =
      `https://api.stlouisfed.org/fred/series/observations` +
      `?series_id=${encodeURIComponent(seriesId)}&api_key=${key}&file_type=json&observation_start=${start}`;
    const data = await fetchJson<FredResp>(url, { provider: "fred" });
    return (data?.observations ?? []).map((o) => ({
      ts: new Date(`${o.date}T00:00:00Z`),
      value: o.value === "." ? null : Number(o.value),
    }));
  }
}

// Macro series tracked daily (rates, CPI, unemployment, yields, GDP).
export const FRED_SERIES = ["DFF", "CPIAUCSL", "UNRATE", "DGS10", "DGS2", "GDP"] as const;
