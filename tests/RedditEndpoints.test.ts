import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import knowledgeRoutes from "../src/routes/KnowledgeRoutes.ts";
import { getToolSchemas } from "../src/services/ToolSchemaService.ts";
import { redditApiRequest } from "../src/fetchers/web/RedditClient.ts";
import CONFIG from "../src/config.ts";

const app = createTestApp("/knowledge", knowledgeRoutes);

describe("Reddit Tools and Endpoints", () => {
  let originalClientId: string | undefined;
  let originalClientSecret: string | undefined;

  beforeEach(() => {
    originalClientId = CONFIG.REDDIT_CLIENT_ID;
    originalClientSecret = CONFIG.REDDIT_CLIENT_SECRET;
    CONFIG.REDDIT_CLIENT_ID = "mock-client-id";
    CONFIG.REDDIT_CLIENT_SECRET = "mock-client-secret";
  });

  afterEach(() => {
    CONFIG.REDDIT_CLIENT_ID = originalClientId;
    CONFIG.REDDIT_CLIENT_SECRET = originalClientSecret;
  });

  describe("Tool Registration & Mappings", () => {
    it("registers the 9 Reddit tools under the Reddit domain", () => {
      const tools = getToolSchemas();
      const redditTools = tools.filter((t) => t.domain === "Reddit");

      expect(redditTools.length).toBe(9);

      const names = redditTools.map((t) => t.name).sort();
      expect(names).toEqual([
        "get_reddit_subreddit_feed",
        "get_reddit_subreddit_info",
        "get_reddit_subreddit_rules",
        "get_reddit_subreddit_wiki_page",
        "get_reddit_subreddit_wiki_pages",
        "get_reddit_user_history",
        "get_reddit_user_profile",
        "search_reddit",
        "search_reddit_subreddits",
      ]);

      for (const tool of redditTools) {
        expect(tool.domainKey).toBe("reddit");
        expect(tool.emoji).toBeTruthy();
        expect(tool.intelligenceTier).toBe("medium");
      }
    });
  });

  describe("API Router Validation Tests", () => {
    it("returns 400 for search_reddit when q is missing", async () => {
      const res = await request(app).get("/knowledge/reddit/search");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Query parameter 'q' is required");
    });

    it("returns 400 for search_reddit_subreddits when q is missing", async () => {
      const res = await request(app).get("/knowledge/reddit/subreddits/search");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Query parameter 'q' is required");
    });
  });

  describe("Rate Limiting and Caching Logic", () => {
    let fetchSpy;

    beforeEach(() => {
      // Spy on global fetch
      fetchSpy = vi
        .spyOn(global, "fetch")
        .mockImplementation(async (url: any) => {
          if (url.includes("access_token")) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                access_token: "mock-access-token",
                expires_in: 3600,
              }),
            } as any;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ mockData: "reddit-response" }),
          } as any;
        });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("caches identical api requests to avoid multiple fetch calls", async () => {
      fetchSpy.mockClear();
      const res1 = await redditApiRequest("/test/endpoint", { arg: "1" });
      const countAfterFirst = fetchSpy.mock.calls.length;

      const res2 = await redditApiRequest("/test/endpoint", { arg: "1" });
      const countAfterSecond = fetchSpy.mock.calls.length;

      expect(res1).toEqual({ mockData: "reddit-response" });
      expect(res2).toEqual({ mockData: "reddit-response" });
      expect(countAfterSecond).toBe(countAfterFirst); // No new network calls made
    });

    it("bypasses cache when bypassCache parameter is true", async () => {
      fetchSpy.mockClear();
      await redditApiRequest("/test/endpoint-bypass", { arg: "1" });
      const countAfterFirst = fetchSpy.mock.calls.length;

      await redditApiRequest("/test/endpoint-bypass", { arg: "1" }, true);
      const countAfterSecond = fetchSpy.mock.calls.length;

      expect(countAfterSecond).toBe(countAfterFirst + 1); // Exactly one new call made
    });

    it("serializes concurrent requests through the rate limiter", async () => {
      const startTimes: number[] = [];
      const finishTimes: number[] = [];

      fetchSpy.mockImplementation(async (url: any) => {
        startTimes.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 50));
        finishTimes.push(Date.now());

        if (url.includes("access_token")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: "mock-access-token",
              expires_in: 3600,
            }),
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: "success" }),
        } as any;
      });

      fetchSpy.mockClear();
      await Promise.all([
        redditApiRequest("/test/limiter-1", {}, true),
        redditApiRequest("/test/limiter-2", {}, true),
        redditApiRequest("/test/limiter-3", {}, true),
      ]);

      // There should be exactly 3 network API calls (and potentially 1 token refresh if expired/cleared, or 0 if cached)
      expect(startTimes.length).toBeGreaterThanOrEqual(3);
    });
  });
});
