import YahooFinance from "yahoo-finance2";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";
import {
  VOLATILITY_TICKERS,
  VOLATILITY_REGIMES,
} from "../../constants.ts";

const yahooFinance = new YahooFinance();

interface VolatilityQuote {
  ticker: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  previousClose: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
}

interface VolatilitySnapshot {
  vix: VolatilityQuote | null;
  vvix: VolatilityQuote | null;
  instruments: VolatilityQuote[];
  regime: {
    level: string;
    description: string;
    vixValue: number | null;
  };
  fetchedAt: string;
}

export async function fetchVolatilitySnapshot(): Promise<VolatilitySnapshot> {
  const tickers = Object.keys(VOLATILITY_TICKERS);

  try {
    const quotes = await yahooFinance.quote(tickers);
    const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

    const instruments: VolatilityQuote[] = [];
    let vixQuote: VolatilityQuote | null = null;
    let vvixQuote: VolatilityQuote | null = null;

    for (const quote of quoteArray) {
      if (!quote?.symbol) continue;
      const tickerMeta = VOLATILITY_TICKERS[quote.symbol];
      if (!tickerMeta) continue;

      const price = quote.regularMarketPrice ?? null;
      const previousClose = quote.regularMarketPreviousClose ?? null;
      const change =
        price != null && previousClose != null
          ? round(price - previousClose, 4)
          : null;
      const changePercent =
        price != null && previousClose != null && previousClose !== 0
          ? round(((price - previousClose) / previousClose) * 100, 2)
          : null;

      const volatilityQuote: VolatilityQuote = {
        ticker: quote.symbol,
        name: tickerMeta.name,
        price,
        change,
        changePercent,
        dayHigh: quote.regularMarketDayHigh ?? null,
        dayLow: quote.regularMarketDayLow ?? null,
        previousClose,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
      };

      if (quote.symbol === "^VIX") vixQuote = volatilityQuote;
      else if (quote.symbol === "^VVIX") vvixQuote = volatilityQuote;

      instruments.push(volatilityQuote);
    }

    const vixValue = vixQuote?.price ?? null;
    const regime = classifyVolatilityRegime(vixValue);

    return {
      vix: vixQuote,
      vvix: vvixQuote,
      instruments,
      regime: {
        level: regime.level,
        description: regime.description,
        vixValue,
      },
      fetchedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    logger.error(
      `[VolatilityFetcher] ❌ ${errorMessage(error)}`,
    );
    throw error;
  }
}

function classifyVolatilityRegime(vixValue: number | null): {
  level: string;
  description: string;
} {
  if (vixValue == null) {
    return { level: "unknown", description: "VIX data unavailable" };
  }

  for (const regime of VOLATILITY_REGIMES) {
    if (vixValue >= regime.min && vixValue < regime.max) {
      return { level: regime.level, description: regime.description };
    }
  }

  return {
    level: "extreme",
    description: "Crisis-level fear (VIX > 40)",
  };
}

function round(value: number, decimals: number): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

export type { VolatilitySnapshot };
