// Pure algorithmic lunar phase calculator.
// Uses the synodic period (~29.53059 days) relative to a known
// reference New Moon (January 6, 2000 09:14 UTC) to compute
// phase age, illumination, and phase name without any external API.

const SYNODIC_PERIOD_DAYS = 29.53059;

const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 9, 14, 0);

export interface MoonPhaseResult {
  phaseName: string;
  phaseEmoji: string;
  illuminationPercent: number;
  ageInDays: number;
  synodicPeriodDays: number;
  isWaxing: boolean;
  isWaning: boolean;
  nextNewMoonUtc: string;
  nextFullMoonUtc: string;
  currentCycleStartUtc: string;
}

const EIGHTH = SYNODIC_PERIOD_DAYS / 8;

const PHASE_BOUNDARIES = [
  { maxAge: 0.5 * EIGHTH, name: "New Moon", emoji: "🌑" },
  { maxAge: 1.5 * EIGHTH, name: "Waxing Crescent", emoji: "🌒" },
  { maxAge: 2.5 * EIGHTH, name: "First Quarter", emoji: "🌓" },
  { maxAge: 3.5 * EIGHTH, name: "Waxing Gibbous", emoji: "🌔" },
  { maxAge: 4.5 * EIGHTH, name: "Full Moon", emoji: "🌕" },
  { maxAge: 5.5 * EIGHTH, name: "Waning Gibbous", emoji: "🌖" },
  { maxAge: 6.5 * EIGHTH, name: "Last Quarter", emoji: "🌗" },
  { maxAge: 7.5 * EIGHTH, name: "Waning Crescent", emoji: "🌘" },
] as const;

function resolvePhase(ageInDays: number): {
  name: string;
  emoji: string;
} {
  for (const boundary of PHASE_BOUNDARIES) {
    if (ageInDays < boundary.maxAge) {
      return { name: boundary.name, emoji: boundary.emoji };
    }
  }
  return { name: "New Moon", emoji: "🌑" };
}

function calculateIllumination(ageInDays: number): number {
  const phaseAngle = (ageInDays / SYNODIC_PERIOD_DAYS) * 2 * Math.PI;
  const illumination = (1 - Math.cos(phaseAngle)) / 2;
  return Math.round(illumination * 1000) / 10;
}

export function calculateMoonPhase(
  dateInput: Date = new Date(),
): MoonPhaseResult {
  const timestampMs = dateInput.getTime();
  const elapsedMs = timestampMs - REFERENCE_NEW_MOON_MS;
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);

  const completeCycles = Math.floor(elapsedDays / SYNODIC_PERIOD_DAYS);
  const ageInDays = elapsedDays - completeCycles * SYNODIC_PERIOD_DAYS;

  const normalizedAge =
    ageInDays >= 0 ? ageInDays : ageInDays + SYNODIC_PERIOD_DAYS;

  const phase = resolvePhase(normalizedAge);
  const illuminationPercent = calculateIllumination(normalizedAge);

  const halfSynodic = SYNODIC_PERIOD_DAYS / 2;
  const isWaxing = normalizedAge < halfSynodic;
  const isWaning = normalizedAge >= halfSynodic;

  const currentCycleStartMs =
    REFERENCE_NEW_MOON_MS + completeCycles * SYNODIC_PERIOD_DAYS * 86400000;
  const nextNewMoonMs = currentCycleStartMs + SYNODIC_PERIOD_DAYS * 86400000;
  const nextFullMoonMs = currentCycleStartMs + halfSynodic * 86400000;

  const effectiveNextFullMoonMs =
    nextFullMoonMs <= timestampMs
      ? nextFullMoonMs + SYNODIC_PERIOD_DAYS * 86400000
      : nextFullMoonMs;

  return {
    phaseName: phase.name,
    phaseEmoji: phase.emoji,
    illuminationPercent,
    ageInDays: Math.round(normalizedAge * 100) / 100,
    synodicPeriodDays: SYNODIC_PERIOD_DAYS,
    isWaxing,
    isWaning,
    nextNewMoonUtc: new Date(nextNewMoonMs).toISOString(),
    nextFullMoonUtc: new Date(effectiveNextFullMoonMs).toISOString(),
    currentCycleStartUtc: new Date(currentCycleStartMs).toISOString(),
  };
}

export { SYNODIC_PERIOD_DAYS, REFERENCE_NEW_MOON_MS, PHASE_BOUNDARIES };
