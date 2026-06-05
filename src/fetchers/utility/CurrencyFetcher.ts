import { EXCHANGE_RATE_BASE_URL } from "../../constants.ts";

export interface CachedExchangeRates {
  baseCurrency: string;
  lastUpdate: string;
  nextUpdate: string;
  exchangeRates: Record<string, number>;
}

const exchangeRateCache = new Map<string, { data: CachedExchangeRates; fetchedAt: number }>();
const EXCHANGE_RATE_CACHE_TTL_MILLISECONDS = 3_600_000;

export async function fetchExchangeRates(baseCurrency: string = "USD"): Promise<CachedExchangeRates> {
  const uppercaseBaseCurrency = baseCurrency.toUpperCase();

  const cachedExchangeRates = exchangeRateCache.get(uppercaseBaseCurrency);
  if (
    cachedExchangeRates &&
    Date.now() - cachedExchangeRates.fetchedAt < EXCHANGE_RATE_CACHE_TTL_MILLISECONDS
  ) {
    return cachedExchangeRates.data;
  }

  const apiUrl = `${EXCHANGE_RATE_BASE_URL}/${uppercaseBaseCurrency}`;
  const apiResponse = await fetch(apiUrl);

  if (!apiResponse.ok) {
    throw new Error(
      `Exchange Rate API → ${apiResponse.status} ${apiResponse.statusText}`,
    );
  }

  const apiResponseBody = await apiResponse.json();

  if (apiResponseBody.result !== "success") {
    throw new Error(
      `Exchange Rate API → ${apiResponseBody["error-type"] || "unknown error"}`,
    );
  }

  const exchangeRateResult = {
    baseCurrency: apiResponseBody.base_code,
    lastUpdate: apiResponseBody.time_last_update_utc,
    nextUpdate: apiResponseBody.time_next_update_utc,
    exchangeRates: apiResponseBody.rates,
  };

  exchangeRateCache.set(uppercaseBaseCurrency, {
    data: exchangeRateResult,
    fetchedAt: Date.now(),
  });
  return exchangeRateResult;
}

export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
) {
  const uppercaseFromCurrency = fromCurrency.toUpperCase();
  const uppercaseToCurrency = toCurrency.toUpperCase();

  const exchangeRateData = await fetchExchangeRates(uppercaseFromCurrency);
  const exchangeRate = exchangeRateData.exchangeRates[uppercaseToCurrency];

  if (exchangeRate == null) {
    throw new Error(`Currency "${uppercaseToCurrency}" not found`);
  }

  const convertedAmount = Math.round(amount * exchangeRate * 100) / 100;

  return {
    from: uppercaseFromCurrency,
    to: uppercaseToCurrency,
    amount,
    rate: exchangeRate,
    converted: convertedAmount,
    lastUpdate: exchangeRateData.lastUpdate,
  };
}

export async function listCurrencies() {
  const exchangeRateData = await fetchExchangeRates("USD");
  return Object.keys(exchangeRateData.exchangeRates).sort();
}
