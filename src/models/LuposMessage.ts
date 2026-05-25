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
let messagesCol: Collection<Document> | null = null;

/**
 * Connect to the Lupos database.
 * Uses the same MongoDB host but targets the `lupos` database.
 */
export async function connectLuposDB(baseUri: string) {
  if (luposDb) return luposDb;

  // Replace the database name in the URI
  const luposUri = baseUri.replace(
    /\/tools\b/,
    "/lupos",
  );

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
  if (!luposDb) throw new Error("Lupos DB not connected — call connectLuposDB() first");
  return luposDb;
}

/**
 * Initialize collections with required indexes.
 * Index creation runs in the background (MongoDB handles large collections asynchronously).
 */
export async function setupLuposCollections() {
  const database = getLuposDB();
  messagesCol = database.collection("Messages");

  // Fire-and-forget index creation — these are additive.
  // If Lupos already created them, MongoDB noops.
  // On 8M+ docs, new indexes may take several minutes to build in background.
  const ensureIndexes = async () => {
    try {
      await messagesCol!.createIndex({ id: 1 }, { unique: true, background: true });
      await messagesCol!.createIndex({ "author.id": 1, createdTimestamp: -1 }, { background: true });
      await messagesCol!.createIndex({ guildId: 1, channelId: 1, createdTimestamp: -1 }, { background: true });
      await messagesCol!.createIndex({ guildId: 1, createdTimestamp: -1 }, { background: true });
    } catch (error: unknown) {
      logger.warn(`🐺 Lupos index creation warning: ${errorMessage(error)}`);
    }

    try {
      await messagesCol!.createIndex(
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
  if (!messagesCol) {
    const database = getLuposDB();
    messagesCol = database.collection("Messages");
  }
  return messagesCol;
}
