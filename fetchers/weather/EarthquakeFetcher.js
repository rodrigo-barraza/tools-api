import { EARTHQUAKE_MAGNITUDE_SCALE } from "../../constants.js";

const EARTHQUAKE_FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";

/**
 * Classify magnitude into a human-readable scale label.
 */
function classifyMagnitude(mag) {
  if (mag === null || mag === undefined) return "Unknown";
  const entry = EARTHQUAKE_MAGNITUDE_SCALE.find(
    (s) => mag >= s.min && mag < s.max,
  );
  return entry?.label || "Unknown";
}

/**
 * Fetch all earthquakes from the past hour via the USGS GeoJSON feed.
 * Returns an array of normalized earthquake event objects.
 */
export async function fetchEarthquakes() {
  const response = await fetch(EARTHQUAKE_FEED_URL);

  if (!response.ok) {
    throw new Error(`USGS Earthquake feed returned ${response.status}`);
  }

  const data = await response.json();

  return data.features.map((feature) => {
    const { properties: p, geometry: g, id } = feature;

    return {
      usgsId: id,
      magnitude: p.mag,
      magnitudeType: p.magType,
      magnitudeClass: classifyMagnitude(p.mag),
      place: p.place,
      time: p.time ? new Date(p.time) : null,
      updated: p.updated ? new Date(p.updated) : null,
      url: p.url,
      detailUrl: p.detail,
      felt: p.felt,
      cdi: p.cdi,
      mmi: p.mmi,
      alert: p.alert,
      status: p.status,
      tsunami: Boolean(p.tsunami),
      significance: p.sig,
      net: p.net,
      code: p.code,
      nst: p.nst,
      dmin: p.dmin,
      rms: p.rms,
      gap: p.gap,
      type: p.type,
      title: p.title,
      longitude: g.coordinates[0],
      latitude: g.coordinates[1],
      depth: g.coordinates[2],
    };
  });
}
