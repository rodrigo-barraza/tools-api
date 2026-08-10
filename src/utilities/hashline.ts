// ─── Hashline Format ─────────────────────────────────────────
// Token-efficient read/edit contract (port of oh-my-pi's hashline format):
// every read line is prefixed `<line#>:<hash>|` where <hash> is a short
// content hash of the exact line text. Edits reference lines by that
// `line:hash` anchor — if the hash no longer matches the file, the edit is
// rejected with a machine-actionable error instead of silently landing on
// drifted content. This replaces exact-substring (str_replace) matching.

/** Length of the per-line content hash in anchor strings. */
export const LINE_HASH_LENGTH = 4;

/**
 * Short content hash of a single line (FNV-1a 32-bit, base36, truncated).
 * Deterministic across processes — no seed, no length component — so a hash
 * from any earlier read of the same text always matches.
 */
export function lineHash(line: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < line.length; index++) {
    hash ^= line.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(LINE_HASH_LENGTH, "0").slice(0, LINE_HASH_LENGTH);
}

/** Format one line as `line#:hash|text`. */
export function formatHashline(lineNumber: number, text: string): string {
  return `${lineNumber}:${lineHash(text)}|${text}`;
}

/**
 * Format a run of lines as hashlines. `startLineNumber` is the 1-based file
 * line number of `lines[0]`.
 */
export function formatHashlines(
  lines: string[],
  startLineNumber: number,
): string {
  return lines
    .map((text, index) => formatHashline(startLineNumber + index, text))
    .join("\n");
}

export interface ParsedAnchor {
  ok: true;
  line: number;
  hash: string;
}

export interface AnchorParseError {
  ok: false;
  error: string;
}

/**
 * Parse a `line:hash` anchor. Line 0 (written `0` or `0:`) is the virtual
 * start-of-file anchor — valid only for insert_after — and carries no hash.
 */
export function parseAnchor(
  anchor: unknown,
): ParsedAnchor | AnchorParseError {
  if (typeof anchor !== "string" || !anchor.trim()) {
    return {
      ok: false,
      error: "anchor must be a 'line:hash' string from a prior read (e.g. '42:k9x2')",
    };
  }
  const trimmed = anchor.trim();
  const match = trimmed.match(/^(\d+)(?::([0-9a-z]*))?$/);
  if (!match) {
    return {
      ok: false,
      error: `anchor '${trimmed}' is not 'line:hash' (e.g. '42:k9x2')`,
    };
  }
  const line = parseInt(match[1], 10);
  const hash = match[2] ?? "";
  if (line === 0) {
    // Virtual start-of-file anchor — no content, so no hash to check.
    return { ok: true, line: 0, hash: "" };
  }
  if (hash.length !== LINE_HASH_LENGTH) {
    return {
      ok: false,
      error: `anchor '${trimmed}' is missing its ${LINE_HASH_LENGTH}-char content hash — copy the anchor exactly as returned by read_file (e.g. '42:k9x2')`,
    };
  }
  return { ok: true, line, hash };
}
