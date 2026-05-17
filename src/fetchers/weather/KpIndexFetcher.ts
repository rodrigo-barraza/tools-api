/**
 * Fetch NOAA Planetary K-index (Kp) — 7-day rolling data.
 * Returns array of Kp readings with time, value, and station count.
 */
export async function fetchKpIndex() {
  const url =
    "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`NOAA Kp Index API returned ${response.status}`);
  }

  const data = await response.json();

  // First row is headers: ["time_tag", "Kp", "a_running", "station_count"]
  const [, ...rows] = data;

  return rows.map((row) => ({
    time: new Date(row[0]),
    kp: parseFloat(row[1]),
    aRunning: parseInt(row[2], 10),
    stationCount: parseInt(row[3], 10),
  }));
}
