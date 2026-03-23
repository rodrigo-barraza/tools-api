let solarWind = { plasma: [], magnetic: [], latest: {}, counts: {} };
let lastFetch = null;
let lastError = null;

export function updateSolarWind(data) {
  solarWind = data;
  lastFetch = new Date().toISOString();
  lastError = null;
}

export function setSolarWindError(error) {
  lastError = { message: error.message, time: new Date().toISOString() };
}

export function getSolarWind() {
  return {
    plasma: solarWind.plasma,
    magnetic: solarWind.magnetic,
    counts: solarWind.counts,
    lastFetch,
  };
}

export function getSolarWindLatest() {
  return {
    ...solarWind.latest,
    lastFetch,
  };
}

export function getSolarWindHealth() {
  return {
    lastFetch,
    error: lastError,
    plasmaPoints: solarWind.counts?.plasma ?? 0,
    magneticPoints: solarWind.counts?.magnetic ?? 0,
  };
}
