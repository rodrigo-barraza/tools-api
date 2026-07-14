// ─── Kijiji Fetcher — Archive-First Classifieds Search ──────────
//
// Kijiji is server-rendered Next.js: the search page embeds full
// listing objects (including real posting dates) in __NEXT_DATA__'s
// Apollo cache. One request returns a whole results page. Traffic is
// governed by the shared ClassifiedsEngine (see its module header).

import {
  createClassifiedsSource,
  type ClassifiedsSearchOptions,
  type ClassifiedsSearchResponse,
} from "./ClassifiedsEngine.ts";
import type { ParsedClassifiedListing } from "../../models/ClassifiedsArchive.ts";

// ─── Category Mapping ────────────────────────────────────────────
// Same friendly names as search_craigslist. Kijiji has no gigs
// section, so gigs maps to jobs.

interface KijijiCategory {
  slug: string;
  id: number;
}

export const KIJIJI_CATEGORIES: Record<string, KijijiCategory> = {
  "for sale": { slug: "b-buy-sell", id: 10 },
  jobs: { slug: "b-jobs", id: 45 },
  housing: { slug: "b-real-estate", id: 34 },
  services: { slug: "b-services", id: 72 },
  gigs: { slug: "b-jobs", id: 45 },
  autos: { slug: "b-cars-vehicles", id: 27 },
};

// ─── Location Mapping ────────────────────────────────────────────
// Kijiji locations are (slug, numeric id) pairs; the id is
// authoritative (a mismatched slug redirects to the id's canonical
// URL). Curated list of major markets.

interface KijijiLocation {
  slug: string;
  id: number;
}

const KIJIJI_LOCATIONS: Record<string, KijijiLocation> = {
  vancouver: { slug: "greater-vancouver-area", id: 80003 },
  toronto: { slug: "gta-greater-toronto-area", id: 1700272 },
  calgary: { slug: "calgary", id: 1700199 },
  edmonton: { slug: "edmonton-area", id: 1700203 },
  ottawa: { slug: "ottawa", id: 1700185 },
  winnipeg: { slug: "winnipeg", id: 1700192 },
  montreal: { slug: "grand-montreal", id: 80002 },
  hamilton: { slug: "hamilton", id: 80014 },
  victoria: { slug: "victoria-bc", id: 1700173 },
  saskatoon: { slug: "saskatoon", id: 1700197 },
  regina: { slug: "regina-area", id: 1700196 },
  kelowna: { slug: "kelowna", id: 1700228 },
  london: { slug: "london", id: 1700214 },
  kitchener: { slug: "kitchener-waterloo", id: 1700212 },
  halifax: { slug: "city-of-halifax", id: 1700321 },
};

function resolveLocation(cityInput: string): KijijiLocation | null {
  const normalized = cityInput.toLowerCase().replace(/[^a-z0-9]/g, "");
  return KIJIJI_LOCATIONS[normalized] ?? null;
}

export function kijijiSupportedCities(): string[] {
  return Object.keys(KIJIJI_LOCATIONS);
}

// ─── Parser ──────────────────────────────────────────────────────

interface KijijiApolloListing {
  __typename?: string;
  id?: string;
  title?: string;
  description?: string;
  imageUrls?: string[];
  url?: string;
  activationDate?: string;
  adSource?: string;
  location?: {
    name?: string;
    coordinates?: { latitude?: number; longitude?: number };
  };
  price?: { amount?: number | null };
}

export function parseKijijiSearchPage(
  html: string,
): ParsedClassifiedListing[] {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>(.*?)<\/script>/s,
  );
  if (!match) return [];

  const nextData = JSON.parse(match[1]) as {
    props?: {
      pageProps?: { __APOLLO_STATE__?: Record<string, KijijiApolloListing> };
    };
  };
  const apollo = nextData.props?.pageProps?.__APOLLO_STATE__ ?? {};

  const results: ParsedClassifiedListing[] = [];
  const seen = new Set<string>();

  for (const [key, value] of Object.entries(apollo)) {
    if (!key.startsWith("StandardListing:") && !key.startsWith("AutosListing:")) {
      continue;
    }
    // TOP_AD entries are paid promotions, often from other regions
    if (value.adSource && value.adSource !== "ORGANIC") continue;

    const postId = value.id;
    const url = value.url;
    const title = value.title?.trim();
    if (!postId || !url || !title || seen.has(postId)) continue;
    seen.add(postId);

    const amount = value.price?.amount;
    const postedAt = value.activationDate
      ? new Date(value.activationDate)
      : null;

    results.push({
      postId,
      url,
      title,
      // Kijiji amounts are in cents
      price: typeof amount === "number" ? amount / 100 : null,
      currency: typeof amount === "number" ? "CAD" : null,
      location: value.location?.name ?? null,
      latitude: value.location?.coordinates?.latitude ?? null,
      longitude: value.location?.coordinates?.longitude ?? null,
      imageUrls: (value.imageUrls ?? []).slice(0, 5),
      postedAt:
        postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
      description: value.description?.slice(0, 500) ?? null,
    });
  }

  return results;
}

// ─── Source ──────────────────────────────────────────────────────

function slugifyQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const kijijiSource = createClassifiedsSource({
  source: "kijiji",
  provider: "KIJIJI",
  dailyBudget: 200,
  freshnessTtlMs: 45 * 60_000,
  maxPending: 10,
  jitterMaxMs: 5_000,
  buildUrl: (site: string, section: string, query: string) => {
    const location = KIJIJI_LOCATIONS[site];
    const category = Object.values(KIJIJI_CATEGORIES).find(
      (candidate) => String(candidate.id) === section,
    );
    return (
      `https://www.kijiji.ca/${category?.slug ?? "b-buy-sell"}/${location?.slug ?? site}` +
      `/${slugifyQuery(query)}/k0c${section}l${location?.id ?? ""}`
    );
  },
  parse: parseKijijiSearchPage,
});

/**
 * Archive-first Kijiji search. Same caching/traffic contract as
 * search_craigslist — see ClassifiedsEngine.
 */
export async function searchKijiji(
  cityInput: string,
  categoryInput: string,
  query: string,
  options: ClassifiedsSearchOptions = {},
): Promise<ClassifiedsSearchResponse | { error: string }> {
  const category = KIJIJI_CATEGORIES[categoryInput.toLowerCase().trim()];
  if (!category) {
    return {
      error: `Unknown category '${categoryInput}'. Use one of: ${Object.keys(KIJIJI_CATEGORIES).join(", ")}`,
    };
  }
  const location = resolveLocation(cityInput);
  if (!location) {
    return {
      error: `Unsupported Kijiji city '${cityInput}'. Supported: ${kijijiSupportedCities().join(", ")}`,
    };
  }
  const normalized = cityInput.toLowerCase().replace(/[^a-z0-9]/g, "");
  return kijijiSource.search(
    normalized,
    String(category.id),
    categoryInput,
    query,
    options,
  );
}
