const ISS_POSITION_URL = "http://api.open-notify.org/iss-now.json";
const ISS_ASTROS_URL = "http://api.open-notify.org/astros.json";

/**
 * Fetch current ISS position.
 */
export async function fetchIssPosition() {
  const response = await fetch(ISS_POSITION_URL);

  if (!response.ok) {
    throw new Error(`ISS position API returned ${response.status}`);
  }

  const data = await response.json();

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
export async function fetchAstronauts() {
  const response = await fetch(ISS_ASTROS_URL);

  if (!response.ok) {
    throw new Error(`Astronauts API returned ${response.status}`);
  }

  const data = await response.json();

  if (data.message !== "success") {
    throw new Error("Astronauts API returned non-success message");
  }

  return {
    total: data.number,
    people: data.people.map((p) => ({
      name: p.name,
      craft: p.craft,
    })),
  };
}
