import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

const SEC_EDGAR_BASE_URL = "https://data.sec.gov";
const SEC_EFTS_BASE_URL = "https://efts.sec.gov/LATEST";
const SEC_USER_AGENT = "Prism/1.0 (tools-service)";
const SEC_HEADERS = {
  "User-Agent": SEC_USER_AGENT,
  Accept: "application/json",
};

interface SecFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string | null;
  form: string;
  primaryDocument: string;
  description: string | null;
  filingUrl: string;
}

interface SecFilerInfo {
  cik: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  sic: string | null;
  sicDescription: string | null;
  stateOfIncorporation: string | null;
  filingCount: number;
}

interface SecFilingsResult {
  filer: SecFilerInfo;
  filings: SecFiling[];
  count: number;
  fetchedAt: string;
}

interface SecSearchResult {
  query: string;
  results: Array<{
    cik: string;
    name: string;
    tickers: string[];
    stateOfIncorporation: string | null;
  }>;
  count: number;
  fetchedAt: string;
}

function padCik(cik: string): string {
  return cik.replace(/^0+/, "").padStart(10, "0");
}

export async function fetchSecFilerInfo(cik: string): Promise<SecFilerInfo> {
  const paddedCik = padCik(cik);
  const url = `${SEC_EDGAR_BASE_URL}/submissions/CIK${paddedCik}.json`;

  try {
    const response = await fetch(url, { headers: SEC_HEADERS });
    if (!response.ok) {
      throw new Error(`SEC EDGAR → ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      cik: paddedCik,
      name: data.name || "Unknown",
      tickers: data.tickers || [],
      exchanges: data.exchanges || [],
      sic: data.sic || null,
      sicDescription: data.sicDescription || null,
      stateOfIncorporation: data.stateOfIncorporation || null,
      filingCount: data.filings?.recent?.accessionNumber?.length || 0,
    };
  } catch (error: unknown) {
    logger.error(`[SecEdgarFetcher] ❌ Filer info for CIK ${cik}: ${errorMessage(error)}`);
    throw error;
  }
}

export async function fetchSecFilings(
  cik: string,
  filingType?: string,
  limit: number = 20,
): Promise<SecFilingsResult> {
  const paddedCik = padCik(cik);
  const url = `${SEC_EDGAR_BASE_URL}/submissions/CIK${paddedCik}.json`;

  try {
    const response = await fetch(url, { headers: SEC_HEADERS });
    if (!response.ok) {
      throw new Error(`SEC EDGAR → ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const recent = data.filings?.recent || {};
    const accessionNumbers: string[] = recent.accessionNumber || [];
    const filingDates: string[] = recent.filingDate || [];
    const reportDates: string[] = recent.reportDate || [];
    const forms: string[] = recent.form || [];
    const primaryDocuments: string[] = recent.primaryDocument || [];
    const primaryDocDescriptions: string[] =
      recent.primaryDocDescription || [];

    const filings: SecFiling[] = [];

    for (let index = 0; index < accessionNumbers.length; index++) {
      const form = forms[index];
      if (filingType && !form.toUpperCase().includes(filingType.toUpperCase())) {
        continue;
      }

      const accessionNumberFormatted = accessionNumbers[index].replace(
        /-/g,
        "",
      );
      filings.push({
        accessionNumber: accessionNumbers[index],
        filingDate: filingDates[index] || "",
        reportDate: reportDates[index] || null,
        form,
        primaryDocument: primaryDocuments[index] || "",
        description: primaryDocDescriptions[index] || null,
        filingUrl: `https://www.sec.gov/Archives/edgar/data/${paddedCik.replace(/^0+/, "")}/${accessionNumberFormatted}/${primaryDocuments[index]}`,
      });

      if (filings.length >= limit) break;
    }

    const filer: SecFilerInfo = {
      cik: paddedCik,
      name: data.name || "Unknown",
      tickers: data.tickers || [],
      exchanges: data.exchanges || [],
      sic: data.sic || null,
      sicDescription: data.sicDescription || null,
      stateOfIncorporation: data.stateOfIncorporation || null,
      filingCount: accessionNumbers.length,
    };

    return {
      filer,
      filings,
      count: filings.length,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    logger.error(
      `[SecEdgarFetcher] ❌ Filings for CIK ${cik}: ${errorMessage(error)}`,
    );
    throw error;
  }
}

export async function searchSecFilers(
  query: string,
  limit: number = 10,
): Promise<SecSearchResult> {
  const url = `${SEC_EFTS_BASE_URL}/search-index?q=${encodeURIComponent(query)}&dateRange=custom&startdt=2020-01-01&enddt=${new Date().toISOString().split("T")[0]}&forms=10-K`;

  try {
    const response = await fetch(url, { headers: SEC_HEADERS });
    if (!response.ok) {
      throw new Error(`SEC EFTS → ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const hits = data.hits?.hits || [];

    const resultMap = new Map<
      string,
      {
        cik: string;
        name: string;
        tickers: string[];
        stateOfIncorporation: string | null;
      }
    >();

    for (const hit of hits) {
      const source = hit._source || {};
      const entityCik = source.entity_id || "";
      if (resultMap.has(entityCik)) continue;

      resultMap.set(entityCik, {
        cik: entityCik,
        name: source.entity_name || "Unknown",
        tickers: source.tickers ? source.tickers.split(",") : [],
        stateOfIncorporation: source.inc_state || null,
      });

      if (resultMap.size >= limit) break;
    }

    return {
      query,
      results: Array.from(resultMap.values()),
      count: resultMap.size,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    logger.error(
      `[SecEdgarFetcher] ❌ Search "${query}": ${errorMessage(error)}`,
    );
    throw error;
  }
}

export async function fetchCompanyFactsXbrl(cik: string) {
  const paddedCik = padCik(cik);
  const url = `${SEC_EDGAR_BASE_URL}/api/xbrl/companyfacts/CIK${paddedCik}.json`;

  try {
    const response = await fetch(url, { headers: SEC_HEADERS });
    if (!response.ok) {
      throw new Error(`SEC XBRL → ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const entityName = data.entityName || "Unknown";
    const facts = data.facts || {};

    const usGaapFacts = facts["us-gaap"] || {};
    const keyMetrics: Record<string, unknown> = {};

    const interestingFacts = [
      "Revenues",
      "NetIncomeLoss",
      "Assets",
      "Liabilities",
      "StockholdersEquity",
      "EarningsPerShareBasic",
      "EarningsPerShareDiluted",
      "OperatingIncomeLoss",
      "GrossProfit",
      "CashAndCashEquivalentsAtCarryingValue",
      "LongTermDebt",
      "CommonStockSharesOutstanding",
    ];

    for (const factName of interestingFacts) {
      const fact = usGaapFacts[factName];
      if (!fact) continue;

      const units = Object.values(fact.units || {}) as Array<
        Array<Record<string, unknown>>
      >;
      const allValues = units.flat();
      const latestValue = allValues
        .filter(
          (entry) => entry.form === "10-K" || entry.form === "10-Q",
        )
        .sort((firstEntry, secondEntry) => {
          const dateFirst = (firstEntry.end as string) || "";
          const dateSecond = (secondEntry.end as string) || "";
          return dateSecond.localeCompare(dateFirst);
        })[0];

      if (latestValue) {
        keyMetrics[factName] = {
          value: latestValue['val'],
          period: latestValue.end,
          form: latestValue.form,
          filed: latestValue.filed,
        };
      }
    }

    return {
      cik: paddedCik,
      entityName,
      metricsCount: Object.keys(keyMetrics).length,
      metrics: keyMetrics,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    logger.error(
      `[SecEdgarFetcher] ❌ XBRL facts for CIK ${cik}: ${errorMessage(error)}`,
    );
    throw error;
  }
}
