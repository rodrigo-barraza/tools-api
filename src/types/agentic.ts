/**
 * Agentic Subsystem TypeScript Definitions
 */

import type { Document, ObjectId } from "mongodb";

// ─── Agent Task Document ────────────────────────────────────────

export interface AgenticTask extends Document {
  _id?: ObjectId;
  project: string;
  taskId: number;
  subject: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string | null;
  conversationId: string | null;
  owner: string | null;
  blocks: number[];
  blockedBy: number[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgenticTaskCreateData {
  subject: string;
  description: string;
  status?: string;
  activeForm?: string | null;
  conversationId?: string | null;
  owner?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AgenticTaskUpdates {
  status?: string;
  subject?: string;
  description?: string;
  activeForm?: string | null;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgenticTaskListOptions {
  status?: string;
  limit?: number;
}

export type SanitizedTask = Omit<AgenticTask, "_id">;

// ─── Agent Datastore Document ───────────────────────────────────

export interface DatastoreRecord extends Document {
  _id?: ObjectId;
  project: string;
  namespace: string;
  key: string | null;
  data: Record<string, unknown>;
  agent: string | null;
  username: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DatastoreProvenance {
  agent?: string | null;
  username?: string | null;
}

export interface DatastoreQueryOptions {
  filter?: unknown;
  sort?: unknown;
  fields?: unknown;
  limit?: unknown;
  skip?: unknown;
  pipeline?: unknown;
}

export interface DatastoreDeleteOptions {
  ids?: unknown;
  filter?: unknown;
  all?: unknown;
}

export interface SanitizedDatastoreRecord {
  id: string | null;
  key: string | null;
  data: Record<string, unknown>;
  agent: string | null;
  username: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Collector Task (FreshnessService) ──────────────────────────

export interface CollectorTask<T = never> {
  label: string;
  collection: string;
  ttl: number;
  delay?: number;
  collectFunction: () => Promise<void>;
  restoreFunction: (data: T) => void;
}

// ─── Browser Script Execution ───────────────────────────────────

export interface ScriptExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  result?: unknown;
}

// ─── Project Summary ────────────────────────────────────────────

export interface DetectedFramework {
  name: string;
  version?: string;
  confidence?: string;
}

// ─── Location Config ────────────────────────────────────────────

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  timezone: string;
  radiusMiles: number;
  tideStationId: string | null;
  tideStationName: string | null;
  tideStationDistanceKm: number | null;
  source: {
    ip: string;
    city: string | null;
    region: string | null;
    country: string | null;
  };
}

export interface LocationDocument extends Document {
  _id: string;
  updatedAt?: Date;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  radiusMiles?: number;
  tideStationId?: string | null;
  tideStationName?: string | null;
  tideStationDistanceKm?: number | null;
  source?: {
    ip?: string;
    city?: string | null;
    region?: string | null;
    country?: string | null;
  };
}

// ─── NOAA Tide Station ──────────────────────────────────────────

export interface TideStation {
  id: string;
  name: string;
  state: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

// ─── Task Counter Document ──────────────────────────────────────

export interface TaskCounterDocument extends Document {
  _id: string;
  seq: number;
}
