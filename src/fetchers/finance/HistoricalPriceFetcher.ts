import YahooFinance from "yahoo-finance2";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

const yahooFinance = new YahooFinance();

type ChartInterval =
  | "1m"
  | "2m"
  | "5m"
  | "15m"
  | "30m"
  | "60m"
  | "1h"
  | "1d"
  | "5d"
  | "1wk"
  | "1mo"
  | "3mo";

type ChartPeriod =
  | "1d"
  | "5d"
  | "1mo"
  | "3mo"
  | "6mo"
  | "1y"
  | "2y"
  | "5y"
  | "10y"
  | "ytd"
  | "max";

interface HistoricalPriceOptions {
  interval?: ChartInterval;
  period?: ChartPeriod;
}

interface CandlestickData {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

interface HistoricalPriceResult {
  symbol: string;
  interval: ChartInterval;
  period: ChartPeriod;
  currency: string | null;
  exchangeName: string | null;
  instrumentType: string | null;
  count: number;
  candles: CandlestickData[];
  fetchedAt: string;
}

const VALID_INTERVALS: ChartInterval[] = [
  "1m",
  "2m",
  "5m",
  "15m",
  "30m",
  "60m",
  "1h",
  "1d",
  "5d",
  "1wk",
  "1mo",
  "3mo",
];

const VALID_PERIODS: ChartPeriod[] = [
  "1d",
  "5d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "10y",
  "ytd",
  "max",
];

export async function fetchHistoricalPrices(
  symbol: string,
  options: HistoricalPriceOptions = {},
): Promise<HistoricalPriceResult> {
  const interval = options.interval || "1d";
  const period = options.period || "3mo";

  if (!VALID_INTERVALS.includes(interval)) {
    throw new Error(
      `Invalid interval "${interval}". Valid: ${VALID_INTERVALS.join(", ")}`,
    );
  }
  if (!VALID_PERIODS.includes(period)) {
    throw new Error(
      `Invalid period "${period}". Valid: ${VALID_PERIODS.join(", ")}`,
    );
  }

  try {
    const chartResult = await yahooFinance.chart(symbol.toUpperCase(), {
      period1: calculatePeriodStart(period),
      interval,
    });

    const meta = chartResult.meta || {};
    const quotes = chartResult.quotes || [];

    const candles: CandlestickData[] = quotes
      .filter(
        (quote: Record<string, unknown>) =>
          quote.date != null && quote.close != null,
      )
      .map((quote: Record<string, unknown>) => ({
        date: (quote.date as Date).toISOString(),
        open: (quote.open as number) ?? null,
        high: (quote.high as number) ?? null,
        low: (quote.low as number) ?? null,
        close: (quote.close as number) ?? null,
        volume: (quote.volume as number) ?? null,
      }));

    return {
      symbol: symbol.toUpperCase(),
      interval,
      period,
      currency: (meta.currency as string) || null,
      exchangeName: (meta.exchangeName as string) || null,
      instrumentType: (meta.instrumentType as string) || null,
      count: candles.length,
      candles,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    logger.error(
      `[HistoricalPriceFetcher] ❌ ${symbol} (${interval}/${period}): ${errorMessage(error)}`,
    );
    throw error;
  }
}

function calculatePeriodStart(period: ChartPeriod): Date {
  const now = new Date();
  const periodMilliseconds: Record<string, number> = {
    "1d": 86_400_000,
    "5d": 5 * 86_400_000,
    "1mo": 30 * 86_400_000,
    "3mo": 90 * 86_400_000,
    "6mo": 180 * 86_400_000,
    "1y": 365 * 86_400_000,
    "2y": 2 * 365 * 86_400_000,
    "5y": 5 * 365 * 86_400_000,
    "10y": 10 * 365 * 86_400_000,
    max: 50 * 365 * 86_400_000,
  };

  if (period === "ytd") {
    return new Date(now.getFullYear(), 0, 1);
  }

  const offsetMilliseconds = periodMilliseconds[period] || 90 * 86_400_000;
  return new Date(now.getTime() - offsetMilliseconds);
}

export { VALID_INTERVALS, VALID_PERIODS };
export type { ChartInterval, ChartPeriod, HistoricalPriceResult };
