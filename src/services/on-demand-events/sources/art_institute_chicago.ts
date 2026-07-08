import type { OnDemandSourceOptions, CachedEvent } from "./_helpers.ts";

const AIC_BASE = "https://api.artic.edu/api/v1";

interface AicExhibition {
  id: number;
  title: string;
  short_description: string | null;
  aic_start_at: string | null;
  aic_end_at: string | null;
  image_url: string | null;
  web_url: string | null;
  gallery_title: string | null;
  status: string;
}

interface AicEvent {
  id: number;
  title: string;
  short_description: string | null;
  start_at: string | null;
  end_at: string | null;
  image_url: string | null;
  web_url: string | null;
  location: string | null;
  is_registration_required: boolean;
  is_free: boolean;
}

/**
 * Fetch exhibitions and events from the Art Institute of Chicago.
 * No API key required. CORS-enabled. Chicago-only but high-quality data.
 */
export async function fetchArtInstituteChicagoOnDemand(
  options: OnDemandSourceOptions,
): Promise<CachedEvent[]> {
  // Only relevant for Chicago queries
  const normalizedCity = options.city.toLowerCase();
  if (!normalizedCity.includes("chicago")) return [];

  const events: CachedEvent[] = [];

  // Fetch current exhibitions
  try {
    const exhibitionResponse = await fetch(
      `${AIC_BASE}/exhibitions?limit=20&status=Current`,
    );
    if (exhibitionResponse.ok) {
      const exhibitionData = await exhibitionResponse.json();
      const exhibitions: AicExhibition[] = exhibitionData.data || [];

      for (const exhibition of exhibitions) {
        events.push({
          name: exhibition.title,
          source: "art-institute-chicago",
          sourceId: `aic-exhibition-${exhibition.id}`,
          category: "exhibition",
          startDate: exhibition.aic_start_at
            ? new Date(exhibition.aic_start_at)
            : undefined,
          endDate: exhibition.aic_end_at
            ? new Date(exhibition.aic_end_at)
            : undefined,
          description: exhibition.short_description,
          venue: { name: exhibition.gallery_title || "Art Institute of Chicago" },
          url: exhibition.web_url,
          imageUrl: exhibition.image_url,
          status: exhibition.status,
        });
      }
    }
  } catch {
    // Graceful failure
  }

  // Fetch upcoming events
  try {
    const eventResponse = await fetch(`${AIC_BASE}/events?limit=20`);
    if (eventResponse.ok) {
      const eventData = await eventResponse.json();
      const aicEvents: AicEvent[] = eventData.data || [];

      for (const aicEvent of aicEvents) {
        events.push({
          name: aicEvent.title,
          source: "art-institute-chicago",
          sourceId: `aic-event-${aicEvent.id}`,
          category: "exhibition",
          startDate: aicEvent.start_at
            ? new Date(aicEvent.start_at)
            : undefined,
          description: aicEvent.short_description,
          venue: { name: aicEvent.location || "Art Institute of Chicago" },
          url: aicEvent.web_url,
          imageUrl: aicEvent.image_url,
          isFree: aicEvent.is_free,
        });
      }
    }
  } catch {
    // Graceful failure
  }

  return events;
}
