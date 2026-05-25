import { createSimpleCache } from "./createSimpleCache.ts";
import type { EmojiKitchenMetadata, EmojiCombination } from "../fetchers/creative/EmojiKitchenFetcher.ts";

const cache = createSimpleCache<EmojiKitchenMetadata>();

export const updateEmojiKitchen = cache.update;
export const setEmojiKitchenError = cache.setError;
export const getEmojiKitchen = cache.get;
export const getEmojiKitchenHealth = cache.getHealth;
export const getEmojiKitchenRawData = cache.getData;

/**
 * Convert any emoji character or string to a lowercase hyphenated hex codepoint sequence.
 * Handles ZWJ sequences, skin tones, variation selectors, etc.
 * If input is already in codepoint format (e.g. "1f43c"), returns it lowercased.
 */
export function emojiToCodepoints(emojiStr: string): string {
  if (!emojiStr) return "";
  
  // If it's already a hex codepoint string (e.g. "1f600" or "1f43c-1f3fb"), return it lowercased
  if (/^[0-9a-fA-F-]+$/.test(emojiStr)) {
    return emojiStr.toLowerCase().trim();
  }

  const points: string[] = [];
  for (const char of emojiStr) {
    const cp = char.codePointAt(0);
    if (cp === undefined) continue;
    points.push(cp.toString(16));
  }
  return points.join("-");
}

/**
 * Resiliently strip variation selectors (like -fe0f) for robust mapping.
 */
export function normalizeCodepoint(cp: string): string {
  return cp.toLowerCase().trim().replace(/^(u|0x)/, "").replace(/-fe0f/g, "");
}

/**
 * Symmetrically find a key in an object by comparing normalized versions of keys.
 */
function findNormalizedKey<T>(obj: Record<string, T>, target: string): string | null {
  const normTarget = normalizeCodepoint(target);
  for (const key of Object.keys(obj)) {
    if (normalizeCodepoint(key) === normTarget) {
      return key;
    }
  }
  return null;
}

/**
 * Get the Emoji Kitchen combination of two emojis.
 * Matches symmetrically (either order) and handles FE0F normalization.
 */
export function queryEmojiCombination(left: string, right: string): EmojiCombination | null {
  const rawData = getEmojiKitchenRawData();
  if (!rawData || !rawData.data) return null;

  const cpLeft = emojiToCodepoints(left);
  const cpRight = emojiToCodepoints(right);

  if (!cpLeft || !cpRight) return null;

  // Helper to look up a precise pair in the raw data
  function lookup(c1: string, c2: string): EmojiCombination | null {
    const emojiEntry = rawData.data[c1];
    if (!emojiEntry || !emojiEntry.combinations) return null;
    
    const combos = emojiEntry.combinations[c2];
    if (!combos || combos.length === 0) return null;

    // Pick latest design version
    const latest = combos.find(c => c.isLatest);
    return latest || combos[0];
  }

  // 1. Try exact match in both directions
  let result = lookup(cpLeft, cpRight) || lookup(cpRight, cpLeft);
  if (result) return result;

  // 2. Try normalized key matching in both directions
  const nKeyLeft = findNormalizedKey(rawData.data, cpLeft);
  if (nKeyLeft) {
    const emojiEntry = rawData.data[nKeyLeft];
    const nKeyRight = findNormalizedKey(emojiEntry.combinations, cpRight);
    if (nKeyRight) {
      result = lookup(nKeyLeft, nKeyRight);
      if (result) return result;
    }
  }

  const nKeyRight = findNormalizedKey(rawData.data, cpRight);
  if (nKeyRight) {
    const emojiEntry = rawData.data[nKeyRight];
    const nKeyLeft = findNormalizedKey(emojiEntry.combinations, cpLeft);
    if (nKeyLeft) {
      result = lookup(nKeyRight, nKeyLeft);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Get all supported combinations for a single emoji.
 */
export interface CombinedOption {
  emoji: string;
  codepoint: string;
  combination: EmojiCombination;
}

export function queryEmojiCombinations(emoji: string, limit: number = 50): CombinedOption[] {
  const rawData = getEmojiKitchenRawData();
  if (!rawData || !rawData.data) return [];

  const cp = emojiToCodepoints(emoji);
  if (!cp) return [];

  // Find emoji key using normalized comparison
  const matchedKey = findNormalizedKey(rawData.data, cp);
  if (!matchedKey) return [];

  const emojiEntry = rawData.data[matchedKey];
  if (!emojiEntry || !emojiEntry.combinations) return [];

  const options: CombinedOption[] = [];
  
  for (const [otherCp, combos] of Object.entries(emojiEntry.combinations)) {
    if (!combos || combos.length === 0) continue;
    const latest = combos.find(c => c.isLatest) || combos[0];
    
    // Determine which side of the combination represents the other emoji
    const otherEmoji = latest.leftEmojiCodepoint === matchedKey ? latest.rightEmoji : latest.leftEmoji;
    
    options.push({
      emoji: otherEmoji,
      codepoint: otherCp,
      combination: latest,
    });
  }

  // Sort by GBoard order and limit results
  return options
    .sort((a, b) => (a.combination.gBoardOrder || 999999) - (b.combination.gBoardOrder || 999999))
    .slice(0, limit);
}
