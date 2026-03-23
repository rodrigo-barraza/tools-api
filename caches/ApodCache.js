let apod = null;
let lastFetch = null;
let lastError = null;

export function updateApod(data) {
  apod = data;
  lastFetch = new Date().toISOString();
  lastError = null;
}

export function setApodError(error) {
  lastError = { message: error.message, time: new Date().toISOString() };
}

export function getApod() {
  return {
    ...apod,
    lastFetch,
  };
}

export function getApodHealth() {
  return {
    lastFetch,
    error: lastError,
    hasData: apod !== null,
  };
}
