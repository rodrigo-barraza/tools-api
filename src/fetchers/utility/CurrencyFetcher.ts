import { EXCHANGE_RATE_BASE_URL } from "../../constants.ts";

/**
 * Exchange Rate API fetcher.
 * https://open.er-api.com/ — no auth required (free tier).
 * Returns real-time exchange rates for 161 currencies.
 */

// ─── In-Memory Rate Cache ──────────────────────────────────────────

const rateCache = new Map();
const RATE_CACHE_TTL_MS = 3_600_000; // 1 hour — rates update daily on free tier

// ─── Fetch Latest Rates ────────────────────────────────────────────

/**
 * Get latest exchange rates for a base currency.


 */
async function fetchRates(base: any = "USD") {
  const upperBase = base.toUpperCase();

  // Check cache
  const cached = rateCache.get(upperBase);
  if (cached && Date.now() - cached.fetchedAt < RATE_CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${EXCHANGE_RATE_BASE_URL}/${upperBase}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Exchange Rate API → ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.result !== "success") {
    throw new Error(
      `Exchange Rate API → ${data["error-type"] || "unknown error"}`,
    );
  }

  const result = {
    base: data.base_code,
    lastUpdate: data.time_last_update_utc,
    nextUpdate: data.time_next_update_utc,
    rates: data.rates,
  };

  rateCache.set(upperBase, { data: result, fetchedAt: Date.now() });
  return result;
}

// ─── Convert Currency ──────────────────────────────────────────────

/**
 * Convert an amount from one currency to another.


 */
export async function convertCurrency(amount: any, from: any, to: any) {
  const upperFrom = from.toUpperCase();
  const upperTo = to.toUpperCase();

  const rateData = await fetchRates(upperFrom);
  const rate = rateData.rates[upperTo];

  if (rate == null) {
    throw new Error(`Currency "${upperTo}" not found`);
  }

  const converted = Math.round(amount * rate * 100) / 100;

  return {
    from: upperFrom,
    to: upperTo,
    amount,
    rate,
    converted,
    lastUpdate: rateData.lastUpdate,
  };
}

// ─── List Available Currencies ─────────────────────────────────────

/**
 * Get all available currency codes.

 */
export async function listCurrencies() {
  const rateData = await fetchRates("USD");
  return Object.keys(rateData.rates).sort();
}
