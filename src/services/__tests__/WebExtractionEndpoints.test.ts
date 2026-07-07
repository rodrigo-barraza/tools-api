import { describe, it, expect } from "vitest";

describe("ToolSchemaService", () => {
  let getToolSchemas: any;

  it("loads tool schemas", async () => {
    const mod = await import("../ToolSchemaService.js") as any;
    getToolSchemas = mod.getToolSchemas;
    const tools = getToolSchemas();
    expect(tools.length > 100, `expected >100 tools, got ${tools.length}`).toBeTruthy();
  });

  it("every tool has required fields", async () => {
    if (!getToolSchemas) return;
    const tools = getToolSchemas();
    for (const t of tools) {
      expect(t.name).toBeTruthy();
      expect(t.description, `${t.name} missing description`).toBeTruthy();
      expect(t.endpoint, `${t.name} missing endpoint`).toBeTruthy();
      expect(t.endpoint.path, `${t.name} missing endpoint.path`).toBeTruthy();
      expect(t.domain, `${t.name} missing domain`).toBeTruthy();
    }
  });

  it("no duplicate tool names", async () => {
    if (!getToolSchemas) return;
    const tools = getToolSchemas();
    const names = tools.map((t: any) => t.name);
    const dupes = names.filter((n: any, i: number) => names.indexOf(n) !== i);
    expect(dupes).toEqual([]);
  });



  it("unified tools exist with correct schemas", async () => {
    if (!getToolSchemas) return;
    const tools = getToolSchemas();
    const byName = Object.fromEntries(tools.map((t: any) => [t.name, t]));

    expect(byName.read_url).toBeTruthy();
    expect(byName.read_url.parameters.properties.url).toBeTruthy();
    expect(byName.read_url.parameters.required).toEqual(["url"]);

    expect(byName.get_package_info).toBeTruthy();
    expect(byName.get_package_info.parameters.properties.name).toBeTruthy();
    expect(byName.get_package_info.parameters.properties.registry).toBeTruthy();
    expect(byName.get_package_info.parameters.required).toEqual(["name", "registry"]);

    const removed = [
      "get_github_repo", "get_reddit_thread", "get_twitter_post",
      "get_hackernews_thread", "get_stackoverflow_question",
      "get_npm_package",
    ];
    for (const name of removed) {
      expect(byName[name]).toBe(undefined);
    }

    expect(byName.get_youtube_video).toBeTruthy();
  });
});
