import { errorMessage } from "../../utilities.ts";

// ─── Post + Comment Thread ──────────────────────────────────

const HN_API = "https://hacker-news.firebaseio.com/v0";
const MAX_COMMENTS = 25;

// ─── URL Parsing ───────────────────────────────────────────────────

const HN_URL_REGEX =
  /(?:https?:\/\/)?(?:news\.ycombinator\.com)\/item\?id=(\d+)/i;

/**
 * Extract a HN item ID from a URL or raw ID.


 */
function parseHnInput(input: any) {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  const match = trimmed.match(HN_URL_REGEX);
  if (match) return match[1];

  // Bare numeric ID
  if (/^\d+$/.test(trimmed)) return trimmed;

  return null;
}

// ─── Comment Fetching ────────────────────────────────────────────

/**
 * Recursively fetch comment tree (breadth-first, limited depth).


 */
async function fetchComments(ids: any, remaining: any, depth: any = 0) {
  if (!ids?.length || remaining <= 0 || depth > 3) return [];

  const batch = ids.slice(0, remaining);
  const comments: unknown[] = [];

  const items = await Promise.all(
    batch.map((id: any) =>
      fetch(`${HN_API}/item/${id}.json`)
        .then((r: any) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  );

  for (const item of items) {
    if (!item || item.deleted || item.dead || comments.length >= remaining) continue;

    const comment = {
      id: item.id,
      author: item.by || "[deleted]",
      text: item.text || "",
      time: item.time ? new Date(item.time * 1000).toISOString() : null,
      depth,
    };

    comments.push(comment);

    // Fetch child comments
    if (item.kids?.length && comments.length < remaining) {
      const children = await fetchComments(
        item.kids,
        remaining - comments.length,
        depth + 1,
      );
      comments.push(...children);
    }
  }

  return comments;
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Fetch a Hacker News post with top comments.


 */
export async function getHackerNewsThread(input: any, options: Record<string, unknown> = {}) {
  const itemId = parseHnInput(input);
  if (!itemId) {
    return { error: `Invalid Hacker News URL or ID: "${input}"` };
  }

  const { commentLimit = MAX_COMMENTS } = options;

  try {
    const response = await fetch(`${HN_API}/item/${itemId}.json`);
    if (!response.ok) {
      return { error: `HN API error: ${response.status}` };
    }

    const item = await response.json();
    if (!item) {
      return { error: `Item not found: ${itemId}` };
    }

    const result: Record<string, unknown> = {
      id: item.id,
      type: item.type,
      title: item.title || null,
      url: item.url || null,
      hnUrl: `https://news.ycombinator.com/item?id=${item.id}`,
      author: item.by || null,
      score: item.score || 0,
      commentCount: item.descendants || 0,
      time: item.time ? new Date(item.time * 1000).toISOString() : null,
      text: item.text || null,
    };

    // Fetch top comments
    if (item.kids?.length) {
      result.comments = await fetchComments(item.kids, commentLimit);
    } else {
      result.comments = [];
    }

    return result;
  } catch (error: unknown) {
    return { error: `HN fetch failed: ${errorMessage(error)}` };
  }
}
