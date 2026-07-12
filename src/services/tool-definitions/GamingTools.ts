// ────────────────────────────────────────────────────────────
// Tool Definitions — Gaming
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, compute } from "./utils.ts";

export function getGamingTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "get_dota",
    dataSource: onDemand("OpenDota"),
    description: translate("get_dota.description"),
    endpoint: {
      path: "/gaming/dota",
      queryParams: [
        "action",
        "query",
        "heroId",
        "accountId",
        "matchId",
        "limit",
        "role",
        "attr",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "heroes",
            "hero",
            "matchups",
            "player",
            "player_matches",
            "match",
            "pro_matches",
          ],
          description: translate("get_steam_profile.params.action"),
        },
        query: {
          type: "string",
          description: translate("get_dota.params.query"),
        },
        heroId: {
          type: "number",
          description: translate("get_dota.params.heroId"),
        },
        accountId: {
          type: "number",
          description: translate("get_dota.params.accountId"),
        },
        matchId: {
          type: "number",
          description: translate("get_dota.params.matchId"),
        },
        limit: {
          type: "number",
          description: translate("get_dota.params.limit"),
        },
        role: {
          type: "string",
          description: translate("get_dota.params.role"),
        },
        attr: {
          type: "string",
          enum: ["str", "agi", "int", "all"],
          description: translate("get_dota.params.attr"),
        },
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Fetching Dota 2 data for action",
      completedVerb: "Fetched Dota 2 data for action",
      subjectParam: "action",
      subjectFormat: "full",
    },
  },
  {
    name: "get_steam_profile",
    dataSource: onDemand("Steam Web API"),
    description: translate("get_steam_profile.description"),
    endpoint: {
      path: "/gaming/steam",
      queryParams: ["action", "steamId", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "profile",
            "owned_games",
            "recent_games",
            "bans",
            "resolve_vanity",
          ],
          description: translate("get_steam_profile.params.action"),
        },
        steamId: {
          type: "string",
          description: translate("get_steam_profile.params.steamId"),
        },
        limit: {
          type: "number",
          description: translate("get_steam_profile.params.limit"),
        },
      },
      required: ["action", "steamId"],
    },
    display: {
      activeVerb: "Fetching Steam data for",
      completedVerb: "Fetched Steam data for",
      subjectParam: "steamId",
      subjectFormat: "full",
    },
  },
  {
    name: "create_bonfire",
    dataSource: compute("Bonfire Generator"),
    description: translate("create_bonfire.description"),
    endpoint: {
      method: "POST",
      path: "/gaming/bonfire",
      bodyParams: [
        "woodType",
        "logsCount",
        "breezeSpeed",
        "fireColor",
        "intensity",
        "marshmallows",
        "itemToBurn",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        woodType: {
          type: "string",
          enum: ["oak", "pine", "birch", "driftwood", "magical"],
          description: translate("create_bonfire.params.woodType"),
        },
        logsCount: {
          type: "number",
          description: translate("create_bonfire.params.logsCount"),
        },
        breezeSpeed: {
          type: "number",
          description: translate("create_bonfire.params.breezeSpeed"),
        },
        fireColor: {
          type: "string",
          enum: ["classic", "emerald", "sapphire", "amethyst", "ghostly"],
          description: translate("create_bonfire.params.fireColor"),
        },
        intensity: {
          type: "string",
          enum: ["ember", "spark", "cozy", "blazing", "inferno"],
          description: translate("create_bonfire.params.intensity"),
        },
        marshmallows: {
          type: "number",
          description: translate("create_bonfire.params.marshmallows"),
        },
        itemToBurn: {
          type: "string",
          description: translate("create_bonfire.params.itemToBurn"),
        },
      },
    },
    display: {
      activeVerb: "Creating cozy bonfire",
      completedVerb: "Created cozy bonfire",
      subjectParam: "woodType",
      subjectFormat: "full",
    },
  },
  ];
}
