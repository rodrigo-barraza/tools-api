// ─── HTTP Client for Prism LLM Gateway ──────────────────────

import CONFIG from "../config.ts";
import logger from "../logger.ts";
import {
  PRISM_CHAT_TIMEOUT_MS,
  PRISM_HEALTH_TIMEOUT_MS,
  PRISM_TTS_TIMEOUT_MS,
  PRISM_STT_TIMEOUT_MS,
} from "../constants.ts";

const PRISM_SERVICE_URL = CONFIG.PRISM_SERVICE_URL;

/**
 * Call Prism's /chat endpoint for text/image generation.
 *

 * @param {string} params.provider - Provider name (e.g. "google", "openai")
 * @param {string} params.model - Model name
 * @param {Array}  params.messages - Messages array

 * @returns {Promise<object>} Parsed JSON response from Prism
 */
export async function chat(params: any) {
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
      throw new Error(`Prism returned ${response.status}: ${errText.slice(0, 200)}`);
    }

    return await response.json();
  } catch (error: any) {
    logger.error(`[PrismService] chat failed: ${error.message}`);
    throw error;
  }
}

/**
 * Check Prism health/connectivity.
 * @returns {Promise<boolean>} true if Prism is reachable
 */
export async function health() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PRISM_HEALTH_TIMEOUT_MS);
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
 *

 * @param {string} params.text - Text to synthesize


 * @returns {Promise<{ audioBase64: string, contentType: string }>}
 */
export async function textToSpeech(params: any) {
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
      throw new Error(`Prism TTS returned ${response.status}: ${errText.slice(0, 200)}`);
    }

    const contentType = response.headers.get("content-type") || "audio/mpeg";
    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString("base64");

    return { audioBase64, contentType };
  } catch (error: any) {
    logger.error(`[PrismService] textToSpeech failed: ${error.message}`);
    throw error;
  }
}

/**
 * Call Prism's /audio-to-text endpoint to transcribe audio.
 *

 * @param {string} params.audio - Base64-encoded audio or data URL


 * @returns {Promise<{ text: string, usage?: object }>}
 */
export async function speechToText(params: any) {
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
      throw new Error(`Prism STT returned ${response.status}: ${errText.slice(0, 200)}`);
    }

    return await response.json();
  } catch (error: any) {
    logger.error(`[PrismService] speechToText failed: ${error.message}`);
    throw error;
  }
}

export default { chat, health, textToSpeech, speechToText };

