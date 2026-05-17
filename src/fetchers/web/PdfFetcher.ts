// ─── Download and Extract Text from PDF URLs ────────────────

import { PDFParse } from "pdf-parse";

const MAX_PDF_BYTES = 10_485_760; // 10 MB
const MAX_TEXT_CHARS = 100_000;
const FETCH_TIMEOUT_MS = 30_000;

// ─── Public API ───────────────────────────────────────────────────

/**
 * Download a PDF from a URL and extract its text content.
 * @param {string} url - URL pointing to a PDF file
 * @param {object} [options]
 * @param {number} [options.maxPages] - Only extract first N pages
 * @returns {Promise<object>}
 */
export async function readPdfUrl(url, options: Record<string, any> = {}) {
  if (!url || typeof url !== "string") {
    return { error: "URL is required" };
  }

  let parser;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/pdf,*/*",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}`, url };
    }

    // Verify content type
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      return { error: `URL does not point to a PDF (content-type: ${contentType})`, url };
    }

    // Check content length
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_PDF_BYTES) {
      return { error: `PDF too large: ${(contentLength / 1_048_576).toFixed(1)} MB (max: 10 MB)`, url };
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    if (data.length > MAX_PDF_BYTES) {
      return { error: `PDF too large: ${(data.length / 1_048_576).toFixed(1)} MB (max: 10 MB)`, url };
    }

    // pdf-parse v2: pass data in constructor, then load + extract
    parser = new PDFParse({ data });
    await parser.load();

    const info = await parser.getInfo();

    // Build text extraction params
    const textParams: Record<string, any> = {};
    if (options.maxPages) {
      textParams.last = parseInt(options.maxPages, 10);
    }

    const textResult = await parser.getText(textParams);
    let text = textResult.text || "";
    const pageCount = textResult.total || info.numPages || null;
    const charCount = text.length;
    const truncated = charCount > MAX_TEXT_CHARS;
    if (truncated) {
      text = text.slice(0, MAX_TEXT_CHARS) + "\n\n... [truncated]";
    }

    return {
      url,
      pageCount,
      info: {
        title: info.info?.Title || null,
        author: info.info?.Author || null,
        subject: info.info?.Subject || null,
        creator: info.info?.Creator || null,
        producer: info.info?.Producer || null,
        creationDate: info.info?.CreationDate || null,
      },
      text,
      charCount,
      truncated,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      return { error: `PDF download timed out after ${FETCH_TIMEOUT_MS / 1000}s`, url };
    }
    return { error: `PDF extraction failed: ${error.message}`, url };
  } finally {
    if (parser) {
      await parser.destroy().catch(() => {});
    }
  }
}
