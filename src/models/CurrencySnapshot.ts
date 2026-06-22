import { getDatabase } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";

export interface CurrencySnapshotInput {
  baseCurrency: string;
  exchangeRates: Record<string, number>;
  fetchedAt: Date;
  lastUpdate: string;
}

export async function setupCurrencyCollection(): Promise<void> {
  const database = getDatabase();
  const currencySnapshotCollection = database.collection("currency_snapshots");

  await currencySnapshotCollection.createIndex({ fetchedAt: -1 });
  await currencySnapshotCollection.createIndex({ baseCurrency: 1, fetchedAt: -1 });

  logger.info("💱 currency_snapshots collection ready");
}

export async function insertCurrencySnapshot(currencySnapshot: CurrencySnapshotInput): Promise<any> {
  const database = getDatabase();
  const currencySnapshotCollection = database.collection("currency_snapshots");

  const result = await currencySnapshotCollection.insertOne({
    baseCurrency: currencySnapshot.baseCurrency,
    exchangeRates: currencySnapshot.exchangeRates,
    fetchedAt: new Date(currencySnapshot.fetchedAt),
    lastUpdate: currencySnapshot.lastUpdate,
  });

  return result;
}
