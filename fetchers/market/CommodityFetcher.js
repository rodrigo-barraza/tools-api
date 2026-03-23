import YahooFinance from "yahoo-finance2";
import { COMMODITY_TICKERS } from "../../constants.js";

const yahooFinance = new YahooFinance();

/**
 * Batch size for Yahoo Finance quote() calls.
 * Splitting into smaller batches avoids potential timeout / payload-size
 * issues with 100+ tickers in a single request.
 */
const BATCH_SIZE = 40;

/**
 * Fetch current quotes for all tracked tickers using yahoo-finance2.
 * Uses the `quote()` method for near real-time data (~15-20 min delay).
 *
 * Splits tickers into batches to stay comfortably within Yahoo Finance
 * limits and avoid request timeouts on large payloads.
 *
 * @returns {Promise<Array>} Array of normalized quote objects.
 */
export async function fetchCommodities() {
  const tickers = Object.keys(COMMODITY_TICKERS);
  const results = [];
  const errors = [];

  // Process in batches
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    try {
      const quotes = await yahooFinance.quote(batch);
      const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

      for (const quote of quoteArray) {
        if (!quote?.symbol) continue;
        const ticker = quote.symbol;
        const meta = COMMODITY_TICKERS[ticker];
        if (!meta) continue;

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

        results.push({
          ticker,
          name: meta.name,
          category: meta.category,
          unit: meta.unit,
          price,
          previousClose,
          change,
          changePercent,
          dayHigh: quote.regularMarketDayHigh ?? null,
          dayLow: quote.regularMarketDayLow ?? null,
          open: quote.regularMarketOpen ?? null,
          volume: quote.regularMarketVolume ?? null,
          marketCap: quote.marketCap ?? null,
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
          currency: quote.currency ?? "USD",
          marketState: quote.marketState ?? "UNKNOWN",
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      errors.push({
        batch: batch.slice(0, 3).join(", ") + "…",
        error: err.message,
      });
      console.warn(
        `[CommodityFetcher] ⚠️ Batch ${i / BATCH_SIZE + 1} failed: ${err.message}`,
      );
    }
  }

  if (errors.length > 0) {
    console.warn(
      `[CommodityFetcher] ${errors.length} batch(es) failed, ${results.length} tickers OK`,
    );
  }

  return results;
}

/**
 * Round a number to a given decimal precision.
 */
function round(value, decimals) {
  return Math.round(value * 10 ** decimals) / 10 ** decimals;
}
