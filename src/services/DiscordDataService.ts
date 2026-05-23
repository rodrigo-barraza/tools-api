import { days as daysToMs } from "@rodrigo-barraza/utilities-library";
import type { Document } from "mongodb";
import { getMessagesCollection } from "../models/LuposMessage.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MongoDB documents from Discord have deeply nested dynamic shapes
type DiscordDocument = Document;

// ═══════════════════════════════════════════════════════════════
//  Discord Data Service
//
//  Query layer for the Lupos `Messages` collection. Powers the
//  discord_message_search, discord_server_activity, and
//  discord_message_analytics tools.
// ═══════════════════════════════════════════════════════════════

// ── Excluded Categories ──────────────────────────────────────
// Messages from channels under these Discord category IDs are
// NEVER returned by any query. This is a hard server-side filter.
const EXCLUDED_CATEGORY_IDS = [
  "609652454375555082", // Private/staff channels
  "665736600042340352", // Staff/admin channels
];

// ── Discord User Badge Flags ─────────────────────────────────
// Maps UserFlags bitfield values to badge identifiers used by the
// client to render inline badge icons next to usernames.
const BADGE_FLAGS = [
  { bit: 1,       id: "staff",                label: "Discord Staff" },
  { bit: 2,       id: "partner",              label: "Partnered Server Owner" },
  { bit: 4,       id: "hypesquad",            label: "HypeSquad Events" },
  { bit: 8,       id: "bug_hunter_1",         label: "Bug Hunter Level 1" },
  { bit: 64,      id: "hypesquad_bravery",    label: "HypeSquad Bravery" },
  { bit: 128,     id: "hypesquad_brilliance", label: "HypeSquad Brilliance" },
  { bit: 256,     id: "hypesquad_balance",    label: "HypeSquad Balance" },
  { bit: 512,     id: "early_supporter",      label: "Early Supporter" },
  { bit: 16384,   id: "bug_hunter_2",         label: "Bug Hunter Level 2" },
  { bit: 65536,   id: "verified_bot",         label: "Verified Bot" },
  { bit: 131072,  id: "verified_developer",   label: "Early Verified Bot Developer" },
  { bit: 262144,  id: "certified_moderator",  label: "Moderator Programs Alumni" },
  { bit: 4194304, id: "active_developer",     label: "Active Developer" },
];

/**
 * Extract badge identifiers from a UserFlags bitfield.
 * The bitfield can be a number, a string-encoded number, or a
 * discord.js BitField object with a `.bitfield` property.
 */
function extractBadges(flags: number | string | { bitfield: number } | null | undefined) {
  if (!flags) return [];
  // discord.js stores BitField as { bitfield: <number> }
  const bits = typeof flags === "object" && flags !== null && "bitfield" in flags
    ? Number(flags.bitfield)
    : Number(flags);
  if (!bits || isNaN(bits)) return [];
  return BADGE_FLAGS
    .filter((f) => (bits & f.bit) === f.bit)
    .map((f) => ({ id: f.id, label: f.label }));
}

/**
 * Extract visible role tags from a member's roles array.
 * Returns the top non-@everyone roles (sorted by position desc),
 * limited to the top 3 for UI space — matching Discord's inline
 * role badge behavior.
 */
interface DiscordRole {
  id: string;
  name: string;
  position?: number;
  hexColor?: string;
  iconURL?: string;
}

function extractRoleTags(roles: DiscordRole[] | undefined, guildId: string | undefined) {
  if (!Array.isArray(roles) || roles.length === 0) return [];
  return roles
    .filter((r) => r.id !== guildId && r.name !== "@everyone")
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0))
    .slice(0, 3)
    .map((r) => ({
      name: r.name,
      color: r.hexColor && r.hexColor !== "#000000" ? r.hexColor : null,
      iconUrl: r.iconURL || null,
    }));
}

/**
 * Build a Discord CDN avatar URL from raw author data stored in MongoDB.
 * Falls back to the default avatar URL (e.g. blue/green Wumpus silhouette).
 */
interface DiscordAuthor {
  id?: string;
  avatar?: string;
  defaultAvatarURL?: string;
}

interface DiscordMember {
  avatar?: string;
  displayName?: string;
  displayHexColor?: string;
  roles?: DiscordRole[];
  roleColors?: { secondary?: string; tertiary?: string };
  premiumSince?: string;
  premiumSinceTimestamp?: number;
}

function buildAvatarUrl(author: DiscordAuthor | undefined, member?: DiscordMember, guildId?: string) {
  if (!author) return null;
  if (member?.avatar && author.id && guildId) {
    const fileExtension = member.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${author.id}/avatars/${member.avatar}.${fileExtension}?size=128`;
  }
  if (author.avatar && author.id) {
    const fileExtension = author.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${fileExtension}?size=128`;
  }
  return author.defaultAvatarURL || null;
}

/**
 * Resolve a media URL using the mediaArchive map.
 * Prefers the permanent MinIO URL when the original URL was archived.
 * Falls back to the original URL otherwise.
 */
function resolveArchivedUrl(url: string | undefined, archiveMap: Record<string, { publicUrl?: string }> | null) {
  if (!url || !archiveMap) return url;
  const archiveReference = archiveMap[url];
  // If the entry was marked as expired during backfill, it has no publicUrl
  if (archiveReference?.publicUrl) return archiveReference.publicUrl;
  return url;
}

/**
 * Build the common MongoDB filter used by search and analytics.
 */
function buildBaseFilter({
  guildId,
  channelId,
  userId,
  username,
  query,
  before,
  after,
  includeBots = false,
}: Record<string, unknown> = {}) {
  const filter: Record<string, unknown> = {};

  if (guildId) filter.guildId = guildId;
  if (channelId) filter.channelId = channelId;
  if (userId) filter["author.id"] = userId;

  // Username search — match across username, globalName, and displayName
  if (username && !userId) {
    const nameRegex = { $regex: username, $options: "i" };
    filter.$or = [
      { "author.username": nameRegex },
      { "author.globalName": nameRegex },
      { "member.displayName": nameRegex },
    ];
  }

  // Exclude bot messages by default — callers can opt-in with includeBots
  if (!includeBots) {
    filter["author.bot"] = { $ne: true };
  }

  // Exclude messages from restricted categories (hard filter)
  filter["channel.parentId"] = { $nin: EXCLUDED_CATEGORY_IDS };

  // Time range
  if (before || after) {
    const tsFilter: { $lte?: number; $gte?: number } = {};
    if (before) tsFilter.$lte = new Date(before as string | number).getTime();
    if (after) tsFilter.$gte = new Date(after as string | number).getTime();
    filter.createdTimestamp = tsFilter;
  }

  // Text search — prefer $regex for reliability (text index may still be building)
  if (query) {
    filter.content = { $regex: query, $options: "i" };
  }

  return filter;
}

const DiscordDataService = {
  /**
   * Search Discord messages with flexible filters.
   *


   *   "messages" — full message objects (default)
   *   "count"    — only the matching count, zero message bodies
   *   "compact"  — minimal per-message data (author, timestamp, truncated content)
   */
  async searchMessages({
    guildId,
    channelId,
    userId,
    username,
    query,
    before,
    after,
    limit = 50,
    mode = "messages",
    includeBots = false,
  }: Record<string, unknown> = {}) {
    const collection = getMessagesCollection();
    const filter = buildBaseFilter({ guildId, channelId, userId, username, query, before, after, includeBots });
    const cappedLimit = Math.min(Number(limit), 500);

    // ── Count mode — return only the total, zero payloads ──────
    if (mode === "count") {
      const total = await collection.countDocuments(filter);
      return { count: total };
    }

    // ── Compact mode — minimal per-message data ───────────────
    if (mode === "compact") {
      const messages = await collection
        .find(filter)
        .sort({ createdTimestamp: -1 })
        .limit(cappedLimit)
        .project({
          _id: 0,
          id: 1,
          content: 1,
          "author.id": 1,
          "author.username": 1,
          "author.globalName": 1,
          "author.avatar": 1,
          "author.defaultAvatarURL": 1,
          "member.displayName": 1,
          "member.avatar": 1,
          guildId: 1,
          channelId: 1,
          "channel.name": 1,
          createdTimestamp: 1,
        })
        .toArray();

      const formatted = messages.map((m: DiscordDocument) => ({
        id: m.id,
        // Truncate content to 120 chars to save tokens
        content: m.content?.length > 120
          ? m.content.slice(0, 120) + "…"
          : m.content,
        author: m.member?.displayName || m.author?.globalName || m.author?.username,
        avatarUrl: buildAvatarUrl(m.author, m.member, m.guildId),
        channel: m.channel?.name || null,
        date: m.createdTimestamp
          ? new Date(m.createdTimestamp).toISOString().slice(0, 16)
          : null,
      }));

      return { count: formatted.length, messages: formatted };
    }

    // ── Messages mode — full message objects (default) ─────────
    const messages = await collection
      .find(filter)
      .sort({ createdTimestamp: -1 })
      .limit(cappedLimit)
      .project({
        _id: 0,
        id: 1,
        content: 1,
        cleanContent: 1,
        "author.id": 1,
        "author.username": 1,
        "author.globalName": 1,
        "author.bot": 1,
        "author.avatar": 1,
        "author.defaultAvatarURL": 1,
        "member.displayName": 1,
        "member.displayHexColor": 1,
        "member.avatar": 1,
        // Enhanced Role Styles (gradient/holographic)
        "member.roleColors": 1,
        channelId: 1,
        "channel.name": 1,
        "channel.parentName": 1,
        guildId: 1,
        "channel.guild.name": 1,
        // Guild icon/banner/splash hashes for CDN URL reconstruction
        "channel.guild.icon": 1,
        "channel.guild.banner": 1,
        "channel.guild.splash": 1,
        createdTimestamp: 1,
        createdAt: 1,
        // Reply context
        reference: 1,
        // Attachments (images, files)
        attachments: 1,
        // Embeds (link previews)
        embeds: 1,
        // Stickers
        stickers: 1,
        // Reactions (emoji reactions on the message)
        reactions: 1,
        // Member roles (for badge detection — e.g. Nitro Booster)
        "member.premiumSince": 1,
        "member.premiumSinceTimestamp": 1,
        "member.roles": 1,
        // Author flags (public_flags bitfield for profile badges)
        "author.flags": 1,
        // Archived media URLs (MinIO permanent URLs)
        mediaArchive: 1,
      })
      .toArray();

    // Format into a clean shape with human-readable names
    const formatted = messages.map((m: DiscordDocument) => {
      // Build attachment list with URLs for image rendering.
      // Prefer archived MinIO URLs over potentially-expired Discord CDN URLs.
      const archive = m.mediaArchive || null;
      const attachments = Array.isArray(m.attachments) && m.attachments.length > 0
        ? m.attachments.map((a: DiscordDocument) => {
          const resolvedUrl = resolveArchivedUrl(a.url, archive) || resolveArchivedUrl(a.proxyURL, archive) || null;
          const resolvedProxy = resolveArchivedUrl(a.proxyURL, archive) || null;
          return {
            name: a.name || null,
            contentType: a.contentType || null,
            size: a.size || null,
            url: resolvedUrl,
            proxyURL: resolvedProxy,
            width: a.width || null,
            height: a.height || null,
            duration: a.duration ?? null,
            waveform: a.waveform ?? null,
          };
        })
        : undefined;

      // Build rich embed objects — preserve image/thumbnail/video for rendering.
      // Resolve archived URLs for embed media as well (belt-and-suspenders).
      const embeds = Array.isArray(m.embeds) && m.embeds.length > 0
        ? m.embeds
          .map((e: DiscordDocument) => {
            // Skip empty embeds
            if (!e.title && !e.description && !e.url && !e.image && !e.thumbnail && !e.video) return null;
            return {
              ...(e.title && { title: e.title }),
              ...(e.description && { description: e.description }),
              ...(e.url && { url: e.url }),
              ...(e.image && {
                image: {
                  ...e.image,
                  url: resolveArchivedUrl(e.image.url, archive),
                  proxyURL: resolveArchivedUrl(e.image.proxyURL, archive),
                },
              }),
              ...(e.thumbnail && {
                thumbnail: {
                  ...e.thumbnail,
                  url: resolveArchivedUrl(e.thumbnail.url, archive),
                  proxyURL: resolveArchivedUrl(e.thumbnail.proxyURL, archive),
                },
              }),
              ...(e.video && {
                video: {
                  ...e.video,
                  ...(e.video.url && { url: resolveArchivedUrl(e.video.url, archive) }),
                  ...(e.video.proxyURL && { proxyURL: resolveArchivedUrl(e.video.proxyURL, archive) }),
                },
              }),
              ...(e.provider && { provider: e.provider }),
              ...(e.color != null && { color: e.color }),
            };
          })
          .filter(Boolean)
          .slice(0, 5)
        : undefined;

      // Role color — #000000 means no custom color, treat as null
      const roleColor = m.member?.displayHexColor && m.member.displayHexColor !== "#000000"
        ? m.member.displayHexColor
        : null;

      return {
        id: m.id,
        content: m.content,
        cleanContent: m.cleanContent,
        author: {
          id: m.author?.id,
          username: m.author?.username,
          displayName: m.member?.displayName || m.author?.globalName || m.author?.username,
          avatarUrl: buildAvatarUrl(m.author, m.member, m.guildId),
          isBot: m.author?.bot === true,
          roleColor,
          // Enhanced Role Styles — gradient (secondary) / holographic (tertiary)
          ...(m.member?.roleColors?.secondary && { roleColors: m.member.roleColors }),
          // Profile badges (HypeSquad, Active Developer, Nitro Early Supporter, etc.)
          badges: extractBadges(m.author?.flags),
          // Top role tags displayed to the right of the username (colored pill badges)
          roleTags: extractRoleTags(m.member?.roles, m.guildId),
        },
        channelId: m.channelId,
        channelName: m.channel?.name || null,
        parentName: m.channel?.parentName || null,
        guildId: m.guildId,
        guildName: m.channel?.guild?.name || null,
        // Guild icon/banner/splash hashes — lets clients build CDN URLs
        // e.g. https://cdn.discordapp.com/icons/{guildId}/{hash}.png
        ...(m.channel?.guild?.icon && { guildIcon: m.channel.guild.icon }),
        ...(m.channel?.guild?.banner && { guildBanner: m.channel.guild.banner }),
        ...(m.channel?.guild?.splash && { guildSplash: m.channel.guild.splash }),
        createdAtISO: m.createdTimestamp
          ? new Date(m.createdTimestamp).toISOString()
          : m.createdAt,
        // Direct link to the message in Discord
        messageUrl: m.guildId && m.channelId && m.id
          ? `https://discord.com/channels/${m.guildId}/${m.channelId}/${m.id}`
          : null,
        // Reply reference — so Lupos can follow conversation threads
        replyTo: m.reference?.messageId || null,
        // Emoji reactions (array of { emoji, count, me })
        ...(Array.isArray(m.reactions) && m.reactions.length > 0 && {
          reactions: m.reactions.map((r: DiscordDocument) => ({
            emoji: {
              id: r.emoji?.id || null,
              name: r.emoji?.name || null,
              animated: r.emoji?.animated || false,
            },
            count: r.count || r.countDetails?.normal || 0,
            // `me` = true when the bot (Lupos) has this reaction — used by
            // the client to render the pill as "already reacted" (blurple,
            // unclickable) since all website reactions go through Lupos.
            me: r.me === true,
          })),
        }),
        // Media indicators
        ...(attachments && { attachments }),
        ...(embeds && { embeds }),
        ...(m.stickers?.length > 0 && { stickerCount: m.stickers.length }),
      };
    });

    return { count: formatted.length, messages: formatted };
  },

  /**
   * Analyze Discord messages with aggregation queries.
   *
   * Groups messages by a chosen dimension and returns counted
   * results, sorted by count descending. Supports all the same
   * filters as searchMessages.
   *


   *   "user"    — group by author
   *   "channel" — group by channel
   *   "day"     — group by calendar day (YYYY-MM-DD)
   *   "hour"    — group by hour of day (0–23, UTC)
   *   "weekday" — group by day of week (Mon–Sun)
   *   "month"   — group by month (YYYY-MM)


   */
  async analyzeMessages({
    guildId,
    channelId,
    userId,
    username,
    query,
    before,
    after,
    groupBy = "user",
    topN = 25,
    includeBots = false,
  }: Record<string, unknown> = {}) {
    const collection = getMessagesCollection();
    const filter = buildBaseFilter({ guildId, channelId, userId, username, query, before, after, includeBots });
    const cappedTopN = Math.min(Number(topN), 100);

    // Weekday labels for the weekday grouping
    const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // ── Build group expression based on groupBy dimension ──────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MongoDB aggregation expressions are dynamic objects
    let groupId: string | Record<string, any>;

    switch (groupBy) {
      case "user":
        groupId = "$author.id";
        break;

      case "channel":
        groupId = "$channelId";
        break;

      case "day":
        // Group by YYYY-MM-DD
        groupId = {
          $dateToString: {
            format: "%Y-%m-%d",
            date: { $toDate: "$createdTimestamp" },
          },
        };
        break;

      case "hour":
        // Group by hour of day (0–23)
        groupId = { $hour: { $toDate: "$createdTimestamp" } };
        break;

      case "weekday":
        // Group by day of week (1=Sun … 7=Sat in MongoDB)
        groupId = { $dayOfWeek: { $toDate: "$createdTimestamp" } };
        break;

      case "month":
        // Group by YYYY-MM
        groupId = {
          $dateToString: {
            format: "%Y-%m",
            date: { $toDate: "$createdTimestamp" },
          },
        };
        break;

      default:
        groupId = "$author.id";
        break;
    }

    // ── Run aggregation ───────────────────────────────────────
    const pipeline = [
      { $match: filter },
      {
        $group: {
          _id: groupId,
          count: { $sum: 1 },
          // Capture extra fields for label building
          ...(groupBy === "user" && {
            username: { $last: "$author.username" },
            displayName: { $last: "$member.displayName" },
            globalName: { $last: "$author.globalName" },
          }),
          ...(groupBy === "channel" && {
            channelName: { $last: "$channel.name" },
          }),
          // First/last timestamps for time-based groups
          firstMessage: { $min: "$createdTimestamp" },
          lastMessage: { $max: "$createdTimestamp" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: cappedTopN },
    ];

    const [results, totalCount] = await Promise.all([
      collection.aggregate(pipeline).toArray(),
      collection.countDocuments(filter),
    ]);

    // ── Format results with human-readable labels ─────────────
    const groups = results.map((r: Document) => {
      const base: Record<string, unknown> = { count: r.count };

      switch (groupBy) {
        case "user":
          base.userId = r._id;
          base.label = r.displayName || r.globalName || r.username || r._id;
          base.username = r.username;
          break;

        case "channel":
          base.channelId = r._id;
          base.label = r.channelName || r._id;
          break;

        case "day":
        case "month":
          base.label = r._id; // Already formatted as YYYY-MM-DD or YYYY-MM
          break;

        case "hour":
          base.label = `${String(r._id).padStart(2, "0")}:00 UTC`;
          base.hour = r._id;
          break;

        case "weekday":
          // MongoDB dayOfWeek: 1=Sun, 2=Mon, ..., 7=Sat
          base.label = weekdayLabels[r._id - 1] || `Day ${r._id}`;
          base.dayOfWeek = r._id;
          break;

        default:
          base.label = String(r._id);
          break;
      }

      return base;
    });

    return {
      guildId,
      groupBy,
      totalMatchingMessages: totalCount,
      groupCount: groups.length,
      ...(typeof query === "string" && query ? { query } : {}),
      groups,
    };
  },

  /**
   * Get server activity stats for a guild.
   */
  async getServerActivity({
    guildId,
    channelId,
    days = 7,
    topN = 15,
  }: Record<string, unknown> = {}) {
    const collection = getMessagesCollection();
    const cappedDays = Math.min(Number(days), 365);
    const sinceTimestamp = Date.now() - daysToMs(cappedDays);

    const match: Record<string, unknown> = {
      guildId,
      createdTimestamp: { $gte: sinceTimestamp },
      "author.bot": { $ne: true },
      "channel.parentId": { $nin: EXCLUDED_CATEGORY_IDS },
    };
    if (channelId) match.channelId = channelId;

    const cappedTopN = Math.min(Number(topN), 50);

    // Run all aggregations in parallel
    const [
      totalMessages,
      topUsers,
      channelBreakdown,
      hourlyActivity,
    ] = await Promise.all([
      // Total message count
      collection.countDocuments(match),

      // Top users by message count
      collection.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$author.id",
            username: { $last: "$author.username" },
            count: { $sum: 1 },
            lastActive: { $max: "$createdTimestamp" },
          },
        },
        { $sort: { count: -1 } },
        { $limit: cappedTopN },
      ]).toArray(),

      // Channel breakdown (top 10)
      collection.aggregate([
        { $match: { ...match, channelId: channelId ? channelId : { $exists: true } } },
        {
          $group: {
            _id: "$channelId",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).toArray(),

      // Hourly activity distribution
      collection.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $hour: { $toDate: "$createdTimestamp" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id": 1 } },
      ]).toArray(),
    ]);

    // Unique users count
    const uniqueUsersResult = await collection.aggregate([
      { $match: match },
      { $group: { _id: "$author.id" } },
      { $count: "total" },
    ]).toArray();
    const uniqueUsers = uniqueUsersResult[0]?.total || 0;

    return {
      guildId,
      period: {
        days: cappedDays,
        since: new Date(sinceTimestamp).toISOString(),
      },
      totalMessages,
      uniqueUsers,
      avgMessagesPerUser: uniqueUsers > 0
        ? Math.round(totalMessages / uniqueUsers * 10) / 10
        : 0,
      topUsers: topUsers.map((u: Document) => ({
        userId: u._id,
        username: u.username,
        messageCount: u.count,
        lastActive: new Date(u.lastActive).toISOString(),
      })),
      channelBreakdown: channelBreakdown.map((c: Document) => ({
        channelId: c._id,
        messageCount: c.count,
      })),
      hourlyActivity: hourlyActivity.map((h: Document) => ({
        hour: h._id,
        messageCount: h.count,
      })),
    };
  },
};

export default DiscordDataService;
