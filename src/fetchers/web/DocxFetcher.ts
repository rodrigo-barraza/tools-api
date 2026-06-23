// ─── Download and Extract Text from DOCX URLs ────────────────

import mammoth from "mammoth";
import { errorMessage, randomUserAgent } from "../../utilities.ts";

const MAX_DOCX_BYTES = 10_485_760; // 10 MB
const MAX_TEXT_CHARS = 100_000;
const FETCH_TIMEOUT_MS = 30_000;

// Define an interface for the mammoth methods not fully exposed in typescript declarations
interface MammothExtended {
  convertToMarkdown(
    input: { buffer: Buffer },
    options?: unknown,
  ): Promise<{ value: string; messages: { type: string; message: string }[] }>;
  extractRawText(
    input: { buffer: Buffer },
  ): Promise<{ value: string; messages: { type: string; message: string }[] }>;
}

const mammothParser = mammoth as unknown as MammothExtended;

// ─── Public API ───────────────────────────────────────────────────

export interface DocxOptions {
  maxChars?: number | string;
  outputFormat?: "markdown" | "text";
}

/**
 * Download a DOCX from a URL and extract its text/markdown content.
 */
export async function readDocxUrl(url: string, options: DocxOptions = {}) {
  if (!url || typeof url !== "string") {
    return { error: "URL is required" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": randomUserAgent(),
        Accept:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/octet-stream,*/*",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}`, url };
    }

    // Verify content type
    const contentType = response.headers.get("content-type") || "";
    const isDocxContentType =
      contentType.includes("wordprocessingml") ||
      contentType.includes("msword") ||
      contentType.includes("octet-stream");

    if (!isDocxContentType) {
      return {
        error: `URL does not point to a DOCX (content-type: ${contentType})`,
        url,
      };
    }

    // Check content length
    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
      10,
    );
    if (contentLength > MAX_DOCX_BYTES) {
      return {
        error: `DOCX too large: ${(contentLength / 1_048_576).toFixed(1)} MB (max: 10 MB)`,
        url,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_DOCX_BYTES) {
      return {
        error: `DOCX too large: ${(buffer.length / 1_048_576).toFixed(1)} MB (max: 10 MB)`,
        url,
      };
    }

    const targetFormat = options.outputFormat || "markdown";
    const useMarkdown = targetFormat === "markdown";

    // Perform mammoth conversion
    const conversionResult = useMarkdown
      ? await mammothParser.convertToMarkdown({ buffer })
      : await mammothParser.extractRawText({ buffer });

    let content = conversionResult.value || "";
    const charCount = content.length;

    // Apply max characters limit if requested
    const charsLimit = options.maxChars
      ? parseInt(String(options.maxChars), 10)
      : MAX_TEXT_CHARS;
    const isTruncated = charCount > charsLimit;
    if (isTruncated) {
      content = content.slice(0, charsLimit) + "\n\n... [truncated]";
    }

    const warnings = conversionResult.messages.map((message) => message.message);

    return {
      url,
      info: {
        contentType,
      },
      content,
      charCount,
      truncated: isTruncated,
      outputFormat: targetFormat,
      warnings,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        error: `DOCX download timed out after ${FETCH_TIMEOUT_MS / 1000}s`,
        url,
      };
    }
    return { error: `DOCX extraction failed: ${errorMessage(error)}`, url };
  }
}
