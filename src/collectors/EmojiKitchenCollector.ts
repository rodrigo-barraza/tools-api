import { EMOJI_KITCHEN_INTERVAL_MS } from "../constants.ts";
import { fetchEmojiKitchenMetadata } from "../fetchers/creative/EmojiKitchenFetcher.ts";
import {
  updateEmojiKitchen,
  setEmojiKitchenError,
} from "../caches/EmojiKitchenCache.ts";
import { saveState, startCollectorLoop } from "../services/FreshnessService.ts";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

/**
 * Background task to fetch and save the latest Emoji Kitchen catalog.
 */
export async function collectEmojiKitchen() {
  try {
    const metadata = await fetchEmojiKitchenMetadata();

    // Update in-memory cache
    updateEmojiKitchen(metadata);

    // Persist to MongoDB snapshot
    await saveState(
      "emoji_kitchen_metadata",
      metadata as unknown as Record<string, unknown>,
    );

    const count = Object.keys(metadata.data).length;
    logger.info(
      `[EmojiKitchen] ✅ Loaded metadata successfully | ${count} emojis cataloged`,
    );
  } catch (error: unknown) {
    const errorObject =
      error instanceof Error ? error : new Error(errorMessage(error));
    setEmojiKitchenError(errorObject);
    logger.error(`[EmojiKitchen] ❌ Collection failed: ${errorObject.message}`);
  }
}

const STARTUP_TASKS = [
  {
    label: "EmojiKitchen",
    collection: "emoji_kitchen_metadata",
    ttl: EMOJI_KITCHEN_INTERVAL_MS,
    collectFn: collectEmojiKitchen,
    restoreFn: updateEmojiKitchen,
    delay: 38_000, // staggered startup delay
  },
];

export function startEmojiKitchenCollectors() {
  startCollectorLoop(STARTUP_TASKS);
  logger.info("🍳 Emoji Kitchen collector started");
}
