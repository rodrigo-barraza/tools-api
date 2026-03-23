let forecasts = [];
let lastFetch = null;
let lastError = null;

export function updateAvalanche(data) {
  forecasts = data;
  lastFetch = new Date().toISOString();
  lastError = null;
}

export function setAvalancheError(error) {
  lastError = { message: error.message, time: new Date().toISOString() };
}

export function getAvalanche() {
  return {
    count: forecasts.length,
    forecasts,
    lastFetch,
  };
}

export function getAvalancheHealth() {
  return {
    lastFetch,
    error: lastError,
    count: forecasts.length,
  };
}
