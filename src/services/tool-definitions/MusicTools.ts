// ────────────────────────────────────────────────────────────
// Tool Definitions — Music (Spotify)
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getMusicTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {

  return [
  {
    name: "search_spotify",
    dataSource: onDemand("Spotify Web API"),
    description: translate("search_spotify.description"),
    endpoint: {
      path: "/music/spotify/search",
      queryParams: ["q", "type", "limit", "market"],
    },
    parameters: {
      type: "object",
      properties: {
        "q": {
          type: "string",
          description: translate("search_spotify.params.q"),
        },
        type: {
          type: "string",
          enum: ["track", "artist", "album", "playlist", "show", "episode", "audiobook"],
          description: translate("search_spotify.params.type"),
        },
        limit: {
          type: "number",
          description: translate("search_spotify.params.limit"),
        },
        market: {
          type: "string",
          description: translate("search_spotify.params.market"),
        },
      },
      required: ["q"],
    },
    display: {
      activeVerb: "Searching Spotify for",
      completedVerb: "Searched Spotify for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "get_spotify",
    dataSource: onDemand("Spotify Web API"),
    description: translate("get_spotify.description"),
    endpoint: {
      path: "/music/spotify/get",
      queryParams: ["action", "id", "limit", "market", "timeRange"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "track", "album", "artist", "artist_top_tracks", "artist_albums",
            "playlist", "new_releases", "now_playing", "devices", "queue",
            "recently_played", "my_playlists", "saved_tracks", "top_tracks",
            "top_artists",
          ],
          description: translate("get_spotify.params.action"),
        },
        id: {
          type: "string",
          description: translate("get_spotify.params.id"),
        },
        limit: {
          type: "number",
          description: translate("get_spotify.params.limit"),
        },
        market: {
          type: "string",
          description: translate("get_spotify.params.market"),
        },
        timeRange: {
          type: "string",
          enum: ["short_term", "medium_term", "long_term"],
          description: translate("get_spotify.params.timeRange"),
        },
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Fetching Spotify",
      completedVerb: "Fetched Spotify",
      subjectParam: "action",
    },
  },
  {
    name: "control_spotify",
    dataSource: onDemand("Spotify Web API"),
    description: translate("control_spotify.description"),
    endpoint: {
      method: "POST",
      path: "/music/spotify/control",
      bodyParams: [
        "action", "query", "uri", "id", "deviceId", "percent", "mode",
        "enabled", "positionMs",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "play", "pause", "next", "previous", "queue", "shuffle", "repeat",
            "volume", "transfer", "seek", "save_track", "unsave_track",
          ],
          description: translate("control_spotify.params.action"),
        },
        query: {
          type: "string",
          description: translate("control_spotify.params.query"),
        },
        uri: {
          type: "string",
          description: translate("control_spotify.params.uri"),
        },
        id: {
          type: "string",
          description: translate("control_spotify.params.id"),
        },
        deviceId: {
          type: "string",
          description: translate("control_spotify.params.deviceId"),
        },
        percent: {
          type: "number",
          description: translate("control_spotify.params.percent"),
        },
        mode: {
          type: "string",
          enum: ["off", "track", "context"],
          description: translate("control_spotify.params.mode"),
        },
        enabled: {
          type: "boolean",
          description: translate("control_spotify.params.enabled"),
        },
        positionMs: {
          type: "number",
          description: translate("control_spotify.params.positionMs"),
        },
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Controlling Spotify playback",
      completedVerb: "Controlled Spotify playback",
      subjectParam: "action",
    },
  },
  ];
}
