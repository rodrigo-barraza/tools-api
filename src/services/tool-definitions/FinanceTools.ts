// ────────────────────────────────────────────────────────────
// Tool Definitions — Finance
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { cached, onDemand, fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";
import {
  FINNHUB_NEWS_INTERVAL_MS,
  FINNHUB_EARNINGS_INTERVAL_MS
} from "../../constants.ts";

export function getFinanceTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
  {
    name: "get_market_news",
    dataSource: cached("Finnhub", FINNHUB_NEWS_INTERVAL_MS),
    description: translate("get_market_news.description"),
    endpoint: {
      path: "/finance/news",
      queryParams: ["symbol"],
    },
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: translate("get_market_news.params.symbol"),
        },
        ...fieldsParam(FIELDS.MARKET_NEWS),
      },
      required: ["fields"],
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "symbol",
      subjectFormat: "full",
    },
  },
  {
    name: "get_earnings_calendar",
    dataSource: cached("Finnhub", FINNHUB_EARNINGS_INTERVAL_MS),
    description: translate("get_earnings_calendar.description"),
    endpoint: { path: "/finance/earnings" },
    parameters: {
      type: "object",
      properties: { ...fieldsParam(FIELDS.EARNINGS) },
      required: ["fields"],
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_stock",
    dataSource: onDemand("Finnhub API"),
    description: translate("get_stock.description"),
    endpoint: {
      path: "/finance/stock/data",
      queryParams: ["action", "symbol"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("get_stock.params.action"),
          enum: ["quote", "profile", "recommendation", "financials"],
        },
        symbol: {
          type: "string",
          description: translate("get_stock.params.symbol"),
        },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["action", "symbol"],
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "symbol",
      subjectFormat: "full",
    },
  },
  {
    name: "get_macro",
    dataSource: onDemand("FRED (Federal Reserve)"),
    description: translate("get_macro.description"),
    endpoint: {
      path: "/finance/macro/data",
      queryParams: [
        "action",
        "q",
        "seriesId",
        "limit",
        "orderBy",
        "sortOrder",
        "observationStart",
        "observationEnd",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("common.params.queryMode"),
          enum: ["indicators", "search", "series", "observations"],
        },
        "q": { type: "string", description: translate("common.params.searchQuery") },
        seriesId: {
          type: "string",
          description: translate("get_macro.params.seriesId"),
        },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
        orderBy: { type: "string", description: translate("get_macro.params.orderBy") },
        sortOrder: {
          type: "string",
          enum: ["asc", "desc"],
          description: translate("get_macro.params.sortOrder"),
        },
        observationStart: {
          type: "string",
          description: translate("get_macro.params.observationStart"),
        },
        observationEnd: {
          type: "string",
          description: translate("get_macro.params.observationEnd"),
        },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Fetching",
      completedVerb: "Fetched",
      subjectParam: "action",
      subjectFormat: "full",
    },
  },
  {
    name: "get_historical_prices",
    dataSource: onDemand("Yahoo Finance"),
    description: translate("get_historical_prices.description"),
    endpoint: {
      path: "/finance/prices/:symbol",
      pathParams: ["symbol"],
      queryParams: ["interval", "period"],
    },
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: translate("get_historical_prices.params.symbol"),
        },
        interval: {
          type: "string",
          description: translate("get_historical_prices.params.interval"),
          enum: ["1m", "5m", "15m", "1h", "1d", "1wk", "1mo"],
        },
        period: {
          type: "string",
          description: translate("get_historical_prices.params.period"),
          enum: ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "ytd", "max"],
        },
        ...fieldsParam(FIELDS.HISTORICAL_PRICES),
      },
      required: ["symbol"],
    },
    display: {
      activeVerb: "Fetching historical prices for",
      completedVerb: "Fetched historical prices for",
      subjectParam: "symbol",
      subjectFormat: "full",
    },
  },
  {
    name: "get_technical_analysis",
    dataSource: onDemand("Yahoo Finance + technicalindicators"),
    description: translate("get_technical_analysis.description"),
    endpoint: {
      path: "/finance/technical/:symbol",
      pathParams: ["symbol"],
      queryParams: ["indicators", "period", "interval"],
    },
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: translate("get_technical_analysis.params.symbol"),
        },
        indicators: {
          type: "string",
          description: translate("get_technical_analysis.params.indicators"),
        },
        period: {
          type: "number",
          description: translate("get_technical_analysis.params.period"),
        },
        interval: {
          type: "string",
          description: translate("get_technical_analysis.params.interval"),
          enum: ["1d", "1wk", "1mo"],
        },
        ...fieldsParam(FIELDS.TECHNICAL_ANALYSIS),
      },
      required: ["symbol"],
    },
    display: {
      activeVerb: "Analyzing technical indicators for",
      completedVerb: "Analyzed technical indicators for",
      subjectParam: "symbol",
      subjectFormat: "full",
    },
  },
  {
    name: "get_volatility",
    dataSource: onDemand("Yahoo Finance"),
    description: translate("get_volatility.description"),
    endpoint: {
      path: "/finance/volatility",
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.VOLATILITY),
      },
    },
    display: {
      activeVerb: "Fetching market volatility",
      completedVerb: "Fetched market volatility",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_fear_greed_index",
    dataSource: onDemand("Alternative.me (cached)"),
    description: translate("get_fear_greed_index.description"),
    endpoint: {
      path: "/finance/fear-greed",
      queryParams: ["limit"],
    },
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: translate("get_fear_greed_index.params.limit"),
        },
        ...fieldsParam(FIELDS.FEAR_GREED),
      },
    },
    display: {
      activeVerb: "Fetching Fear and Greed index",
      completedVerb: "Fetched Fear and Greed index",
      subjectParam: "limit",
      subjectFormat: "truncate",
    },
  },
  {
    name: "get_sec_filings",
    dataSource: onDemand("SEC EDGAR (public)"),
    description: translate("get_sec_filings.description"),
    endpoint: {
      path: "/finance/sec/filings/:cik",
      pathParams: ["cik"],
      queryParams: ["filingType", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("common.params.queryMode"),
          enum: ["filings", "search", "facts"],
        },
        cik: {
          type: "string",
          description: translate("get_sec_filings.params.cik"),
        },
        "q": {
          type: "string",
          description: translate("get_sec_filings.params.q"),
        },
        filingType: {
          type: "string",
          description: translate("get_sec_filings.params.filingType"),
        },
        limit: {
          type: "number",
          description: translate("get_sec_filings.params.limit"),
        },
        ...fieldsParam(FIELDS.SEC_FILINGS),
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Fetching SEC filings for",
      completedVerb: "Fetched SEC filings for",
      subjectParam: "cik",
      subjectFormat: "full",
    },
  },
  {
    name: "get_sector_performance",
    dataSource: onDemand("Yahoo Finance (Sector SPDRs)"),
    description: translate("get_sector_performance.description"),
    endpoint: {
      path: "/finance/sectors",
    },
    parameters: {
      type: "object",
      properties: {
        ...fieldsParam(FIELDS.SECTOR_PERFORMANCE),
      },
    },
    display: {
      activeVerb: "Fetching sector performance",
      completedVerb: "Fetched sector performance",
      subjectParam: "fields",
      subjectFormat: "truncate",
    },
  },
  ];
}
