import { EARTHQUAKE_MAGNITUDE_SCALE } from "../../constants.ts";
import { EarthquakeRecord } from "../../types/weather.ts";

const EARTHQUAKE_FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

interface UsgsFeature {
  id: string;
  properties: {
    mag: number | null;
    magType: string | null;
    place: string | null;
    time: number | null;
    updated: number | null;
    url: string | null;
    detail: string | null;
    felt: number | null;
    cdi: number | null;
    mmi: number | null;
    alert: string | null;
    status: string | null;
    tsunami: number;
    sig: number | null;
    net: string | null;
    code: string | null;
    nst: number | null;
    dmin: number | null;
    rms: number | null;
    gap: number | null;
    type: string | null;
    title: string | null;
  };
  geometry: {
    coordinates: [number, number, number];
  };
}

/**
 * Classify magnitude into a human-readable scale label.
 */
function classifyMagnitude(mag: number | null): string {
  if (mag === null || mag === undefined) return "Unknown";
  const entry = EARTHQUAKE_MAGNITUDE_SCALE.find(
    (s: { min: number; max: number; label: string }) => mag >= s.min && mag < s.max,
  );
  return entry?.label || "Unknown";
}

/**
 * Fetch all earthquakes from the past hour via the USGS GeoJSON feed.
 * Returns an array of normalized earthquake event objects.
 */
export async function fetchEarthquakes(): Promise<EarthquakeRecord[]> {
  const response = await fetch(EARTHQUAKE_FEED_URL);

  if (!response.ok) {
    throw new Error(`USGS Earthquake feed returned ${response.status}`);
  }

  const data = await response.json() as { features: UsgsFeature[] };

  return data.features.map((feature): EarthquakeRecord => {
    const { properties: provider, geometry: g, id } = feature;

    return {
      usgsId: id,
      magnitude: provider.mag,
      magnitudeType: provider.magType,
      magnitudeClass: classifyMagnitude(provider.mag),
      place: provider.place,
      time: provider.time ? new Date(provider.time) : null,
      updated: provider.updated ? new Date(provider.updated) : null,
      url: provider.url,
      detailUrl: provider.detail,
      felt: provider.felt,
      cdi: provider.cdi,
      mmi: provider.mmi,
      alert: provider.alert,
      status: provider.status,
      tsunami: Boolean(provider.tsunami),
      significance: provider.sig,
      net: provider.net,
      code: provider.code,
      nst: provider.nst,
      dmin: provider.dmin,
      rms: provider.rms,
      gap: provider.gap,
      type: provider.type,
      title: provider.title,
      longitude: g.coordinates[0],
      latitude: g.coordinates[1],
      depth: g.coordinates[2],
    };
  });
}
