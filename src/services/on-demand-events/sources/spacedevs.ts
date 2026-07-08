import type { OnDemandSourceOptions, CachedEvent } from "./_helpers.ts";

const SPACEDEVS_BASE = "https://ll.thespacedevs.com/2.2.0";

interface SpaceDevsLaunch {
  id: string;
  name: string;
  net: string;
  status: { name: string };
  pad?: {
    name: string;
    location?: {
      name: string;
      country_code: string;
    };
  };
  rocket?: { configuration?: { name: string } };
  mission?: { name: string; description: string };
  image?: string;
}

interface SpaceDevsEvent {
  id: number;
  name: string;
  date: string;
  type: { name: string };
  description: string;
  location: string;
  news_url: string | null;
  feature_image: string | null;
}

/**
 * Fetch upcoming space launches and space events from Launch Library 2.
 * No API key required (15 req/hr unauthenticated).
 * Global coverage — includes SpaceX, NASA, ESA, JAXA, Roscosmos, etc.
 */
export async function fetchSpaceDevsOnDemand(
  _options: OnDemandSourceOptions,
): Promise<CachedEvent[]> {
  const events: CachedEvent[] = [];

  // Fetch upcoming launches (limit 10 to stay within rate limits)
  try {
    const launchResponse = await fetch(
      `${SPACEDEVS_BASE}/launch/upcoming/?limit=10&format=json`,
    );
    if (launchResponse.ok) {
      const launchData = await launchResponse.json();
      const launches: SpaceDevsLaunch[] = launchData.results || [];

      for (const launch of launches) {
        const locationName =
          launch.pad?.location?.name || launch.pad?.name || "Unknown";
        const rocketName =
          launch.rocket?.configuration?.name || "Unknown Rocket";

        events.push({
          name: launch.name,
          source: "spacedevs",
          sourceId: `spacedevs-launch-${launch.id}`,
          category: "space",
          startDate: new Date(launch.net),
          location: locationName,
          rocket: rocketName,
          status: launch.status?.name,
          mission: launch.mission?.name,
          missionDescription: launch.mission?.description,
          imageUrl: launch.image,
        });
      }
    }
  } catch {
    // Graceful failure — launches unavailable
  }

  // Fetch upcoming space events (eclipses, dockings, etc.)
  try {
    const eventResponse = await fetch(
      `${SPACEDEVS_BASE}/event/upcoming/?limit=10&format=json`,
    );
    if (eventResponse.ok) {
      const eventData = await eventResponse.json();
      const spaceEvents: SpaceDevsEvent[] = eventData.results || [];

      for (const spaceEvent of spaceEvents) {
        events.push({
          name: spaceEvent.name,
          source: "spacedevs",
          sourceId: `spacedevs-event-${spaceEvent.id}`,
          category: "space",
          startDate: new Date(spaceEvent.date),
          eventType: spaceEvent.type?.name,
          description: spaceEvent.description,
          location: spaceEvent.location,
          url: spaceEvent.news_url,
          imageUrl: spaceEvent.feature_image,
        });
      }
    }
  } catch {
    // Graceful failure — events unavailable
  }

  return events;
}
