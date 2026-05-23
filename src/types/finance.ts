/**
 * Finance Domain TypeScript Definitions
 */

// ─── FRED API Types ─────────────────────────────────────────────

export interface FredRawObservation {
  date: string;
  value: string;
}

export interface FredRawSeries {
  id: string;
  title: string;
  frequency_short: string;
  units_short: string;
  seasonal_adjustment_short: string;
  last_updated: string;
  observation_start: string;
  observation_end: string;
  notes?: string | null;
  popularity?: number;
}

export interface FredObservationsResponse {
  observations: FredRawObservation[];
}

export interface FredSeriesResponse {
  seriess: FredRawSeries[];
}

export interface FredSearchResponse {
  count: number;
  seriess: FredRawSeries[];
}

export interface FredSeriesInfo {
  id: string;
  title: string;
  frequency: string;
  units: string;
  seasonalAdjustment: string;
  lastUpdated: string;
  observationStart: string;
  observationEnd: string;
  notes: string | null;
}

export interface FredObservation {
  date: string;
  value: number;
}

export interface FredIndicatorMeta {
  name: string;
  category: string;
  unit: string;
}

export interface FredIndicator {
  id: string;
  name: string;
  category: string;
  value: number | null;
  date: string | null;
  unit: string;
}

export interface FredFailedIndicator {
  seriesId: string;
  error: string;
}
