import { stripHtml } from "@rodrigo-barraza/utilities-library";
import { ARXIV_BASE_URL } from "../../constants.ts";
import { extractXmlTag, extractXmlItems } from "../../utilities.ts";

/**
 * arXiv API fetcher.
 * https://info.arxiv.org/help/api/ — no auth, fully open.
 * Returns academic papers with abstracts, authors, categories.
 * Uses Atom XML responses — parsed with lightweight XML utilities.
 */

export interface ArxivPaper {
  arxivId: string | null;
  title: string | null;
  abstract: string | null;
  authors: string[];
  published: string | null;
  updated: string | null;
  primaryCategory: string | null;
  categories: string[];
  pdfUrl: string | null;
  abstractUrl: string | null;
  doi: string | null;
  comment: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────

function parseEntry(entryXml: string): ArxivPaper {
  const id = extractXmlTag(entryXml, "id");
  const title = extractXmlTag(entryXml, "title")?.replace(/\s+/g, " ").trim();
  const summary = extractXmlTag(entryXml, "summary")
    ?.replace(/\s+/g, " ")
    .trim();
  const published = extractXmlTag(entryXml, "published");
  const updated = extractXmlTag(entryXml, "updated");

  // Extract authors
  const authorBlocks = extractXmlItems(entryXml, "author");
  const authors = authorBlocks
    .map((first) => extractXmlTag(first, "name"))
    .filter((name): name is string => name != null)
    .slice(0, 10);

  // Extract categories from <category term="..." />
  const categoryMatches = [...entryXml.matchAll(/category\s+term="([^"]+)"/g)];
  const categories = categoryMatches.map((m) => m[1]);
  const primaryCategory = categories[0] || null;

  // Extract PDF link
  const pdfMatch = entryXml.match(/link[^>]+title="pdf"[^>]+href="([^"]+)"/);
  const pdfUrl = pdfMatch ? pdfMatch[1] : null;

  // Extract DOI
  const doi = extractXmlTag(entryXml, "arxiv:doi");

  // Extract comment (page count, conference, etc.)
  const comment = extractXmlTag(entryXml, "arxiv:comment");

  return {
    arxivId: id?.replace("http://arxiv.org/abs/", "") || null,
    title: title || null,
    abstract: summary ? stripHtml(summary) : null,
    authors,
    published: published || null,
    updated: updated || null,
    primaryCategory,
    categories: categories.slice(0, 5),
    pdfUrl,
    abstractUrl: id || null,
    doi: doi || null,
    comment: comment || null,
  };
}

// ─── Search Papers ─────────────────────────────────────────────────

export interface SearchPapersOptions {
  category?: string;
  limit?: number;
  sortBy?: string;
}

/**
 * Search arXiv for papers matching a query.
 */
export async function searchPapers(
  query: string,
  { category, limit = 10, sortBy = "relevance" }: SearchPapersOptions = {},
) {
  // Build the search query
  let searchQuery = `all:${query}`;
  if (category) {
    searchQuery = `cat:${category}+AND+all:${query}`;
  }

  const sortMap = {
    relevance: "relevance",
    lastUpdatedDate: "lastUpdatedDate",
    submittedDate: "submittedDate",
  } as const;

  const resolvedSortBy = (sortBy && sortBy in sortMap)
    ? sortMap[sortBy as keyof typeof sortMap]
    : "relevance";

  const params = new URLSearchParams({
    search_query: searchQuery,
    start: "0",
    max_results: String(Math.min(limit, 30)),
    sortBy: resolvedSortBy,
    sortOrder: "descending",
  });

  const url = `${ARXIV_BASE_URL}?${params}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`arXiv API → ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();

  // Parse total results from feed
  const totalResults =
    parseInt(extractXmlTag(xml, "opensearch:totalResults") ?? "0", 10) || 0;

  // Parse entries
  const entries = extractXmlItems(xml, "entry");
  const papers = entries.map(parseEntry);

  return {
    totalResults,
    count: papers.length,
    papers,
  };
}
