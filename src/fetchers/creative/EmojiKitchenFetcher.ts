const METADATA_URL =
  "https://raw.githubusercontent.com/xsalazar/emoji-kitchen-backend/main/app/metadata.json";

export interface EmojiCombination {
  gStaticUrl: string;
  alt: string;
  leftEmoji: string;
  leftEmojiCodepoint: string;
  rightEmoji: string;
  rightEmojiCodepoint: string;
  date: string;
  isLatest: boolean;
  gBoardOrder: number;
}

export interface EmojiData {
  alt: string;
  keywords: string[];
  emojiCodepoint: string;
  gBoardOrder: number;
  combinations: Record<string, EmojiCombination[]>;
}

export interface EmojiKitchenMetadata {
  knownSupportedEmoji: string[];
  data: Record<string, EmojiData>;
}

/**
 * Fetch the raw Emoji Kitchen metadata JSON from github.
 */
export async function fetchEmojiKitchenMetadata(): Promise<EmojiKitchenMetadata> {
  const response = await fetch(METADATA_URL);

  if (!response.ok) {
    throw new Error(
      `Emoji Kitchen Metadata API returned ${response.status}: ${response.statusText}`,
    );
  }

  const data = (await response.json()) as EmojiKitchenMetadata;
  return data;
}
