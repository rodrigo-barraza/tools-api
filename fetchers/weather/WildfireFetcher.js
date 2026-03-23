const EONET_URL =
  "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&limit=25&days=7";

/**
 * Fetch active wildfire events from NASA EONET v3.
 * Free API, no key required.
 */
export async function fetchWildfires() {
  const res = await fetch(EONET_URL);
  if (!res.ok) throw new Error(`EONET ${res.status}: ${res.statusText}`);
  const json = await res.json();

  return (json.events || []).map((event) => {
    const geo = event.geometry?.[0] || {};
    const source = event.sources?.[0] || {};

    return {
      eonetId: event.id,
      title: event.title,
      description: event.description || null,
      status: event.closed ? "closed" : "open",
      coordinates: geo.coordinates
        ? { lng: geo.coordinates[0], lat: geo.coordinates[1] }
        : null,
      magnitudeValue: geo.magnitudeValue ?? null,
      magnitudeUnit: geo.magnitudeUnit ?? null,
      date: geo.date || null,
      sourceId: source.id || null,
      sourceUrl: source.url || null,
    };
  });
}
