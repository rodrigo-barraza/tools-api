let twilight = null;
let lastFetch = null;
let lastError = null;

export function updateTwilight(data) {
  twilight = data;
  lastFetch = new Date().toISOString();
  lastError = null;
}

export function setTwilightError(error) {
  lastError = { message: error.message, time: new Date().toISOString() };
}

export function getTwilight() {
  return {
    ...twilight,
    lastFetch,
  };
}

export function getTwilightHealth() {
  return {
    lastFetch,
    error: lastError,
    hasData: twilight !== null,
  };
}
