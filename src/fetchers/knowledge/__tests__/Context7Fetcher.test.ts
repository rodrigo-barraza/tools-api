import { afterEach, describe, expect, it, vi } from "vitest";
import { searchLibraryDocs } from "../Context7Fetcher.ts";

// ─── Fetch mocking ─────────────────────────────────────────────────

type FetchCall = { url: string; headers: Record<string, string> };

const calls: FetchCall[] = [];

function mockFetch(
  handler: (url: string) => { status?: number; json?: unknown; text?: string },
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        headers: (init?.headers as Record<string, string>) ?? {},
      });
      const { status = 200, json, text } = handler(url);
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => json,
        text: async () => text ?? "",
      } as Response;
    }),
  );
}

const EXPRESS_RESULT = {
  id: "/expressjs/express",
  title: "Express",
  description: "Fast, unopinionated web framework",
  stars: 66919,
  trustScore: 9,
  totalSnippets: 781,
  versions: ["v5.2.0"],
};

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

// ─── searchLibraryDocs ─────────────────────────────────────────────

describe("searchLibraryDocs", () => {
  it("resolves a library name, returns docs and alternatives", async () => {
    mockFetch((url) =>
      url.includes("/search?")
        ? {
            json: {
              results: [
                EXPRESS_RESULT,
                { id: "/koajs/koa", title: "Koa" },
                { id: "/fastify/fastify", title: "Fastify" },
              ],
            },
          }
        : { text: "### Routing\nUse app.get()..." },
    );

    const result = await searchLibraryDocs({
      libraryName: "express",
      topic: "routing",
    });

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.library.id).toBe("/expressjs/express");
    expect(result.library.trustScore).toBe(9);
    expect(result.docs).toContain("Routing");
    expect(result.alternatives.map((a) => a.id)).toEqual([
      "/koajs/koa",
      "/fastify/fastify",
    ]);
    expect(calls[0].url).toContain("/search?query=express");
    expect(calls[1].url).toContain("/expressjs/express?");
    expect(calls[1].url).toContain("topic=routing");
    expect(calls[1].url).toContain("type=txt");
  });

  it("uses an exact libraryId directly without a search call", async () => {
    mockFetch(() => ({ text: "docs body" }));

    const result = await searchLibraryDocs({ libraryId: "vercel/next.js" });

    expect(result.found).toBe(true);
    if (!result.found) return;
    expect(result.library.id).toBe("/vercel/next.js");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/vercel/next.js?");
  });

  it("clamps tokens into the allowed range", async () => {
    mockFetch(() => ({ text: "docs" }));

    await searchLibraryDocs({ libraryId: "/expressjs/express", tokens: 5 });
    expect(calls[0].url).toContain("tokens=1000");

    await searchLibraryDocs({ libraryId: "/expressjs/express", tokens: 999999 });
    expect(calls[1].url).toContain("tokens=20000");
  });

  it("returns found:false when the search has no matches", async () => {
    mockFetch(() => ({ json: { results: [] } }));

    const result = await searchLibraryDocs({ libraryName: "zzznotalib" });
    expect(result).toMatchObject({ found: false });
  });

  it("returns found:false when docs are missing (404 or empty)", async () => {
    mockFetch(() => ({ status: 404 }));
    expect(
      await searchLibraryDocs({ libraryId: "/nope/nothing" }),
    ).toMatchObject({ found: false });

    vi.unstubAllGlobals();
    calls.length = 0;
    mockFetch(() => ({ text: "   " }));
    expect(
      await searchLibraryDocs({ libraryId: "/empty/docs" }),
    ).toMatchObject({ found: false });
  });

  it("returns found:false when neither name nor id is provided", async () => {
    mockFetch(() => ({ text: "unused" }));
    const result = await searchLibraryDocs({});
    expect(result).toMatchObject({ found: false });
    expect(calls).toHaveLength(0);
  });

  it("throws on non-404 upstream errors", async () => {
    mockFetch(() => ({ status: 429 }));
    await expect(
      searchLibraryDocs({ libraryId: "/expressjs/express" }),
    ).rejects.toThrow("429");
  });
});
