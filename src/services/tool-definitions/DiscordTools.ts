// ────────────────────────────────────────────────────────────
// Tool Definitions — Discord
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getDiscordTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "search_discord_messages",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("search_discord_messages.description"),
    endpoint: {
      path: "/discord/messages/search",
      queryParams: [
        "guildId",
        "channelId",
        "userId",
        "username",
        "query",
        "before",
        "after",
        "limit",
        "mode",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("search_discord_messages.params.guildId"),
        },
        channelId: {
          type: "string",
          description: translate("search_discord_messages.params.channelId"),
        },
        userId: {
          type: "string",
          description: translate("search_discord_messages.params.userId"),
        },
        username: {
          type: "string",
          description: translate("search_discord_messages.params.username"),
        },
        query: {
          type: "string",
          description: translate("search_discord_messages.params.query"),
        },
        before: {
          type: "string",
          description: translate("search_discord_messages.params.before"),
        },
        after: {
          type: "string",
          description: translate("search_discord_messages.params.after"),
        },
        limit: {
          type: "number",
          description: translate("search_discord_messages.params.limit"),
        },
        mode: {
          type: "string",
          enum: ["messages", "count", "compact"],
          description: translate("search_discord_messages.params.mode"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_message_analytics",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_message_analytics.description"),
    endpoint: {
      path: "/discord/messages/analytics",
      queryParams: [
        "guildId",
        "channelId",
        "userId",
        "username",
        "query",
        "before",
        "after",
        "groupBy",
        "topN",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_server_activity.params.guildId"),
        },
        channelId: {
          type: "string",
          description: translate("search_discord_messages.params.channelId"),
        },
        userId: {
          type: "string",
          description: translate("search_discord_messages.params.userId"),
        },
        username: {
          type: "string",
          description: translate("get_discord_message_analytics.params.username"),
        },
        query: {
          type: "string",
          description: translate("get_discord_message_analytics.params.query"),
        },
        before: {
          type: "string",
          description: translate("get_discord_message_analytics.params.before"),
        },
        after: {
          type: "string",
          description: translate("get_discord_message_analytics.params.after"),
        },
        groupBy: {
          type: "string",
          enum: ["user", "channel", "day", "hour", "weekday", "month"],
          description: translate("get_discord_message_analytics.params.groupBy"),
        },
        topN: {
          type: "number",
          description: translate("get_discord_message_analytics.params.topN"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_server_activity",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_server_activity.description"),
    endpoint: {
      path: "/discord/activity",
      queryParams: ["guildId", "channelId", "days", "topN"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_server_activity.params.guildId"),
        },
        channelId: {
          type: "string",
          description: translate("get_discord_server_activity.params.channelId"),
        },
        days: {
          type: "number",
          description: translate("get_discord_server_activity.params.days"),
        },
        topN: {
          type: "number",
          description: translate("get_discord_server_activity.params.topN"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_guild_channels",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_discord_guild_channels.description"),
    endpoint: {
      path: "/discord/guild/channels",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_guild_channels.params.guildId"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_guild_members",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_discord_guild_members.description"),
    endpoint: {
      path: "/discord/guild/members",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_guild_members.params.guildId"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_guild_emojis",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_discord_guild_emojis.description"),
    endpoint: {
      path: "/discord/guild/emojis",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_guild_emojis.params.guildId"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_bot_stats",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_bot_stats.description"),
    endpoint: {
      path: "/discord/bot/stats",
      queryParams: [],
    },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_bot_guilds",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_bot_guilds.description"),
    endpoint: {
      path: "/discord/bot/guilds",
      queryParams: [],
    },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_bot_activity_timeline",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_bot_activity_timeline.description"),
    endpoint: {
      path: "/discord/bot/activity",
      queryParams: [],
    },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_discord_user_heatmap_data",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_user_heatmap_data.description"),
    endpoint: {
      path: "/discord/guild/heatmap",
      queryParams: [
        "guildId",
        "userId",
        "channelId",
        "years",
        "months",
        "days",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("common.params.discordGuildId"),
        },
        userId: {
          type: "string",
          description: translate("get_discord_word_frequencies.params.userId"),
        },
        channelId: {
          type: "string",
          description: translate("get_discord_user_heatmap_data.params.channelId"),
        },
        years: {
          type: "number",
          description: translate("common.params.yearsOfHistory"),
        },
        months: {
          type: "number",
          description: translate("common.params.monthsOfHistory"),
        },
        days: {
          type: "number",
          description: translate("common.params.daysOfHistory"),
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "get_discord_mention_leaderboard",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_mention_leaderboard.description"),
    endpoint: {
      path: "/discord/guild/mentions",
      queryParams: [
        "guildId",
        "userId",
        "years",
        "months",
        "days",
        "channelId",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("common.params.discordGuildId"),
        },
        userId: {
          type: "string",
          description: translate("get_discord_mention_leaderboard.params.userId"),
        },
        years: {
          type: "number",
          description: translate("common.params.yearsOfHistory"),
        },
        months: {
          type: "number",
          description: translate("common.params.monthsOfHistory"),
        },
        days: {
          type: "number",
          description: translate("common.params.daysOfHistory"),
        },
        channelId: {
          type: "string",
          description: translate("get_discord_user_heatmap_data.params.channelId"),
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "get_discord_message_leaderboard",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_message_leaderboard.description"),
    endpoint: {
      path: "/discord/guild/leaderboard",
      queryParams: ["guildId", "years", "months", "days", "channelId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("common.params.discordGuildId"),
        },
        years: {
          type: "number",
          description: translate("common.params.yearsOfHistory"),
        },
        months: {
          type: "number",
          description: translate("common.params.monthsOfHistory"),
        },
        days: {
          type: "number",
          description: translate("common.params.daysOfHistory"),
        },
        channelId: {
          type: "string",
          description: translate("get_discord_message_leaderboard.params.channelId"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_word_frequencies",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_word_frequencies.description"),
    endpoint: {
      path: "/discord/guild/word-frequencies",
      queryParams: ["guildId", "userId", "years", "months", "days", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("common.params.discordGuildId"),
        },
        userId: {
          type: "string",
          description: translate("get_discord_word_frequencies.params.userId"),
        },
        years: {
          type: "number",
          description: translate("common.params.yearsOfHistory"),
        },
        months: {
          type: "number",
          description: translate("common.params.monthsOfHistory"),
        },
        days: {
          type: "number",
          description: translate("common.params.daysOfHistory"),
        },
        limit: {
          type: "number",
          description: translate("get_discord_word_frequencies.params.limit"),
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "react_to_discord_message",
    dataSource: onDemand("Discord Live API"),
    description: translate("react_to_discord_message.description"),
    endpoint: {
      path: "/discord/guild/react",
      method: "POST",
      bodyParams: ["guildId", "channelId", "messageId", "emoji"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("react_to_discord_message.params.guildId"),
        },
        channelId: {
          type: "string",
          description: translate("react_to_discord_message.params.channelId"),
        },
        messageId: {
          type: "string",
          description: translate("react_to_discord_message.params.messageId"),
        },
        emoji: {
          type: "string",
          description: translate("react_to_discord_message.params.emoji"),
        },
      },
      required: ["guildId", "channelId", "messageId", "emoji"],
    },
  },
  {
    name: "get_discord_voice_channel_members",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_discord_voice_channel_members.description"),
    endpoint: {
      path: "/discord/guild/voice-members",
      queryParams: ["guildId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_voice_channel_members.params.guildId"),
        },
      },
      required: ["guildId"],
    },
  },
  {
    name: "get_discord_user_profile",
    dataSource: onDemand("Discord Live API"),
    description: translate("get_discord_user_profile.description"),
    endpoint: {
      path: "/discord/guild/user-profile",
      queryParams: ["guildId", "userId"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_user_profile.params.guildId"),
        },
        userId: {
          type: "string",
          description: translate("get_discord_user_profile.params.userId"),
        },
      },
      required: ["guildId", "userId"],
    },
  },
  {
    name: "get_discord_channel_activity_stats",
    dataSource: onDemand("Lupos MongoDB"),
    description: translate("get_discord_channel_activity_stats.description"),
    endpoint: {
      path: "/discord/guild/channel-stats",
      queryParams: ["guildId", "days"],
    },
    parameters: {
      type: "object",
      properties: {
        guildId: {
          type: "string",
          description: translate("get_discord_channel_activity_stats.params.guildId"),
        },
        days: {
          type: "number",
          description: translate("get_discord_channel_activity_stats.params.days"),
        },
      },
      required: ["guildId"],
    },
  },
  ];
}
