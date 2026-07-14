import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSearchPage } from "../src/fetchers/web/CraigslistFetcher.ts";

// ─── Unit Tests for Craigslist Parsers (fixture-based, no network) ──

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const searchHtml = readFileSync(
  join(fixturesDir, "craigslist-search.html"),
  "utf8",
);

describe("parseSearchPage", () => {
  const listings = parseSearchPage(searchHtml);

  it("extracts all static search results", () => {
    expect(listings.length).toBeGreaterThan(200);
  });

  it("extracts required fields on every listing", () => {
    for (const listing of listings) {
      expect(listing.postId).toBeTruthy();
      expect(listing.url).toMatch(/^https:\/\//);
      expect(listing.title).toBeTruthy();
    }
  });

  it("derives unique postIds from listing URLs", () => {
    const ids = new Set(listings.map((listing) => listing.postId));
    expect(ids.size).toBe(listings.length);
  });

  it("parses prices as numbers", () => {
    const priced = listings.filter((listing) => listing.price !== null);
    expect(priced.length).toBeGreaterThan(0);
    for (const listing of priced) {
      expect(typeof listing.price).toBe("number");
      expect(listing.price).toBeGreaterThanOrEqual(0);
    }
  });

  it("extracts locations", () => {
    const located = listings.filter((listing) => listing.location);
    expect(located.length).toBeGreaterThan(0);
  });

  it("enriches some listings from JSON-LD (currency/geo)", () => {
    const enriched = listings.filter(
      (listing) => listing.currency !== null || listing.latitude !== null,
    );
    expect(enriched.length).toBeGreaterThan(0);
  });
});
