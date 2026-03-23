let tides = [];
let lastFetch = null;
let lastError = null;

export function updateTides(predictions) {
  tides = predictions;
  lastFetch = new Date().toISOString();
  lastError = null;
}

export function setTideError(error) {
  lastError = { message: error.message, time: new Date().toISOString() };
}

export function getTides() {
  return {
    count: tides.length,
    predictions: tides,
    lastFetch,
  };
}

export function getNextTide() {
  const now = new Date();
  const upcoming = tides.find((t) => new Date(t.time) > now);
  return {
    next: upcoming || null,
    lastFetch,
  };
}

export function getTideHealth() {
  return {
    lastFetch,
    error: lastError,
    count: tides.length,
  };
}
