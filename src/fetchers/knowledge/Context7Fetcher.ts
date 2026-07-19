import { CONTEXT7_BASE_URL } from "../../constants.ts";
import CONFIG from "../../config.ts";

/**
 * Context7 fetcher — version-correct library documentation and code examples.
 * https://context7.com/api/v1 — anonymous access allowed (rate-limited);
 * optional CONTEXT7_API_KEY raises limits via Authorization: Bearer.
 */

export interface Context7Library {
  id: string;
  title: string;
  description: string;
  stars: number | null;
  trustScore: number | null;
  totalSnippets: number | null;
  versions: string[];
}

export interface LibraryDocsSuccess {
  found: true;
  library: Context7Library;
  topic: string | null;
  docs: string;
  /** Other search matches, so callers can re-query with an exact libraryId. */
  alternatives: Context7Library[];
}

export interface LibraryDocsNotFound {
  found: false;
  message: string;
}

export type LibraryDocsResult = LibraryDocsSuccess | LibraryDocsNotFound;

interface RawSearchResult {
  id: string;
  title?: string;
  description?: string;
  stars?: number;
  trustScore?: number;
  totalSnippets?: number;
  versions?: string[];
}

const DEFAULT_DOC_TOKENS = 2500;
const MIN_DOC_TOKENS = 1000;
const MAX_DOC_TOKENS = 20000;

function authHeaders(): Record<string, string> {
  return CONFIG.CONTEXT7_API_KEY
    ? { Authorization: `Bearer ${CONFIG.CONTEXT7_API_KEY}` }
    : {};
}

function toLibrary(raw: RawSearchResult): Context7Library {
  return {
    id: raw.id,
    title: raw.title ?? raw.id,
    description: raw.description ?? "",
    stars: raw.stars ?? null,
    trustScore: raw.trustScore ?? null,
    totalSnippets: raw.totalSnippets ?? null,
    versions: raw.versions ?? [],
  };
}

async function searchLibraries(query: string): Promise<Context7Library[]> {
  const url = `${CONTEXT7_BASE_URL}/search?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`Context7 library search failed: ${response.status}`);
  }
  const data = (await response.json()) as { results?: RawSearchResult[] };
  return (data.results ?? []).map(toLibrary);
}

async function fetchDocs(
  libraryId: string,
  topic: string | undefined,
  tokens: number,
): Promise<string | null> {
  // Library ids come with a leading slash, e.g. "/expressjs/express".
  const idPath = libraryId.startsWith("/") ? libraryId : `/${libraryId}`;
  const params = new URLSearchParams({ type: "txt", tokens: String(tokens) });
  if (topic) params.set("topic", topic);
  const response = await fetch(`${CONTEXT7_BASE_URL}${idPath}?${params}`, {
    headers: authHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Context7 docs fetch failed: ${response.status}`);
  }
  return response.text();
}

/**
 * Fetch up-to-date documentation for a library, resolving a free-text name
 * to a Context7 library id first when no exact id is given.
 */
export async function searchLibraryDocs(options: {
  libraryName?: string;
  libraryId?: string;
  topic?: string;
  tokens?: number;
}): Promise<LibraryDocsResult> {
  const { libraryName, libraryId, topic } = options;
  const tokens = Math.min(
    MAX_DOC_TOKENS,
    Math.max(MIN_DOC_TOKENS, options.tokens ?? DEFAULT_DOC_TOKENS),
  );

  let library: Context7Library;
  let alternatives: Context7Library[] = [];

  if (libraryId) {
    library = {
      id: libraryId.startsWith("/") ? libraryId : `/${libraryId}`,
      title: libraryId,
      description: "",
      stars: null,
      trustScore: null,
      totalSnippets: null,
      versions: [],
    };
  } else if (libraryName) {
    const matches = await searchLibraries(libraryName);
    if (matches.length === 0) {
      return {
        found: false,
        message: `No libraries matched '${libraryName}'. Try a different name.`,
      };
    }
    [library] = matches;
    alternatives = matches.slice(1, 5);
  } else {
    return {
      found: false,
      message: "Provide either libraryName or libraryId.",
    };
  }

  const docs = await fetchDocs(library.id, topic, tokens);
  if (docs === null || docs.trim() === "") {
    return {
      found: false,
      message: `No documentation found for '${library.id}'${topic ? ` on topic '${topic}'` : ""}.`,
    };
  }

  return { found: true, library, topic: topic ?? null, docs, alternatives };
}
