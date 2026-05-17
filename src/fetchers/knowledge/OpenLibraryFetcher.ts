import { stripHtml } from "@rodrigo-barraza/utilities-library";
import { OPEN_LIBRARY_BASE_URL } from "../../constants.ts";

/**
 * Open Library API fetcher.
 * https://openlibrary.org/developers/api — no auth, fully open.
 * Returns book metadata, author info, cover images, edition data.
 */
// ─── Search Books ──────────────────────────────────────────────────
/**
 * Search for books by title, author, or general query.
 * @param {string} query - Search query
 * @param {number} [limit=10] - Max results
 * @returns {Promise<object>}
 */
export async function searchBooks(query, limit = 10) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    fields:
      "key,title,author_name,first_publish_year,cover_i,subject,language,edition_count,ratings_average,ratings_count,isbn",
  });
  const url = `${OPEN_LIBRARY_BASE_URL}/search.json?${params}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open Library search → ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return {
    totalResults: data.numFound || 0,
    books: (data.docs || []).slice(0, limit).map((document) => ({
      key: document.key,
      title: document.title,
      authors: document.author_name || [],
      firstPublishYear: document.first_publish_year || null,
      coverUrl: document.cover_i
        ? `https://covers.openlibrary.org/b/id/${document.cover_i}-M.jpg`
        : null,
      subjects: (document.subject || []).slice(0, 5),
      languages: (document.language || []).slice(0, 5),
      editionCount: document.edition_count || 0,
      rating: document.ratings_average
        ? Math.round(document.ratings_average * 10) / 10
        : null,
      ratingCount: document.ratings_count || 0,
      isbn: document.isbn?.[0] || null,
    })),
  };
}
// ─── Get Book Details ──────────────────────────────────────────────
/**
 * Get detailed book info by Open Library work key (e.g., "/works/OL45883W").
 * @param {string} workKey - e.g. "OL45883W"
 * @returns {Promise<object>}
 */
export async function getBookDetails(workKey) {
  const key = workKey.startsWith("/works/") ? workKey : `/works/${workKey}`;
  const url = `${OPEN_LIBRARY_BASE_URL}${key}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Open Library work detail → ${response.status} ${response.statusText}`,
    );
  }
  const data = await response.json();
  const description =
    typeof data.description === "string"
      ? data.description
      : data.description?.value || null;
  return {
    key: data.key,
    title: data.title,
    description: description ? stripHtml(description) : null,
    subjects: (data.subjects || []).slice(0, 10),
    coverUrl: data.covers?.[0]
      ? `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`
      : null,
    firstPublishDate: data.first_publish_date || null,
    links: (data.links || []).map((l) => ({
      title: l.title,
      url: l.url,
    })),
  };
}
// ─── Get Author Info ───────────────────────────────────────────────
/**
 * Get author info by Open Library author key (e.g., "OL23919A").
 * @param {string} authorKey
 * @returns {Promise<object>}
 */
export async function getAuthorInfo(authorKey) {
  const key = authorKey.startsWith("/authors/")
    ? authorKey
    : `/authors/${authorKey}`;
  const url = `${OPEN_LIBRARY_BASE_URL}${key}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Open Library author detail → ${response.status} ${response.statusText}`,
    );
  }
  const data = await response.json();
  const bio = typeof data.bio === "string" ? data.bio : data.bio?.value || null;
  return {
    key: data.key,
    name: data.name,
    bio: bio ? stripHtml(bio) : null,
    birthDate: data.birth_date || null,
    deathDate: data.death_date || null,
    photoUrl: data.photos?.[0]
      ? `https://covers.openlibrary.org/a/id/${data.photos[0]}-M.jpg`
      : null,
    wikipedia: data.wikipedia || null,
    alternateNames: (data.alternate_names || []).slice(0, 5),
  };
}
