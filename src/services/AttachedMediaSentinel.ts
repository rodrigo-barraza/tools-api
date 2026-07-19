// ─── "attached" Media Sentinel ──────────────────────────────
// prism-service substitutes the literal string "attached" with the
// conversation's uploaded media (image/audio/video/document) before
// a tool request ever reaches this service. A tool that still sees
// the raw sentinel means there was nothing to substitute — the user
// must (re-)attach the file. This module is the single source of
// truth for the sentinel string and the standard error copy; never
// duplicate the check inline in a route.

export const ATTACHED_MEDIA_SENTINEL = "attached";

export type AttachedMediaKind = "image" | "audio" | "video" | "document";

/** True when the input is the literal, unresolved "attached" sentinel. */
export function isUnresolvedAttachedSentinel(input: unknown): boolean {
  return (
    typeof input === "string" &&
    input.trim().toLowerCase() === ATTACHED_MEDIA_SENTINEL
  );
}

/**
 * Standard "please re-attach" error message.
 * `alternatives` finishes the sentence "…or pass ___." — e.g.
 * "an explicit URL, data URI, or imageId".
 */
export function buildAttachedSentinelError(
  mediaKind: AttachedMediaKind,
  alternatives: string,
): string {
  return (
    `No attached ${mediaKind} was found in the conversation to substitute for ` +
    `'${ATTACHED_MEDIA_SENTINEL}'. Ask the user to (re-)upload the ${mediaKind}, ` +
    `or pass ${alternatives}.`
  );
}

/** Throwing variant for resolvers/services (routes usually return a 400 instead). */
export function assertNoUnresolvedAttachedSentinel(
  input: unknown,
  mediaKind: AttachedMediaKind,
  alternatives: string,
): void {
  if (isUnresolvedAttachedSentinel(input)) {
    throw new Error(buildAttachedSentinelError(mediaKind, alternatives));
  }
}
