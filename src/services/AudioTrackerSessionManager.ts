import { randomUUID } from "crypto";
import { clamp } from "@rodrigo-barraza/utilities-library";
import logger from "../logger.ts";
import { INSTRUMENT_PRESETS } from "./SoundSynthesizerService.ts";
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
  velocity?: number;
  pitchBend?: PitchBendConfig;
}

export interface TrackerInputRow {
  note: string;
  velocity?: number;
  /** Grid steps (1-64) or a beat fraction like "1/4"; defaults to 1 step */
  duration?: number | string;
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
  linesPerBeat: number;
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
  linesPerBeat?: number;
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
  rows: TrackerInputRow[];
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
    ? clamp(options.duration, 0.1, 60.0)
    : undefined;

  const session: TrackerSession = {
    sessionId,
    tempo: clamp(options.tempo ?? 120, 20, 300),
    timeSignature: options.timeSignature ?? [4, 4],
    linesPerBeat: clamp(options.linesPerBeat ?? 4, 1, 16),
    sampleRate: clamp(options.sampleRate ?? 44100, 8000, 48000),
    swing: clamp(options.swing ?? 0, 0, 1),
    humanize: clamp(options.humanize ?? 0, 0, 1),
    duration: clampedDuration,
    channels: [],
    createdAt: now,
    updatedAt: now,
  };

  sessionStore.set(sessionId, session);

  logger.info(
    `[AudioTrackerSessionManager] Created session ${sessionId} — tempo=${session.tempo} BPM, ` +
    `time=${session.timeSignature.join("/")}, LPB=${session.linesPerBeat}`,
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
    volume: clamp(options.volume ?? 1.0, 0, 2),
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

  const expansionResult = expandDurationRows(options.rows, session.linesPerBeat);
  if ("error" in expansionResult) {
    return { success: false, error: expansionResult.error };
  }
  const expandedRows = expansionResult.rows;
  const shouldAppend = options.append !== false;

  if (shouldAppend) {
    const remainingCapacity = MAX_ROWS_PER_CHANNEL - channel.pattern.length;
    const rowsToAdd = expandedRows.slice(0, remainingCapacity);
    channel.pattern.push(...rowsToAdd);
  } else {
    const insertionIndex = options.startRow ?? 0;
    const clampedIndex = Math.max(0, Math.min(insertionIndex, channel.pattern.length));
    const rowsToInsert = expandedRows.slice(0, MAX_ROWS_PER_CHANNEL - clampedIndex);
    channel.pattern.splice(clampedIndex, rowsToInsert.length, ...rowsToInsert);
  }

  session.updatedAt = Date.now();

  const previewNotation = channel.pattern
    .slice(0, 16)
    .map((row, index) => {
      const velocityLabel = row.velocity !== undefined
        ? ` v${Math.round(row.velocity * 127)}`
        : "";
      return `${String(index).padStart(2, "0")}| ${row.note}${velocityLabel}`;
    })
    .join("\n");

  logger.info(
    `[AudioTrackerSessionManager] Wrote ${options.rows.length} row(s) (${expandedRows.length} expanded) to channel ` +
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

/**
 * Length in seconds of the pattern content actually written to the session
 * (longest channel × row duration). Unlike a rendered preview, this is not
 * inflated by auto-repeat looping — it's the number an agent needs when
 * deciding whether to write more rows to reach a target duration.
 */
export function getAuthoredDurationSeconds(session: TrackerSession): number {
  const rowDuration = 60.0 / session.tempo / session.linesPerBeat;
  const longestChannelRows = session.channels.reduce(
    (max, channel) => Math.max(max, channel.pattern.length),
    0,
  );
  return longestChannelRows * rowDuration;
}

// ────────────────────────────────────────────────────────────
// Conversion — Tracker State → SynthesizerConfig
// ────────────────────────────────────────────────────────────

export function toSynthesizerConfig(
  sessionId: string,
  options: { forPreview?: boolean } = {},
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
    } else if (patternHasDrumTriggers(channel.pattern)) {
      // Drum mode: drum triggers (KICK/SNARE/HAT) must be synthesized by a
      // drum_synth node — an oscillator would render them as a flat tone.
      // DrumSynthNode shapes its own amplitude, so no envelope is needed.
      const drumId = `${channelPrefix}_drums`;
      nodes[drumId] = { type: "drum_synth" };
      channelNodeChain.push(drumId);
    } else {
      // Simple mode: auto-build from instrument/waveform + effects.
      // Instrument presets map their waveform + ADSR onto the node graph
      // (harmonics/FM/LFO have no modular node equivalent).
      const instrumentPreset = channel.instrument
        ? INSTRUMENT_PRESETS[channel.instrument]
        : undefined;

      const oscillatorId = `${channelPrefix}_osc`;
      nodes[oscillatorId] = {
        type: "oscillator",
        waveform: channel.waveform ?? instrumentPreset?.waveform ?? "sine",
      };
      channelNodeChain.push(oscillatorId);

      const envelopeId = `${channelPrefix}_env`;
      nodes[envelopeId] = instrumentPreset
        ? { type: "envelope", ...instrumentPreset.envelope }
        : { type: "envelope", attack: 0.005, decay: 0.2, sustain: 0.5, release: 0.15 };
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
      session.linesPerBeat,
    );

    // Auto-repeat: when a target duration is set and the pattern is shorter,
    // calculate how many repetitions are needed to fill the target duration
    // (the final render trims back to the exact target). This is the standard
    // tracker/sequencer behavior — patterns loop. Previews skip the looping
    // and play only what's actually been written.
    let repeatCount: number | undefined;
    if (!options.forPreview && session.duration && convertedNotes.length > 0) {
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
    duration: options.forPreview ? undefined : session.duration,
    nodes,
    tracks,
  };

  return { config };
}

// ────────────────────────────────────────────────────────────
// Internal Helpers
// ────────────────────────────────────────────────────────────

// Step-grid symbols
const NOTE_OFF_SYMBOLS = new Set(["===", "OFF", "KEY_OFF"]);
const EMPTY_SYMBOLS = new Set(["---", "...", ""]);
const SILENCE_SYMBOLS = new Set(["REST", "SILENCE"]);
const DRUM_TRIGGER_SYMBOLS = new Set(["KICK", "SNARE", "HAT", "HIHAT"]);

function patternHasDrumTriggers(pattern: TrackerRow[]): boolean {
  return pattern.some((row) =>
    DRUM_TRIGGER_SYMBOLS.has(row.note.toUpperCase().trim()),
  );
}



/**
 * Resolves a row duration into a whole number of grid steps.
 *
 * Accepted forms:
 *   - number (or numeric string): step count, e.g. 4 = four grid rows
 *   - beat fraction string: "1/4" (quarter note), "1/8", "1/2", with
 *     optional dotted ("1/4d") or triplet ("1/4t") modifiers — converted
 *     to steps via linesPerBeat (one beat = linesPerBeat rows)
 *
 * Returns null when the value can't be interpreted.
 */
export function resolveDurationSteps(
  duration: number | string,
  linesPerBeat: number,
): number | null {
  if (typeof duration === "number") {
    if (!Number.isFinite(duration) || duration <= 0) return null;
    return Math.max(1, Math.min(Math.round(duration), 64));
  }

  const trimmed = String(duration).trim();
  const beatFractionMatch = trimmed.match(/^(\d+)\/(\d+)(d|t)?$/i);
  if (beatFractionMatch) {
    const numerator = parseInt(beatFractionMatch[1], 10);
    const denominator = parseInt(beatFractionMatch[2], 10);
    if (denominator <= 0 || numerator <= 0) return null;
    const modifier = beatFractionMatch[3]?.toLowerCase();
    // A whole note = 4 beats, so "1/4" = 1 beat = linesPerBeat steps
    let beats = (numerator * 4) / denominator;
    if (modifier === "d") beats *= 1.5;
    if (modifier === "t") beats *= 2 / 3;
    return Math.max(1, Math.min(Math.round(beats * linesPerBeat), 64));
  }

  const parsed = Number(trimmed);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(1, Math.min(Math.round(parsed), 64));
  }

  return null;
}

/**
 * Expands input rows that carry a required `duration` field into the
 * internal tracker grid representation. A row resolving to N steps becomes:
 *   1) the note-trigger row (with duration stripped)
 *   2) N-1 sustain rows (`---`)
 *
 * Step counts are clamped to [1, 64] to prevent degenerate expansions.
 */
function expandDurationRows(
  inputRows: TrackerInputRow[],
  linesPerBeat: number,
): { rows: TrackerRow[] } | { error: string } {
  const expandedRows: TrackerRow[] = [];

  for (let rowIndex = 0; rowIndex < inputRows.length; rowIndex++) {
    const row = inputRows[rowIndex];
    const stepCount = resolveDurationSteps(row.duration ?? 1, linesPerBeat);
    if (stepCount === null) {
      return {
        error:
          `Row ${rowIndex} has invalid duration '${row.duration}'. ` +
          `Use a whole number of grid steps (1-64) or a beat fraction ` +
          `like '1/4' (quarter note), '1/8', '1/4d' (dotted), '1/4t' (triplet).`,
      };
    }

    const { duration: _discardedDuration, ...triggerRow } = row;
    expandedRows.push(triggerRow);

    for (let sustainIndex = 1; sustainIndex < stepCount; sustainIndex++) {
      expandedRows.push({ note: "---" });
    }
  }

  return { rows: expandedRows };
}

function computePatternDuration(
  notes: NoteConfig[],
  _tempo: number,
  _linesPerBeat: number,
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

/**
 * Step-based pattern-to-notes converter.
 *
 * Each row occupies a fixed time slot: `rowDuration = 60 / tempo / linesPerBeat`.
 * A note plays from its row index until the next note trigger, note-off (`===`/`OFF`),
 * rest/silence, or end of pattern. Empty rows (`---`/`...`) sustain the previous note.
 */
function convertPatternToNotes(
  pattern: TrackerRow[],
  tempo: number,
  linesPerBeat: number,
): NoteConfig[] {
  const notes: NoteConfig[] = [];
  const rowDuration = 60.0 / tempo / linesPerBeat;

  for (let rowIndex = 0; rowIndex < pattern.length; rowIndex++) {
    const row = pattern[rowIndex];
    const noteString = row.note.toUpperCase().trim();

    // Skip empty/sustain rows — they just extend the previous note
    if (EMPTY_SYMBOLS.has(noteString)) continue;

    // Note-off and silence rows don't produce NoteConfig entries —
    // they only terminate the previous note (handled by look-ahead below)
    if (NOTE_OFF_SYMBOLS.has(noteString) || SILENCE_SYMBOLS.has(noteString)) continue;

    // This is a note trigger — calculate its duration via look-ahead
    const stepsUntilEnd = lookAheadForNoteEnd(pattern, rowIndex);
    const noteDuration = stepsUntilEnd * rowDuration;

    const noteConfig: NoteConfig = {
      time: rowIndex * rowDuration,
      duration: noteDuration,
      note: row.note,
      velocity: row.velocity,
      pitchBend: row.pitchBend,
    };

    notes.push(noteConfig);
  }

  return notes;
}

/**
 * Scans ahead from a note trigger to determine how many steps it should ring for.
 * Returns the number of rows (including the trigger row itself) before the note is
 * terminated by: another note trigger, a note-off (`===`/`OFF`), a rest/silence, or
 * the end of the pattern.
 */
function lookAheadForNoteEnd(
  pattern: TrackerRow[],
  triggerIndex: number,
): number {
  let steps = 1;

  for (let nextIndex = triggerIndex + 1; nextIndex < pattern.length; nextIndex++) {
    const nextNoteString = pattern[nextIndex].note.toUpperCase().trim();

    // Empty/sustain rows extend the note
    if (EMPTY_SYMBOLS.has(nextNoteString)) {
      steps++;
      continue;
    }

    // Anything else (note trigger, note-off, rest/silence) terminates the note
    break;
  }

  return steps;
}
