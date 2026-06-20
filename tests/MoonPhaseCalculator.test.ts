import { describe, it, expect } from "vitest";
import {
  calculateMoonPhase,
  SYNODIC_PERIOD_DAYS,
  REFERENCE_NEW_MOON_MS,
  PHASE_BOUNDARIES,
} from "../src/utilities/MoonPhaseCalculator.ts";

const MILLISECONDS_PER_DAY = 86400000;

describe("MoonPhaseCalculator", () => {
  describe("calculateMoonPhase", () => {
    it("returns all expected fields", () => {
      const result = calculateMoonPhase();
      expect(result).toHaveProperty("phaseName");
      expect(result).toHaveProperty("phaseEmoji");
      expect(result).toHaveProperty("illuminationPercent");
      expect(result).toHaveProperty("ageInDays");
      expect(result).toHaveProperty("synodicPeriodDays");
      expect(result).toHaveProperty("isWaxing");
      expect(result).toHaveProperty("isWaning");
      expect(result).toHaveProperty("nextNewMoonUtc");
      expect(result).toHaveProperty("nextFullMoonUtc");
      expect(result).toHaveProperty("currentCycleStartUtc");
    });

    it("illumination is between 0 and 100", () => {
      const result = calculateMoonPhase();
      expect(result.illuminationPercent).toBeGreaterThanOrEqual(0);
      expect(result.illuminationPercent).toBeLessThanOrEqual(100);
    });

    it("age is within one synodic period", () => {
      const result = calculateMoonPhase();
      expect(result.ageInDays).toBeGreaterThanOrEqual(0);
      expect(result.ageInDays).toBeLessThan(SYNODIC_PERIOD_DAYS);
    });

    it("isWaxing and isWaning are mutually exclusive", () => {
      const result = calculateMoonPhase();
      expect(result.isWaxing).not.toBe(result.isWaning);
    });

    it("synodic period is the standard value", () => {
      const result = calculateMoonPhase();
      expect(result.synodicPeriodDays).toBe(SYNODIC_PERIOD_DAYS);
    });

    it("next new moon and full moon are valid ISO strings", () => {
      const result = calculateMoonPhase();
      expect(new Date(result.nextNewMoonUtc).toISOString()).toBe(
        result.nextNewMoonUtc,
      );
      expect(new Date(result.nextFullMoonUtc).toISOString()).toBe(
        result.nextFullMoonUtc,
      );
    });

    it("next new moon is in the future", () => {
      const now = new Date();
      const result = calculateMoonPhase(now);
      expect(new Date(result.nextNewMoonUtc).getTime()).toBeGreaterThan(
        now.getTime(),
      );
    });

    it("next full moon is in the future", () => {
      const now = new Date();
      const result = calculateMoonPhase(now);
      expect(new Date(result.nextFullMoonUtc).getTime()).toBeGreaterThan(
        now.getTime(),
      );
    });

    it("phase name is one of the eight standard phases", () => {
      const validPhaseNames = PHASE_BOUNDARIES.map((boundary) => boundary.name);
      const result = calculateMoonPhase();
      expect(validPhaseNames).toContain(result.phaseName);
    });

    it("phase emoji is one of the eight standard moon emojis", () => {
      const validEmojis = PHASE_BOUNDARIES.map((boundary) => boundary.emoji);
      const result = calculateMoonPhase();
      expect(validEmojis).toContain(result.phaseEmoji);
    });
  });

  describe("known reference dates", () => {
    it("reference new moon (Jan 6, 2000) is a New Moon", () => {
      const referenceDate = new Date(REFERENCE_NEW_MOON_MS);
      const result = calculateMoonPhase(referenceDate);
      expect(result.phaseName).toBe("New Moon");
      expect(result.ageInDays).toBeCloseTo(0, 0);
      expect(result.illuminationPercent).toBeCloseTo(0, 0);
    });

    it("half a synodic period after reference is approximately a Full Moon", () => {
      const halfCycleMs =
        REFERENCE_NEW_MOON_MS + (SYNODIC_PERIOD_DAYS / 2) * MILLISECONDS_PER_DAY;
      const result = calculateMoonPhase(new Date(halfCycleMs));
      expect(result.phaseName).toBe("Full Moon");
      expect(result.illuminationPercent).toBeCloseTo(100, 0);
    });

    it("one quarter synodic period after reference is approximately First Quarter", () => {
      const quarterCycleMs =
        REFERENCE_NEW_MOON_MS + (SYNODIC_PERIOD_DAYS / 4) * MILLISECONDS_PER_DAY;
      const result = calculateMoonPhase(new Date(quarterCycleMs));
      expect(result.phaseName).toBe("First Quarter");
      expect(result.illuminationPercent).toBeCloseTo(50, 5);
      expect(result.isWaxing).toBe(true);
    });

    it("three quarter synodic period after reference is approximately Last Quarter", () => {
      const threeQuarterCycleMs =
        REFERENCE_NEW_MOON_MS + ((3 * SYNODIC_PERIOD_DAYS) / 4) * MILLISECONDS_PER_DAY;
      const result = calculateMoonPhase(new Date(threeQuarterCycleMs));
      expect(result.phaseName).toBe("Last Quarter");
      expect(result.illuminationPercent).toBeCloseTo(50, 5);
      expect(result.isWaning).toBe(true);
    });

    it("one full cycle after reference returns to New Moon", () => {
      const fullCycleMs =
        REFERENCE_NEW_MOON_MS + SYNODIC_PERIOD_DAYS * MILLISECONDS_PER_DAY;
      const result = calculateMoonPhase(new Date(fullCycleMs));
      expect(result.phaseName).toBe("New Moon");
      expect(result.ageInDays).toBeCloseTo(0, 0);
    });

    it("known Full Moon date (Jan 21, 2000) returns Full Moon", () => {
      const knownFullMoon = new Date(Date.UTC(2000, 0, 21, 4, 40, 0));
      const result = calculateMoonPhase(knownFullMoon);
      expect(result.phaseName).toBe("Full Moon");
      expect(result.illuminationPercent).toBeGreaterThan(95);
    });

    it("known New Moon date (Feb 5, 2000) returns New Moon", () => {
      const knownNewMoon = new Date(Date.UTC(2000, 1, 5, 13, 3, 0));
      const result = calculateMoonPhase(knownNewMoon);
      expect(result.phaseName).toBe("New Moon");
      expect(result.illuminationPercent).toBeLessThan(5);
    });

    it("known Full Moon date (July 21, 2024) returns Full Moon", () => {
      const knownFullMoon = new Date(Date.UTC(2024, 6, 21, 10, 17, 0));
      const result = calculateMoonPhase(knownFullMoon);
      expect(result.phaseName).toBe("Full Moon");
      expect(result.illuminationPercent).toBeGreaterThan(95);
    });

    it("known New Moon date (August 4, 2024) has low illumination", () => {
      const knownNewMoon = new Date(Date.UTC(2024, 7, 4, 11, 13, 0));
      const result = calculateMoonPhase(knownNewMoon);
      expect(result.illuminationPercent).toBeLessThan(10);
    });
  });

  describe("waxing vs waning state consistency", () => {
    it("waxing crescent is waxing", () => {
      const crescent = new Date(
        REFERENCE_NEW_MOON_MS + 3 * MILLISECONDS_PER_DAY,
      );
      const result = calculateMoonPhase(crescent);
      expect(result.isWaxing).toBe(true);
      expect(result.isWaning).toBe(false);
    });

    it("waning gibbous is waning", () => {
      const waningGibbous = new Date(
        REFERENCE_NEW_MOON_MS + 18 * MILLISECONDS_PER_DAY,
      );
      const result = calculateMoonPhase(waningGibbous);
      expect(result.isWaxing).toBe(false);
      expect(result.isWaning).toBe(true);
    });
  });

  describe("illumination curve shape", () => {
    it("illumination increases during the waxing phase", () => {
      const day3 = calculateMoonPhase(
        new Date(REFERENCE_NEW_MOON_MS + 3 * MILLISECONDS_PER_DAY),
      );
      const day7 = calculateMoonPhase(
        new Date(REFERENCE_NEW_MOON_MS + 7 * MILLISECONDS_PER_DAY),
      );
      const day11 = calculateMoonPhase(
        new Date(REFERENCE_NEW_MOON_MS + 11 * MILLISECONDS_PER_DAY),
      );
      expect(day7.illuminationPercent).toBeGreaterThan(
        day3.illuminationPercent,
      );
      expect(day11.illuminationPercent).toBeGreaterThan(
        day7.illuminationPercent,
      );
    });

    it("illumination decreases during the waning phase", () => {
      const day17 = calculateMoonPhase(
        new Date(REFERENCE_NEW_MOON_MS + 17 * MILLISECONDS_PER_DAY),
      );
      const day22 = calculateMoonPhase(
        new Date(REFERENCE_NEW_MOON_MS + 22 * MILLISECONDS_PER_DAY),
      );
      const day27 = calculateMoonPhase(
        new Date(REFERENCE_NEW_MOON_MS + 27 * MILLISECONDS_PER_DAY),
      );
      expect(day22.illuminationPercent).toBeLessThan(
        day17.illuminationPercent,
      );
      expect(day27.illuminationPercent).toBeLessThan(
        day22.illuminationPercent,
      );
    });
  });

  describe("deterministic output", () => {
    it("same input date produces identical output", () => {
      const fixedDate = new Date("2025-06-15T12:00:00Z");
      const firstResult = calculateMoonPhase(fixedDate);
      const secondResult = calculateMoonPhase(fixedDate);
      expect(firstResult).toEqual(secondResult);
    });
  });

  describe("eight phases cover the full cycle", () => {
    it("stepping through a full cycle produces all eight phases", () => {
      const observedPhases = new Set<string>();
      const stepDays = SYNODIC_PERIOD_DAYS / 16;
      for (let index = 0; index < 16; index++) {
        const dateMs =
          REFERENCE_NEW_MOON_MS + index * stepDays * MILLISECONDS_PER_DAY;
        const result = calculateMoonPhase(new Date(dateMs));
        observedPhases.add(result.phaseName);
      }
      expect(observedPhases.size).toBe(8);
    });
  });
});
