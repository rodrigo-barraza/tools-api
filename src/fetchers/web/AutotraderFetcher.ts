// ─── AutoTrader.ca Fetcher — Archive-First Vehicle Search ────────
//
// AutoTrader.ca is server-rendered Next.js: search pages embed the
// full listing objects (price, make/model/year/mileage, dealer
// location) in __NEXT_DATA__'s pageProps.listings. Keyword search
// via the kwd query param. Traffic is governed by the shared
// ClassifiedsEngine (see its module header).

import {
  createClassifiedsSource,
  type ClassifiedsSearchOptions,
  type ClassifiedsSearchResponse,
} from "./ClassifiedsEngine.ts";
import type { ParsedClassifiedListing } from "../../models/ClassifiedsArchive.ts";

// ─── City Mapping ────────────────────────────────────────────────

interface AutotraderCity {
  city: string;
  province: string;
}

const AUTOTRADER_CITIES: Record<string, AutotraderCity> = {
  vancouver: { city: "vancouver", province: "bc" },
  victoria: { city: "victoria", province: "bc" },
  kelowna: { city: "kelowna", province: "bc" },
  kamloops: { city: "kamloops", province: "bc" },
  abbotsford: { city: "abbotsford", province: "bc" },
  calgary: { city: "calgary", province: "ab" },
  edmonton: { city: "edmonton", province: "ab" },
  saskatoon: { city: "saskatoon", province: "sk" },
  regina: { city: "regina", province: "sk" },
  winnipeg: { city: "winnipeg", province: "mb" },
  toronto: { city: "toronto", province: "on" },
  mississauga: { city: "mississauga", province: "on" },
  hamilton: { city: "hamilton", province: "on" },
  ottawa: { city: "ottawa", province: "on" },
  london: { city: "london", province: "on" },
  kitchener: { city: "kitchener", province: "on" },
  windsor: { city: "windsor", province: "on" },
  montreal: { city: "montreal", province: "qc" },
  quebec: { city: "quebec", province: "qc" },
  halifax: { city: "halifax", province: "ns" },
  moncton: { city: "moncton", province: "nb" },
  stjohns: { city: "st-johns", province: "nl" },
};

export function autotraderSupportedCities(): string[] {
  return Object.keys(AUTOTRADER_CITIES);
}

// ─── Parser ──────────────────────────────────────────────────────

interface AutotraderListing {
  id?: string;
  url?: string;
  price?: { priceRaw?: number | null };
  images?: string[];
  description?: string;
  vehicle?: {
    make?: string;
    model?: string;
    modelYear?: number;
    modelVersionInput?: string | null;
    transmission?: string | null;
    fuel?: string | null;
    mileageInKm?: string | null;
  };
  location?: {
    city?: string;
    provinceCode?: string;
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAutotraderSearchPage(
  html: string,
): ParsedClassifiedListing[] {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json"[^>]*>(.*?)<\/script>/s,
  );
  if (!match) return [];

  const nextData = JSON.parse(match[1]) as {
    props?: { pageProps?: { listings?: AutotraderListing[] } };
  };
  const listings = nextData.props?.pageProps?.listings ?? [];

  const results: ParsedClassifiedListing[] = [];
  const seen = new Set<string>();

  for (const listing of listings) {
    const postId = listing.id;
    const vehicle = listing.vehicle;
    if (!postId || !listing.url || !vehicle || seen.has(postId)) continue;
    seen.add(postId);

    const title = [
      vehicle.modelYear,
      vehicle.make,
      vehicle.model,
      vehicle.modelVersionInput?.trim(),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!title) continue;

    const locationParts = [
      listing.location?.city,
      listing.location?.provinceCode,
    ].filter(Boolean);

    results.push({
      postId,
      url: listing.url.startsWith("http")
        ? listing.url
        : `https://www.autotrader.ca${listing.url}`,
      title,
      price: listing.price?.priceRaw ?? null,
      currency: listing.price?.priceRaw != null ? "CAD" : null,
      location: locationParts.length > 0 ? locationParts.join(", ") : null,
      imageUrls: (listing.images ?? []).slice(0, 5),
      postedAt: null, // AutoTrader does not expose posting dates on search pages
      description: listing.description
        ? stripHtml(listing.description).slice(0, 500)
        : null,
      attributes: {
        make: vehicle.make ?? null,
        model: vehicle.model ?? null,
        year: vehicle.modelYear ?? null,
        mileage: vehicle.mileageInKm ?? null,
        transmission: vehicle.transmission ?? null,
        fuel: vehicle.fuel ?? null,
      },
    });
  }

  return results;
}

// ─── Source ──────────────────────────────────────────────────────

const autotraderSource = createClassifiedsSource({
  source: "autotrader",
  provider: "AUTOTRADER",
  dailyBudget: 200,
  freshnessTtlMs: 45 * 60_000,
  maxPending: 10,
  jitterMaxMs: 5_000,
  buildUrl: (site: string, _section: string, query: string) => {
    const cityConfig = AUTOTRADER_CITIES[site];
    return (
      `https://www.autotrader.ca/cars/${cityConfig?.province ?? "bc"}/${cityConfig?.city ?? site}` +
      `/?kwd=${encodeURIComponent(query)}&prx=100`
    );
  },
  parse: parseAutotraderSearchPage,
});

/**
 * Archive-first AutoTrader.ca vehicle search. Query is keyword-based
 * (make, model, trim — e.g. "honda ridgeline"). Same caching/traffic
 * contract as search_craigslist — see ClassifiedsEngine.
 */
export async function searchAutotrader(
  cityInput: string,
  query: string,
  options: ClassifiedsSearchOptions = {},
): Promise<ClassifiedsSearchResponse | { error: string }> {
  const normalized = cityInput.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!AUTOTRADER_CITIES[normalized]) {
    return {
      error: `Unsupported AutoTrader city '${cityInput}'. Supported: ${autotraderSupportedCities().join(", ")}`,
    };
  }
  return autotraderSource.search(normalized, "cars", "autos", query, options);
}
