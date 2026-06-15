import { MongoClient, type Db, type Collection, type Document } from "mongodb";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";

// ═══════════════════════════════════════════════════════════════
//  Lupos Discord — MongoDB Connection (separate database)
// ═══════════════════════════════════════════════════════════════
//  Database: lupos
//  Collections:
//    Messages — One doc per Discord message (scraped from servers)
// ═══════════════════════════════════════════════════════════════

let client: MongoClient | null = null;
let luposDb: Db | null = null;
let messagesCollection: Collection<Document> | null = null;

/**
 * Connect to the Lupos database.
 * Uses the same MongoDB host but targets the `lupos` database.
 */
export async function connectLuposDB(baseUri: string) {
  if (luposDb) return luposDb;

  // Replace the database name in the URI
  const luposUri = baseUri.replace(/\/tools\b/, "/lupos");

  client = new MongoClient(luposUri);
  await client.connect();
  luposDb = client.db("lupos");
  logger.info(`🐺 Connected to Lupos DB: ${luposDb.databaseName}`);
  return luposDb;
}

/**
 * Get the Lupos database instance.
 */
export function getLuposDB(): Db {
  if (!luposDb)
    throw new Error("Lupos DB not connected — call connectLuposDB() first");
  return luposDb;
}

/**
 * Initialize collections with required indexes.
 * Index creation runs in the background (MongoDB handles large collections asynchronously).
 */
export async function setupLuposCollections() {
  const database = getLuposDB();
  messagesCollection = database.collection("Messages");

  // Fire-and-forget index creation — these are additive.
  // If Lupos already created them, MongoDB noops.
  // On 8M+ docs, new indexes may take several minutes to build in background.
  const ensureIndexes = async () => {
    try {
      await messagesCollection!.createIndex(
        { id: 1 },
        { unique: true, background: true },
      );
      await messagesCollection!.createIndex(
        { "author.id": 1, createdTimestamp: -1 },
        { background: true },
      );
      await messagesCollection!.createIndex(
        { guildId: 1, channelId: 1, createdTimestamp: -1 },
        { background: true },
      );
      await messagesCollection!.createIndex(
        { guildId: 1, createdTimestamp: -1 },
        { background: true },
      );

      // ── Hot-path indexes for DiscordDataService ────────────────
      // Every query appends `"author.bot": { $ne: true }` and
      // `"channel.parentId": { $nin: [...] }`. Without these indexes,
      // MongoDB must FETCH every candidate doc from disk to filter,
      // causing massive I/O on the 8M+ collection.

      // Compound index with bot-exclusion baked in via partial filter.
      // Covers the dominant pattern: guildId + time range + non-bot.
      // partialFilterExpression must match the exact query predicate in
      // buildBaseFilter (`author.bot: { $in: [false, null] }`).
      await messagesCollection!.createIndex(
        { guildId: 1, createdTimestamp: -1, "channel.parentId": 1 },
        {
          background: true,
          partialFilterExpression: { "author.bot": { $in: [false, null] } },
          name: "guild_time_nonbot_partial",
        },
      );

      // Compound index for guild + channel + time with bot exclusion.
      // Covers channel-scoped searches (the most common LUPOS pattern).
      await messagesCollection!.createIndex(
        { guildId: 1, channelId: 1, createdTimestamp: -1, "channel.parentId": 1 },
        {
          background: true,
          partialFilterExpression: { "author.bot": { $in: [false, null] } },
          name: "guild_channel_time_nonbot_partial",
        },
      );

      // Username search — LUPOS frequently searches by username with
      // case-insensitive regex. This index covers the first $or branch
      // and allows MongoDB to use an IXSCAN instead of COLLSCAN.
      await messagesCollection!.createIndex(
        { "author.username": 1 },
        { background: true },
      );

      // channel.parentId standalone — used by the $nin exclusion filter
      // and channel-based groupBy aggregations.
      await messagesCollection!.createIndex(
        { "channel.parentId": 1 },
        { background: true },
      );
    } catch (error: unknown) {
      logger.warn(`🐺 Lupos index creation warning: ${errorMessage(error)}`);
    }

    try {
      await messagesCollection!.createIndex(
        { content: "text" },
        { name: "lupos_message_text_search", background: true },
      );
    } catch (error: unknown) {
      // Text index may already exist with different fields — non-fatal
      logger.warn(`🐺 Lupos text index skipped: ${errorMessage(error)}`);
    }
  };

  // Don't block startup on index creation
  ensureIndexes().then(() => {
    logger.info("🐺 Lupos collections & indexes ready");
  });
}

/**
 * Get the Messages collection reference.
 */
export function getMessagesCollection(): Collection<Document> {
  if (!messagesCollection) {
    const database = getLuposDB();
    messagesCollection = database.collection("Messages");
  }
  return messagesCollection;
}
