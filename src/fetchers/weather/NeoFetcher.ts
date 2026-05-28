import CONFIG from "../../config.ts";

const { NASA_API_KEY } = CONFIG;

export interface NearEarthObject {
  neoId: string;
  name: string;
  nasaJplUrl: string;
  absoluteMagnitude: number;
  estimatedDiameterMinKm: number | null;
  estimatedDiameterMaxKm: number | null;
  isPotentiallyHazardous: boolean;
  isSentryObject: boolean;
  closeApproachDate: string;
  relativeVelocityKmPerSec: number | null;
  relativeVelocityKmPerHour: number | null;
  missDistanceKm: number | null;
  missDistanceLunar: number | null;
  missDistanceAu: number | null;
  orbitingBody: string;
  [key: string]: unknown;
}

interface RawNeoCloseApproach {
  close_approach_date_full: string;
  relative_velocity: {
    kilometers_per_second: string;
    kilometers_per_hour: string;
  };
  miss_distance: {
    kilometers: string;
    lunar: string;
    astronomical: string;
  };
  orbiting_body: string;
}

interface RawNeo {
  neo_reference_id: string;
  name: string;
  nasa_jpl_url: string;
  absolute_magnitude_h: number;
  estimated_diameter: {
    kilometers: {
      estimated_diameter_min: number;
      estimated_diameter_max: number;
    };
  };
  is_potentially_hazardous_asteroid: boolean;
  is_sentry_object: boolean;
  close_approach_data: RawNeoCloseApproach[];
}

interface RawNeoResponse {
  near_earth_objects: Record<string, RawNeo[]>;
}

/**
 * Fetch near-Earth objects for today from the NASA NEO API.
 * Returns an array of normalized asteroid close-approach objects.
 */
export async function fetchNeos(): Promise<NearEarthObject[]> {
  const today = new Date().toISOString().split("T")[0];
  const url =
    `https://api.nasa.gov/neo/rest/v1/feed` +
    `?start_date=${today}&end_date=${today}&api_key=${NASA_API_KEY}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`NASA NEO API returned ${response.status}`);
  }

  const data = (await response.json()) as RawNeoResponse;
  const neos: NearEarthObject[] = [];

  for (const [date, objects] of Object.entries(data.near_earth_objects)) {
    for (const neo of objects) {
      const approach = neo.close_approach_data?.[0];

      neos.push({
        neoId: neo.neo_reference_id,
        name: neo.name,
        nasaJplUrl: neo.nasa_jpl_url,
        absoluteMagnitude: neo.absolute_magnitude_h,
        estimatedDiameterMinKm:
          neo.estimated_diameter?.kilometers?.estimated_diameter_min ?? null,
        estimatedDiameterMaxKm:
          neo.estimated_diameter?.kilometers?.estimated_diameter_max ?? null,
        isPotentiallyHazardous: neo.is_potentially_hazardous_asteroid,
        isSentryObject: neo.is_sentry_object,
        closeApproachDate: approach?.close_approach_date_full ?? date,
        relativeVelocityKmPerSec: approach
          ? parseFloat(approach.relative_velocity.kilometers_per_second)
          : null,
        relativeVelocityKmPerHour: approach
          ? parseFloat(approach.relative_velocity.kilometers_per_hour)
          : null,
        missDistanceKm: approach
          ? parseFloat(approach.miss_distance.kilometers)
          : null,
        missDistanceLunar: approach
          ? parseFloat(approach.miss_distance.lunar)
          : null,
        missDistanceAu: approach
          ? parseFloat(approach.miss_distance.astronomical)
          : null,
        orbitingBody: approach?.orbiting_body ?? "Earth",
      });
    }
  }

  // Sort by miss distance (closest first)
  neos.sort(
    (a, b) => (a.missDistanceKm ?? Infinity) - (b.missDistanceKm ?? Infinity),
  );

  return neos;
}
