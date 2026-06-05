import { fetchExchangeRates } from "../fetchers/utility/CurrencyFetcher.ts";
import { insertCurrencySnapshot } from "../models/CurrencySnapshot.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

const ONE_HOUR_MILLISECONDS = 3_600_000;

export async function collectCurrencyRates(): Promise<void> {
  try {
    const exchangeRateData = await fetchExchangeRates("USD");
    await insertCurrencySnapshot({
      baseCurrency: exchangeRateData.baseCurrency,
      exchangeRates: exchangeRateData.exchangeRates,
      fetchedAt: new Date(),
      lastUpdate: exchangeRateData.lastUpdate,
    });

    logger.info(
      `[CurrencyCollector] Saved USD exchange rate snapshot with ${
        Object.keys(exchangeRateData.exchangeRates).length
      } currencies`,
    );
  } catch (error: unknown) {
    logger.error(`[CurrencyCollector] Failed to collect rates: ${errorMessage(error)}`);
  }
}

export function startCurrencyCollector(): void {
  collectCurrencyRates();
  setInterval(() => {
    collectCurrencyRates();
  }, ONE_HOUR_MILLISECONDS);

  logger.info("💱 Currency collector started");
}
