import type { Collection } from "mongodb";
import { getDatabase } from "@rodrigo-barraza/utilities-library/mongo";
import logger from "../logger.ts";
import { errorMessage } from "../utilities.ts";
import { getMetadataBySource } from "../fetchers/utility/webcams/WebcamMetadata.ts";

// ─── Types ──────────────────────────────────────────────────────
export interface WebcamDocument {
  id: string;
  city?: string;
  state?: string;
  province?: string;
  region?: string;
  country?: string;
  registryKey?: string;
  lastUpdated?: Date;
  firstSeen?: Date;
  [key: string]: unknown;
}

let collection: Collection<WebcamDocument> | null = null;

export async function setupWebcamCollection() {
  const database = getDatabase();
  if (!database) return;

  const collectionInstance = database.collection<WebcamDocument>("webcams") as unknown as Collection<WebcamDocument>;

  await collectionInstance.createIndex({ id: 1 }, { unique: true });
  await collectionInstance.createIndex({ city: 1 });
  await collectionInstance.createIndex({ state: 1 });
  await collectionInstance.createIndex({ province: 1 });
  await collectionInstance.createIndex({ region: 1 });
  await collectionInstance.createIndex({ country: 1 });
  await collectionInstance.createIndex({ registryKey: 1 });
  await collectionInstance.createIndex({ lastUpdated: -1 });

  collection = collectionInstance;
  logger.info("📷 Webcam collection indexes ready");
}

export async function upsertWebcams(webcams: WebcamDocument[]) {
  if (!collection || webcams.length === 0) return null;

  const now = new Date();
  const operations = webcams.map((webcam: WebcamDocument) => {
    const enriched = { ...webcam };
    
    // Enrich with geographic metadata based on city and country
    if (webcam.city && webcam.country) {
      const meta = getMetadataBySource(webcam.city, webcam.country);
      if (meta) {
        enriched.registryKey = meta.key;
        enriched.country = meta.country;
        if (meta.city) {
          enriched.city = meta.city;
        } else {
          // If metadata does not designate it as a city source, remove "city" property
          delete enriched.city;
        }
        if (meta.state) enriched.state = meta.state;
        if (meta.province) enriched.province = meta.province;
        if (meta.region) enriched.region = meta.region;
      }
    }

    return {
      updateOne: {
        filter: { id: webcam.id },
        update: {
          $set: { ...enriched, lastUpdated: now },
          $setOnInsert: { firstSeen: now },
        },
        upsert: true,
      },
    };
  });

  try {
    const result = await collection.bulkWrite(operations, { ordered: false });
    return result;
  } catch (error: unknown) {
    logger.error("Failed to upsert webcams:", errorMessage(error));
    return null;
  }
}

export async function getWebcamsByCity(city: string, limit: number = 100): Promise<WebcamDocument[]> {
  if (!collection) return [];
  // Exclude mongodb _id from results so it's clean
  return collection
    .find({ city }, { projection: { _id: 0, lastUpdated: 0, firstSeen: 0 } })
    .limit(limit)
    .toArray() as unknown as WebcamDocument[];
}

export async function getWebcams(query: Record<string, unknown>, limit: number = 100): Promise<WebcamDocument[]> {
  if (!collection) return [];
  return collection
    .find(query, { projection: { _id: 0, lastUpdated: 0, firstSeen: 0 } })
    .limit(limit)
    .toArray() as unknown as WebcamDocument[];
}

export async function getWebcamsLastUpdated(city: string) {
  if (!collection) return null;
  const latest = await collection
    .find({ city })
    .sort({ lastUpdated: -1 })
    .limit(1)
    .toArray();
  return latest.length > 0 ? latest[0].lastUpdated : null;
}

export async function getWebcamsLastUpdatedByKey(registryKey: string) {
  if (!collection) return null;
  const latest = await collection
    .find({ registryKey })
    .sort({ lastUpdated: -1 })
    .limit(1)
    .toArray();
  return latest.length > 0 ? latest[0].lastUpdated : null;
}

