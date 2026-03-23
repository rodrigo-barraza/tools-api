let wildfires = [];
let lastFetch = null;
let lastError = null;

export function updateWildfires(events) {
  wildfires = events;
  lastFetch = new Date().toISOString();
  lastError = null;
}

export function setWildfireError(error) {
  lastError = { message: error.message, time: new Date().toISOString() };
}

export function getWildfires() {
  return {
    count: wildfires.length,
    events: wildfires,
    lastFetch,
  };
}

export function getWildfireSummary() {
  const sorted = [...wildfires]
    .filter((w) => w.magnitudeValue != null)
    .sort((a, b) => b.magnitudeValue - a.magnitudeValue);

  return {
    count: wildfires.length,
    largest: sorted[0] || null,
    openCount: wildfires.filter((w) => w.status === "open").length,
    lastFetch,
  };
}

export function getWildfireHealth() {
  return {
    lastFetch,
    error: lastError,
    count: wildfires.length,
  };
}
