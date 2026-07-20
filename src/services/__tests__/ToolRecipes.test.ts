import { describe, it, expect } from "vitest";
import {
  TOOL_RECIPES,
  getLocalizedRecipes,
  getRecipeSearchDocuments,
  isRecipeName,
  isRecipeAvailable,
} from "../ToolRecipeService.ts";
import { agenticToolSearch } from "../AgenticToolSearchService.ts";
import { getToolSchemas, getLocalizedToolDefinitions } from "../ToolSchemaService.ts";

describe("recipe registry invariants", () => {
  it("every recipe tool exists in the tool definitions", () => {
    // Validate against raw definitions, not the runtime catalog —
    // API-key-gated tools (e.g. search_youtube) are filtered from the
    // catalog when their key is absent, and recipes may still name them
    // (absent constituents are skipped at search time).
    const definedNames = new Set(
      getLocalizedToolDefinitions("en").map((definition) => definition.name),
    );
    for (const recipe of TOOL_RECIPES) {
      for (const toolName of recipe.tools) {
        expect(
          definedNames.has(toolName),
          `recipe '${recipe.id}' references unknown tool '${toolName}'`,
        ).toBe(true);
      }
    }
  });

  it("every recipe has non-placeholder localized strings", () => {
    for (const locale of ["en", "caveman"]) {
      for (const recipe of getLocalizedRecipes(locale)) {
        // PromptLocaleService returns the key itself on a missing entry
        expect(recipe.title).not.toContain("recipe.");
        expect(recipe.description.length).toBeGreaterThan(20);
        expect(recipe.steps).toMatch(/1\)/);
      }
    }
  });

  it("recipe search documents carry combined searchable text", () => {
    const documents = getRecipeSearchDocuments("en");
    expect(documents).toHaveLength(TOOL_RECIPES.length);
    const sampleDocument = documents.find(
      (document) => document.name === "recipe:sample-audio-from-web",
    );
    expect(sampleDocument!.description).toMatch(/download_video/);
    expect(isRecipeName(sampleDocument!.name)).toBe(true);
  });
});

describe("agenticToolSearch with recipes", () => {
  it("surfaces the mixing recipe for the exact query that previously failed", () => {
    // Regression for conversation 3dd193fe: this query returned no plan,
    // so the agent shelled out to ffmpeg.
    const result = agenticToolSearch("combine audio mix merge overlay");
    const recipeMatch = result.matches!.find((match) => isRecipeName(match.name));
    expect(recipeMatch).toBeDefined();
    expect(recipeMatch!.recipe!.steps).toMatch(/remix_audio/);
    expect(recipeMatch!.domain).toBe("Recipes");
  });

  it("appends constituent tools of a matched recipe as enableable matches", () => {
    const result = agenticToolSearch("sample a sound from the web", {
      enabledTools: ["get_weather"],
    });
    const recipeMatch = result.matches!.find(
      (match) => match.name === "recipe:sample-audio-from-web",
    );
    expect(recipeMatch).toBeDefined();

    const matchNames = new Set(result.matches!.map((match) => match.name));
    // Only constituents present in the runtime catalog ride along —
    // API-key-gated tools are silently skipped.
    const catalogNames = new Set(getToolSchemas().map((schema) => schema.name));
    for (const toolName of recipeMatch!.recipe!.tools) {
      if (!catalogNames.has(toolName)) continue;
      expect(matchNames.has(toolName), `missing constituent '${toolName}'`).toBe(true);
    }
    // Constituents carry isEnabled so the discovery nudge can activate them
    const downloadMatch = result.matches!.find(
      (match) => match.name === "download_video",
    );
    expect(downloadMatch!.isEnabled).toBe(false);
    expect(result.actionRequired).toBeTruthy();
  });

  it("gates recipes on required tools but not optional ones", () => {
    const [sampleRecipe] = getLocalizedRecipes("en").filter(
      (recipe) => recipe.id === "sample-audio-from-web",
    );
    const allRequired = new Set(sampleRecipe.requiredTools);

    // All required present, optional (search_youtube) absent → available
    expect(isRecipeAvailable(sampleRecipe, allRequired)).toBe(true);

    // A required tool missing → hidden
    const missingRequired = new Set(
      sampleRecipe.requiredTools.filter((name) => name !== "download_video"),
    );
    expect(isRecipeAvailable(sampleRecipe, missingRequired)).toBe(false);
  });

  it("only surfaces recipes whose required tools exist in the runtime catalog", () => {
    // The environment lacks GOOGLE_CLOUD_API_KEY, so search_youtube is
    // absent from the catalog — the sampling recipe must still surface
    // because search_youtube is optional, not required.
    const catalogNames = new Set(getToolSchemas().map((schema) => schema.name));
    expect(catalogNames.has("search_youtube")).toBe(false);

    const result = agenticToolSearch("sample a sound from the web");
    expect(
      result.matches!.some(
        (match) => match.name === "recipe:sample-audio-from-web",
      ),
    ).toBe(true);
  });

  it("returns no recipes for unrelated queries", () => {
    const result = agenticToolSearch("current weather in vancouver");
    const recipeMatches = result.matches!.filter((match) => isRecipeName(match.name));
    expect(recipeMatches.length).toBe(0);
  });

  it("caps recipe matches at two", () => {
    const result = agenticToolSearch("audio music sound");
    const recipeMatches = result.matches!.filter((match) => isRecipeName(match.name));
    expect(recipeMatches.length).toBeLessThanOrEqual(2);
  });
});
