import YahooFinance from "yahoo-finance2";
import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";
import { SECTOR_ETFS } from "../../constants.ts";

const yahooFinance = new YahooFinance();

interface SectorQuote {
  ticker: string;
  name: string;
  sector: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  ytdReturn: number | null;
}

interface SectorPerformanceResult {
  sectors: SectorQuote[];
  topPerformers: SectorQuote[];
  bottomPerformers: SectorQuote[];
  fetchedAt: string;
}

export async function fetchSectorPerformance(): Promise<SectorPerformanceResult> {
  const tickers = Object.keys(SECTOR_ETFS);

  try {
    const quotes = await yahooFinance.quote(tickers);
    const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

    const sectors: SectorQuote[] = [];

    for (const quote of quoteArray) {
      if (!quote?.symbol) continue;
      const sectorMeta = SECTOR_ETFS[quote.symbol];
      if (!sectorMeta) continue;

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

      const fiftyTwoWeekLow = quote.fiftyTwoWeekLow ?? null;
      const ytdReturn =
        price != null && fiftyTwoWeekLow != null && fiftyTwoWeekLow !== 0
          ? round(((price - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100, 2)
          : null;

      sectors.push({
        ticker: quote.symbol,
        name: sectorMeta.name,
        sector: sectorMeta.sector,
        price,
        change,
        changePercent,
        previousClose,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow,
        ytdReturn,
      });
    }

    const sorted = [...sectors]
      .filter((sectorItem) => sectorItem.changePercent != null)
      .sort(
        (firstSector, secondSector) =>
          (secondSector.changePercent ?? 0) - (firstSector.changePercent ?? 0),
      );

    return {
      sectors,
      topPerformers: sorted.slice(0, 3),
      bottomPerformers: sorted.slice(-3).reverse(),
      fetchedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    logger.error(
      `[SectorPerformanceFetcher] ❌ ${errorMessage(error)}`,
    );
    throw error;
  }
}

function round(value: number, decimals: number): number {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}

export type { SectorPerformanceResult };
