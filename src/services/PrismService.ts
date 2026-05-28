// ─── HTTP Client for Prism LLM Gateway ──────────────────────

import CONFIG from "../config.ts";
import logger from "../logger.ts";
import {
  PRISM_CHAT_TIMEOUT_MS,
  PRISM_HEALTH_TIMEOUT_MS,
  PRISM_TTS_TIMEOUT_MS,
  PRISM_STT_TIMEOUT_MS,
} from "../constants.ts";
import { errorMessage } from "../utilities.ts";

const PRISM_SERVICE_URL = CONFIG.PRISM_SERVICE_URL;

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface PrismChatParams {
  project?: string;
  username?: string;
  model?: string;
  messages?: Array<{ role: string; content: string; [key: string]: unknown }>;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface PrismTTSParams {
  provider?: string;
  text: string;
  voice?: string;
  model?: string;
  project?: string;
  username?: string;
}

export interface PrismSTTParams {
  provider?: string;
  audio: string;
  model?: string;
  language?: string;
  project?: string;
  username?: string;
}

export interface TransformedPrismSpeechResult {
  audioBase64: string;
  contentType: string;
}

export interface TransformedPrismChatResult {
  text?: string;
  message?: { role: string; content: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface TransformedPrismSTTResult {
  text: string;
  [key: string]: unknown;
}

/**
 * Call Prism's /chat endpoint for text/image generation.
 */
export async function chat(
  params: PrismChatParams,
): Promise<TransformedPrismChatResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRISM_CHAT_TIMEOUT_MS);

    const response = await fetch(`${PRISM_SERVICE_URL}/chat?stream=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...params,
        project: params.project || "tools-api",
        username: params.username || "system",
        skipConversation: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `Prism returned ${response.status}: ${errText.slice(0, 200)}`,
      );
    }

    return (await response.json()) as TransformedPrismChatResult;
  } catch (error: unknown) {
    logger.error(`[PrismService] chat failed: ${errorMessage(error)}`);
    throw error;
  }
}

/**
 * Check Prism health/connectivity.
 */
export async function health(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PRISM_HEALTH_TIMEOUT_MS,
    );
    const response = await fetch(`${PRISM_SERVICE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Call Prism's /text-to-audio endpoint to generate speech.
 * Collects the streamed binary response into a base64-encoded buffer.
 */
export async function textToSpeech(
  params: PrismTTSParams,
): Promise<TransformedPrismSpeechResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRISM_TTS_TIMEOUT_MS);

    const response = await fetch(`${PRISM_SERVICE_URL}/text-to-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: params.provider || "elevenlabs",
        text: params.text,
        voice: params.voice || undefined,
        model: params.model || undefined,
        skipConversation: true,
        project: params.project || "tools-api",
        username: params.username || "system",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `Prism TTS returned ${response.status}: ${errText.slice(0, 200)}`,
      );
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");

    return { audioBase64, contentType };
  } catch (error: unknown) {
    logger.error(`[PrismService] textToSpeech failed: ${errorMessage(error)}`);
    throw error;
  }
}

/**
 * Call Prism's /audio-to-text endpoint to transcribe audio.
 */
export async function speechToText(
  params: PrismSTTParams,
): Promise<TransformedPrismSTTResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRISM_STT_TIMEOUT_MS);

    const response = await fetch(`${PRISM_SERVICE_URL}/audio-to-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: params.provider || "openai",
        audio: params.audio,
        model: params.model || undefined,
        language: params.language || undefined,
        skipConversation: true,
        project: params.project || "tools-api",
        username: params.username || "system",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `Prism STT returned ${response.status}: ${errText.slice(0, 200)}`,
      );
    }

    return (await response.json()) as TransformedPrismSTTResult;
  } catch (error: unknown) {
    logger.error(`[PrismService] speechToText failed: ${errorMessage(error)}`);
    throw error;
  }
}

/**
 * Fetch global user settings from Prism's /settings endpoint.
 */
export async function getSettings(): Promise<any> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PRISM_HEALTH_TIMEOUT_MS,
    );

    const response = await fetch(`${PRISM_SERVICE_URL}/settings`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Prism returned ${response.status}`);
    }

    return await response.json();
  } catch (error: unknown) {
    logger.error(`[PrismService] getSettings failed: ${errorMessage(error)}`);
    return null;
  }
}

export default { chat, health, textToSpeech, speechToText, getSettings };
