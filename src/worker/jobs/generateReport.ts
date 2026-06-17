import { getActiveUniverse } from "../../lib/universe";
import { generateDecisionReport } from "../../lib/ai/decision-report";
import { withRun } from "../runlog";

// Generate the flagship Decision Report (on-demand: enqueued from the API/dashboard).
export async function runGenerateReport(tickers?: string[]): Promise<void> {
  const universe = tickers ?? (await getActiveUniverse());
  for (const ticker of universe) {
    await withRun("generate-report", ticker, async () => {
      const r = await generateDecisionReport(ticker);
      return { rowsWritten: r.contentMd ? 1 : 0 };
    });
  }
}
