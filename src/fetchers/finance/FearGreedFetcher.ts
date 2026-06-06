import logger from "../../logger.ts";
import { errorMessage } from "../../utilities.ts";

const FEAR_GREED_API_BASE = "https://api.alternative.me/fng";

interface FearGreedEntry {
  value: number;
  classification: string;
  timestamp: string;
  date: string;
}

interface FearGreedResult {
  current: FearGreedEntry | null;
  history: FearGreedEntry[];
  fetchedAt: string;
}

export async function fetchFearGreedIndex(
  limit: number = 30,
): Promise<FearGreedResult> {
  try {
    const url = `${FEAR_GREED_API_BASE}/?limit=${limit}&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Fear & Greed API → ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const rawEntries = data?.data || [];

    const entries: FearGreedEntry[] = rawEntries.map(
      (entry: Record<string, string>) => {
        const timestampSeconds = parseInt(entry.timestamp, 10);
        const entryDate = new Date(timestampSeconds * 1000);
        return {
          value: parseInt(entry.value, 10),
          classification: entry.value_classification || "Unknown",
          timestamp: entry.timestamp,
          date: entryDate.toISOString().split("T")[0],
        };
      },
    );

    return {
      current: entries[0] || null,
      history: entries,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    logger.error(
      `[FearGreedFetcher] ❌ ${errorMessage(error)}`,
    );
    throw error;
  }
}

export type { FearGreedEntry, FearGreedResult };
