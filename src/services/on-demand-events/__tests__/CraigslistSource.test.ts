import { describe, it, expect, vi } from "vitest";
import { resolveCraigslistSubdomain } from "../sources/craigslist.ts";

vi.mock("../../../../fetchers/event/CraigslistFetcher.ts", () => ({
  fetchCraigslistEvents: vi.fn().mockResolvedValue([]),
}));

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
