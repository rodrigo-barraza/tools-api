import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock External Dependencies ────────────────────────────────

vi.mock("../../fetchers/shared/GeocodingUtility.ts", () => ({
  geocodeLocation: vi.fn(),
}));

vi.mock("../../fetchers/event/TicketmasterFetcher.ts", () => ({
  fetchTicketmasterEvents: vi.fn(),
}));

vi.mock("../../fetchers/event/SeatGeekFetcher.ts", () => ({
  fetchSeatGeekEvents: vi.fn(),
}));

vi.mock("../../fetchers/event/CraigslistFetcher.ts", () => ({
  fetchCraigslistEvents: vi.fn(),
}));

vi.mock("../../fetchers/event/MovieFetcher.ts", () => ({
  fetchMovieEvents: vi.fn(),
}));

vi.mock("../../config.ts", () => ({
  default: {
    TICKETMASTER_API_KEY: "test-tm-key",
    SEATGEEK_CLIENT_ID: "test-sg-id",
    TMDB_API_KEY: "test-tmdb-key",
    LATITUDE: 49.2827,
    LONGITUDE: -123.1207,
    RADIUS_MILES: 50,
  },
}));

vi.mock("../../logger.ts", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../utilities.ts", () => ({
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

import {
  fetchOnDemandEvents,
  resolveCraigslistSubdomain,
  deduplicateEvents,
} from "../OnDemandEventService.ts";
import { geocodeLocation } from "../../fetchers/shared/GeocodingUtility.ts";
import { fetchTicketmasterEvents } from "../../fetchers/event/TicketmasterFetcher.ts";
import { fetchSeatGeekEvents } from "../../fetchers/event/SeatGeekFetcher.ts";
import { fetchCraigslistEvents } from "../../fetchers/event/CraigslistFetcher.ts";
import { fetchMovieEvents } from "../../fetchers/event/MovieFetcher.ts";
import type { CachedEvent } from "../../caches/EventCache.ts";

const mockedGeocode = vi.mocked(geocodeLocation);
const mockedTicketmaster = vi.mocked(fetchTicketmasterEvents);
const mockedSeatGeek = vi.mocked(fetchSeatGeekEvents);
const mockedCraigslist = vi.mocked(fetchCraigslistEvents);
const mockedMovies = vi.mocked(fetchMovieEvents);

// ─── Helpers ────────────────────────────────────────────────────

function createMockEvent(overrides: Partial<CachedEvent> = {}): CachedEvent {
  return {
    name: "Test Event",
    source: "ticketmaster",
    sourceId: `tm-${Date.now()}-${Math.random()}`,
    startDate: new Date("2026-08-01T19:00:00Z"),
    ...overrides,
  };
}

const torontoGeocode = {
  name: "Toronto",
  country: "Canada",
  countryCode: "CA",
  admin1: "Ontario",
  latitude: 43.6532,
  longitude: -79.3832,
  timezone: "America/Toronto",
  elevation: 76,
  population: 2731571,
};

const tokyoGeocode = {
  name: "Tokyo",
  country: "Japan",
  countryCode: "JP",
  admin1: "Tokyo",
  latitude: 35.6762,
  longitude: 139.6503,
  timezone: "Asia/Tokyo",
  elevation: 40,
  population: 13960000,
};

// ─── Tests ──────────────────────────────────────────────────────

describe("OnDemandEventService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveCraigslistSubdomain", () => {
    it("resolves known Canadian cities", () => {
      expect(resolveCraigslistSubdomain("Toronto")).toBe("toronto");
      expect(resolveCraigslistSubdomain("Vancouver")).toBe("vancouver");
      expect(resolveCraigslistSubdomain("Montreal")).toBe("montreal");
    });

    it("resolves known US cities", () => {
      expect(resolveCraigslistSubdomain("New York")).toBe("newyork");
      expect(resolveCraigslistSubdomain("San Francisco")).toBe("sfbay");
      expect(resolveCraigslistSubdomain("Seattle")).toBe("seattle");
      expect(resolveCraigslistSubdomain("Los Angeles")).toBe("losangeles");
    });

    it("is case-insensitive", () => {
      expect(resolveCraigslistSubdomain("TORONTO")).toBe("toronto");
      expect(resolveCraigslistSubdomain("seattle")).toBe("seattle");
      expect(resolveCraigslistSubdomain("San francisco")).toBe("sfbay");
    });

    it("returns null for unknown cities", () => {
      expect(resolveCraigslistSubdomain("Tokyo")).toBeNull();
      expect(resolveCraigslistSubdomain("Paris")).toBeNull();
      expect(resolveCraigslistSubdomain("Random Town")).toBeNull();
    });

    it("handles whitespace trimming", () => {
      expect(resolveCraigslistSubdomain("  Toronto  ")).toBe("toronto");
    });
  });

  describe("deduplicateEvents", () => {
    it("removes duplicate events with same name and date", () => {
      const eventA = createMockEvent({
        name: "Summer Concert",
        source: "ticketmaster",
        sourceId: "tm-1",
        startDate: new Date("2026-08-15T20:00:00Z"),
      });
      const eventB = createMockEvent({
        name: "Summer Concert",
        source: "seatgeek",
        sourceId: "sg-1",
        startDate: new Date("2026-08-15T21:00:00Z"),
        category: "music",
      });

      const result = deduplicateEvents([eventA, eventB]);
      expect(result).toHaveLength(1);
    });

    it("keeps the event with richer metadata on duplicates", () => {
      const sparseEvent = createMockEvent({
        name: "Rock Show",
        source: "seatgeek",
        sourceId: "sg-1",
        startDate: new Date("2026-08-15T20:00:00Z"),
      });
      const richEvent = createMockEvent({
        name: "Rock Show",
        source: "ticketmaster",
        sourceId: "tm-1",
        startDate: new Date("2026-08-15T20:30:00Z"),
        category: "music",
        url: "https://example.com",
        imageUrl: "https://example.com/img.jpg",
      });

      const result = deduplicateEvents([sparseEvent, richEvent]);
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("ticketmaster");
    });

    it("keeps events with different names", () => {
      const eventA = createMockEvent({
        name: "Concert A",
        startDate: new Date("2026-08-15T20:00:00Z"),
      });
      const eventB = createMockEvent({
        name: "Concert B",
        startDate: new Date("2026-08-15T20:00:00Z"),
      });

      const result = deduplicateEvents([eventA, eventB]);
      expect(result).toHaveLength(2);
    });

    it("keeps events with same name but different dates", () => {
      const eventA = createMockEvent({
        name: "Weekly Show",
        startDate: new Date("2026-08-15T20:00:00Z"),
      });
      const eventB = createMockEvent({
        name: "Weekly Show",
        startDate: new Date("2026-08-22T20:00:00Z"),
      });

      const result = deduplicateEvents([eventA, eventB]);
      expect(result).toHaveLength(2);
    });

    it("handles events without dates", () => {
      const eventA = createMockEvent({ name: "Dateless Event" });
      delete (eventA as Record<string, unknown>).startDate;
      const eventB = createMockEvent({ name: "Dateless Event" });
      delete (eventB as Record<string, unknown>).startDate;

      const result = deduplicateEvents([eventA, eventB]);
      expect(result).toHaveLength(1);
    });
  });

  describe("fetchOnDemandEvents", () => {
    it("geocodes the city and fans out to all APIs", async () => {
      mockedGeocode.mockResolvedValue(torontoGeocode);
      const ticketmasterEvent = createMockEvent({
        name: "Raptors Game",
        source: "ticketmaster",
      });
      const seatgeekEvent = createMockEvent({
        name: "Blue Jays Game",
        source: "seatgeek",
      });
      const craigslistEvent = createMockEvent({
        name: "Community Fair",
        source: "craigslist",
      });
      const movieEvent = createMockEvent({
        name: "New Movie",
        source: "tmdb",
      });

      mockedTicketmaster.mockResolvedValue([ticketmasterEvent] as never);
      mockedSeatGeek.mockResolvedValue([seatgeekEvent] as never);
      mockedCraigslist.mockResolvedValue([craigslistEvent]);
      mockedMovies.mockResolvedValue([movieEvent]);

      const result = await fetchOnDemandEvents({ city: "Toronto" });

      expect(mockedGeocode).toHaveBeenCalledWith("Toronto");
      expect(mockedTicketmaster).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: torontoGeocode.latitude,
          longitude: torontoGeocode.longitude,
        }),
      );
      expect(mockedSeatGeek).toHaveBeenCalledWith(
        expect.objectContaining({
          latitude: torontoGeocode.latitude,
          longitude: torontoGeocode.longitude,
        }),
      );
      expect(mockedCraigslist).toHaveBeenCalledWith("toronto");
      expect(mockedMovies).toHaveBeenCalledWith("CA");

      expect(result.count).toBe(4);
      expect(result.sources).toContain("ticketmaster");
      expect(result.sources).toContain("seatgeek");
      expect(result.sources).toContain("craigslist");
      expect(result.sources).toContain("tmdb");
      expect(result.location.city).toBe("Toronto");
      expect(result.location.countryCode).toBe("CA");
    });

    it("returns empty results when geocoding fails", async () => {
      mockedGeocode.mockResolvedValue(null);

      const result = await fetchOnDemandEvents({ city: "Nonexistent City" });

      expect(result.count).toBe(0);
      expect(result.events).toHaveLength(0);
      expect(result.sources).toHaveLength(0);
      expect(mockedTicketmaster).not.toHaveBeenCalled();
    });

    it("gracefully handles partial API failures", async () => {
      mockedGeocode.mockResolvedValue(torontoGeocode);
      mockedTicketmaster.mockResolvedValue([
        createMockEvent({ name: "Event A" }),
      ] as never);
      mockedSeatGeek.mockRejectedValue(new Error("SeatGeek rate limited"));
      mockedCraigslist.mockResolvedValue([
        createMockEvent({ name: "Event B" }),
      ]);
      mockedMovies.mockRejectedValue(new Error("TMDb timeout"));

      const result = await fetchOnDemandEvents({ city: "Toronto" });

      expect(result.count).toBe(2);
      expect(result.sources).toContain("ticketmaster");
      expect(result.sources).toContain("craigslist");
      expect(result.sources).not.toContain("seatgeek");
      expect(result.sources).not.toContain("tmdb");
    });

    it("skips Craigslist for cities not in the map", async () => {
      mockedGeocode.mockResolvedValue(tokyoGeocode);
      mockedTicketmaster.mockResolvedValue([
        createMockEvent({ name: "Tokyo Event" }),
      ] as never);
      mockedSeatGeek.mockResolvedValue([]);
      mockedMovies.mockResolvedValue([
        createMockEvent({ name: "Japanese Movie" }),
      ]);

      const result = await fetchOnDemandEvents({ city: "Tokyo" });

      expect(mockedCraigslist).not.toHaveBeenCalled();
      expect(result.location.countryCode).toBe("JP");
      expect(mockedMovies).toHaveBeenCalledWith("JP");
    });

    it("deduplicates cross-source events", async () => {
      mockedGeocode.mockResolvedValue(torontoGeocode);
      const sharedEvent = createMockEvent({
        name: "Big Concert",
        startDate: new Date("2026-09-01T19:00:00Z"),
      });
      mockedTicketmaster.mockResolvedValue([
        { ...sharedEvent, source: "ticketmaster", sourceId: "tm-99" },
      ] as never);
      mockedSeatGeek.mockResolvedValue([
        {
          ...sharedEvent,
          source: "seatgeek",
          sourceId: "sg-99",
          category: "music",
          url: "https://seatgeek.com/big-concert",
        },
      ] as never);
      mockedCraigslist.mockResolvedValue([]);
      mockedMovies.mockResolvedValue([]);

      const result = await fetchOnDemandEvents({ city: "Toronto" });

      expect(result.count).toBe(1);
    });

    it("respects the limit parameter", async () => {
      mockedGeocode.mockResolvedValue(torontoGeocode);
      const manyEvents = Array.from({ length: 50 }, (_, index) => {
        const eventDate = new Date("2026-08-01T19:00:00Z");
        eventDate.setDate(eventDate.getDate() + index);
        return createMockEvent({
          name: `Event ${index}`,
          sourceId: `tm-${index}`,
          startDate: eventDate,
        });
      });
      mockedTicketmaster.mockResolvedValue(manyEvents as never);
      mockedSeatGeek.mockResolvedValue([]);
      mockedCraigslist.mockResolvedValue([]);
      mockedMovies.mockResolvedValue([]);

      const result = await fetchOnDemandEvents({
        city: "Toronto",
        limit: 10,
      });

      expect(result.count).toBe(10);
      expect(result.events).toHaveLength(10);
    });

    it("sorts results by startDate ascending", async () => {
      mockedGeocode.mockResolvedValue(torontoGeocode);
      mockedTicketmaster.mockResolvedValue([
        createMockEvent({
          name: "Late Event",
          sourceId: "tm-late",
          startDate: new Date("2026-09-15T20:00:00Z"),
        }),
        createMockEvent({
          name: "Early Event",
          sourceId: "tm-early",
          startDate: new Date("2026-08-01T20:00:00Z"),
        }),
      ] as never);
      mockedSeatGeek.mockResolvedValue([
        createMockEvent({
          name: "Mid Event",
          sourceId: "sg-mid",
          startDate: new Date("2026-08-20T20:00:00Z"),
        }),
      ] as never);
      mockedCraigslist.mockResolvedValue([]);
      mockedMovies.mockResolvedValue([]);

      const result = await fetchOnDemandEvents({ city: "Toronto" });

      expect(result.events[0].name).toBe("Early Event");
      expect(result.events[1].name).toBe("Mid Event");
      expect(result.events[2].name).toBe("Late Event");
    });

    it("uses custom days parameter for lookahead", async () => {
      mockedGeocode.mockResolvedValue(torontoGeocode);
      mockedTicketmaster.mockResolvedValue([]);
      mockedSeatGeek.mockResolvedValue([]);
      mockedCraigslist.mockResolvedValue([]);
      mockedMovies.mockResolvedValue([]);

      await fetchOnDemandEvents({ city: "Toronto", days: 14 });

      expect(mockedTicketmaster).toHaveBeenCalledWith(
        expect.objectContaining({ lookAheadDays: 14 }),
      );
      expect(mockedSeatGeek).toHaveBeenCalledWith(
        expect.objectContaining({ lookAheadDays: 14 }),
      );
    });
  });
});
