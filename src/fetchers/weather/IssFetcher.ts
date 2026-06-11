const ISS_POSITION_URL = "http://api.open-notify.org/iss-now.json";
const ISS_ASTROS_URL = "http://api.open-notify.org/astros.json";

export interface IssPosition {
  latitude: number;
  longitude: number;
  timestamp: Date;
}

export interface Astronaut {
  name: string;
  craft: string;
}

export interface AstronautsResponse {
  total: number;
  people: Astronaut[];
}

interface RawIssPositionResponse {
  message: string;
  iss_position: {
    latitude: string;
    longitude: string;
  };
  timestamp: number;
}

interface RawAstronautsResponse {
  message: string;
  number: number;
  people: Array<{ name: string; craft: string }>;
}

/**
 * Fetch current ISS position.
 */
export async function fetchIssPosition(): Promise<IssPosition> {
  const response = await fetch(ISS_POSITION_URL);

  if (!response.ok) {
    throw new Error(`ISS position API returned ${response.status}`);
  }

  const data = (await response.json()) as RawIssPositionResponse;

  if (data.message !== "success") {
    throw new Error("ISS position API returned non-success message");
  }

  return {
    latitude: parseFloat(data.iss_position.latitude),
    longitude: parseFloat(data.iss_position.longitude),
    timestamp: new Date(data.timestamp * 1000),
  };
}

/**
 * Fetch astronauts currently in space.
 */
export async function fetchAstronauts(): Promise<AstronautsResponse> {
  const response = await fetch(ISS_ASTROS_URL);

  if (!response.ok) {
    throw new Error(`Astronauts API returned ${response.status}`);
  }

  const data = (await response.json()) as RawAstronautsResponse;

  if (data.message !== "success") {
    throw new Error("Astronauts API returned non-success message");
  }

  return {
    total: data.number,
    people: data.people.map(
      (provider): Astronaut => ({
        name: provider.name,
        craft: provider.craft,
      }),
    ),
  };
}
