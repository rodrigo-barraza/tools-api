import { MS_PER_DAY } from "@rodrigo-barraza/utilities-library";
import {
  SolarWindResponse,
  SolarWindPlasmaReading,
  SolarWindMagReading,
} from "../../types/weather.ts";

const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json";
const MAG_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json";

function parseRows<T extends { time: string }>(rows: string[][], fields: string[]): T[] {
  // First row is header, skip it
  const data = rows.slice(1);
  const cutoff = Date.now() - MS_PER_DAY;

  return data
    .map((row: string[]) => {
      const time = new Date(row[0] + "Z").getTime();
      if (isNaN(time) || time < cutoff) return null;
      const object = { time: row[0] } as Record<string, string | number | null>;
      fields.forEach((f: string, i: number) => {
        const value = parseFloat(row[i + 1]);
        object[f] = isNaN(value) ? null : value;
      });
      return object as unknown as T;
    })
    .filter((x): x is T => x !== null);
}

function downsample<T extends { time: string }>(array: T[], intervalMinutes: number): T[] {
  if (array.length === 0) return array;
  const result: T[] = [];
  let lastBucket: number | null = null;

  for (const point of array) {
    const t = new Date(point.time + "Z").getTime();
    const bucket = Math.floor(t / (intervalMinutes * 60_000));
    if (bucket !== lastBucket) {
      result.push(point);
      lastBucket = bucket;
    }
  }
  return result;
}

/**
 * Fetch solar wind plasma + magnetic field data from NOAA SWPC.
 * Returns the last 24h downsampled to 5-minute intervals.
 */
export async function fetchSolarWind(): Promise<SolarWindResponse> {
  const [plasmaRes, magRes] = await Promise.all([
    fetch(PLASMA_URL),
    fetch(MAG_URL),
  ]);

  if (!plasmaRes.ok)
    throw new Error(`SWPC Plasma ${plasmaRes.status}: ${plasmaRes.statusText}`);
  if (!magRes.ok)
    throw new Error(`SWPC Mag ${magRes.status}: ${magRes.statusText}`);

  const plasmaJson = await plasmaRes.json() as string[][];
  const magJson = await magRes.json() as string[][];

  const plasmaFields = ["density", "speed", "temperature"];
  const magFields = ["bx", "by", "bz", "lonGsm", "latGsm", "bt"];

  const plasma = downsample(parseRows<SolarWindPlasmaReading>(plasmaJson, plasmaFields), 5);
  const magnetic = downsample(parseRows<SolarWindMagReading>(magJson, magFields), 5);

  const latestPlasma = plasma[plasma.length - 1] || null;
  const latestMag = magnetic[magnetic.length - 1] || null;

  return {
    plasma,
    magnetic,
    latest: {
      time: latestPlasma?.time || latestMag?.time || null,
      speed: latestPlasma?.speed ?? null,
      density: latestPlasma?.density ?? null,
      temperature: latestPlasma?.temperature ?? null,
      bz: latestMag?.bz ?? null,
      bt: latestMag?.bt ?? null,
      bx: latestMag?.bx ?? null,
      by: latestMag?.by ?? null,
    },
    counts: {
      plasma: plasma.length,
      magnetic: magnetic.length,
    },
  };
}
