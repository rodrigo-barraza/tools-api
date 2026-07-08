import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock External Dependencies ────────────────────────────────

vi.mock("../../../fetchers/shared/GeocodingUtility.ts", () => ({
  geocodeLocation: vi.fn(),
}));

// Mock the registry to control which sources are available
vi.mock("../OnDemandEventRegistry.ts", () => ({
  getAvailableSources: vi.fn(),
}));

vi.mock("../../../logger.ts", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../utilities.ts", () => ({
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

import {
  fetchOnDemandEvents,
  deduplicateEvents,
} from "../OnDemandEventService.ts";
import { geocodeLocation } from "../../../fetchers/shared/GeocodingUtility.ts";
import { getAvailableSources } from "../OnDemandEventRegistry.ts";
import type { CachedEvent } from "../../../caches/EventCache.ts";
import type { OnDemandEventSource } from "../sources/_helpers.ts";

const mockedGeocode = vi.mocked(geocodeLocation);
const mockedGetSources = vi.mocked(getAvailableSources);

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

function createMockSource(
  name: string,
  events: CachedEvent[],
  shouldFail = false,
): OnDemandEventSource {
  return {
    name,
    requiresKey: false,
    fetch: shouldFail
      ? vi.fn().mockRejectedValue(new Error(`${name} failed`))
      : vi.fn().mockResolvedValue(events),
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
    it("geocodes the city and fans out to all registry sources", async () => {
      mockedGeocode.mockResolvedValue(torontoGeocode);

      const ticketmasterSource = createMockSource("ticketmaster", [
        createMockEvent({ name: "Raptors Game", source: "ticketmaster" }),
      ]);
      const nhlSource = createMockSource("nhl", [
        createMockEvent({ name: "Leafs Game", source: "nhl" }),
      ]);
      const holidaySource = createMockSource("nager-holidays", [
        createMockEvent({ name: "Canada Day", source: "nager-holidays" }),
      ]);

      mockedGetSources.mockReturnValue([
        ticketmasterSource,
        nhlSource,
        holidaySource,
      ]);

      const result = await fetchOnDemandEvents({ city: "Toronto" });

      expect(mockedGeocode).toHaveBeenCalledWith("Toronto");
      expect(result.count).toBe(3);
      expect(result.sources).toContain("ticketmaster");
      expect(result.sources).toContain("nhl");
      expect(result.sources).toContain("nager-holidays");
      expect(result.location.city).toBe("Toronto");
      expect(result.location.countryCode).toBe("CA");
    });

    it("returns empty results when geocoding fails", async () => {
      mockedGeocode.mockResolvedValue(null);
      mockedGetSources.mockReturnValue([]);

      const result = await fetchOnDemandEvents({ city: "Nonexistent City" });

      expect(result.count).toBe(0);
      expect(result.events).toHaveLength(0);
      expect(result.sources).toHaveLength(0);
    });

    it("gracefully handles partial source failures", async () => {
      mockedGeocode.mockResolvedValue(torontoGeocode);

      const workingSource = createMockSource("nhl", [
        createMockEvent({ name: "Leafs Game" }),
      ]);
      const failingSource = createMockSource("seatgeek", [], true);
      const anotherWorkingSource = createMockSource("nager-holidays", [
        createMockEvent({ name: "Canada Day" }),
      ]);

      mockedGetSources.mockReturnValue([
        workingSource,
        failingSource,
        anotherWorkingSource,
      ]);

      const result = await fetchOnDemandEvents({ city: "Toronto" });

      expect(result.count).toBe(2);
      expect(result.sources).toContain("nhl");
      expect(result.sources).toContain("nager-holidays");
      expect(result.sources).not.toContain("seatgeek");
    });

    it("deduplicates cross-source events", async () => {
      mockedGeocode.mockResolvedValue(torontoGeocode);

      const sourceA = createMockSource("ticketmaster", [
        createMockEvent({
          name: "Big Concert",
          source: "ticketmaster",
          sourceId: "tm-99",
          startDate: new Date("2026-09-01T19:00:00Z"),
        }),
      ]);
      const sourceB = createMockSource("seatgeek", [
        createMockEvent({
          name: "Big Concert",
          source: "seatgeek",
          sourceId: "sg-99",
          startDate: new Date("2026-09-01T19:30:00Z"),
          category: "music",
          url: "https://seatgeek.com/big-concert",
        }),
      ]);

      mockedGetSources.mockReturnValue([sourceA, sourceB]);

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
          sourceId: `test-${index}`,
          startDate: eventDate,
        });
      });

      mockedGetSources.mockReturnValue([
        createMockSource("ticketmaster", manyEvents),
      ]);

      const result = await fetchOnDemandEvents({
        city: "Toronto",
        limit: 10,
      });

      expect(result.count).toBe(10);
      expect(result.events).toHaveLength(10);
    });

    it("sorts results by startDate ascending", async () => {
      mockedGeocode.mockResolvedValue(torontoGeocode);

      const events = [
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
        createMockEvent({
          name: "Mid Event",
          sourceId: "sg-mid",
          startDate: new Date("2026-08-20T20:00:00Z"),
        }),
      ];

      mockedGetSources.mockReturnValue([
        createMockSource("ticketmaster", events),
      ]);

      const result = await fetchOnDemandEvents({ city: "Toronto" });

      expect(result.events[0].name).toBe("Early Event");
      expect(result.events[1].name).toBe("Mid Event");
      expect(result.events[2].name).toBe("Late Event");
    });

    it("passes correct options to each source", async () => {
      mockedGeocode.mockResolvedValue(tokyoGeocode);

      const mockFetch = vi.fn().mockResolvedValue([]);
      const testSource: OnDemandEventSource = {
        name: "test-source",
        requiresKey: false,
        fetch: mockFetch,
      };

      mockedGetSources.mockReturnValue([testSource]);

      await fetchOnDemandEvents({ city: "Tokyo", days: 14 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          city: "Tokyo",
          countryCode: "JP",
          latitude: tokyoGeocode.latitude,
          longitude: tokyoGeocode.longitude,
          days: 14,
        }),
      );
    });
  });
});
