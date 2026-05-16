import { createSimpleCache } from "./createSimpleCache.js";

const cache = createSimpleCache({ type: "array", itemsKey: "launches" });

export const updateLaunches = cache.update;
export const setLaunchError = cache.setError;
export const getLaunches = cache.get;
export const getLaunchHealth = cache.getHealth;

/** Get the next upcoming launch. */
export function getNextLaunch() {
  const launches = cache.getData();
  const now = new Date();
  const next = launches.find((l) => new Date(l.net) > now) || launches[0];
  return {
    next: next || null,
    lastFetch: cache.getLastFetch(),
  };
}

/** Get a summary with upcoming count and providers. */
export function getLaunchSummary() {
  const launches = cache.getData();
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
    lastFetch: cache.getLastFetch(),
  };
}
