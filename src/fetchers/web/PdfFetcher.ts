// ─── Download and Extract Text from PDF URLs ────────────────

import { PDFParse } from "pdf-parse";
import { errorMessage } from "../../utilities.ts";

const MAX_PDF_BYTES = 10_485_760; // 10 MB
const MAX_TEXT_CHARS = 100_000;
const FETCH_TIMEOUT_MS = 30_000;

// ─── Public API ───────────────────────────────────────────────────

export interface PdfOptions {
  maxPages?: number | string;
  maxChars?: number | string;
  pages?: number[];
  startPage?: number | string;
  endPage?: number | string;
}

/**
 * Download a PDF from a URL and extract its text content.
 */
export async function readPdfUrl(url: string, options: PdfOptions = {}) {
  if (!url || typeof url !== "string") {
    return { error: "URL is required" };
  }

  // pdf-parse v2 types mark .load()/.getInfo()/.getText()/.destroy() as private,
  // but they are the documented public API — define a local interface to bypass.
  interface PdfParser {
    load(): Promise<void>;
    getInfo(): Promise<{ numPages?: number; info?: Record<string, string> }>;
    getText(
      params?: Record<string, unknown>,
    ): Promise<{ text: string; total?: number }>;
    destroy(): Promise<void>;
  }
  let parser: PdfParser | undefined;
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
      return {
        error: `URL does not point to a PDF (content-type: ${contentType})`,
        url,
      };
    }

    // Check content length
    const contentLength = parseInt(
      response.headers.get("content-length") || "0",
      10,
    );
    if (contentLength > MAX_PDF_BYTES) {
      return {
        error: `PDF too large: ${(contentLength / 1_048_576).toFixed(1)} MB (max: 10 MB)`,
        url,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    if (data.length > MAX_PDF_BYTES) {
      return {
        error: `PDF too large: ${(data.length / 1_048_576).toFixed(1)} MB (max: 10 MB)`,
        url,
      };
    }

    // pdf-parse v2: pass data in constructor, then load + extract
    parser = new PDFParse({ data }) as unknown as PdfParser;
    await parser.load();

    const info = await parser.getInfo();

    // Build text extraction params — enable hyperlink detection by default
    const textParams: Record<string, unknown> = {
      parseHyperlinks: true,
    };

    // Specific pages take priority over first-N / range
    if (Array.isArray(options.pages) && options.pages.length > 0) {
      textParams.partial = options.pages;
    } else if (options.startPage || options.endPage) {
      // Explicit page range: first..last (inclusive)
      const start = options.startPage ? parseInt(String(options.startPage), 10) : 1;
      const end = options.endPage ? parseInt(String(options.endPage), 10) : (info.numPages || 999999);
      textParams.first = start;
      textParams.last = end;
    } else if (options.maxPages) {
      // Extract the first N pages (not the last N — the previous implementation was wrong)
      textParams.first = parseInt(String(options.maxPages), 10);
    }

    const textResult = await parser.getText(textParams);
    let text = textResult.text || "";
    const pageCount = textResult.total || info.numPages || null;
    const charCount = text.length;

    // Apply max characters limit if requested
    const charsLimit = options.maxChars
      ? parseInt(String(options.maxChars), 10)
      : MAX_TEXT_CHARS;
    const isTruncated = charCount > charsLimit;
    if (isTruncated) {
      text = text.slice(0, charsLimit) + "\n\n... [truncated]";
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
      truncated: isTruncated,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        error: `PDF download timed out after ${FETCH_TIMEOUT_MS / 1000}s`,
        url,
      };
    }
    return { error: `PDF extraction failed: ${errorMessage(error)}`, url };
  } finally {
    if (parser) {
      await parser.destroy().catch(() => {});
    }
  }
}
