import type {
  FundamentalsProvider,
  FilingsProvider,
  IncomeStatement,
  BalanceSheetFacts,
  Filing,
  InsiderTxn,
  InstHolding,
} from "./types";
import { fetchJson, fetchText } from "../lib/http";
import { connection } from "../lib/redis";

// SEC EDGAR. The descriptive User-Agent comes from SEC_USER_AGENT (required by
// SEC) and the http layer enforces the ≤10 req/s limit via the `sec` bucket.

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const DATA = "https://data.sec.gov";
const WWW = "https://www.sec.gov";

function pad10(cik: string): string {
  return cik.replace(/\D/g, "").padStart(10, "0");
}

// ---------- ticker → CIK (cached map) ----------
async function loadTickerMap(): Promise<Record<string, string>> {
  const cached = await connection.get("edgar:tickermap");
  if (cached) return JSON.parse(cached);
  const json = await fetchJson<Record<string, { cik_str: number; ticker: string }>>(TICKERS_URL, {
    provider: "sec",
  });
  const map: Record<string, string> = {};
  for (const row of Object.values(json ?? {})) {
    map[row.ticker.toUpperCase()] = String(row.cik_str);
  }
  await connection.set("edgar:tickermap", JSON.stringify(map), "EX", 86400);
  return map;
}

async function resolveCik(ticker: string): Promise<string | null> {
  const map = await loadTickerMap();
  return map[ticker.toUpperCase()] ?? null;
}

// ---------- XBRL companyfacts helpers ----------
interface FactUnit { end: string; start?: string; val: number; fy: number; fp: string; form: string; accn: string; }
interface CompanyFacts { facts?: { "us-gaap"?: Record<string, { units?: Record<string, FactUnit[]> }> }; }

function pickConcept(facts: CompanyFacts, concepts: string[], unit = "USD"): FactUnit[] {
  for (const c of concepts) {
    const units = facts.facts?.["us-gaap"]?.[c]?.units?.[unit];
    if (units?.length) return units;
  }
  return [];
}

// index a concept's facts by period_end for a given form set
function byPeriod(units: FactUnit[], forms: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of units) {
    if (!forms.includes(u.form)) continue;
    m.set(u.end, u.val); // last write wins → latest amendment
  }
  return m;
}

export class EdgarFundamentalsProvider implements FundamentalsProvider {
  name = "edgar";

  resolveCik = resolveCik;

  private async companyFacts(ticker: string): Promise<CompanyFacts | null> {
    const cik = await resolveCik(ticker);
    if (!cik) return null;
    return fetchJson<CompanyFacts>(`${DATA}/api/xbrl/companyfacts/CIK${pad10(cik)}.json`, {
      provider: "sec",
      okStatuses: [404],
    });
  }

  async getIncomeStatements(ticker: string, limit: number): Promise<IncomeStatement[]> {
    const facts = await this.companyFacts(ticker);
    if (!facts) return [];

    const forms = ["10-K", "10-Q"];
    const revenue = byPeriod(
      pickConcept(facts, [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "Revenues",
        "SalesRevenueNet",
      ]),
      forms
    );
    const opInc = byPeriod(pickConcept(facts, ["OperatingIncomeLoss"]), forms);
    const netInc = byPeriod(pickConcept(facts, ["NetIncomeLoss"]), forms);
    const grossProfit = byPeriod(pickConcept(facts, ["GrossProfit"]), forms);
    const eps = byPeriod(pickConcept(facts, ["EarningsPerShareDiluted", "EarningsPerShareBasic"], "USD/shares"), forms);

    // which periods came from a 10-K (FY) vs 10-Q (Q)?
    const formByEnd = new Map<string, "Q" | "FY">();
    for (const u of pickConcept(facts, ["NetIncomeLoss"])) {
      if (u.form === "10-K") formByEnd.set(u.end, "FY");
      else if (u.form === "10-Q" && !formByEnd.has(u.end)) formByEnd.set(u.end, "Q");
    }

    const ends = [...formByEnd.keys()].sort().reverse().slice(0, limit);
    return ends.map((end) => {
      const rev = revenue.get(end) ?? null;
      const gp = grossProfit.get(end) ?? null;
      const oi = opInc.get(end) ?? null;
      return {
        periodEnd: new Date(`${end}T00:00:00Z`),
        periodType: formByEnd.get(end)!,
        revenue: rev,
        operatingIncome: oi,
        netIncome: netInc.get(end) ?? null,
        eps: eps.get(end) ?? null,
        fcf: null, // requires cash-flow concepts; left Unavailable in Phase 1
        grossMargin: rev && gp != null ? gp / rev : null,
        opMargin: rev && oi != null ? oi / rev : null,
        roic: null,
      };
    });
  }

  async getBalanceSheetFacts(ticker: string, limit: number): Promise<BalanceSheetFacts[]> {
    const facts = await this.companyFacts(ticker);
    if (!facts) return [];
    const forms = ["10-K", "10-Q"];
    const cash = byPeriod(pickConcept(facts, ["CashAndCashEquivalentsAtCarryingValue"]), forms);
    const ltDebtNon = byPeriod(pickConcept(facts, ["LongTermDebtNoncurrent", "LongTermDebt"]), forms);
    const ltDebtCur = byPeriod(pickConcept(facts, ["LongTermDebtCurrent", "DebtCurrent"]), forms);

    const ends = [...new Set([...cash.keys(), ...ltDebtNon.keys()])].sort().reverse().slice(0, limit);
    return ends.map((end) => {
      const debt =
        ltDebtNon.has(end) || ltDebtCur.has(end)
          ? (ltDebtNon.get(end) ?? 0) + (ltDebtCur.get(end) ?? 0)
          : null;
      return {
        periodEnd: new Date(`${end}T00:00:00Z`),
        periodType: "Q",
        totalDebt: debt,
        cash: cash.get(end) ?? null,
      };
    });
  }
}

// ---------- filings ----------
interface SubmissionsResp {
  filings?: { recent?: { accessionNumber?: string[]; form?: string[]; filingDate?: string[]; primaryDocument?: string[] } };
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : null;
}
function allBlocks(xml: string, name: string): string[] {
  return xml.match(new RegExp(`<${name}[^>]*>[\\s\\S]*?</${name}>`, "gi")) ?? [];
}
function num(s: string | null): number | null {
  if (s == null) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export class EdgarFilingsProvider implements FilingsProvider {
  name = "edgar";

  resolveCik = resolveCik;

  async pollSubmissions(ticker: string, sinceAccession: string | null): Promise<Filing[]> {
    const cik = await resolveCik(ticker);
    if (!cik) return [];
    const data = await fetchJson<SubmissionsResp>(`${DATA}/submissions/CIK${pad10(cik)}.json`, {
      provider: "sec",
      okStatuses: [404],
    });
    const rec = data?.filings?.recent;
    if (!rec?.accessionNumber) return [];
    const wanted = new Set(["8-K", "10-K", "10-Q", "4", "13F-HR", "13F-HR/A"]);
    const out: Filing[] = [];
    for (let i = 0; i < rec.accessionNumber.length; i++) {
      const accn = rec.accessionNumber[i];
      if (sinceAccession && accn === sinceAccession) break; // reached watermark
      const form = rec.form?.[i] ?? "";
      if (!wanted.has(form)) continue;
      const noDash = accn.replace(/-/g, "");
      const primary = rec.primaryDocument?.[i] ?? "";
      out.push({
        cik,
        formType: form,
        filedAt: new Date(`${rec.filingDate?.[i]}T00:00:00Z`),
        accessionNo: accn,
        url: `${WWW}/Archives/edgar/data/${cik}/${noDash}/${primary}`,
      });
    }
    return out;
  }

  private archiveDir(filing: Filing): string {
    return `${WWW}/Archives/edgar/data/${filing.cik}/${filing.accessionNo.replace(/-/g, "")}`;
  }

  async getForm4(filing: Filing): Promise<InsiderTxn[]> {
    // Form 4 ownership XML lives in the filing directory; fetch the primary doc.
    const xml = await fetchText(filing.url, { provider: "sec", okStatuses: [404] });
    if (!xml) return [];
    const owner = tag(xml, "rptOwnerName");
    const role =
      [
        tag(xml, "officerTitle"),
        /<isDirector>\s*1/.test(xml) ? "director" : null,
        /<isOfficer>\s*1/.test(xml) ? "officer" : null,
      ]
        .filter(Boolean)
        .join(",") || null;
    const out: InsiderTxn[] = [];
    for (const block of allBlocks(xml, "nonDerivativeTransaction")) {
      const code = tag(block, "transactionAcquiredDisposedCode") ?? tag(block, "value");
      const shares = num(tag(block, "transactionShares") ? tag(tag(block, "transactionShares")!, "value") : null) ??
        num(tag(block, "transactionShares"));
      const price = num(tag(block, "transactionPricePerShare") ? tag(tag(block, "transactionPricePerShare")!, "value") : null);
      const dateRaw = tag(block, "transactionDate") ? tag(tag(block, "transactionDate")!, "value") : null;
      const acquired = /A/i.test(code ?? "");
      out.push({
        insiderName: owner,
        role,
        txnType: acquired ? "buy" : "sell",
        shares,
        price,
        value: shares != null && price != null ? shares * price : null,
        txnDate: dateRaw ? new Date(`${dateRaw}T00:00:00Z`) : filing.filedAt,
      });
    }
    return out;
  }

  async get13F(filing: Filing): Promise<InstHolding[]> {
    // 13F holdings live in an information-table XML in the filing directory.
    const idx = await fetchJson<{ directory?: { item?: Array<{ name: string }> } }>(
      `${this.archiveDir(filing)}/index.json`,
      { provider: "sec", okStatuses: [404] }
    );
    const infoFile = idx?.directory?.item?.find((f) => /infotable\.xml$/i.test(f.name))?.name;
    if (!infoFile) return [];
    const xml = await fetchText(`${this.archiveDir(filing)}/${infoFile}`, { provider: "sec", okStatuses: [404] });
    if (!xml) return [];
    const reportPeriod = filing.filedAt;
    const out: InstHolding[] = [];
    for (const block of allBlocks(xml, "infoTable")) {
      const holder = tag(block, "nameOfIssuer") ?? "";
      const value = num(tag(block, "value"));
      const sshBlock = tag(block, "shrsOrPrnAmt");
      const shares = sshBlock ? num(tag(sshBlock, "sshPrnamt")) : null;
      out.push({ holderName: holder, shares, value, reportPeriod });
    }
    return out;
  }
}
