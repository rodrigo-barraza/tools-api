// ────────────────────────────────────────────────────────────
// Tool Definitions — Movies & TV
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, fieldsParam as fieldsParamImport } from "./utils.ts";
import { FIELDS } from "./fields.ts";

export function getMoviesTvTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  const fieldsParam = (fieldEnum: string[]) => fieldsParamImport(translate, fieldEnum);

  return [
  {
    name: "search_media",
    dataSource: onDemand("TMDB API"),
    description: translate("search_media.description"),
    endpoint: {
      path: "/knowledge/media/search",
      queryParams: ["type", "q", "year", "page"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("search_media.params.type"),
        },
        "q": { type: "string", description: translate("search_media.params.q") },
        year: {
          type: "number",
          description: translate("search_media.params.year"),
        },
        page: { type: "number", description: translate("search_media.params.page") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["type", "q"],
    },
    display: {
      activeVerb: "Searching media for",
      completedVerb: "Searched media for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "get_media_details",
    dataSource: onDemand("TMDB API"),
    description: translate("get_media_details.description"),
    endpoint: {
      path: "/knowledge/media/:id",
      pathParams: ["id"],
      queryParams: ["type"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        id: { type: "number", description: translate("get_media_details.params.id") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["type", "id"],
    },
    display: {
      activeVerb: "Fetching media details for ID",
      completedVerb: "Fetched media details for ID",
      subjectParam: "id",
      subjectFormat: "full",
    },
  },
  {
    name: "get_media_credits",
    dataSource: onDemand("TMDB API"),
    description: translate("get_media_credits.description"),
    endpoint: {
      path: "/knowledge/media/:id/credits",
      pathParams: ["id"],
      queryParams: ["type"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        id: { type: "number", description: translate("get_media_credits.params.id") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["type", "id"],
    },
    display: {
      activeVerb: "Fetching credits for media ID",
      completedVerb: "Fetched credits for media ID",
      subjectParam: "id",
      subjectFormat: "full",
    },
  },
  {
    name: "get_trending_media",
    dataSource: onDemand("TMDB API"),
    description: translate("get_trending_media.description"),
    endpoint: {
      path: "/knowledge/media/trending",
      queryParams: ["type", "timeWindow", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        timeWindow: {
          type: "string",
          enum: ["day", "week"],
          description: translate("get_trending_media.params.timeWindow"),
        },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["type"],
    },
    display: {
      activeVerb: "Fetching trending",
      completedVerb: "Fetched trending",
      subjectParam: "type",
      subjectFormat: "full",
    },
  },
  {
    name: "browse_media",
    dataSource: onDemand("TMDB API"),
    description: translate("browse_media.description"),
    endpoint: {
      path: "/knowledge/media/discover",
      queryParams: [
        "type",
        "genreId",
        "year",
        "sortBy",
        "page",
        "minVoteAverage",
        "minVoteCount",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        genreId: {
          type: "number",
          description: translate("browse_media.params.genreId"),
        },
        year: { type: "number", description: translate("browse_media.params.year") },
        sortBy: {
          type: "string",
          description: translate("browse_media.params.sortBy"),
        },
        minVoteAverage: {
          type: "number",
          description: translate("browse_media.params.minVoteAverage"),
        },
        minVoteCount: { type: "number", description: translate("browse_media.params.minVoteCount") },
        page: { type: "number", description: translate("browse_media.params.page") },
        fields: {
          type: "string",
          description: translate("common.params.fieldsCsv"),
        },
      },
      required: ["type"],
    },
    display: {
      activeVerb: "Discovering",
      completedVerb: "Discovered",
      subjectParam: "type",
      subjectFormat: "full",
    },
  },
  {
    name: "get_media_genres",
    dataSource: onDemand("TMDB API"),
    description: translate("get_media_genres.description"),
    endpoint: {
      path: "/knowledge/media/genres",
      queryParams: ["type"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
      },
      required: ["type"],
    },
    display: {
      activeVerb: "Fetching genres for",
      completedVerb: "Fetched genres for",
      subjectParam: "type",
      subjectFormat: "full",
    },
  },
  {
    name: "get_now_playing_media",
    dataSource: onDemand("TMDB API"),
    description: translate("get_now_playing_media.description"),
    endpoint: {
      path: "/knowledge/media/now-playing",
      queryParams: ["action", "region", "page", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["now_playing", "upcoming", "airing_today", "on_the_air"],
          description: translate("get_now_playing_media.params.action"),
        },
        region: {
          type: "string",
          description: translate("get_now_playing_media.params.region"),
        },
        page: { type: "number", description: translate("get_now_playing_media.params.page") },
        limit: { type: "number", description: translate("get_now_playing_media.params.limit") },
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Fetching media list for",
      completedVerb: "Fetched media list for",
      subjectParam: "action",
      subjectFormat: "full",
    },
  },
  {
    name: "get_media_recommendations",
    dataSource: onDemand("TMDB API"),
    description: translate("get_media_recommendations.description"),
    endpoint: {
      path: "/knowledge/media/:id/recommendations",
      pathParams: ["id"],
      queryParams: ["type", "action", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        id: { type: "number", description: translate("get_media_recommendations.params.id") },
        action: {
          type: "string",
          enum: ["recommendations", "similar"],
          description: translate("get_media_recommendations.params.action"),
        },
        limit: { type: "number", description: translate("common.params.maxResultsDefault10") },
      },
      required: ["type", "id", "action"],
    },
    display: {
      activeVerb: "Fetching recommendations for ID",
      completedVerb: "Fetched recommendations for ID",
      subjectParam: "id",
      subjectFormat: "full",
    },
  },
  {
    name: "search_person",
    dataSource: onDemand("TMDB API"),
    description: translate("search_person.description"),
    endpoint: {
      path: "/knowledge/person/search",
      queryParams: ["action", "q", "id", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "details", "filmography"],
          description: translate("search_person.params.action"),
        },
        "q": { type: "string", description: translate("search_person.params.q") },
        id: { type: "number", description: translate("search_person.params.id") },
        limit: { type: "number", description: translate("search_person.params.limit") },
        ...fieldsParam(FIELDS.PERSON),
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Searching movie/TV personnel for",
      completedVerb: "Searched movie/TV personnel for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "get_watch_providers",
    dataSource: onDemand("TMDB API (JustWatch data)"),
    description: translate("get_watch_providers.description"),
    endpoint: {
      path: "/knowledge/media/:id/watch-providers",
      pathParams: ["id"],
      queryParams: ["type", "region"],
    },
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["movie", "tv"],
          description: translate("common.params.mediaType"),
        },
        id: { type: "number", description: translate("get_watch_providers.params.id") },
        region: {
          type: "string",
          description: translate("get_watch_providers.params.region"),
        },
      },
      required: ["type", "id"],
    },
    display: {
      activeVerb: "Fetching watch providers for ID",
      completedVerb: "Fetched watch providers for ID",
      subjectParam: "id",
      subjectFormat: "full",
    },
  },
  ];
}
