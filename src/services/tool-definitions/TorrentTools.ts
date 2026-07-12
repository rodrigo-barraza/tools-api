// ────────────────────────────────────────────────────────────
// Tool Definitions — Torrent
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getTorrentTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "search_torrents",
    dataSource: onDemand("qBittorrent"),
    description: translate("search_torrents.description"),
    endpoint: {
      path: "/torrent",
      queryParams: ["action", "q", "category", "plugins", "limit", "timeout"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search"],
          description: translate("search_torrents.params.action"),
        },
        "q": {
          type: "string",
          description: translate("search_torrents.params.q"),
        },
        category: {
          type: "string",
          enum: [
            "all",
            "movies",
            "tv",
            "music",
            "games",
            "anime",
            "software",
            "pictures",
            "books",
          ],
          description: translate("search_torrents.params.category"),
        },
        plugins: {
          type: "string",
          description: translate("search_torrents.params.plugins"),
        },
        limit: {
          type: "number",
          description: translate("search_torrents.params.limit"),
        },
        timeout: {
          type: "number",
          description: translate("search_torrents.params.timeout"),
        },
      },
      required: ["action", "q"],
    },
    display: {
      activeVerb: "Searching torrents for",
      completedVerb: "Searched torrents for",
      subjectParam: "q",
      subjectFormat: "quoted",
    },
  },
  {
    name: "download_torrent",
    dataSource: onDemand("qBittorrent"),
    description: translate("download_torrent.description"),
    endpoint: {
      method: "POST",
      path: "/torrent/download",
      bodyParams: ["url", "savePath", "category", "tags", "paused"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("download_torrent.params.url"),
        },
        savePath: {
          type: "string",
          description: translate("download_torrent.params.savePath"),
        },
        category: {
          type: "string",
          description: translate("download_torrent.params.category"),
        },
        tags: {
          type: "string",
          description: translate("download_torrent.params.tags"),
        },
        paused: {
          type: "boolean",
          description: translate("download_torrent.params.paused"),
        },
      },
      required: ["url"],
    },
    display: {
      activeVerb: "Downloading torrent from",
      completedVerb: "Downloaded torrent from",
      subjectParam: "url",
      subjectFormat: "domain",
    },
  },
  {
    name: "get_torrent_status",
    dataSource: onDemand("qBittorrent"),
    description: translate("get_torrent_status.description"),
    endpoint: {
      path: "/torrent",
      queryParams: ["action", "filter", "category", "sort", "limit", "hashes"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["status", "plugins", "transfer", "pause", "resume"],
          description: translate("get_torrent_status.params.action"),
        },
        filter: {
          type: "string",
          enum: [
            "all",
            "downloading",
            "seeding",
            "completed",
            "paused",
            "active",
            "inactive",
            "errored",
          ],
          description: translate("get_torrent_status.params.filter"),
        },
        category: {
          type: "string",
          description: translate("get_torrent_status.params.category"),
        },
        sort: {
          type: "string",
          description: translate("get_torrent_status.params.sort"),
        },
        limit: {
          type: "number",
          description: translate("get_torrent_status.params.limit"),
        },
        hashes: {
          type: "string",
          description: translate("get_torrent_status.params.hashes"),
        },
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Checking torrent transfer status",
      completedVerb: "Checked torrent transfer status",
      subjectParam: "action",
      subjectFormat: "full",
    },
  },
  ];
}
