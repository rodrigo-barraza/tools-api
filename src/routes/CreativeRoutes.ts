import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { IDENTITY_HEADERS } from "@rodrigo-barraza/utilities-library/taxonomy";
import PromptLocaleService from "../services/PromptLocaleService.ts";
// ─── Image Generation & Vision ──────────────────────────────

import { Request, Response, Router } from "express";
import PrismService from "../services/PrismService.ts";
import { generateAudioWav, INSTRUMENT_PRESETS } from "../services/SoundSynthesizerService.ts";
import { validateSynthesizerInput } from "../services/SoundSynthesizerValidation.ts";
import { processAudio, getAvailablePresets } from "../services/AudioRemixService.ts";
import { validateAudioRemixInput } from "../services/AudioRemixValidation.ts";
import {
  createTrackerSession,
  getTrackerSession,
  addTrackerChannel,
  writeTrackerPattern,
  toSynthesizerConfig,
  deleteTrackerSession,
  getActiveSessionCount,
  getAuthoredDurationSeconds,
} from "../services/AudioTrackerSessionManager.ts";
import {
  validateVectorAnimationInput,
  normalizeEasing,
  findKeyframeBeyondDuration,
  type VectorLayer as VectorLayerInput,
} from "../services/VectorAnimationValidation.ts";
import { synthesizeSpeech, getSupportedVoices, isEspeakAvailable } from "../services/TextToSpeechService.ts";
import logger from "../logger.ts";
import { extractCallerContext, errorMessage, buildDisplay, buildLocalUrl, buildEmbedHtml, escapeHtml, sanitizeCssColor, toEmbedScriptJson } from "../utilities.ts";
import { saveVectorAnimation, getVectorAnimation, type VectorAnimationConfig, type VectorAnimationOptions } from "../models/VectorAnimation.ts";
import crypto from "node:crypto";
import CONFIG from "../config.ts";
import {
  buildEngineEmbedScript,
  type VectorLayer,
  type Keyframe,
} from "../utilities/VectorAnimationEngine.ts";
import {
  queryEmojiCombination,
  queryEmojiCombinations,
  getEmojiKitchenHealth,
} from "../caches/EmojiKitchenCache.ts";

const router = Router();

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

/**
 * Retrieve user's custom settings from the LLM Gateway, with fallbacks to defaults.
 */
async function getCreativeSettings() {
  try {
    const settings = await PrismService.getSettings();
    const creative = (settings?.creative ?? {}) as Record<string, string | undefined>;
    return {
      imageProvider: creative.imageProvider || "google",
      imageModel:
        creative.imageModel ||
        CONFIG.TOOLS_IMAGE_MODEL ||
        "gemini-3-pro-image-preview",
      visionProvider: creative.visionProvider || "google",
      visionModel:
        creative.visionModel || CONFIG.TOOLS_VISION_MODEL || "gemini-3.5-flash",
      textToSpeechProvider: creative.textToSpeechProvider || "elevenlabs",
      textToSpeechModel: creative.textToSpeechModel || "",
      speechToTextProvider: creative.speechToTextProvider || "openai",
      speechToTextModel: creative.speechToTextModel || "",
    };
  } catch (error: unknown) {
    logger.warn(
      `[CreativeRoutes] Failed to fetch settings from Prism, falling back to defaults: ${errorMessage(error)}`,
    );
    return {
      imageProvider: "google",
      imageModel: CONFIG.TOOLS_IMAGE_MODEL || "gemini-3-pro-image-preview",
      visionProvider: "google",
      visionModel: CONFIG.TOOLS_VISION_MODEL || "gemini-3.5-flash",
      textToSpeechProvider: "elevenlabs",
      textToSpeechModel: "",
      speechToTextProvider: "openai",
      speechToTextModel: "",
    };
  }
}

const MAX_SAFETY_RETRIES = 3;

// ────────────────────────────────────────────────────────────
// Prompt Softening — graceful degradation for content safety
// ────────────────────────────────────────────────────────────
// Progressive substitutions applied cumulatively on each retry.
// Tier 2 includes tier 1 changes, tier 3 includes both, etc.
// The visual intent is preserved while problematic descriptors
// are replaced with policy-compliant creative alternatives.
// ────────────────────────────────────────────────────────────

const SAFETY_SOFTENING_TIERS: [RegExp, string][][] = [
  // ── Tier 1: Direct substitutions (nudity → clothing, violence → calm) ──
  [
    [/\bnaked\b/gi, "wearing flowing silk robes"],
    [/\bnude\b/gi, "draped in elegant fabric"],
    [/\bnudity\b/gi, "draped in flowing garments"],
    [/\btopless\b/gi, "in a strapless gown"],
    [/\bshirtless\b/gi, "in an open-collar shirt"],
    [/\bbare[\s-]?chest(ed)?\b/gi, "in a loosely unbuttoned shirt"],
    [/\bundress(ed|ing)?\b/gi, "in minimal elegant attire"],
    [/\bstrip(ping|ped)?\b/gi, "adjusting flowing robes"],
    [
      /\bexposed\s+(skin|body|flesh)\b/gi,
      "visible silhouette through sheer fabric",
    ],
    [/\bseductive\b/gi, "alluring"],
    [/\bsexual(ly)?\b/gi, "romantically"],
    [/\bsensual\b/gi, "graceful"],
    [/\berotic\b/gi, "romantic"],
    [/\bprovocative\b/gi, "striking"],
    [/\bintimate\b/gi, "tender"],
    [/\blingerie\b/gi, "elegant nightwear"],
    [/\bunderwear\b/gi, "loungewear"],
    [/\bbikini\b/gi, "summer outfit"],
    [/\bskimpy\b/gi, "lightweight"],
    [/\bskin[\s-]?tight\b/gi, "form-fitting"],
    [/\bcleavage\b/gi, "neckline"],
    [/\bblood(y|ied)?\b/gi, "red-stained"],
    [/\bgore\b/gi, "aftermath"],
    [/\bviolent(ly)?\b/gi, "intense"],
    [/\bviolence\b/gi, "conflict"],
    [/\bkill(ing|ed|s)?\b/gi, "defeating"],
    [/\bmurder(ed|ing|s|ous)?\b/gi, "confronting"],
    [/\bdead\s+body\b/gi, "fallen figure"],
    [/\bcorpse\b/gi, "fallen figure"],
    [/\bweapon\b/gi, "tool"],
    [/\bgun\b/gi, "device"],
    [/\bdrunk(en)?\b/gi, "carefree"],
    [/\bsmoking\b/gi, "holding an ornate pipe"],
    [/\bdrug(s|ged)?\b/gi, "potion"],
  ],
  // ── Tier 2: Broader softening + artistic framing ──
  [
    [/\bbody\b/gi, "figure"],
    [/\bflesh\b/gi, "form"],
    [/\bskin\b/gi, "complexion"],
    [/\bcurves\b/gi, "silhouette"],
    [/\bcurvy\b/gi, "statuesque"],
    [/\btight\b/gi, "fitted"],
    [/\bsweat(y|ing)?\b/gi, "glistening"],
    [/\bwet\b/gi, "rain-kissed"],
    [/\bfight(ing|s)?\b/gi, "sparring"],
    [/\bstab(bing|bed)?\b/gi, "striking"],
    [/\battack(ing|ed|s)?\b/gi, "charging at"],
    [/\bdestroy(ing|ed|s)?\b/gi, "transforming"],
    [/\bexplod(e|ing|ed|es)\b/gi, "erupting with energy"],
    [/\bfire\b/gi, "golden light"],
    [/\bburning\b/gi, "glowing warmly"],
  ],
  // ── Tier 3: Nuclear option — wrap in fine-art framing ──
  [
    [/^/i, "A tasteful Renaissance-style oil painting depicting: "],
    [/\b(sexy|hot)\b/gi, "beautiful"],
    [/\b(ass|butt|buttocks)\b/gi, "figure from behind"],
    [/\bbreasts?\b/gi, "torso"],
    [/\bthigh(s)?\b/gi, "lower silhouette"],
    [/\bwaist\b/gi, "midsection"],
    [/\bhips?\b/gi, "form"],
    [/\bbed(room)?\b/gi, "chamber"],
    [/\bshower\b/gi, "waterfall scene"],
    [/\bbath(ing|e)?\b/gi, "near a serene pool"],
  ],
];

/**
 * Apply cumulative softening tiers to a prompt string.


 */
function softenPrompt(prompt: string, tier: number) {
  let softened = prompt;
  for (
    let tierIndex = 0;
    tierIndex <= tier && tierIndex < SAFETY_SOFTENING_TIERS.length;
    tierIndex++
  ) {
    for (const [pattern, replacement] of SAFETY_SOFTENING_TIERS[tierIndex]) {
      softened = softened.replace(pattern, replacement);
    }
  }
  return softened;
}

// ────────────────────────────────────────────────────────────
// Vision dedup cache — prevents duplicate describe calls
// within the same request context.
// ────────────────────────────────────────────────────────────

const visionCache = new Map();
const VISION_CACHE_TTL_MS = 5 * 60 * 1000;

// ────────────────────────────────────────────────────────────
// POST /creative/generate-image
// ────────────────────────────────────────────────────────────

router.post(
  "/generate-image",
  asyncHandler(async (req: Request, res: Response) => {
    const { prompt, referenceImages } = req.body;

    if (!prompt) {
      return res
        .status(400)
        .json({ error: "Missing required parameter: prompt" });
    }

    // Extract caller context from headers for Prism attribution
    const {
      project: callerProject,
      username: callerUsername,
      agent: callerAgent,
      traceId: callerTraceId,
    } = extractCallerContext(req);

    try {
      const creativeSettings = await getCreativeSettings();
      let currentPrompt = prompt;
      let result:
        | {
            text?: string;
            images?: { data: string; mimeType?: string }[];
            safetyBlock?: boolean;
          }
        | undefined;
      let safetyRetries = 0;

      for (let attempt = 0; attempt <= MAX_SAFETY_RETRIES; attempt++) {
        const messages = [
          {
            role: "user",
            content: currentPrompt,
            ...(referenceImages?.length > 0 && { images: referenceImages }),
          },
        ];

        // When reference images are present, instruct the image model to
        // preserve and edit them rather than re-imagining from scratch.
        const systemPrompt =
          referenceImages?.length > 0
            ? PromptLocaleService.get("en", "prompts.creative.image.editing-system-prompt")
            : undefined;

        try {
          result = await PrismService.chat({
            provider: creativeSettings.imageProvider,
            model: creativeSettings.imageModel,
            messages,
            forceImageGeneration: true,
            project: callerProject,
            username: callerUsername,
            agent: callerAgent,
            traceId: callerTraceId,
            skipConversation: true,
            ...(systemPrompt && { systemPrompt }),
          });
        } catch (error: unknown) {
          logger.error(
            `[CreativeRoutes] Prism chat failed: ${errorMessage(error)}`,
          );
          return res.status(502).json({
            error: `Image generation failed: ${errorMessage(error)}`,
          });
        }

        // Success — we got an image
        if (!result.safetyBlock && (result.images?.length ?? 0) > 0) {
          break;
        }

        // Safety block — can we retry with a softer prompt?
        if (attempt < MAX_SAFETY_RETRIES) {
          safetyRetries++;
          const previousPrompt = currentPrompt;
          currentPrompt = softenPrompt(prompt, attempt);

          // If softening didn't change anything, no point retrying
          if (currentPrompt === previousPrompt) {
            logger.warn(
              `[CreativeRoutes] generate-image: safety softening had no effect at tier ${attempt + 1}, stopping retries`,
            );
            break;
          }

          logger.info(
            `[CreativeRoutes] generate-image: safety block on attempt ${attempt + 1}, ` +
              `retrying with softened prompt (tier ${attempt + 1}): "${currentPrompt.slice(0, 100)}…"`,
          );
        }
      }

      // All attempts exhausted — still blocked
      if (!result || result.safetyBlock) {
        return res.status(422).json({
          success: false,
          error: PromptLocaleService.get("en", "prompts.creative.image.safety-block-error", {
            attemptCount: String(safetyRetries + 1),
          }),
        });
      }

      // No image in response (model returned text instead)
      if (!result.images || result.images.length === 0) {
        return res.status(422).json({
          success: false,
          error: PromptLocaleService.get("en", "prompts.creative.image.no-image-error"),
        });
      }

      const image = result.images[0];

      // Build the result message — note if prompt was softened
      const resultMessage =
        safetyRetries > 0
          ? PromptLocaleService.get("en", "prompts.creative.image.result-softened")
          : PromptLocaleService.get("en", "prompts.creative.image.result-success");

      res.json({
        success: true,
        message: resultMessage,
        description: result.text || null,
        image: {
          data: image.data,
          mimeType: image.mimeType || "image/png",
        },
        ...(safetyRetries > 0 && {
          safetyRetries,
          softenedPrompt: currentPrompt.slice(0, 200),
        }),
      });
    } catch (error: unknown) {
      logger.error(
        `[CreativeRoutes] generate-image failed: ${errorMessage(error)}`,
      );
      res
        .status(500)
        .json({ error: `Image generation failed: ${errorMessage(error)}` });
    }
  }),
);

// ────────────────────────────────────────────────────────────
// POST /creative/describe-image
// ────────────────────────────────────────────────────────────

router.post(
  "/describe-image",
  asyncHandler(async (req: Request, res: Response) => {
    const { imageUrls, context = "general" } = req.body;

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return res.status(400).json({
        error: "Missing required parameter: imageUrls (array of URLs)",
      });
    }

    // Extract caller context from headers for Prism attribution
    const {
      project: callerProject,
      username: callerUsername,
      agent: callerAgent,
      traceId: callerTraceId,
    } = extractCallerContext(req);

    // Tailor the prompt based on image context
    const prompts: Record<string, string> = {
      avatar: PromptLocaleService.get("en", "prompts.creative.describe.avatar"),
      banner: PromptLocaleService.get("en", "prompts.creative.describe.banner"),
      photo: PromptLocaleService.get("en", "prompts.creative.describe.photo"),
      general: PromptLocaleService.get("en", "prompts.creative.describe.general"),
    };
    const visionPrompt = prompts[context] || prompts.general;

    try {
      const creativeSettings = await getCreativeSettings();
      const descriptions: unknown[] = [];

      // Per-request dedup cache keyed by X-Request-Id header
      const requestId = req.headers[IDENTITY_HEADERS.requestId] || "default";
      if (!visionCache.has(requestId)) {
        visionCache.set(requestId, new Map());
        setTimeout(() => visionCache.delete(requestId), VISION_CACHE_TTL_MS);
      }
      const urlCache = visionCache.get(requestId);

      // Deduplicate URLs within this call
      const uniqueUrls = [...new Set(imageUrls)];

      for (const url of uniqueUrls) {
        // Singleflight: if a request for this URL is already in-flight,
        // await it instead of firing a duplicate.
        if (urlCache.has(url)) {
          const cached = await urlCache.get(url);
          descriptions.push({ url, description: cached });
          logger.info(
            `[CreativeRoutes] describe-image: cache hit for ${url.slice(0, 60)}…`,
          );
          continue;
        }

        // Store the promise IMMEDIATELY so parallel calls can await it
        const descriptionPromise = (async () => {
          try {
            const result = await PrismService.chat({
              provider: creativeSettings.visionProvider,
              model: creativeSettings.visionModel,
              messages: [
                { role: "user", content: visionPrompt, images: [url] },
              ],
              project: callerProject,
              username: callerUsername,
              agent: callerAgent,
              traceId: callerTraceId,
              skipConversation: true,
            });

            return result.text || "Unable to describe this image.";
          } catch (error: unknown) {
            logger.error(
              `[CreativeRoutes] describe-image vision call failed: ${errorMessage(error)}`,
            );
            return `Failed to describe image: ${errorMessage(error)}`;
          }
        })();

        urlCache.set(url, descriptionPromise);

        const text = await descriptionPromise;
        descriptions.push({ url, description: text });
      }

      logger.info(
        `[CreativeRoutes] describe-image: described ${descriptions.length} image(s), context=${context}`,
      );

      res.json({
        success: true,
        descriptions,
      });
    } catch (error: unknown) {
      logger.error(
        `[CreativeRoutes] describe-image failed: ${errorMessage(error)}`,
      );
      res
        .status(500)
        .json({ error: `Image description failed: ${errorMessage(error)}` });
    }
  }),
);

// ────────────────────────────────────────────────────────────
// POST /creative/text-to-speech
// ────────────────────────────────────────────────────────────

router.post(
  "/text-to-speech",
  asyncHandler(async (req: Request, res: Response) => {
    const { text, voice, provider, model } = req.body;

    if (!text) {
      return res
        .status(400)
        .json({ error: "Missing required parameter: text" });
    }

    const { project: callerProject, username: callerUsername } =
      extractCallerContext(req);

    try {
      const creativeSettings = await getCreativeSettings();
      const resolvedProvider =
        provider || creativeSettings.textToSpeechProvider;
      const resolvedModel =
        model || creativeSettings.textToSpeechModel || undefined;

      const result = await PrismService.textToSpeech({
        text,
        voice,
        provider: resolvedProvider,
        model: resolvedModel,
        project: callerProject,
        username: callerUsername,
      });

      res.json({
        success: true,
        message: PromptLocaleService.get("en", "prompts.creative.audio.result-success"),
        audio: {
          data: result.audioBase64,
          mimeType: result.contentType,
        },
        textLength: text.length,
      });
    } catch (error: unknown) {
      logger.error(
        `[CreativeRoutes] text-to-speech failed: ${errorMessage(error)}`,
      );
      res
        .status(500)
        .json({ error: `Text-to-speech failed: ${errorMessage(error)}` });
    }
  }),
);

// ────────────────────────────────────────────────────────────
// POST /creative/local-text-to-speech
// Local espeak-ng based TTS — no AI models, zero cost
// ────────────────────────────────────────────────────────────

router.post(
  "/local-text-to-speech",
  asyncHandler(async (req: Request, res: Response) => {
    const { text, voice, speed, pitch, volume, wordGap } = req.body;

    if (!text) {
      return res
        .status(400)
        .json({ error: "Missing required parameter: text" });
    }

    if (voice) {
      const supportedVoicesList = getSupportedVoices();
      if (!supportedVoicesList[voice]) {
        return res.status(400).json({
          error: `Invalid voice '${voice}'. Supported voices: ${Object.keys(supportedVoicesList).join(", ")}`,
        });
      }
    }

    try {
      const result = await synthesizeSpeech({
        text,
        voice,
        speed: speed != null ? Number(speed) : undefined,
        pitch: pitch != null ? Number(pitch) : undefined,
        volume: volume != null ? Number(volume) : undefined,
        wordGap: wordGap != null ? Number(wordGap) : undefined,
      });

      res.json({
        success: true,
        message: PromptLocaleService.get("en", "prompts.creative.audio.result-local-tts"),
        audio: {
          data: result.audioBase64,
          mimeType: result.mimeType,
        },
        voice: result.voice,
        textLength: result.textLength,
        durationEstimate: result.durationEstimateSeconds,
      });
    } catch (error: unknown) {
      logger.error(
        `[CreativeRoutes] local-text-to-speech failed: ${errorMessage(error)}`,
      );
      res
        .status(500)
        .json({ error: `Local text-to-speech failed: ${errorMessage(error)}` });
    }
  }),
);

router.get(
  "/local-text-to-speech/voices",
  asyncHandler(async (_req: Request, res: Response) => {
    const isAvailable = await isEspeakAvailable();
    res.json({
      success: true,
      available: isAvailable,
      voices: getSupportedVoices(),
    });
  }),
);

// ────────────────────────────────────────────────────────────
// POST /creative/speech-to-text
// ────────────────────────────────────────────────────────────

router.post(
  "/speech-to-text",
  asyncHandler(async (req: Request, res: Response) => {
    const { audioUrl, audio, provider, model, language } = req.body;

    // Accept either a URL (we fetch it) or raw base64 audio
    let audioData = audio;
    if (!audioData && audioUrl) {
      try {
        const response = await fetch(audioUrl);
        if (!response.ok) {
          return res.status(400).json({
            error: `Failed to fetch audio from URL: ${response.status}`,
          });
        }
        const buffer = await response.arrayBuffer();
        const mimeType = response.headers.get("content-type") || "audio/mpeg";
        audioData = `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;
      } catch (error: unknown) {
        return res
          .status(400)
          .json({ error: `Failed to fetch audio URL: ${errorMessage(error)}` });
      }
    }

    if (!audioData) {
      return res.status(400).json({
        error:
          "Missing required parameter: 'audio' (base64) or 'audioUrl' (URL to audio file)",
      });
    }

    const { project: callerProject, username: callerUsername } =
      extractCallerContext(req);

    try {
      const creativeSettings = await getCreativeSettings();
      const resolvedProvider =
        provider || creativeSettings.speechToTextProvider;
      const resolvedModel =
        model || creativeSettings.speechToTextModel || undefined;

      const result = await PrismService.speechToText({
        audio: audioData,
        provider: resolvedProvider,
        model: resolvedModel,
        language,
        project: callerProject,
        username: callerUsername,
      });

      res.json({
        success: true,
        text: result.text,
        usage: result.usage || {},
      });
    } catch (error: unknown) {
      logger.error(
        `[CreativeRoutes] speech-to-text failed: ${errorMessage(error)}`,
      );
      res
        .status(500)
        .json({ error: `Speech-to-text failed: ${errorMessage(error)}` });
    }
  }),
);

// ────────────────────────────────────────────────────────────
// POST /creative/generate-audio
// ────────────────────────────────────────────────────────────

router.post(
  "/generate-audio",
  asyncHandler(async (req: Request, res: Response) => {
    const { action } = req.body;

    // ── Tracker Sequencer Workflow ─────────────────────────────
    // generate_audio is tracker-only: init → add_channel →
    // write_pattern → render. Each action is a small incremental
    // step, and every step auto-renders a live audio preview of
    // the content written so far.

    const VALID_ACTIONS = ["init", "add_channel", "write_pattern", "render"];
    if (!action || !VALID_ACTIONS.includes(action)) {
      return res.status(400).json({
        error:
          `Missing or invalid 'action' (got: ${JSON.stringify(action ?? null)}). ` +
          `generate_audio uses the tracker workflow: 1) action "init" creates a session ` +
          `(tempo, timeSignature, linesPerBeat, duration), 2) "add_channel" once per ` +
          `instrument, 3) "write_pattern" writes note rows to a channel, 4) "render" ` +
          `produces the final audio. Valid actions: ${VALID_ACTIONS.join(", ")}.`,
      });
    }

    // Shared helper: resolve and validate the sessionId parameter.
    const requireSession = (
      sessionId: unknown,
    ):
      | { session: NonNullable<ReturnType<typeof getTrackerSession>> }
      | { errorStatus: number; error: string } => {
      if (!sessionId || sessionId === "null" || sessionId === "undefined") {
        return {
          errorStatus: 400,
          error:
            `Missing or invalid sessionId (got: ${JSON.stringify(sessionId ?? null)}). ` +
            `Pass the exact sessionId returned by action: "init". If you no longer ` +
            `have it, call action: "init" again to start a new session.`,
        };
      }
      const session = getTrackerSession(String(sessionId));
      if (!session) {
        return {
          errorStatus: 400,
          error:
            `Session '${sessionId}' not found or expired (sessions expire after 30 ` +
            `minutes of inactivity). Call action: "init" again and rebuild the ` +
            `channels and patterns with the new sessionId.`,
        };
      }
      return { session };
    };

    // Shared helper: attempt to render a preview of the content written so
    // far. Previews are NOT looped or padded to the target duration — they
    // play exactly what has been authored. Returns null if nothing is
    // renderable yet.
    const tryRenderPreview = (sessionId: string): {
      audio: { data: string; mimeType: string };
      duration: number;
      sampleCount: number;
    } | null => {
      const conversionResult = toSynthesizerConfig(sessionId, { forPreview: true });
      if (!conversionResult.config) return null;
      const validationError = validateSynthesizerInput(conversionResult.config);
      if (validationError) return null;
      try {
        const renderResult = generateAudioWav(conversionResult.config);
        const sampleRate = conversionResult.config.sampleRate ?? 44100;
        return {
          audio: { data: renderResult.audioBase64, mimeType: "audio/wav" },
          duration: renderResult.sampleCount / sampleRate,
          sampleCount: renderResult.sampleCount,
        };
      } catch {
        return null;
      }
    };

    // Duration progress feedback based on AUTHORED pattern length (longest
    // channel), never on a rendered preview — auto-repeat looping would
    // inflate that and tell the model it's done when it isn't.
    const buildDurationProgress = (
      session: NonNullable<ReturnType<typeof getTrackerSession>>,
    ): Record<string, number> => {
      const authored = Math.round(getAuthoredDurationSeconds(session) * 100) / 100;
      if (!session.duration) return { authoredDuration: authored };
      return {
        targetDuration: session.duration,
        authoredDuration: authored,
        remainingDuration: Math.round(Math.max(0, session.duration - authored) * 100) / 100,
      };
    };

    // Human-readable progress sentence appended to action messages.
    const describeDurationProgress = (
      session: NonNullable<ReturnType<typeof getTrackerSession>>,
    ): string => {
      if (!session.duration) return "";
      const authored = getAuthoredDurationSeconds(session);
      const remaining = Math.max(0, session.duration - authored);
      if (remaining <= 0) {
        return ` Authored content covers the ${session.duration}s target.`;
      }
      return (
        ` Authored ${authored.toFixed(2)}s of the ${session.duration}s target ` +
        `(${remaining.toFixed(2)}s remaining — shorter patterns auto-loop at ` +
        `render to fill the target; write more rows if looping is not wanted).`
      );
    };

    if (action === "init") {
      const { tempo, timeSignature, linesPerBeat, sampleRate, swing, humanize, duration } = req.body;
      const session = createTrackerSession({
        tempo: tempo != null ? Number(tempo) : undefined,
        timeSignature,
        linesPerBeat: linesPerBeat != null ? Number(linesPerBeat) : undefined,
        sampleRate: sampleRate != null ? Number(sampleRate) : undefined,
        swing: swing != null ? Number(swing) : undefined,
        humanize: humanize != null ? Number(humanize) : undefined,
        duration: duration != null ? Number(duration) : undefined,
      });
      const rowMilliseconds = (60 / session.tempo / session.linesPerBeat) * 1000;
      const durationMessage = session.duration
        ? ` Target duration: ${session.duration}s (the final render will be exactly this long — shorter patterns auto-loop, longer ones are trimmed).`
        : "";
      return res.json({
        success: true,
        message:
          `Tracker session created. Tempo: ${session.tempo} BPM, ` +
          `Time Signature: ${session.timeSignature.join("/")}, ` +
          `Lines Per Beat: ${session.linesPerBeat} (each row = ${rowMilliseconds.toFixed(1)}ms).${durationMessage} ` +
          `Now add channels with action: "add_channel" (pass this sessionId).`,
        sessionId: session.sessionId,
        tempo: session.tempo,
        timeSignature: session.timeSignature,
        linesPerBeat: session.linesPerBeat,
        sampleRate: session.sampleRate,
        targetDuration: session.duration,
        activeSessions: getActiveSessionCount(),
      });
    }

    if (action === "add_channel") {
      const { sessionId, channelId, instrument, waveform, volume, effects, nodes, nodeChain, rows } = req.body;
      const sessionResult = requireSession(sessionId);
      if ("error" in sessionResult) {
        return res.status(sessionResult.errorStatus).json({ error: sessionResult.error });
      }
      const session = sessionResult.session;
      if (!channelId) {
        return res.status(400).json({
          error: "Missing required parameter: channelId (a descriptive name like 'lead', 'bass', 'drums').",
        });
      }
      if (instrument && !Object.hasOwn(INSTRUMENT_PRESETS, instrument)) {
        return res.status(400).json({
          error:
            `Invalid instrument '${instrument}'. Valid: ${Object.keys(INSTRUMENT_PRESETS).join(", ")}. ` +
            `For drum beats, omit the instrument entirely and write KICK/SNARE/HAT ` +
            `rows — drum synthesis is automatic.`,
        });
      }
      const result = addTrackerChannel(session.sessionId, {
        channelId,
        instrument,
        waveform,
        volume: volume != null ? Number(volume) : undefined,
        effects,
        nodes,
        nodeChain,
      });
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Optional inline pattern: writing rows together with the channel
      // saves an extra round trip for the common one-pattern-per-channel case.
      let writtenRows = 0;
      let previewNotation: string | undefined;
      if (rows != null) {
        if (!Array.isArray(rows) || rows.length === 0) {
          return res.status(400).json({
            error:
              `Channel '${channelId}' was created, but 'rows' must be a non-empty ` +
              `array of {note, duration, velocity?} to write a pattern inline. ` +
              `Write it with action: "write_pattern".`,
          });
        }
        const writeResult = writeTrackerPattern({
          sessionId: session.sessionId,
          channelId,
          rows,
        });
        if (!writeResult.success) {
          return res.status(400).json({
            error:
              `Channel '${channelId}' was created, but writing its pattern failed: ` +
              `${writeResult.error} Fix the rows and use action: "write_pattern".`,
          });
        }
        writtenRows = writeResult.totalRows ?? 0;
        previewNotation = writeResult.previewNotation;
      }

      const preview = tryRenderPreview(session.sessionId);
      return res.json({
        success: true,
        message:
          `Channel '${channelId}' added` +
          (instrument ? ` with instrument preset '${instrument}'` : "") +
          (writtenRows > 0 ? ` and ${writtenRows} pattern row(s) written` : "") +
          `. ${result.channelCount} channel(s) in session.` +
          describeDurationProgress(session) +
          (writtenRows > 0
            ? ` Add more channels, write more rows, or call action: "render".`
            : ` Now write its pattern with action: "write_pattern".`),
        sessionId: session.sessionId,
        channelId,
        channelCount: result.channelCount,
        allChannels: session.channels.map((channel) => channel.channelId),
        ...(previewNotation && { totalRows: writtenRows, previewNotation }),
        ...(preview && {
          audio: preview.audio,
          duration: preview.duration,
          sampleCount: preview.sampleCount,
        }),
        ...buildDurationProgress(session),
      });
    }

    if (action === "write_pattern") {
      const { sessionId, channelId, rows, startRow, append } = req.body;
      const sessionResult = requireSession(sessionId);
      if ("error" in sessionResult) {
        return res.status(sessionResult.errorStatus).json({ error: sessionResult.error });
      }
      const session = sessionResult.session;
      if (!channelId) {
        return res.status(400).json({ error: "Missing required parameter: channelId." });
      }
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({
          error: "Missing required parameter: rows (non-empty array of {note, duration, velocity?}).",
        });
      }
      const writeResult = writeTrackerPattern({
        sessionId: session.sessionId,
        channelId,
        rows,
        startRow: startRow != null ? Number(startRow) : undefined,
        append,
      });
      if (!writeResult.success) {
        return res.status(400).json({ error: writeResult.error });
      }
      const preview = tryRenderPreview(session.sessionId);
      return res.json({
        success: true,
        message:
          `Wrote ${rows.length} row(s) to channel '${channelId}'. ` +
          `Total rows: ${writeResult.totalRows}.` +
          describeDurationProgress(session) +
          ` Add more patterns or call action: "render" for the final output.`,
        sessionId: session.sessionId,
        channelId,
        totalRows: writeResult.totalRows,
        previewNotation: writeResult.previewNotation,
        ...(preview && {
          audio: preview.audio,
          duration: preview.duration,
          sampleCount: preview.sampleCount,
        }),
        ...buildDurationProgress(session),
      });
    }

    if (action === "render") {
      const { sessionId, clearSession } = req.body;
      const sessionResult = requireSession(sessionId);
      if ("error" in sessionResult) {
        return res.status(sessionResult.errorStatus).json({ error: sessionResult.error });
      }
      const session = sessionResult.session;
      const conversionResult = toSynthesizerConfig(session.sessionId);
      if (!conversionResult.config) {
        return res.status(400).json({ error: conversionResult.error });
      }
      const synthesizerConfig = conversionResult.config;
      const validationError = validateSynthesizerInput(synthesizerConfig);
      if (validationError) {
        return res.status(400).json({ error: validationError });
      }
      try {
        const boundedSampleRate = synthesizerConfig.sampleRate ?? 44100;
        const result = generateAudioWav(synthesizerConfig);
        const actualDuration = result.sampleCount / boundedSampleRate;
        const authoredDuration = getAuthoredDurationSeconds(session);
        const channelSummary = session.channels
          .map((channel) => `${channel.channelId} (${channel.pattern.length} rows)`)
          .join(", ");
        let durationNote = "";
        if (session.duration && authoredDuration < session.duration - 0.05) {
          durationNote =
            ` Only ${authoredDuration.toFixed(2)}s of pattern content was written, ` +
            `so it was looped to fill the ${session.duration}s target.`;
        }
        if (clearSession) {
          deleteTrackerSession(session.sessionId);
        }
        return res.json({
          success: true,
          message:
            `Successfully rendered tracker composition (${actualDuration.toFixed(2)}s, ` +
            `${boundedSampleRate}Hz). Channels: ${channelSummary}.${durationNote}` +
            (clearSession ? " Session cleared." : " Session preserved for further editing."),
          sessionId: session.sessionId,
          audio: {
            data: result.audioBase64,
            mimeType: "audio/wav",
          },
          duration: actualDuration,
          targetDuration: session.duration,
          authoredDuration: Math.round(authoredDuration * 100) / 100,
          sampleCount: result.sampleCount,
          sessionCleared: !!clearSession,
        });
      } catch (error: unknown) {
        logger.error(
          `[CreativeRoutes] generate-audio render failed: ${errorMessage(error)}`,
        );
        return res
          .status(500)
          .json({ error: `Audio tracker render failed: ${errorMessage(error)}` });
      }
    }

    // Unreachable — the action guard above returns for unknown actions.
    return res.status(400).json({
      error: `Unhandled action '${action}'. Valid actions: ${VALID_ACTIONS.join(", ")}.`,
    });
  }),
);

// ────────────────────────────────────────────────────────────
// POST /creative/remix-audio
// ────────────────────────────────────────────────────────────

router.post(
  "/remix-audio",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      input,
      operations = [],
      preset,
      outputFormat = "wav",
      sampleRate,
    } = req.body;

    const validationError = validateAudioRemixInput({
      input,
      operations,
      preset,
      outputFormat,
      sampleRate,
    });

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    try {
      const result = await processAudio({
        input,
        operations,
        preset,
        outputFormat,
        sampleRate: sampleRate ? Number(sampleRate) : undefined,
      });

      const audioBase64 = result.buffer.toString("base64");

      const presetLabel = preset ? ` (preset: '${preset}')` : "";
      const operationSummary = result.appliedOperations.join(" → ");

      res.json({
        success: true,
        message:
          `Successfully remixed audio${presetLabel}. ` +
          `Pipeline: ${operationSummary}. ` +
          `Output: ${result.durationSeconds.toFixed(2)}s ${outputFormat.toUpperCase()}.`,
        audio: {
          data: audioBase64,
          mimeType: result.mimeType,
        },
        duration: result.durationSeconds,
        appliedOperations: result.appliedOperations,
        ...(preset && { preset }),
        availablePresets: getAvailablePresets(),
      });
    } catch (error: unknown) {
      logger.error(
        `[CreativeRoutes] remix-audio failed: ${errorMessage(error)}`,
      );
      res
        .status(500)
        .json({ error: `Audio remix failed: ${errorMessage(error)}` });
    }
  }),
);

// ────────────────────────────────────────────────────────────
// Emoji Kitchen Domain
// ────────────────────────────────────────────────────────────

/**
 * GET /creative/emoji-kitchen/combine
 * Combines two emojis and returns the static PNG URL and metadata.
 */
router.get(
  "/emoji-kitchen/combine",
  asyncHandler(async (req: Request, res: Response) => {
    const { left, right } = req.query;

    if (!left || !right) {
      return res
        .status(400)
        .json({ error: "Missing required query parameters: left and right" });
    }

    const combination = queryEmojiCombination(left as string, right as string);
    if (!combination) {
      return res.status(404).json({
        error: `No Emoji Kitchen combination found for "${left}" and "${right}"`,
        left,
        right,
      });
    }

    res.json({
      success: true,
      ...combination,
      display: buildDisplay("image", combination.gStaticUrl, {
        title: combination.alt,
      }),
    });
  }),
);

/**
 * GET /creative/emoji-kitchen/combinations
 * Lists all possible GBoard combinations for a single emoji.
 */
router.get(
  "/emoji-kitchen/combinations",
  asyncHandler(async (req: Request, res: Response) => {
    const { emoji, limit } = req.query;

    if (!emoji) {
      return res
        .status(400)
        .json({ error: "Missing required query parameter: emoji" });
    }

    const maxLimit = limit
      ? Math.min(Math.max(parseInt(limit as string, 10), 1), 500)
      : 50;
    const options = queryEmojiCombinations(emoji as string, maxLimit);

    res.json({
      success: true,
      emoji,
      count: options.length,
      combinations: options,
    });
  }),
);

/**
 * GET /creative/emoji-kitchen/metadata
 * Retrieve cache/health overview of the Emoji Kitchen metadata collector.
 */
router.get(
  "/emoji-kitchen/metadata",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(getEmojiKitchenHealth());
  }),
);

// ────────────────────────────────────────────────────────────
// Vector Animation Domain
// ────────────────────────────────────────────────────────────

const vectorAnimationSessions = new Map();
const VECTOR_ANIMATION_SESSION_TTL_MS = 30 * 60_000; // 30 min

function cleanupVectorAnimationSessions() {
  const now = Date.now();
  for (const [id, session] of vectorAnimationSessions) {
    if (now - session.updatedAt > VECTOR_ANIMATION_SESSION_TTL_MS)
      vectorAnimationSessions.delete(id);
  }
}

/**
 * Normalize incoming layers to the shapes the engine expects: numeric
 * keyframe times (the merge logic compares them with ===), canonical easing
 * names (models send camelCase variants), and object-form motion paths
 * (models send bare SVG path strings). Merge-control markers (action,
 * deleted, replaceKeyframes) are preserved for the session-merge logic.
 */
function normalizeVectorLayers(layers: VectorLayerInput[]): VectorLayerInput[] {
  return layers.map((layer) => {
    const normalized: VectorLayerInput = { ...layer };
    if (Array.isArray(layer.keyframes)) {
      normalized.keyframes = layer.keyframes
        .map((keyframe) => {
          const normalizedKeyframe = { ...keyframe, time: Number(keyframe.time) };
          if (typeof keyframe.easing === "string") {
            normalizedKeyframe.easing = normalizeEasing(keyframe.easing) ?? keyframe.easing;
          }
          if (typeof keyframe.motionPath === "string") {
            normalizedKeyframe.motionPath = { path: keyframe.motionPath };
          }
          return normalizedKeyframe;
        })
        .sort((keyframeA, keyframeB) => Number(keyframeA.time) - Number(keyframeB.time));
    }
    return normalized;
  });
}

/** Strip merge-control markers so they are never stored as renderable data. */
function stripLayerMarkers(layer: VectorLayerInput): VectorLayer {
  const { action: _action, deleted: _deleted, replaceKeyframes: _replaceKeyframes, ...rest } = layer;
  return rest as unknown as VectorLayer;
}

/** Drop delete-marked layers and strip markers — for new-session storage. */
function toRenderableLayers(layers: VectorLayerInput[]): VectorLayer[] {
  return layers
    .filter((layer) => layer.action !== "delete" && layer.deleted !== true)
    .map(stripLayerMarkers);
}

function buildVectorAnimationEmbedHtml(
  animation: VectorAnimationConfig,
  options: VectorAnimationOptions = {},
) {
  const {
    loop = true,
    autoplay = true,
  } = options;
  const width = Number(animation.width) || 800;
  const height = Number(animation.height) || 600;
  const background = sanitizeCssColor(animation.background, "#ffffff");
  const duration = Number(animation.duration) || 5;
  const titleHtml = options.title
    ? `<div id="animation-title">${escapeHtml(options.title)}</div>`
    : "";

  const animationJson = toEmbedScriptJson(animation);

  const engineScripts = buildEngineEmbedScript();

  return buildEmbedHtml({
    styles: `
      html, body {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: #090d16 !important;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      #player-container {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      canvas {
        background: ${background};
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        border-radius: 12px;
        max-width: 100%;
        max-height: calc(100% - 70px);
        object-fit: contain;
      }
      #controls {
        position: absolute;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        width: 90%;
        max-width: 600px;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 30px;
        padding: 8px 20px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
        z-index: 10;
        transition: opacity 0.3s;
      }
      #controls.hidden {
        opacity: 0.1;
      }
      #controls:hover {
        opacity: 1;
      }
      button {
        background: none;
        border: none;
        color: #f8fafc;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        transition: background 0.2s, transform 0.1s;
      }
      button:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: scale(1.05);
      }
      button:active {
        transform: scale(0.95);
      }
      button svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }
      #timeline-slider {
        flex-grow: 1;
        -webkit-appearance: none;
        appearance: none;
        height: 6px;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.2);
        outline: none;
        cursor: pointer;
      }
      #timeline-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #38bdf8;
        box-shadow: 0 0 10px #38bdf8;
        cursor: pointer;
        transition: transform 0.1s;
      }
      #timeline-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
      }
      #time-display {
        color: #94a3b8;
        font-size: 11px;
        font-family: monospace;
        min-width: 80px;
        text-align: right;
      }
      #loop-btn.active {
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.15);
      }
      #animation-title {
        position: absolute;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        color: #f8fafc;
        font-size: 14px;
        font-weight: 600;
        background: rgba(15, 23, 42, 0.75);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        padding: 6px 16px;
        z-index: 10;
      }
    `,
    bodyContent: `
      <div id="player-container">
        ${titleHtml}
        <canvas id="animation-canvas" width="${width}" height="${height}"></canvas>
        <div id="controls">
          <button id="play-pause-btn" title="Play/Pause">
            <svg id="play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg id="pause-icon" viewBox="0 0 24 24" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <input type="range" id="timeline-slider" min="0" max="1000" value="0">
          <button id="loop-btn" class="${loop ? "active" : ""}" title="Toggle Loop">
            <svg viewBox="0 0 24 24"><path d="M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.42 0 8-3.58 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.42 0-8 3.58-8 8H1l4 4 4-4H6z"/></svg>
          </button>
          <div id="time-display">0.00 / ${duration.toFixed(2)}s</div>
        </div>
      </div>
    `,
    scripts: `
      <script>
      (function() {
        const animation = ${animationJson};
        const canvas = document.getElementById("animation-canvas");
        const ctx = canvas.getContext("2d");
        const playPauseButton = document.getElementById("play-pause-btn");
        const playIcon = document.getElementById("play-icon");
        const pauseIcon = document.getElementById("pause-icon");
        const loopButton = document.getElementById("loop-btn");
        const timelineSlider = document.getElementById("timeline-slider");
        const timeDisplay = document.getElementById("time-display");
        const controls = document.getElementById("controls");

        let duration = Number(animation.duration) || 5;
        const fps = Number(animation.fps) || 24;
        let isPlaying = ${autoplay};
        let isLooping = ${loop};
        let currentTime = 0;
        let lastFrameTime = performance.now();

        // Quantize render time to the authored fps so the advertised fps
        // parameter has a real effect (the loop itself is wall-clock rAF).
        function quantizeTime(t) {
          return Math.min(duration, Math.floor(t * fps) / fps);
        }

        ${engineScripts}

        const imageCache = new Map();
        function getLoadedImage(url) {
          if (!url) return null;
          if (imageCache.has(url)) {
            const cached = imageCache.get(url);
            if (cached.complete && cached.naturalWidth !== 0) {
              return cached;
            }
            return null;
          }
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {};
          img.src = url;
          imageCache.set(url, img);
          return null;
        }

        // ── Render Frame at specific time ──
        function renderFrame(t) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          if (!animation.layers || !Array.isArray(animation.layers)) return;

          for (const layer of animation.layers) {
            const interpolatedProps = resolveAnimatedProperties(layer, t);
            drawShape(layer, interpolatedProps);
          }
        }

        function resolveStyle(ctx, value) {
          if (!value || typeof value === "string") return value || "transparent";
          if (typeof value === "object") {
            if (value.type === "linear") {
              const grad = ctx.createLinearGradient(value.x1 || 0, value.y1 || 0, value.x2 || 0, value.y2 || 0);
              if (Array.isArray(value.stops)) {
                for (const stop of value.stops) {
                  grad.addColorStop(stop.offset ?? 0, stop.color || "transparent");
                }
              }
              return grad;
            }
            if (value.type === "radial") {
              const grad = ctx.createRadialGradient(
                value.x0 || 0, value.y0 || 0, value.r0 || 0,
                value.x1 || 0, value.y1 || 0, value.r1 || 0
              );
              if (Array.isArray(value.stops)) {
                for (const stop of value.stops) {
                  grad.addColorStop(stop.offset ?? 0, stop.color || "transparent");
                }
              }
              return grad;
            }
          }
          return "transparent";
        }

        function drawShape(layer, props) {
          ctx.save();
          
          ctx.translate(props.x || 0, props.y || 0);
          ctx.rotate((props.rotation || 0) * Math.PI / 180);
          ctx.scale(props.scaleX ?? 1, props.scaleY ?? 1);
          ctx.globalAlpha = (props.opacity ?? 1) * (layer.opacity ?? 1);

          ctx.fillStyle = resolveStyle(ctx, props.fillColor || layer.fillColor);
          ctx.strokeStyle = resolveStyle(ctx, props.strokeColor || layer.strokeColor);
          ctx.lineWidth = props.strokeWidth ?? layer.strokeWidth ?? 1;

          ctx.beginPath();
          const type = layer.shapeType;
          const shapeData = layer.shapeData || {};

          if (type === "rectangle") {
            const width = props.width ?? shapeData.width ?? 100;
            const height = props.height ?? shapeData.height ?? 100;
            const rx = props.rx ?? shapeData.rx ?? 0;
            const ry = props.ry ?? shapeData.ry ?? 0;
            if (rx > 0 || ry > 0) {
              ctx.roundRect(-width/2, -height/2, width, height, [rx, ry]);
            } else {
              ctx.rect(-width/2, -height/2, width, height);
            }
          } else if (type === "circle") {
            const radius = props.radius ?? shapeData.radius ?? 50;
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
          } else if (type === "ellipse") {
            const rx = props.rx ?? shapeData.rx ?? 50;
            const ry = props.ry ?? shapeData.ry ?? 30;
            ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          } else if (type === "line") {
            const x1 = shapeData.x1 ?? 0;
            const y1 = shapeData.y1 ?? 0;
            const x2 = shapeData.x2 ?? 100;
            const y2 = shapeData.y2 ?? 100;
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
          } else if (type === "polygon") {
            const points = props.points || shapeData.points || [];
            if (points.length > 0) {
              ctx.moveTo(points[0][0], points[0][1]);
              for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i][0], points[i][1]);
              }
              ctx.closePath();
            }
          } else if (type === "path") {
            const pathStr = props.path || shapeData.path || "";
            if (pathStr) {
              const path2d = new Path2D(pathStr);
              const imageUrl = props.imageUrl || layer.imageUrl;
              const imageElement = getLoadedImage(imageUrl);
              if (imageElement) {
                ctx.save();
                ctx.clip(path2d);
                ctx.drawImage(imageElement, -canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2);
                ctx.restore();
              } else if (ctx.fillStyle !== "transparent") {
                ctx.fill(path2d);
              }
              if (ctx.strokeStyle !== "transparent") ctx.stroke(path2d);
              ctx.restore();
              return;
            }
          } else if (type === "text") {
            const textVal = props.text ?? shapeData.text ?? "";
            const fontSize = props.fontSize ?? shapeData.fontSize ?? 20;
            const fontFamily = shapeData.fontFamily || "system-ui, sans-serif";
            ctx.font = fontSize + "px " + fontFamily;
            ctx.textAlign = shapeData.textAlign || "center";
            ctx.textBaseline = shapeData.textBaseline || "middle";
            if (ctx.fillStyle !== "transparent") ctx.fillText(textVal, 0, 0);
            if (ctx.strokeStyle !== "transparent") ctx.strokeText(textVal, 0, 0);
          }

          const imageUrl = props.imageUrl || layer.imageUrl;
          const imageElement = getLoadedImage(imageUrl);

          if (imageElement && type !== "line" && type !== "text" && type !== "path") {
            ctx.save();
            ctx.clip();
            let xValue = -50, yValue = -50, widthValue = 100, heightValue = 100;
            if (type === "rectangle") {
              const rectWidth = props.width ?? shapeData.width ?? 100;
              const rectHeight = props.height ?? shapeData.height ?? 100;
              xValue = -rectWidth / 2;
              yValue = -rectHeight / 2;
              widthValue = rectWidth;
              heightValue = rectHeight;
            } else if (type === "circle") {
              const circleRadius = props.radius ?? shapeData.radius ?? 50;
              xValue = -circleRadius;
              yValue = -circleRadius;
              widthValue = circleRadius * 2;
              heightValue = circleRadius * 2;
            } else if (type === "ellipse") {
              const ellipseRadiusX = props.rx ?? shapeData.rx ?? 50;
              const ellipseRadiusY = props.ry ?? shapeData.ry ?? 30;
              xValue = -ellipseRadiusX;
              yValue = -ellipseRadiusY;
              widthValue = ellipseRadiusX * 2;
              heightValue = ellipseRadiusY * 2;
            } else if (type === "polygon") {
              const polygonPoints = props.points || shapeData.points || [];
              if (polygonPoints.length > 0) {
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                for (const point of polygonPoints) {
                  if (point[0] < minX) minX = point[0];
                  if (point[0] > maxX) maxX = point[0];
                  if (point[1] < minY) minY = point[1];
                  if (point[1] > maxY) maxY = point[1];
                }
                xValue = minX;
                yValue = minY;
                widthValue = maxX - minX;
                heightValue = maxY - minY;
              }
            }
            ctx.drawImage(imageElement, xValue, yValue, widthValue, heightValue);
            ctx.restore();
          } else if (ctx.fillStyle !== "transparent" && type !== "line" && type !== "path") {
            ctx.fill();
          }
          
          if (ctx.strokeStyle !== "transparent" && type !== "path") {
            ctx.stroke();
          }

          ctx.restore();
        }

        function updateUI() {
          timelineSlider.value = Math.round((currentTime / duration) * 1000);
          timeDisplay.textContent = currentTime.toFixed(2) + " / " + duration.toFixed(2) + "s";
          if (isPlaying) {
            playIcon.style.display = "none";
            pauseIcon.style.display = "block";
          } else {
            playIcon.style.display = "block";
            pauseIcon.style.display = "none";
          }
        }

        function loop(timestamp) {
          const delta = (timestamp - lastFrameTime) / 1000;
          lastFrameTime = timestamp;

          if (isPlaying) {
            currentTime += delta;
            if (currentTime >= duration) {
              if (isLooping) {
                currentTime = 0;
              } else {
                currentTime = duration;
                isPlaying = false;
              }
            }
            updateUI();
          }

          renderFrame(quantizeTime(currentTime));
          requestAnimationFrame(loop);
        }

        playPauseButton.addEventListener("click", () => {
          isPlaying = !isPlaying;
          if (isPlaying && currentTime >= duration) {
            currentTime = 0;
          }
          lastFrameTime = performance.now();
          updateUI();
        });

        loopButton.addEventListener("click", () => {
          isLooping = !isLooping;
          loopButton.classList.toggle("active", isLooping);
        });

        timelineSlider.addEventListener("input", (event) => {
          isPlaying = false;
          currentTime = (parseInt(event.target.value) / 1000) * duration;
          updateUI();
          renderFrame(quantizeTime(currentTime));
        });

        let controlsTimeout;
        function resetControlsTimer() {
          controls.classList.remove("hidden");
          clearTimeout(controlsTimeout);
          controlsTimeout = setTimeout(() => {
            if (isPlaying) controls.classList.add("hidden");
          }, 3000);
        }
        document.addEventListener("mousemove", resetControlsTimer);
        document.addEventListener("click", resetControlsTimer);

        updateUI();
        requestAnimationFrame(loop);
      })();
      </script>
    `
  });
}

const vectorAnimationEmbeds = new Map();
const EMBED_CACHE_TTL_MS = 30 * 60_000; // 30 min

function cleanupVectorAnimationEmbeds() {
  const now = Date.now();
  for (const [id, embed] of vectorAnimationEmbeds) {
    if (now - embed.updatedAt > EMBED_CACHE_TTL_MS)
      vectorAnimationEmbeds.delete(id);
  }
}

router.post("/vector-animation", asyncHandler(async (req: Request, res: Response) => {
  const { options, sessionId, referenceImageUrl } = req.body;
  let { animation } = req.body;

  // Models frequently send `animation` as a JSON-encoded string. Before this
  // was parsed, those calls "succeeded" with an empty animation (0 layers,
  // 0 keyframes) — parse it, or reject with a format the model can copy.
  if (typeof animation === "string") {
    try {
      animation = JSON.parse(animation);
    } catch {
      return res.status(400).json({
        error:
          "'animation' was sent as a string that is not valid JSON. Send it as a JSON " +
          "object, e.g. {\"duration\": 5, \"layers\": [{\"id\": \"ball\", \"shapeType\": " +
          "\"circle\", \"shapeData\": {\"radius\": 40}, \"fillColor\": \"#38bdf8\", " +
          "\"keyframes\": [...]}]}",
      });
    }
  }
  if (!animation || typeof animation !== "object" || Array.isArray(animation)) {
    return res.status(400).json({
      error: "'animation' is required and must be an object with a 'layers' array",
    });
  }
  // Unwrap accidental double-nesting ({animation: {animation: {...}}}).
  if (!animation.layers && animation.animation && typeof animation.animation === "object") {
    animation = { ...animation, ...animation.animation };
    delete animation.animation;
  }

  const trimmedSessionId = typeof sessionId === "string" ? sessionId.trim() : sessionId;
  if (trimmedSessionId !== undefined && trimmedSessionId !== null && trimmedSessionId !== "") {
    if (
      typeof trimmedSessionId !== "string" ||
      trimmedSessionId === "null" ||
      trimmedSessionId === "undefined"
    ) {
      return res.status(400).json({
        error:
          `Invalid sessionId (got: ${JSON.stringify(trimmedSessionId)}). Pass the exact ` +
          `sessionId string returned by a previous call, or omit it to create a new animation.`,
      });
    }
    if (!vectorAnimationSessions.has(trimmedSessionId)) {
      return res.status(400).json({
        error:
          `Session '${trimmedSessionId}' not found or expired (sessions expire after 30 ` +
          `minutes of inactivity). Omit sessionId to create a new animation — the response ` +
          `returns a server-assigned sessionId for later edits — and resend the complete ` +
          `animation, not just the changes.`,
      });
    }
  }

  const validationError = validateVectorAnimationInput(animation);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { username: callerUsername } = extractCallerContext(req);
  const isExistingSession = !!(trimmedSessionId && vectorAnimationSessions.has(trimmedSessionId));

  const requestedWidth = animation.width != null ? Number(animation.width) : undefined;
  const requestedHeight = animation.height != null ? Number(animation.height) : undefined;
  const clampWarnings: string[] = [];
  if (requestedWidth !== undefined && requestedWidth > 1920) {
    clampWarnings.push(`width ${requestedWidth} was clamped to 1920`);
  }
  if (requestedHeight !== undefined && requestedHeight > 1080) {
    clampWarnings.push(`height ${requestedHeight} was clamped to 1080`);
  }

  let sessionAnimation = {
    width: Math.min(requestedWidth || 800, 1920),
    height: Math.min(requestedHeight || 600, 1080),
    duration: animation.duration != null ? Number(animation.duration) : 5,
    fps: animation.fps != null ? Number(animation.fps) : 24,
    background: animation.background || "#ffffff",
    layers: [] as VectorLayer[],
  };

  const animationOptions: { loop: boolean; autoplay: boolean; title?: string } = {
    loop: options?.loop !== false,
    autoplay: options?.autoplay !== false,
  };
  if (typeof options?.title === "string" && options.title.trim()) {
    animationOptions.title = options.title.trim();
  }

  const activeSessionId = isExistingSession
    ? trimmedSessionId
    : crypto.randomUUID().slice(0, 12);

  const normalizedLayers = normalizeVectorLayers(animation.layers || []);
  sessionAnimation.layers = toRenderableLayers(normalizedLayers);

  // Keyframes past the effective duration would never play — reject with
  // guidance instead of counting them toward totalKeyframes.
  const effectiveDuration =
    animation.duration != null
      ? Number(animation.duration)
      : isExistingSession
        ? Number(vectorAnimationSessions.get(trimmedSessionId).animation.duration) || 5
        : sessionAnimation.duration;
  const keyframeTimeError = findKeyframeBeyondDuration(normalizedLayers, effectiveDuration);
  if (keyframeTimeError) {
    return res.status(400).json({ error: keyframeTimeError });
  }

  // A layer that doesn't already exist in the session must declare its shape —
  // without one the player would silently render nothing for it.
  const existingLayerIds = new Set<string>(
    isExistingSession
      ? vectorAnimationSessions.get(trimmedSessionId).animation.layers.map((layer: VectorLayer) => layer.id)
      : [],
  );
  for (const layer of normalizedLayers) {
    if (layer.action === "delete" || layer.deleted === true) continue;
    if (!layer.shapeType && !existingLayerIds.has(layer.id)) {
      return res.status(400).json({
        error:
          `Layer '${layer.id}' is new, so it needs a 'shapeType' (rectangle, circle, ` +
          `ellipse, line, polygon, path, or text). shapeType may only be omitted when ` +
          `updating a layer that already exists in the session.`,
      });
    }
  }

  if (isExistingSession) {
    const session = vectorAnimationSessions.get(trimmedSessionId);

    if (options?.clearSession === true || animation.clearSession === true) {
      session.animation = { ...sessionAnimation };
    } else {
      if (animation.width) session.animation.width = sessionAnimation.width;
      if (animation.height) session.animation.height = sessionAnimation.height;
      if (animation.duration) session.animation.duration = sessionAnimation.duration;
      if (animation.fps) session.animation.fps = sessionAnimation.fps;
      if (animation.background) session.animation.background = animation.background;

      for (const newLayer of normalizedLayers) {
        // Support layer deletion
        if (newLayer.action === "delete" || newLayer.deleted === true) {
          session.animation.layers = session.animation.layers.filter((layer: VectorLayer) => layer.id !== newLayer.id);
          continue;
        }

        const existingLayer = session.animation.layers.find((layer: VectorLayer) => layer.id === newLayer.id);
        if (existingLayer) {
          if (newLayer.shapeType) existingLayer.shapeType = newLayer.shapeType;
          if (newLayer.shapeData) existingLayer.shapeData = { ...existingLayer.shapeData, ...newLayer.shapeData };
          if (newLayer.opacity !== undefined) existingLayer.opacity = newLayer.opacity;
          if (newLayer.fillColor !== undefined) existingLayer.fillColor = newLayer.fillColor;
          if (newLayer.strokeColor !== undefined) existingLayer.strokeColor = newLayer.strokeColor;
          if (newLayer.strokeWidth !== undefined) existingLayer.strokeWidth = newLayer.strokeWidth;
          if (newLayer.imageUrl !== undefined) existingLayer.imageUrl = newLayer.imageUrl;

          if (newLayer.keyframes && Array.isArray(newLayer.keyframes)) {
            if (newLayer.replaceKeyframes === true) {
              existingLayer.keyframes = [...newLayer.keyframes];
            } else {
              if (!existingLayer.keyframes) existingLayer.keyframes = [];
              for (const newKf of newLayer.keyframes) {
                const existingKfIndex = existingLayer.keyframes.findIndex((keyframe: Keyframe) => Number(keyframe.time) === Number(newKf.time));
                if (existingKfIndex !== -1) {
                  existingLayer.keyframes[existingKfIndex].properties = {
                    ...existingLayer.keyframes[existingKfIndex].properties,
                    ...newKf.properties,
                  };
                  if (newKf.easing) existingLayer.keyframes[existingKfIndex].easing = newKf.easing;
                  if (newKf.motionPath) existingLayer.keyframes[existingKfIndex].motionPath = newKf.motionPath;
                } else {
                  existingLayer.keyframes.push(newKf);
                }
              }
            }
            existingLayer.keyframes.sort((keyframeA: Keyframe, keyframeB: Keyframe) => keyframeA.time - keyframeB.time);
          }
        } else {
          session.animation.layers.push(stripLayerMarkers(newLayer));
        }
      }
    }

    if (options) {
      if (options.loop !== undefined) session.options.loop = options.loop;
      if (options.autoplay !== undefined) session.options.autoplay = options.autoplay;
      if (typeof options.title === "string") {
        session.options.title = options.title.trim() || undefined;
      }
    }

    session.updatedAt = Date.now();
    sessionAnimation = session.animation;
  } else {
    vectorAnimationSessions.set(activeSessionId, {
      animation: sessionAnimation,
      options: animationOptions,
      updatedAt: Date.now(),
    });
    cleanupVectorAnimationSessions();
  }

  if (referenceImageUrl && typeof referenceImageUrl === "string") {
    const imageFillShapeTypes = ["rectangle", "circle", "ellipse", "polygon", "path"];
    const imagePlaceholderValues = ["placeholder", "reference"];
    for (const layer of sessionAnimation.layers) {
      if (layer && typeof layer === "object") {
        const isCompatibleShape = imageFillShapeTypes.includes(layer.shapeType);
        if (isCompatibleShape && typeof layer.imageUrl === "string" && imagePlaceholderValues.includes(layer.imageUrl)) {
          layer.imageUrl = referenceImageUrl;

          if (layer.keyframes && Array.isArray(layer.keyframes)) {
            for (const keyframe of layer.keyframes) {
              if (keyframe?.properties && typeof keyframe.properties === "object") {
                const keyframeProperties = keyframe.properties;
                if (typeof keyframeProperties.imageUrl === "string" && imagePlaceholderValues.includes(keyframeProperties.imageUrl)) {
                  keyframeProperties.imageUrl = referenceImageUrl;
                }
              }
            }
          }
        }
      }
    }
  }

  const embedId = crypto.randomUUID().slice(0, 12);
  await saveVectorAnimation(embedId, sessionAnimation, animationOptions, activeSessionId, callerUsername);
  
  vectorAnimationEmbeds.set(embedId, {
    animation: sessionAnimation,
    options: animationOptions,
    updatedAt: Date.now(),
  });
  cleanupVectorAnimationEmbeds();
  
  const embedUrl = buildLocalUrl("creative/vector-animation/embed", { id: embedId });
  const totalKeyframes = sessionAnimation.layers.reduce((sum: number, layer: VectorLayer) => sum + (layer.keyframes?.length || 0), 0);
  const layerIds = sessionAnimation.layers.map((layer: VectorLayer) => layer.id);

  const warningSuffix = clampWarnings.length > 0 ? ` Note: ${clampWarnings.join("; ")}.` : "";
  const message =
    `Animation ${isExistingSession ? "updated" : "created"}: ${sessionAnimation.layers.length} ` +
    `layer(s) [${layerIds.join(", ")}], ${totalKeyframes} keyframe(s), ` +
    `${sessionAnimation.duration}s at ${sessionAnimation.fps}fps. The user can see this ` +
    `version now. To keep building on it, call again with sessionId '${activeSessionId}' and ` +
    `only the layers you are adding or changing — layers merge by id, keyframes merge by time, ` +
    `layers with {"action": "delete"} are removed, and the session expires after 30 minutes ` +
    `of inactivity.` +
    warningSuffix;

  res.json({
    message,
    embedUrl,
    display: buildDisplay("embed", embedUrl, { height: 420, title: "Vector Animation" }),
    sessionId: activeSessionId,
    animationId: embedId,
    duration: sessionAnimation.duration,
    layerCount: sessionAnimation.layers.length,
    layerIds,
    totalKeyframes,
    canvasSize: `${sessionAnimation.width}x${sessionAnimation.height}`,
    isAppend: isExistingSession,
  });
}));

router.get("/vector-animation/embed", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as Record<string, string>;
  if (!id) return res.status(400).send("Missing 'id' parameter");
  
  let entry = await getVectorAnimation(id);
  if (!entry) {
    entry = vectorAnimationEmbeds.get(id) || null;
  }
  
  if (!entry) {
    return res.status(404).send("Vector animation not found or expired");
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(buildVectorAnimationEmbedHtml(entry.animation, entry.options));
}));

// ────────────────────────────────────────────────────────────
// Health
// ────────────────────────────────────────────────────────────

export function getCreativeHealth() {
  const emojiHealth = getEmojiKitchenHealth();
  return {
    generateImage: "on-demand (Google Gemini via Prism)",
    describeImage: "on-demand (Google Gemini via Prism)",
    textToSpeech: "on-demand (ElevenLabs/OpenAI via Prism)",
    speechToText: "on-demand (OpenAI Whisper via Prism)",
    vectorAnimation: "on-demand (Creative Vector Animation Engine)",
    emojiKitchen: {
      lastFetch: emojiHealth.lastFetch,
      hasData: emojiHealth.hasData,
      count: emojiHealth.count,
      error: emojiHealth.error,
    },
  };
}

export default router;
