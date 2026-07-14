import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKijijiSearchPage } from "../src/fetchers/web/KijijiFetcher.ts";
import { parseAutotraderSearchPage } from "../src/fetchers/web/AutotraderFetcher.ts";

// ─── Unit Tests for Kijiji/AutoTrader Parsers (fixture-based) ──────

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("parseKijijiSearchPage", () => {
  const html = readFileSync(join(fixturesDir, "kijiji-search.html"), "utf8");
  const listings = parseKijijiSearchPage(html);

  it("extracts organic listings from the Apollo cache", () => {
    expect(listings.length).toBeGreaterThan(20);
  });

  it("extracts required fields on every listing", () => {
    for (const listing of listings) {
      expect(listing.postId).toBeTruthy();
      expect(listing.url).toMatch(/^https:\/\/www\.kijiji\.ca\//);
      expect(listing.title).toBeTruthy();
    }
  });

  it("derives unique postIds", () => {
    const ids = new Set(listings.map((listing) => listing.postId));
    expect(ids.size).toBe(listings.length);
  });

  it("converts cent prices to dollars", () => {
    const priced = listings.filter((listing) => listing.price !== null);
    expect(priced.length).toBeGreaterThan(0);
    for (const listing of priced) {
      expect(listing.currency).toBe("CAD");
      expect(listing.price).toBeLessThan(1_000_000);
    }
  });

  it("extracts real posting dates", () => {
    const dated = listings.filter((listing) => listing.postedAt !== null);
    expect(dated.length).toBeGreaterThan(listings.length / 2);
    for (const listing of dated) {
      expect(listing.postedAt).toBeInstanceOf(Date);
    }
  });

  it("extracts locations and coordinates", () => {
    const located = listings.filter(
      (listing) => listing.location && listing.latitude !== null,
    );
    expect(located.length).toBeGreaterThan(0);
  });
});

describe("parseAutotraderSearchPage", () => {
  const html = readFileSync(
    join(fixturesDir, "autotrader-search.html"),
    "utf8",
  );
  const listings = parseAutotraderSearchPage(html);

  it("extracts listings from NEXT_DATA", () => {
    expect(listings.length).toBeGreaterThan(10);
  });

  it("builds titles from vehicle fields", () => {
    for (const listing of listings) {
      expect(listing.title).toMatch(/\d{4} /);
      expect(listing.url).toMatch(/^https:\/\/www\.autotrader\.ca\//);
    }
  });

  it("extracts vehicle attributes", () => {
    const withAttributes = listings.filter(
      (listing) => listing.attributes?.make && listing.attributes?.model,
    );
    expect(withAttributes.length).toBe(listings.length);
  });

  it("extracts CAD prices", () => {
    const priced = listings.filter((listing) => listing.price !== null);
    expect(priced.length).toBeGreaterThan(0);
    for (const listing of priced) {
      expect(listing.currency).toBe("CAD");
      expect(listing.price).toBeGreaterThan(100);
    }
  });

  it("strips HTML from descriptions", () => {
    const described = listings.filter((listing) => listing.description);
    expect(described.length).toBeGreaterThan(0);
    for (const listing of described) {
      expect(listing.description).not.toMatch(/<[a-z]+>/i);
      expect(listing.description!.length).toBeLessThanOrEqual(500);
    }
  });
});
