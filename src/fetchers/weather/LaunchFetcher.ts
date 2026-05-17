const LL2_URL =
  "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?format=json&limit=10&mode=list";

/**
 * Fetch upcoming rocket launches from Launch Library 2.
 * Free API, no key required. 15 req/hr limit on free tier.
 */
export async function fetchUpcomingLaunches() {
  const res = await fetch(LL2_URL, {
    headers: {
      "User-Agent": "Sun/Nimbus (github.com/rodrigo-barraza)",
    },
  });

  if (!res.ok) {
    throw new Error(
      `Launch Library 2 returned ${res.status}: ${res.statusText}`,
    );
  }

  const data = await res.json();

  return (data.results || []).map((launch) => ({
    id: launch.id,
    name: launch.name,
    slug: launch.slug,
    status: launch.status?.name || null,
    statusAbbrev: launch.status?.abbrev || null,
    net: launch.net,
    windowStart: launch.window_start,
    windowEnd: launch.window_end,
    probability: launch.probability,
    weatherConcerns: launch.weather_concerns || null,
    provider: launch.launch_service_provider?.name || null,
    providerAbbrev: launch.launch_service_provider?.abbrev || null,
    rocket: launch.rocket?.configuration?.full_name || null,
    mission: launch.mission?.name || null,
    missionType: launch.mission?.type || null,
    missionDescription: launch.mission?.description || null,
    orbit: launch.mission?.orbit?.name || null,
    padName: launch.pad?.name || null,
    padLocation: launch.pad?.location?.name || null,
    imageUrl: launch.image?.image_url || null,
    webcastUrl: launch.webcast_live ? launch.url : null,
  }));
}
