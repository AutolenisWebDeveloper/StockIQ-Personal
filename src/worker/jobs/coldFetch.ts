import { ensureStock } from "../../lib/universe";
import { runPrices } from "./prices";
import { runFundamentals } from "./fundamentals";
import { runFilings } from "./filings";

// On-demand cold fetch for an untracked ticker: prices + fundamentals + latest
// filings, same provider/idempotency rules. Caches via the registry.
export async function runColdFetch(ticker: string): Promise<void> {
  const t = ticker.toUpperCase().trim();
  await ensureStock(t);
  await runPrices([t]);
  await runFundamentals([t]);
  await runFilings([t]);
}
