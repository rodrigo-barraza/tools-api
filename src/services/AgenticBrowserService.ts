// ─── Headless Playwright Automation ─────────────────────────

import { chromium, Browser, BrowserContext, Page } from "playwright";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import logger from "../logger.ts";
import {
  BROWSER_SESSION_IDLE_MS,
  BROWSER_LOAD_TIMEOUT_MS,
  BROWSER_NETWORK_IDLE_TIMEOUT_MS,
  BROWSER_ACTION_TIMEOUT_MS,
  BROWSER_DOM_TIMEOUT_MS,
  BROWSER_SCRIPT_TIMEOUT_MS,
  BROWSER_MAX_SCRIPT_OUTPUT,
  BROWSER_MAX_CONTENT_LENGTH,
} from "../constants.ts";
import { errorMessage } from "../utilities.ts";

// ────────────────────────────────────────────────────────────
// Session Management
// ────────────────────────────────────────────────────────────

interface BrowserSession {
  page: Page;
  context: BrowserContext;
  lastUsed: number;
}

let browser: Browser | null = null;
const sessions = new Map<string, BrowserSession>();

const MAX_SESSIONS = 3;
const VIEWPORT = { width: 1280, height: 720 };

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Get or launch the singleton browser instance.
 */
async function getBrowser() {
  if (browser && browser.isConnected()) return browser;

  // Browser died or never existed — purge all stale sessions that belonged
  // to the old instance before launching a fresh one
  if (sessions.size > 0) {
    logger.warn(
      `[AgenticBrowser] Browser disconnected, purging ${sessions.size} stale sessions`,
    );
    sessions.clear();
  }

  browser = await chromium.launch({
    headless: true,
    // In Docker, system Chromium is used instead of Playwright's bundled browser
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    }),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  // Start idle cleanup if not already running
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupIdleSessions, 30_000);
    cleanupInterval.unref?.(); // Don't keep process alive
  }

  logger.info("[AgenticBrowser] Chromium launched");
  return browser;
}

/**
 * Get or create a session page.
 */
async function getSession(sessionId: string): Promise<BrowserSession> {
  const existingSession = sessions.get(sessionId);
  if (existingSession) {
    // Validate the cached session is still alive — the page or browser context
    // may have been closed externally (manual window close, browser crash, etc.)
    const pageAlive = existingSession.page && !existingSession.page.isClosed();
    const browserAlive = browser && browser.isConnected();

    if (pageAlive && browserAlive) {
      existingSession.lastUsed = Date.now();
      return existingSession;
    }

    // Stale session — evict silently and fall through to create a new one
    logger.warn(
      `[AgenticBrowser] Session "${sessionId}" stale (page=${pageAlive}, browser=${browserAlive}), recreating`,
    );
    try {
      await existingSession.context.close();
    } catch {
      /* already dead */
    }
    sessions.delete(sessionId);
  }

  if (sessions.size >= MAX_SESSIONS) {
    // Evict oldest session
    let oldestId: string | null = null;
    let oldestTime = Infinity;
    for (const [id, s] of sessions) {
      if (s.lastUsed < oldestTime) {
        oldestTime = s.lastUsed;
        oldestId = id;
      }
    }
    if (oldestId) await closeSession(oldestId);
  }

  const browserInstance = await getBrowser();
  const context = await browserInstance.newContext({
    viewport: VIEWPORT,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const session = { page, context, lastUsed: Date.now() };
  sessions.set(sessionId, session);

  logger.info(
    `[AgenticBrowser] Session "${sessionId}" created (${sessions.size}/${MAX_SESSIONS})`,
  );
  return session;
}

/**
 * Close and clean up a session.
 */
async function closeSession(sessionId: string): Promise<boolean> {
  const session = sessions.get(sessionId);
  if (!session) return false;

  try {
    await session.context.close();
  } catch {
    /* page may already be closed */
  }
  sessions.delete(sessionId);
  logger.info(
    `[AgenticBrowser] Session "${sessionId}" closed (${sessions.size}/${MAX_SESSIONS})`,
  );
  return true;
}

/**
 * Clean up sessions idle for > SESSION_IDLE_MS.
 */
function cleanupIdleSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastUsed > BROWSER_SESSION_IDLE_MS) {
      logger.info(`[AgenticBrowser] Evicting idle session "${id}"`);
      closeSession(id);
    }
  }

  // Stop cleanup interval if no sessions and no browser
  if (sessions.size === 0 && browser && !browser.isConnected()) {
    browser = null;
  }
}

// ────────────────────────────────────────────────────────────
// Action Handlers
// ────────────────────────────────────────────────────────────

async function actionNavigate(page: Page, { url }: { url?: string }) {
  if (!url) return { error: "Missing required parameter: url" };

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: BROWSER_LOAD_TIMEOUT_MS,
    });

    // Wait a bit more for dynamic content
    await page
      .waitForLoadState("networkidle", {
        timeout: BROWSER_NETWORK_IDLE_TIMEOUT_MS,
      })
      .catch(() => {});

    return {
      action: "navigate",
      url: page.url(),
      title: await page.title(),
      status: response?.status() || null,
    };
  } catch (error: unknown) {
    return { error: `Navigation failed: ${errorMessage(error)}` };
  }
}

async function actionScreenshot(
  page: Page,
  { fullPage, selector }: { fullPage?: boolean; selector?: string },
) {
  try {
    let screenshotBuffer: Buffer;
    if (selector) {
      const element = await page.$(selector);
      if (!element) return { error: `Element not found: ${selector}` };
      screenshotBuffer = await element.screenshot({ type: "png" });
    } else {
      screenshotBuffer = await page.screenshot({
        type: "png",
        fullPage: fullPage === true,
      });
    }

    return {
      action: "screenshot",
      url: page.url(),
      title: await page.title(),
      screenshot: screenshotBuffer.toString("base64"),
      mimeType: "image/png",
    };
  } catch (error: unknown) {
    return { error: `Screenshot failed: ${errorMessage(error)}` };
  }
}

async function actionClick(page: Page, { selector }: { selector?: string }) {
  if (!selector) return { error: "Missing required parameter: selector" };

  try {
    await page.click(selector, { timeout: BROWSER_ACTION_TIMEOUT_MS });

    // Wait for potential navigation or re-render
    await page
      .waitForLoadState("domcontentloaded", { timeout: BROWSER_DOM_TIMEOUT_MS })
      .catch(() => {});

    return {
      action: "click",
      selector,
      url: page.url(),
      title: await page.title(),
    };
  } catch (error: unknown) {
    return { error: `Click failed on "${selector}": ${errorMessage(error)}` };
  }
}

async function actionType(
  page: Page,
  {
    selector,
    text,
    pressEnter,
  }: { selector?: string; text?: string; pressEnter?: boolean },
) {
  if (!selector) return { error: "Missing required parameter: selector" };
  if (text === undefined || text === null)
    return { error: "Missing required parameter: text" };

  try {
    // Clear existing content and type new text
    await page.fill(selector, "", { timeout: BROWSER_ACTION_TIMEOUT_MS });
    await page.fill(selector, text, { timeout: BROWSER_ACTION_TIMEOUT_MS });

    if (pressEnter) {
      await page.press(selector, "Enter");
      await page
        .waitForLoadState("domcontentloaded", {
          timeout: BROWSER_DOM_TIMEOUT_MS,
        })
        .catch(() => {});
    }

    return {
      action: "type",
      selector,
      text,
      pressEnter: pressEnter || false,
      url: page.url(),
      title: await page.title(),
    };
  } catch (error: unknown) {
    return { error: `Type failed on "${selector}": ${errorMessage(error)}` };
  }
}

async function actionScroll(
  page: Page,
  {
    direction,
    selector,
    amount,
  }: { direction?: string; selector?: string; amount?: number },
) {
  try {
    if (selector) {
      await page.evaluate(
        ({ sel }: { sel: string }) => {
          const element = document.querySelector(sel);
          if (element)
            element.scrollIntoView({ behavior: "smooth", block: "center" });
        },
        { sel: selector },
      );
    } else {
      const pixels = amount || 500;
      const delta = direction === "up" ? -pixels : pixels;

      await page.evaluate((scrollDelta: number) => window.scrollBy(0, scrollDelta), delta);
    }

    // Small delay for scroll animation
    await page.waitForTimeout(300);

    return {
      action: "scroll",
      direction: selector ? "to element" : direction || "down",
      url: page.url(),
    };
  } catch (error: unknown) {
    return { error: `Scroll failed: ${errorMessage(error)}` };
  }
}

async function actionEvaluate(
  page: Page,
  { expression }: { expression?: string },
) {
  if (!expression) return { error: "Missing required parameter: expression" };

  try {
    const result = await page.evaluate(expression);

    return {
      action: "evaluate",
      result:
        typeof result === "object"
          ? JSON.stringify(result, null, 2)
          : String(result),
      url: page.url(),
    };
  } catch (error: unknown) {
    return { error: `Evaluate failed: ${errorMessage(error)}` };
  }
}

async function actionGetContent(
  page: Page,
  { selector, format }: { selector?: string; format?: string },
) {
  try {
    let content: string | null;

    if (format === "html") {
      content = selector
        ? await page
            .$eval(selector, (element: HTMLElement) => element.innerHTML)
            .catch(() => null)
        : await page.content();
    } else {
      // Default: extract text content
      content = selector
        ? await page
            .$eval(selector, (element: HTMLElement) => element.innerText)
            .catch(() => null)
        : await page.evaluate(() => document.body.innerText);
    }

    if (content === null) {
      return { error: `Element not found: ${selector}` };
    }

    // Truncate to max content length (same as fetch_url)
    const maxLength = BROWSER_MAX_CONTENT_LENGTH;
    const truncated = content.length > maxLength;
    if (truncated) content = content.slice(0, maxLength);

    return {
      action: "get_content",
      format: format || "text",
      url: page.url(),
      title: await page.title(),
      content,
      length: content.length,
      truncated,
    };
  } catch (error: unknown) {
    return { error: `Content extraction failed: ${errorMessage(error)}` };
  }
}

async function actionWait(
  page: Page,
  {
    selector,
    timeout,
    state,
  }: {
    selector?: string;
    timeout?: number;
    state?: "attached" | "detached" | "visible" | "hidden";
  },
) {
  try {
    if (selector) {
      await page.waitForSelector(selector, {
        timeout: timeout || BROWSER_ACTION_TIMEOUT_MS,
        state: state || "visible",
      });
      return {
        action: "wait",
        waited_for: `selector: ${selector}`,
        url: page.url(),
      };
    }

    // Wait for timeout duration
    const waitMs = Math.min(timeout || 2_000, 30_000);
    await page.waitForTimeout(waitMs);
    return {
      action: "wait",
      waited_for: `${waitMs}ms`,
      url: page.url(),
    };
  } catch (error: unknown) {
    return { error: `Wait failed: ${errorMessage(error)}` };
  }
}

async function actionGetElements(
  page: Page,
  { selector, limit }: { selector?: string; limit?: number },
) {
  try {
    const maxElements = Math.min(limit || 50, 100);
    const scope = selector || "body";

    const elements = await page.evaluate(
      ({ scope, max }: { scope: string; max: number }) => {
        const root = document.querySelector(scope) || document.body;

        // All interactive elements worth reporting to an LLM
        const interactiveSelectors = [
          "a[href]",
          "button",
          "input",
          "textarea",
          "select",
          "[role='button']",
          "[role='link']",
          "[role='tab']",
          "[role='menuitem']",
          "[role='checkbox']",
          "[role='radio']",
          "[role='switch']",
          "[role='combobox']",
          "[role='searchbox']",
          "[role='textbox']",
          "[contenteditable='true']",
        ];

        const allElements = root.querySelectorAll(
          interactiveSelectors.join(", "),
        );
        const results: Record<string, unknown>[] = [];

        for (const element of allElements) {
          if (results.length >= max) break;

          // Skip invisible elements
          const rect = element.getBoundingClientRect();

          const style = window.getComputedStyle(element);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            (rect.width === 0 && rect.height === 0)
          )
            continue;

          // Build the best CSS selector for this element
          let cssSelector = "";
          if (element.id) {
            cssSelector = `#${element.id}`;
          } else if (element.getAttribute("data-testid")) {
            cssSelector = `[data-testid="${element.getAttribute("data-testid")}"]`;
          } else if (element.getAttribute("name")) {
            cssSelector = `${element.tagName.toLowerCase()}[name="${element.getAttribute("name")}"]`;
          } else if (element.getAttribute("aria-label")) {
            cssSelector = `[aria-label="${element.getAttribute("aria-label")}"]`;
          } else if (
            element.className &&
            typeof element.className === "string"
          ) {
            // Use first meaningful class
            const cls = element.className.trim().split(/\s+/)[0];
            if (cls) cssSelector = `${element.tagName.toLowerCase()}.${cls}`;
          }

          // Fallback: tag + nth-of-type
          if (!cssSelector) {
            cssSelector = element.tagName.toLowerCase();
          }

          const text = (element.textContent || "").trim().slice(0, 80);
          const tag = element.tagName.toLowerCase();
          const entry: Record<string, unknown> = { tag, selector: cssSelector };

          if (text) entry.text = text;
          if (element.getAttribute("type"))
            entry.type = element.getAttribute("type");
          if (element.getAttribute("placeholder"))
            entry.placeholder = element.getAttribute("placeholder");
          if (element.getAttribute("href"))
            entry.href = element.getAttribute("href")?.slice(0, 120);
          if (element.getAttribute("value"))
            entry.value = element.getAttribute("value")?.slice(0, 60);
          if (element.getAttribute("role"))
            entry.role = element.getAttribute("role");
          if ((element as HTMLInputElement).disabled) entry.disabled = true;
          if (element.getAttribute("aria-label"))
            entry.ariaLabel = element.getAttribute("aria-label");

          results.push(entry);
        }

        return results;
      },
      { scope, max: maxElements },
    );

    return {
      action: "get_elements",
      url: page.url(),
      title: await page.title(),
      count: elements.length,
      elements,
    };
  } catch (error: unknown) {
    return { error: `Get elements failed: ${errorMessage(error)}` };
  }
}

// ────────────────────────────────────────────────────────────
// Accessibility Snapshot Actions
// ────────────────────────────────────────────────────────────

/**
 * Capture an ARIA accessibility tree snapshot of the page.
 *
 * Returns a YAML-like text representation of the page's accessibility tree
 * with roles, names, states, and ref IDs for interactive elements.
 * This is ~4x more token-efficient than screenshots for LLM page understanding.
 *
 * Ref IDs (e.g. [ref=s1e5]) can be used with click_ref/type_ref actions.
 */
async function actionSnapshot(page: Page, { selector }: { selector?: string }) {
  try {
    const locator = selector ? page.locator(selector) : page.locator("body");

    // Playwright ≥1.49 supports locator.ariaSnapshot()
    const locWithSnapshot = locator as typeof locator & {
      ariaSnapshot?: () => Promise<string>;
    };
    if (typeof locWithSnapshot.ariaSnapshot === "function") {
      const snapshot = await locWithSnapshot.ariaSnapshot();
      return {
        action: "snapshot",
        url: page.url(),
        title: await page.title(),
        snapshot,
        format: "aria",
      };
    }

    // Fallback: use page.accessibility.snapshot() + format ourselves
    const pgWithAccessibility = page as typeof page & {
      accessibility?: {
        snapshot: (options?: {
          interestingOnly?: boolean;
        }) => Promise<AccessibilityNode | null>;
      };
    };
    const tree =
      (await pgWithAccessibility.accessibility?.snapshot({
        interestingOnly: true,
      })) || null;
    const formatted = formatAccessibilityTree(tree, 0);
    return {
      action: "snapshot",
      url: page.url(),
      title: await page.title(),
      snapshot: formatted,
      format: "a11y-tree",
    };
  } catch (error: unknown) {
    return { error: `Snapshot failed: ${errorMessage(error)}` };
  }
}

interface AccessibilityNode {
  role: string;
  name?: string;
  level?: number;
  checked?: boolean | "mixed";
  disabled?: boolean;
  expanded?: boolean;
  pressed?: boolean | "mixed";
  selected?: boolean;
  required?: boolean;
  valuetext?: string;
  value?: string | number;
  children?: AccessibilityNode[];
}

/**
 * Format an accessibility tree node into a readable indented text representation.
 * Fallback for when locator.ariaSnapshot() is unavailable.
 */
function formatAccessibilityTree(
  node: AccessibilityNode | null,
  depth: number,
): string {
  if (!node) return "";
  const indent = "  ".repeat(depth);
  const parts: string[] = [];

  // Role
  let line = `${indent}- ${node.role}`;

  // Name (accessible name)
  if (node.name) line += ` "${node.name}"`;

  // Key attributes
  const attrs: string[] = [];
  if (node.level != null) attrs.push(`level=${node.level}`);
  if (node.checked != null) attrs.push(`checked=${node.checked}`);
  if (node.disabled) attrs.push("disabled");
  if (node.expanded != null) attrs.push(`expanded=${node.expanded}`);
  if (node.pressed != null) attrs.push(`pressed=${node.pressed}`);
  if (node.selected != null) attrs.push(`selected=${node.selected}`);
  if (node.required) attrs.push("required");
  if (node.valuetext) attrs.push(`value="${node.valuetext}"`);
  if (node.value != null && !node.valuetext)
    attrs.push(`value="${node.value}"`);
  if (attrs.length) line += ` [${attrs.join("][")}]`;

  parts.push(line);

  // Recurse children
  if (node.children) {
    for (const child of node.children) {
      parts.push(formatAccessibilityTree(child, depth + 1));
    }
  }

  return parts.filter(Boolean).join("\n");
}

// ────────────────────────────────────────────────────────────
// Ref-Based Interaction Actions
// ────────────────────────────────────────────────────────────
// These use ARIA role + name locators from snapshot output
// to interact with elements without CSS selectors.

/**
 * Resolve a ref string from an aria snapshot to a Playwright locator.
 *
 * Supports two modes:
 * 1. If ariaSnapshot gave us [ref=X] IDs (Playwright ≥1.49), use getByRole/getByLabel
 * 2. Direct role + name matching: "button:Submit", "link:Home", "textbox:Search"
 */
function resolveRef(page: Page, ref: string) {
  // Format: "role:name" (e.g. "button:Submit", "link:Get started")
  const colonIndex = ref.indexOf(":");
  if (colonIndex > 0) {
    const role = ref.slice(0, colonIndex).trim() as Parameters<
      typeof page.getByRole
    >[0];
    const name = ref.slice(colonIndex + 1).trim();
    return page.getByRole(role, { name, exact: false });
  }

  // Fallback: try as aria-label
  return page.getByLabel(ref, { exact: false });
}

async function actionClickRef(page: Page, { ref }: { ref?: string }) {
  if (!ref) return { error: "Missing required parameter: ref" };

  try {
    const locator = resolveRef(page, ref);
    await locator.click({ timeout: BROWSER_ACTION_TIMEOUT_MS });
    await page
      .waitForLoadState("domcontentloaded", { timeout: BROWSER_DOM_TIMEOUT_MS })
      .catch(() => {});

    return {
      action: "click_ref",
      ref,
      url: page.url(),
      title: await page.title(),
    };
  } catch (error: unknown) {
    return { error: `click_ref failed for "${ref}": ${errorMessage(error)}` };
  }
}

async function actionTypeRef(
  page: Page,
  {
    ref,
    text,
    pressEnter,
  }: { ref?: string; text?: string; pressEnter?: boolean },
) {
  if (!ref) return { error: "Missing required parameter: ref" };
  if (text === undefined || text === null)
    return { error: "Missing required parameter: text" };

  try {
    const locator = resolveRef(page, ref);
    await locator.fill("", { timeout: BROWSER_ACTION_TIMEOUT_MS });
    await locator.fill(text, { timeout: BROWSER_ACTION_TIMEOUT_MS });

    if (pressEnter) {
      await locator.press("Enter");
      await page
        .waitForLoadState("domcontentloaded", {
          timeout: BROWSER_DOM_TIMEOUT_MS,
        })
        .catch(() => {});
    }

    return {
      action: "type_ref",
      ref,
      text,
      pressEnter: pressEnter || false,
      url: page.url(),
      title: await page.title(),
    };
  } catch (error: unknown) {
    return { error: `type_ref failed for "${ref}": ${errorMessage(error)}` };
  }
}

async function actionHoverRef(page: Page, { ref }: { ref?: string }) {
  if (!ref) return { error: "Missing required parameter: ref" };

  try {
    const locator = resolveRef(page, ref);
    await locator.hover({ timeout: BROWSER_ACTION_TIMEOUT_MS });

    return {
      action: "hover_ref",
      ref,
      url: page.url(),
    };
  } catch (error: unknown) {
    return { error: `hover_ref failed for "${ref}": ${errorMessage(error)}` };
  }
}

async function actionSelectRef(
  page: Page,
  { ref, value }: { ref?: string; value?: string },
) {
  if (!ref) return { error: "Missing required parameter: ref" };
  if (!value) return { error: "Missing required parameter: value" };

  try {
    const locator = resolveRef(page, ref);
    await locator.selectOption(value, { timeout: BROWSER_ACTION_TIMEOUT_MS });

    return {
      action: "select_ref",
      ref,
      value,
      url: page.url(),
      title: await page.title(),
    };
  } catch (error: unknown) {
    return { error: `select_ref failed for "${ref}": ${errorMessage(error)}` };
  }
}

// ────────────────────────────────────────────────────────────
// Playwright Script Execution
// ────────────────────────────────────────────────────────────

/**
 * Execute an arbitrary Playwright script in a subprocess.
 *
 * The script is written to a temp file and executed via `node`. It receives
 * the browser's WebSocket endpoint via the BROWSER_WS_ENDPOINT env var,
 * allowing it to connect to the existing singleton browser session.
 *
 * Scripts should use `chromium.connectOverCDP(process.env.BROWSER_WS_ENDPOINT)`
 * to connect.
 */
async function actionRunScript(
  _page: Page,
  { script, timeout }: { script?: string; timeout?: number },
) {
  if (!script) return { error: "Missing required parameter: script" };

  // Ensure the browser is running and get its WebSocket endpoint
  const browserInstance = await getBrowser();
  const wsEndpoint =
    (
      browserInstance as Browser & { wsEndpoint?: () => string }
    ).wsEndpoint?.() || null;

  // Wrap the user script with boilerplate for connecting to our browser
  const wrappedScript = `
const { chromium } = require('playwright');

(async () => {
  const BROWSER_WS = process.env.BROWSER_WS_ENDPOINT;
  let browser;
  if (BROWSER_WS) {
    browser = await chromium.connectOverCDP(BROWSER_WS);
  } else {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  }
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages()[0] || await context.newPage();

  try {
    // ── User Script Start ──
    ${script}
    // ── User Script End ──
  } catch (error) {
    console.error('Script error:', error.message);
    process.exit(1);
  } finally {
    if (!BROWSER_WS) await browser.close();
  }
})();
`;

  let temporaryDirectory: string | undefined;
  let scriptPath: string | undefined;

  try {
    // Write script to temp file
    temporaryDirectory = await mkdtemp(join(tmpdir(), "pw-script-"));
    scriptPath = join(temporaryDirectory, "script.cjs");
    await writeFile(scriptPath, wrappedScript, "utf-8");

    // Execute in subprocess
    const clampedTimeout = Math.min(
      Math.max(timeout || BROWSER_SCRIPT_TIMEOUT_MS, 5_000),
      120_000,
    );
    const result = await executeScript(scriptPath, wsEndpoint, clampedTimeout);

    return {
      action: "run_script",
      ...(result as Record<string, unknown>),
    };
  } catch (error: unknown) {
    return { error: `run_script failed: ${errorMessage(error)}` };
  } finally {
    // Cleanup
    if (scriptPath) {
      unlink(scriptPath).catch(() => {});
    }
    if (temporaryDirectory) {
      import("node:fs")
        .then((fs) => fs.rmSync(temporaryDirectory!, { recursive: true, force: true }))
        .catch(() => {});
    }
  }
}

/**
 * Execute a Playwright script file in a subprocess.
 */
function executeScript(
  scriptPath: string,
  wsEndpoint: string | null,
  timeoutMs: number,
) {
  return new Promise<unknown>((resolve) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    let timedOut = false;
    let settled = false;

    const child = spawn("node", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        BROWSER_WS_ENDPOINT: wsEndpoint || "",
        CI: "true",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      detached: false,
    });

    child.stdin.end();

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutLength < BROWSER_MAX_SCRIPT_OUTPUT) {
        stdoutChunks.push(chunk);
        stdoutLength += chunk.length;
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrLength < BROWSER_MAX_SCRIPT_OUTPUT) {
        stderrChunks.push(chunk);
        stderrLength += chunk.length;
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    function finish(exitCode: number | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");

      resolve({
        success: exitCode === 0 && !timedOut,
        stdout:
          stdoutLength > BROWSER_MAX_SCRIPT_OUTPUT
            ? stdout + "\n... [output truncated]"
            : stdout,
        stderr:
          stderrLength > BROWSER_MAX_SCRIPT_OUTPUT
            ? stderr + "\n... [output truncated]"
            : stderr,
        exitCode: timedOut ? null : exitCode,
        timedOut,
        ...(timedOut && { error: `Script timed out after ${timeoutMs}ms` }),
      });
    }

    child.on("close", (code: number | null) => finish(code));
    child.on("error", (error: unknown) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          success: false,
          stdout: "",
          stderr: "",
          exitCode: null,
          error: `Process error: ${errorMessage(error)}`,
        });
      }
    });
  });
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

const ACTION_HANDLERS = {
  navigate: actionNavigate,
  screenshot: actionScreenshot,
  click: actionClick,
  type: actionType,
  scroll: actionScroll,
  evaluate: actionEvaluate,
  get_content: actionGetContent,
  get_elements: actionGetElements,
  wait: actionWait,
  snapshot: actionSnapshot,
  click_ref: actionClickRef,
  type_ref: actionTypeRef,
  hover_ref: actionHoverRef,
  select_ref: actionSelectRef,
  run_script: actionRunScript,
};

export interface AgenticBrowserParams {
  action: string;
  sessionId?: string;
  url?: string;
  fullPage?: boolean;
  selector?: string;
  text?: string;
  pressEnter?: boolean;
  direction?: string;
  amount?: number;
  expression?: string;
  format?: string;
  timeout?: number;
  state?: "attached" | "detached" | "visible" | "hidden";
  limit?: number;
  ref?: string;
  value?: string;
  script?: string;
  [key: string]: unknown;
}

/**
 * Execute a browser action.
 */
export async function agenticBrowserAction(params: AgenticBrowserParams) {
  const { action, sessionId: requestedSessionId, ...actionParams } = params;

  // Handle close without needing a session
  if (action === "close") {
    const sid = requestedSessionId || "default";
    const closed = await closeSession(sid);
    return {
      action: "close",
      sessionId: sid,
      closed,
    };
  }

  const handler = ACTION_HANDLERS[action as keyof typeof ACTION_HANDLERS];
  if (!handler) {
    return {
      error: `Unknown action: "${action}". Valid actions: ${Object.keys(ACTION_HANDLERS).join(", ")}, close`,
    };
  }

  const sessionId = requestedSessionId || "default";

  try {
    const session = await getSession(sessionId);
    const result = await handler(session.page, actionParams);

    return {
      ...(result as Record<string, unknown>),
      sessionId,
    };
  } catch (error: unknown) {
    return {
      error: `Browser action "${action}" failed: ${errorMessage(error)}`,
      sessionId,
    };
  }
}

/**
 * Get browser service health info.
 */
export function getBrowserHealth() {
  return {
    browserConnected: browser?.isConnected() || false,
    activeSessions: sessions.size,
    maxSessions: MAX_SESSIONS,
  };
}
