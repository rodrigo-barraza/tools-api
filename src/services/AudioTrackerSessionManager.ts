import { randomUUID } from "crypto";
import logger from "../logger.ts";
import type {
  SynthesizerConfig,
  NodeConfig,
  NoteConfig,
  TrackConfig,
  PitchBendConfig,
} from "./SoundSynthesizerService.ts";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface TrackerRow {
  note: string;
  duration: string | number;
  velocity?: number;
  pitchBend?: PitchBendConfig;
}

export interface TrackerChannelEffects {
  reverb?: { wet?: number; decayTime?: number };
  delay?: { delayTime?: number | string; feedback?: number; pingPong?: boolean };
  filter?: { type?: "lowpass" | "highpass" | "bandpass"; cutoff?: number; Q?: number };
  distortion?: { algorithm?: "soft_clip" | "hard_clip" | "bitcrush"; drive?: number; bitDepth?: number };
}

export interface TrackerChannel {
  channelId: string;
  instrument?: string;
  waveform?: "sine" | "triangle" | "sawtooth" | "square" | "noise";
  volume: number;
  effects: TrackerChannelEffects;
  nodes?: Record<string, NodeConfig>;
  nodeChain?: string[];
  pattern: TrackerRow[];
}

export interface TrackerSession {
  sessionId: string;
  tempo: number;
  timeSignature: [number, number];
  sampleRate: number;
  swing: number;
  humanize: number;
  duration?: number;
  channels: TrackerChannel[];
  createdAt: number;
  updatedAt: number;
}

export interface TrackerInitOptions {
  tempo?: number;
  timeSignature?: [number, number];
  sampleRate?: number;
  swing?: number;
  humanize?: number;
  duration?: number;
}

export interface AddChannelOptions {
  channelId: string;
  instrument?: string;
  waveform?: "sine" | "triangle" | "sawtooth" | "square" | "noise";
  volume?: number;
  effects?: TrackerChannelEffects;
  nodes?: Record<string, NodeConfig>;
  nodeChain?: string[];
}

export interface WritePatternOptions {
  sessionId: string;
  channelId: string;
  rows: TrackerRow[];
  startRow?: number;
  append?: boolean;
}

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 60_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;
const MAX_SESSIONS = 100;
const MAX_CHANNELS_PER_SESSION = 16;
const MAX_ROWS_PER_CHANNEL = 512;

// ────────────────────────────────────────────────────────────
// Session Store
// ────────────────────────────────────────────────────────────

const sessionStore = new Map<string, TrackerSession>();
let cleanupIntervalHandle: ReturnType<typeof setInterval> | null = null;

function startCleanupLoop(): void {
  if (cleanupIntervalHandle) return;
  cleanupIntervalHandle = setInterval(() => {
    const now = Date.now();
    let expiredCount = 0;
    for (const [sessionId, session] of sessionStore) {
      if (now - session.updatedAt > SESSION_TTL_MS) {
        sessionStore.delete(sessionId);
        expiredCount++;
      }
    }
    if (expiredCount > 0) {
      logger.info(
        `[AudioTrackerSessionManager] Cleaned up ${expiredCount} expired session(s). Active: ${sessionStore.size}`,
      );
    }
  }, CLEANUP_INTERVAL_MS);
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

export function createTrackerSession(
  options: TrackerInitOptions = {},
): TrackerSession {
  startCleanupLoop();

  if (sessionStore.size >= MAX_SESSIONS) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, session] of sessionStore) {
      if (session.updatedAt < oldestTime) {
        oldestTime = session.updatedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) sessionStore.delete(oldestKey);
  }

  const sessionId = randomUUID();
  const now = Date.now();

  const clampedDuration = options.duration != null
    ? clampNumber(options.duration, 0.1, 60.0)
    : undefined;

  const session: TrackerSession = {
    sessionId,
    tempo: clampNumber(options.tempo ?? 120, 20, 300),
    timeSignature: options.timeSignature ?? [4, 4],
    sampleRate: clampNumber(options.sampleRate ?? 44100, 8000, 48000),
    swing: clampNumber(options.swing ?? 0, 0, 1),
    humanize: clampNumber(options.humanize ?? 0, 0, 1),
    duration: clampedDuration,
    channels: [],
    createdAt: now,
    updatedAt: now,
  };

  sessionStore.set(sessionId, session);

  logger.info(
    `[AudioTrackerSessionManager] Created session ${sessionId} — tempo=${session.tempo} BPM, ` +
    `time=${session.timeSignature.join("/")}`,
  );

  return session;
}

export function getTrackerSession(
  sessionId: string,
): TrackerSession | null {
  return sessionStore.get(sessionId) ?? null;
}

export function addTrackerChannel(
  sessionId: string,
  options: AddChannelOptions,
): { success: boolean; error?: string; channelCount?: number } {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return { success: false, error: `Session '${sessionId}' not found or expired.` };
  }

  if (session.channels.length >= MAX_CHANNELS_PER_SESSION) {
    return {
      success: false,
      error: `Maximum of ${MAX_CHANNELS_PER_SESSION} channels per session reached.`,
    };
  }

  const existingChannel = session.channels.find(
    (channel) => channel.channelId === options.channelId,
  );
  if (existingChannel) {
    return {
      success: false,
      error: `Channel '${options.channelId}' already exists. Use a unique channelId.`,
    };
  }

  const channel: TrackerChannel = {
    channelId: options.channelId,
    instrument: options.instrument,
    waveform: options.waveform,
    volume: clampNumber(options.volume ?? 1.0, 0, 2),
    effects: options.effects ?? {},
    nodes: options.nodes,
    nodeChain: options.nodeChain,
    pattern: [],
  };

  session.channels.push(channel);
  session.updatedAt = Date.now();

  logger.info(
    `[AudioTrackerSessionManager] Added channel '${options.channelId}' to session ${sessionId} — ` +
    `instrument=${options.instrument ?? "custom"}, channels=${session.channels.length}`,
  );

  return { success: true, channelCount: session.channels.length };
}

export function writeTrackerPattern(
  options: WritePatternOptions,
): { success: boolean; error?: string; totalRows?: number; previewNotation?: string } {
  const session = sessionStore.get(options.sessionId);
  if (!session) {
    return { success: false, error: `Session '${options.sessionId}' not found or expired.` };
  }

  const channel = session.channels.find(
    (channel) => channel.channelId === options.channelId,
  );
  if (!channel) {
    return {
      success: false,
      error: `Channel '${options.channelId}' not found. Available: [${session.channels.map((channel) => channel.channelId).join(", ")}]`,
    };
  }

  const shouldAppend = options.append !== false;

  if (shouldAppend) {
    const remainingCapacity = MAX_ROWS_PER_CHANNEL - channel.pattern.length;
    const rowsToAdd = options.rows.slice(0, remainingCapacity);
    channel.pattern.push(...rowsToAdd);
  } else {
    const insertionIndex = options.startRow ?? 0;
    const clampedIndex = Math.max(0, Math.min(insertionIndex, channel.pattern.length));
    const rowsToInsert = options.rows.slice(0, MAX_ROWS_PER_CHANNEL - clampedIndex);
    channel.pattern.splice(clampedIndex, rowsToInsert.length, ...rowsToInsert);
  }

  session.updatedAt = Date.now();

  const previewNotation = channel.pattern
    .slice(0, 16)
    .map((row, index) => {
      const velocityLabel = row.velocity !== undefined
        ? ` v${Math.round(row.velocity * 127)}`
        : "";
      return `${String(index).padStart(2, "0")}| ${row.note}${velocityLabel} [${row.duration}]`;
    })
    .join("\n");

  logger.info(
    `[AudioTrackerSessionManager] Wrote ${options.rows.length} row(s) to channel ` +
    `'${options.channelId}' in session ${options.sessionId} — total=${channel.pattern.length}`,
  );

  return {
    success: true,
    totalRows: channel.pattern.length,
    previewNotation: channel.pattern.length > 16
      ? previewNotation + `\n... (${channel.pattern.length - 16} more rows)`
      : previewNotation,
  };
}

export function deleteTrackerSession(sessionId: string): boolean {
  return sessionStore.delete(sessionId);
}

export function getActiveSessionCount(): number {
  return sessionStore.size;
}

// ────────────────────────────────────────────────────────────
// Conversion — Tracker State → SynthesizerConfig
// ────────────────────────────────────────────────────────────

export function toSynthesizerConfig(
  sessionId: string,
): { config: SynthesizerConfig; error?: string } | { config: null; error: string } {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return { config: null, error: `Session '${sessionId}' not found or expired.` };
  }

  if (session.channels.length === 0) {
    return { config: null, error: "Session has no channels. Add at least one channel before rendering." };
  }

  const hasNonEmptyChannel = session.channels.some(
    (channel) => channel.pattern.length > 0,
  );
  if (!hasNonEmptyChannel) {
    return { config: null, error: "All channels are empty. Write pattern data before rendering." };
  }

  const nodes: Record<string, NodeConfig> = {};
  const tracks: TrackConfig[] = [];

  for (const channel of session.channels) {
    if (channel.pattern.length === 0) continue;

    const channelPrefix = channel.channelId.replace(/[^a-zA-Z0-9_]/g, "_");

    // Build the node chain for this channel
    const channelNodeChain: string[] = [];

    if (channel.nodes && channel.nodeChain) {
      // Advanced mode: user provided custom nodes
      for (const [nodeId, nodeConfig] of Object.entries(channel.nodes)) {
        const qualifiedNodeId = `${channelPrefix}_${nodeId}`;
        nodes[qualifiedNodeId] = { ...nodeConfig };
      }
      channelNodeChain.push(
        ...channel.nodeChain.map((nodeId) => `${channelPrefix}_${nodeId}`),
      );
    } else {
      // Simple mode: auto-build from instrument/waveform + effects
      const oscillatorId = `${channelPrefix}_osc`;
      nodes[oscillatorId] = {
        type: "oscillator",
        waveform: channel.waveform ?? "sine",
      };
      channelNodeChain.push(oscillatorId);

      const envelopeId = `${channelPrefix}_env`;
      if (channel.instrument) {
        nodes[envelopeId] = { type: "envelope", attack: 0.005, decay: 0.3, sustain: 0.4, release: 0.2 };
      } else {
        nodes[envelopeId] = { type: "envelope", attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.15 };
      }
      channelNodeChain.push(envelopeId);

      // Effects chain
      if (channel.effects.filter) {
        const filterId = `${channelPrefix}_filter`;
        nodes[filterId] = {
          type: "biquad_filter",
          filterType: channel.effects.filter.type ?? "lowpass",
          cutoff: channel.effects.filter.cutoff ?? 2000,
          Q: channel.effects.filter.Q ?? 1,
        };
        channelNodeChain.push(filterId);
      }

      if (channel.effects.distortion) {
        const distortionId = `${channelPrefix}_dist`;
        nodes[distortionId] = {
          type: "distortion",
          algorithm: channel.effects.distortion.algorithm ?? "soft_clip",
          drive: channel.effects.distortion.drive ?? 4,
          bitDepth: channel.effects.distortion.bitDepth,
        };
        channelNodeChain.push(distortionId);
      }

      if (channel.effects.delay) {
        const delayId = `${channelPrefix}_delay`;
        nodes[delayId] = {
          type: "delay",
          delayTime: channel.effects.delay.delayTime as number ?? 0.25,
          feedback: channel.effects.delay.feedback ?? 0.3,
          pingPong: channel.effects.delay.pingPong,
        };
        channelNodeChain.push(delayId);
      }

      if (channel.effects.reverb) {
        const reverbId = `${channelPrefix}_reverb`;
        nodes[reverbId] = {
          type: "reverb",
          wet: channel.effects.reverb.wet ?? 0.3,
          decayTime: channel.effects.reverb.decayTime ?? 0.5,
        };
        channelNodeChain.push(reverbId);
      }
    }

    // Convert pattern rows to NoteConfig[]
    const convertedNotes: NoteConfig[] = convertPatternToNotes(
      channel.pattern,
      session.tempo,
      session.timeSignature[0],
    );

    // Auto-repeat: when a target duration is set and the pattern is shorter,
    // calculate how many repetitions are needed to fill the target duration.
    // This is the standard tracker/sequencer behavior — patterns loop.
    let repeatCount: number | undefined;
    if (session.duration && convertedNotes.length > 0) {
      const patternDuration = computePatternDuration(
        convertedNotes,
        session.tempo,
        session.timeSignature[0],
      );
      if (patternDuration > 0 && patternDuration < session.duration) {
        repeatCount = Math.min(
          Math.ceil(session.duration / patternDuration),
          64,
        );
      }
    }

    const track: TrackConfig = {
      nodeChain: channelNodeChain,
      notes: convertedNotes,
      volume: channel.volume,
      ...(repeatCount !== undefined && repeatCount > 1 && { repeat: repeatCount }),
    };

    tracks.push(track);
  }

  const config: SynthesizerConfig = {
    soundType: "modular",
    tempo: session.tempo,
    timeSignature: session.timeSignature,
    sampleRate: session.sampleRate,
    swing: session.swing > 0 ? session.swing : undefined,
    humanize: session.humanize > 0 ? session.humanize : undefined,
    duration: session.duration,
    nodes,
    tracks,
  };

  // When ALL channels use a named instrument preset, set the instrument
  // on the config for the synthesizer engine to resolve the preset chain.
  // For mixed channels, we rely on the per-channel node graphs built above.
  const instrumentChannels = session.channels.filter(
    (channel) => channel.instrument && !channel.nodes,
  );
  if (
    instrumentChannels.length === session.channels.length &&
    instrumentChannels.length === 1
  ) {
    config.instrument = instrumentChannels[0].instrument;
  }

  return { config };
}

// ────────────────────────────────────────────────────────────
// Internal Helpers
// ────────────────────────────────────────────────────────────

function computePatternDuration(
  notes: NoteConfig[],
  _tempo: number,
  _beatsPerBar: number,
): number {
  let maximumEndTime = 0;
  for (const note of notes) {
    const startTime = typeof note.time === "number"
      ? note.time
      : 0;
    const noteDuration = typeof note.duration === "number"
      ? note.duration
      : 0;
    maximumEndTime = Math.max(maximumEndTime, startTime + noteDuration);
  }
  return maximumEndTime;
}

function convertPatternToNotes(
  pattern: TrackerRow[],
  tempo: number,
  beatsPerBar: number,
): NoteConfig[] {
  const notes: NoteConfig[] = [];
  let currentTimeInBeats = 0;
  const secondsPerBeat = 60.0 / tempo;

  for (const row of pattern) {
    const noteString = row.note.toUpperCase();

    if (noteString === "REST" || noteString === "---" || noteString === "SILENCE") {
      const restDuration = resolveDuration(row.duration, secondsPerBeat, beatsPerBar);
      currentTimeInBeats += restDuration / secondsPerBeat;
      continue;
    }

    const noteDuration = resolveDuration(row.duration, secondsPerBeat, beatsPerBar);

    const noteConfig: NoteConfig = {
      time: currentTimeInBeats * secondsPerBeat,
      duration: noteDuration,
      note: row.note,
      velocity: row.velocity,
      pitchBend: row.pitchBend,
    };

    notes.push(noteConfig);
    currentTimeInBeats += noteDuration / secondsPerBeat;
  }

  return notes;
}

function resolveDuration(
  durationValue: string | number,
  secondsPerBeat: number,
  _beatsPerBar: number,
): number {
  if (typeof durationValue === "number") return durationValue;

  // Beat fraction notation: "1/4", "1/8", "1/16", "1/4d" (dotted), "1/8t" (triplet)
  const beatFractionMatch = durationValue.trim().match(/^1\/(\d+)(d|t)?$/i);
  if (beatFractionMatch) {
    const denominator = parseInt(beatFractionMatch[1], 10);
    const modifier = beatFractionMatch[2]?.toLowerCase();
    const wholeNoteDuration = secondsPerBeat * 4.0;
    const baseDuration = wholeNoteDuration / denominator;
    if (modifier === "d") return baseDuration * 1.5;
    if (modifier === "t") return baseDuration * (2.0 / 3.0);
    return baseDuration;
  }

  const parsed = parseFloat(durationValue);
  return isNaN(parsed) ? 0.25 : parsed;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
