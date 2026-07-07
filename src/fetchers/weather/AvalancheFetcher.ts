import { stripHtml } from "@rodrigo-barraza/utilities-library";

const AVCAN_PRODUCTS_URL = "https://api.avalanche.ca/forecasts/en/products";

export interface DangerRating {
  date: string | null;
  alpine: string | null;
  treeline: string | null;
  belowTreeline: string | null;
}

export interface AvalancheProblem {
  type: string | null;
  comment: string | null;
}

export interface AvalancheForecast {
  id: string;
  title: string;
  dateIssued: string | null;
  validUntil: string | null;
  highlights: string | null;
  confidence: string | null;
  dangerRatings: DangerRating[];
  problems: AvalancheProblem[];
  url: string;
}

interface RawRatingDetail {
  rating?: {
    display?: string;
  };
}

interface RawDangerRating {
  date?: {
    display?: string;
  };
  ratings?: {
    alp?: RawRatingDetail;
    tln?: RawRatingDetail;
    btl?: RawRatingDetail;
  };
}

interface RawProblem {
  type?: {
    display?: string;
  };
  comment?: string;
}

interface RawReport {
  title?: string;
  dateIssued?: string;
  validUntil?: string;
  highlights?: string;
  confidence?: {
    rating?: {
      display?: string;
    };
  };
  dangerRatings?: RawDangerRating[];
  problems?: RawProblem[];
}

interface RawProduct {
  id?: string;
  slug?: string;
  url?: string;
  area?: {
    id?: string;
    name?: string;
  };
  report?: RawReport;
}

/**
 * Fetch avalanche forecasts from Avalanche Canada.
 * Free, no key required. Fetches all current product metadata.
 * When a region keyword is provided, filters to matching areas.
 * When omitted, returns all available regions.
 */
export async function fetchAvalancheForecast(
  region?: string,
): Promise<AvalancheForecast[]> {
  const response = await fetch(AVCAN_PRODUCTS_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (compatible; Sun/Nimbus; github.com/rodrigo-barraza)",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Avalanche Canada API returned ${response.status}: ${response.statusText}`,
    );
  }
  const products = (await response.json()) as RawProduct[];
  if (!Array.isArray(products)) {
    throw new Error("Avalanche Canada returned unexpected data format");
  }

  const regionKeyword = region?.toLowerCase().trim();

  function parseProduct(product: RawProduct): AvalancheForecast {
    const report = product.report || {};
    const areaId = (product.area?.id || product.id || "").toLowerCase();
    return {
      id: product.id || product.slug || "",
      title: report.title || product.area?.name || areaId || "Unknown Region",
      dateIssued: report.dateIssued || null,
      validUntil: report.validUntil || null,
      highlights: report.highlights ? stripHtml(report.highlights) : null,
      confidence: report.confidence?.rating?.display || null,
      dangerRatings: (report.dangerRatings || []).map(
        (dr): DangerRating => ({
          date: dr.date?.display || null,
          alpine: dr.ratings?.alp?.rating?.display || null,
          treeline: dr.ratings?.tln?.rating?.display || null,
          belowTreeline: dr.ratings?.btl?.rating?.display || null,
        }),
      ),
      problems: (report.problems || []).map(
        (rawProblem): AvalancheProblem => ({
          type: rawProblem.type?.display || null,
          comment: rawProblem.comment ? stripHtml(rawProblem.comment) : null,
        }),
      ),
      url:
        product.url ||
        `https://avalanche.ca/forecasts/${product.id || areaId || ""}`,
    };
  }

  if (regionKeyword) {
    const forecasts: AvalancheForecast[] = [];
    for (const product of products) {
      const title = (
        product.report?.title ||
        product.area?.name ||
        product.id ||
        ""
      ).toLowerCase();
      const areaId = (product.area?.id || product.id || "").toLowerCase();
      if (title.includes(regionKeyword) || areaId.includes(regionKeyword)) {
        forecasts.push(parseProduct(product));
      }
    }
    return forecasts;
  }

  return products.map(parseProduct);
}
