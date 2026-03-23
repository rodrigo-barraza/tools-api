let launches = [];
let lastFetch = null;
let lastError = null;

export function updateLaunches(data) {
  launches = data;
  lastFetch = new Date().toISOString();
  lastError = null;
}

export function setLaunchError(error) {
  lastError = { message: error.message, time: new Date().toISOString() };
}

export function getLaunches() {
  return {
    count: launches.length,
    launches,
    lastFetch,
  };
}

export function getNextLaunch() {
  const now = new Date();
  const next = launches.find((l) => new Date(l.net) > now) || launches[0];
  return {
    next: next || null,
    lastFetch,
  };
}

export function getLaunchSummary() {
  const now = new Date();
  const upcoming = launches.filter((l) => new Date(l.net) > now);
  const providers = [
    ...new Set(launches.map((l) => l.provider).filter(Boolean)),
  ];

  return {
    count: launches.length,
    upcomingCount: upcoming.length,
    next: upcoming[0] || null,
    providers,
    lastFetch,
  };
}

export function getLaunchHealth() {
  return {
    lastFetch,
    error: lastError,
    count: launches.length,
  };
}
