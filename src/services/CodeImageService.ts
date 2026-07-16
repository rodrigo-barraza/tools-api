// ─── Code → Image Rendering (carbon.now.sh-style) ───────────
// Syntax-highlighted code screenshots: Shiki tokenizes to themed HTML
// (https://github.com/shikijs/shiki), a styled macOS-window card wraps it,
// and the shared warm Playwright Chromium rasterizes the card to PNG.
// Inspired by carbon.now.sh, charmbracelet/freeze
// (https://github.com/charmbracelet/freeze) and Aloxaf/silicon
// (https://github.com/Aloxaf/silicon); surveyed via pi0/shiki-image
// (https://github.com/pi0/shiki-image).

import { codeToHtml, bundledLanguages } from "shiki";
import { getSharedBrowser } from "./AgenticBrowserService.ts";
import { escapeHtml } from "../utilities.ts";

// ─── Limits ────────────────────────────────────────────────────

const MAX_RENDER_CODE_CHARS = 20_000;
const MAX_RENDER_CODE_LINES = 300;
const SCREENSHOT_TIMEOUT_MS = 20_000;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 28;

// Curated theme set — every entry is a Shiki bundled theme, loaded on
// demand from node_modules (no CDN).
export const CODE_IMAGE_THEMES = [
  "github-dark",
  "github-light",
  "dracula",
  "nord",
  "one-dark-pro",
  "monokai",
  "solarized-light",
  "catppuccin-mocha",
] as const;
export type CodeImageTheme = (typeof CODE_IMAGE_THEMES)[number];

const LIGHT_THEMES = new Set<string>(["github-light", "solarized-light"]);

export const CODE_IMAGE_BACKGROUNDS = ["gradient", "plain", "transparent"] as const;
export type CodeImageBackground = (typeof CODE_IMAGE_BACKGROUNDS)[number];

export interface RenderCodeImageInput {
  code: string;
  lang?: string;
  theme?: string;
  title?: string;
  windowChrome?: boolean;
  background?: string;
  fontSize?: number;
}

export interface RenderCodeImageResult {
  buffer: Buffer;
  lang: string;
  /** Set when the requested language was unknown and plaintext was used. */
  langFallback?: string;
  theme: CodeImageTheme;
  lineCount: number;
}

// ─── HTML card shell ───────────────────────────────────────────

function buildCardHtml({
  highlighted,
  themeBackground,
  isLightTheme,
  title,
  windowChrome,
  background,
  fontSize,
}: {
  highlighted: string;
  themeBackground: string;
  isLightTheme: boolean;
  title: string;
  windowChrome: boolean;
  background: CodeImageBackground;
  fontSize: number;
}) {
  const outerBackground =
    background === "gradient"
      ? isLightTheme
        ? "linear-gradient(135deg, #a8c0ff 0%, #f0d9ff 100%)"
        : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
      : background === "plain"
        ? themeBackground
        : "transparent";

  const titleBar = windowChrome
    ? `<div class="titlebar">
        <span class="dot" style="background:#ff5f57"></span>
        <span class="dot" style="background:#febc2e"></span>
        <span class="dot" style="background:#28c840"></span>
        ${title ? `<span class="title">${escapeHtml(title)}</span>` : ""}
      </div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { background: transparent; }
  #shot {
    display: inline-block;
    padding: ${background === "transparent" ? "0" : "48px"};
    background: ${outerBackground};
  }
  .window {
    border-radius: 12px;
    overflow: hidden;
    ${background === "transparent" ? "" : "box-shadow: 0 20px 60px rgba(0,0,0,0.45);"}
    background: ${themeBackground};
  }
  .titlebar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px 0 16px;
  }
  .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
  .title {
    margin-left: 8px;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;
    font-size: 12px;
    color: ${isLightTheme ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.55)"};
  }
  pre.shiki {
    margin: 0;
    padding: 20px 26px 24px 26px;
    max-width: 1100px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: ${fontSize}px;
    line-height: 1.55;
  }
  pre.shiki, pre.shiki code {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace;
  }
</style></head>
<body><div id="shot"><div class="window">${titleBar}${highlighted}</div></div></body></html>`;
}

// ─── Renderer ──────────────────────────────────────────────────

/**
 * Render source code to a syntax-highlighted PNG card.
 * Throws on invalid input; the route maps errors to 400s.
 */
export async function renderCodeImage({
  code,
  lang = "text",
  theme = "github-dark",
  title = "",
  windowChrome = true,
  background = "gradient",
  fontSize = 14,
}: RenderCodeImageInput): Promise<RenderCodeImageResult> {
  if (!code || typeof code !== "string") {
    throw new Error("'code' is required (string)");
  }
  if (code.length > MAX_RENDER_CODE_CHARS) {
    throw new Error(
      `Code exceeds ${MAX_RENDER_CODE_CHARS} characters — render a shorter excerpt`,
    );
  }
  const lineCount = code.split("\n").length;
  if (lineCount > MAX_RENDER_CODE_LINES) {
    throw new Error(
      `Code exceeds ${MAX_RENDER_CODE_LINES} lines — render a shorter excerpt`,
    );
  }
  if (!CODE_IMAGE_THEMES.includes(theme as CodeImageTheme)) {
    throw new Error(
      `Unknown theme '${theme}'. Available: ${CODE_IMAGE_THEMES.join(", ")}`,
    );
  }
  if (!CODE_IMAGE_BACKGROUNDS.includes(background as CodeImageBackground)) {
    throw new Error(
      `Unknown background '${background}'. Available: ${CODE_IMAGE_BACKGROUNDS.join(", ")}`,
    );
  }

  // "ansi" is a Shiki special language for colored terminal output; every
  // other language must be in the bundled set, else fall back to plaintext.
  const requestedLang = String(lang).toLowerCase();
  let effectiveLang = requestedLang;
  let langFallback: string | undefined;
  if (requestedLang !== "ansi" && requestedLang !== "text" && requestedLang !== "txt") {
    if (!(requestedLang in bundledLanguages)) {
      effectiveLang = "text";
      langFallback = requestedLang;
    }
  }

  const highlighted = await codeToHtml(code, {
    lang: effectiveLang,
    theme: theme as CodeImageTheme,
  });

  // Shiki inlines the theme's background on the <pre>; reuse it for the
  // window chrome so the title bar matches the code pane.
  const themeBackground =
    highlighted.match(/background-color:(#[0-9a-fA-F]{3,8})/)?.[1] ??
    (LIGHT_THEMES.has(theme) ? "#ffffff" : "#24292e");

  const html = buildCardHtml({
    highlighted,
    themeBackground,
    isLightTheme: LIGHT_THEMES.has(theme),
    title,
    windowChrome,
    background: background as CodeImageBackground,
    fontSize: Math.min(Math.max(Math.round(fontSize) || 14, MIN_FONT_SIZE), MAX_FONT_SIZE),
  });

  const browser = await getSharedBrowser();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 400 },
    deviceScaleFactor: 2,
  });
  try {
    const page = await context.newPage();
    await page.setContent(html, {
      waitUntil: "load",
      timeout: SCREENSHOT_TIMEOUT_MS,
    });
    const buffer = await page.locator("#shot").screenshot({
      type: "png",
      timeout: SCREENSHOT_TIMEOUT_MS,
      omitBackground: background === "transparent",
    });
    return {
      buffer: Buffer.from(buffer),
      lang: effectiveLang,
      ...(langFallback && { langFallback }),
      theme: theme as CodeImageTheme,
      lineCount,
    };
  } finally {
    await context.close().catch(() => {});
  }
}
