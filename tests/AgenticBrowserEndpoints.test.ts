import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import { Express } from "express";

// Real-browser endpoint tests for /agentic/browser/action and /agentic/browser/script.
// Each "production failure" test reproduces an exact bad input a real model sent
// (conversation 6a2df2c59d7ab8c39c646aee, gemma-4-12b, 2026-06-14) that the old
// implementation handled badly.

const PAGE = `data:text/html,${encodeURIComponent(`
<html><head><title>Test Page</title></head><body>
  <h1>Hello</h1>
  <a href="#one" id="one-link">One</a>
  <input aria-label="Search box" id="search" type="text" />
  <button id="btn">Submit</button>
  <div style="display:none"><a class="hidden-link" href="#h1">H1</a></div>
  <a class="hidden-link" href="#h2" style="display:inline">H2</a>
</body></html>`)}`;

describe("Agentic Browser Endpoints", () => {
  let app: Express;
  const sessionId = "vitest-browser";

  beforeAll(async () => {
    const { default: router } = await import("../src/routes/AgenticRoutes.ts");
    app = createTestApp("/agentic", router);
  });

  afterAll(async () => {
    await request(app)
      .post("/agentic/browser/action")
      .send({ action: "close", sessionId });
  });

  const act = (body: Record<string, unknown>) =>
    request(app)
      .post("/agentic/browser/action")
      .send({ sessionId, ...body });

  describe("happy-path workflow", () => {
    it("navigate → snapshot → type → click echoes state on every response", async () => {
      const nav = await act({ action: "navigate", url: PAGE });
      expect(nav.body.error).toBeUndefined();
      expect(nav.body.title).toBe("Test Page");
      expect(nav.body.sessionId).toBe(sessionId);

      const snap = await act({ action: "snapshot" });
      expect(snap.body.error).toBeUndefined();
      expect(snap.body.snapshot).toContain('button "Submit"');
      expect(snap.body.sessionId).toBe(sessionId);

      const typed = await act({
        action: "type",
        selector: "#search",
        text: "hello",
      });
      expect(typed.body.error).toBeUndefined();
      expect(typed.body.sessionId).toBe(sessionId);

      const clicked = await act({ action: "click", selector: "#btn" });
      expect(clicked.body.error).toBeUndefined();
      expect(clicked.body.sessionId).toBe(sessionId);
    });

    it("fuses navigate into get_content via optional url", async () => {
      const res = await act({
        action: "get_content",
        url: PAGE,
      });
      expect(res.body.error).toBeUndefined();
      expect(res.body.content).toContain("Hello");
      expect(res.body.title).toBe("Test Page");
    });

    it("close reports whether a session existed", async () => {
      const res = await request(app)
        .post("/agentic/browser/action")
        .send({ action: "close", sessionId: "never-existed" });
      expect(res.body).toMatchObject({ action: "close", closed: false });
    });
  });

  describe("ref resolution accepts what models actually send", () => {
    it("accepts the snapshot's own 'role \"name\"' format (production failure)", async () => {
      await act({ action: "navigate", url: PAGE });
      // gemma-4 sent ref='link "English 7,189,000+ articles"' — copied verbatim
      // from snapshot output — and got a raw 10s timeout
      const res = await act({ action: "click_ref", ref: 'link "One"' });
      expect(res.body.error).toBeUndefined();
      expect(res.body.action).toBe("click_ref");
    });

    it("accepts the documented 'role:name' format", async () => {
      await act({ action: "navigate", url: PAGE });
      const res = await act({ action: "click_ref", ref: "button:Submit" });
      expect(res.body.error).toBeUndefined();
    });

    it("accepts a raw snapshot line with annotations", async () => {
      await act({ action: "navigate", url: PAGE });
      const res = await act({ action: "type_ref", ref: '- textbox "Search box":', text: "abc" });
      expect(res.body.error).toBeUndefined();
    });

    it("fails fast with a teaching error when the ref matches nothing", async () => {
      await act({ action: "navigate", url: PAGE });
      const started = Date.now();
      const res = await act({ action: "click_ref", ref: 'link "Does Not Exist"' });
      expect(Date.now() - started).toBeLessThan(8_000);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("snapshot");
    });
  });

  describe("selector failures teach recovery instead of burning timeouts", () => {
    it("click on a non-matching selector fails fast (production failure)", async () => {
      await act({ action: "navigate", url: PAGE });
      const started = Date.now();
      // gemma-4 sent a[href*="wiki/Canada"] on a page with no such link,
      // three times, burning 10s each on the old implementation
      const res = await act({ action: "click", selector: 'a[href*="wiki/Canada"]' });
      expect(Date.now() - started).toBeLessThan(8_000);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("No element matches");
      expect(res.body.error).toMatch(/snapshot|get_elements/);
    });

    it("click on a multi-match selector picks the first VISIBLE element (production failure)", async () => {
      await act({ action: "navigate", url: PAGE });
      // gemma-4 clicked a[href*="wiki/"] — 618 matches, first one invisible →
      // old implementation timed out trying to click the invisible first match
      const res = await act({ action: "click", selector: "a.hidden-link" });
      expect(res.body.error).toBeUndefined();
      expect(res.body.note).toContain("first visible");
    });
  });

  describe("numeric coercion", () => {
    it("accepts numeric strings for limit", async () => {
      await act({ action: "navigate", url: PAGE });
      const res = await act({ action: "get_elements", limit: "2" });
      expect(res.body.error).toBeUndefined();
      expect(res.body.count).toBeLessThanOrEqual(2);
    });

    it("rejects uninterpretable limit with a teaching error (was: NaN disabled the cap)", async () => {
      await act({ action: "navigate", url: PAGE });
      const res = await act({ action: "get_elements", limit: "many" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid limit");
      expect(res.body.error).toContain("50");
    });

    it("rejects uninterpretable wait timeout (was: NaN reached waitForTimeout)", async () => {
      await act({ action: "navigate", url: PAGE });
      const res = await act({ action: "wait", timeout: "fast" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid timeout");
    });

    it("rejects an invalid wait state with the valid list", async () => {
      const res = await act({ action: "wait", selector: "#btn", state: "shown" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("visible");
    });

    it("rejects uninterpretable scroll amount", async () => {
      await act({ action: "navigate", url: PAGE });
      const res = await act({ action: "scroll", amount: "a bit" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid amount");
    });
  });

  describe("output bounding", () => {
    it("truncates oversized evaluate results with a note", async () => {
      await act({ action: "navigate", url: PAGE });
      const res = await act({
        action: "evaluate",
        expression: '"x".repeat(50000)',
      });
      expect(res.body.error).toBeUndefined();
      expect(res.body.truncated).toBe(true);
      expect(res.body.result.length).toBeLessThanOrEqual(20_000);
      expect(res.body.note).toContain("truncated");
    });
  });

  describe("url validation", () => {
    it("rejects file:// navigation", async () => {
      const res = await act({ action: "navigate", url: "file:///etc/passwd" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("scheme");
    });

    it("rejects relative urls with an example", async () => {
      const res = await act({ action: "navigate", url: "example.com" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("https://example.com");
    });
  });

  describe("unknown action", () => {
    it("lists the valid actions", async () => {
      const res = await act({ action: "look_at" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("navigate");
      expect(res.body.error).toContain("close");
    });
  });

  describe("/agentic/browser/script", () => {
    it("executes a Playwright script in a subprocess (production failure: playwright was unresolvable)", async () => {
      // Both production calls failed with "Cannot find module 'playwright'"
      // because the script ran from a temp dir with a bare require
      const res = await request(app)
        .post("/agentic/browser/script")
        .send({
          script: `await page.goto(${JSON.stringify(PAGE)}); console.log(await page.title());`,
        });
      expect(res.body.error).toBeUndefined();
      expect(res.body.success).toBe(true);
      expect(res.body.stdout).toContain("Test Page");
    }, 60_000);

    it("returns a recovery hint for the non-async-helper mistake (production failure)", async () => {
      // gemma-4 defined a non-async helper containing await and got a bare
      // Node SyntaxError pointing at wrapped-file line numbers
      const res = await request(app)
        .post("/agentic/browser/script")
        .send({
          script: `function helper() { return await page.title(); }\nconsole.log(helper());`,
        });
      expect(res.body.success).toBe(false);
      expect(res.body.hint).toContain("async");
    }, 60_000);

    it("rejects an uninterpretable timeout (was: NaN → instant SIGKILL)", async () => {
      const res = await request(app)
        .post("/agentic/browser/script")
        .send({ script: "console.log(1);", timeout: "soon" });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid timeout");
    });
  });
});
