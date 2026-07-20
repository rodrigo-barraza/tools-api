import PromptLocaleService from "./PromptLocaleService.ts";

// ────────────────────────────────────────────────────────────
// ToolRecipeService — cross-tool workflow recipes
// ────────────────────────────────────────────────────────────
// A recipe is advisory knowledge about how tools COMPOSE toward a
// goal ("sample a sound from the web", "layer speech over music").
// Recipes are indexed into search_tools' BM25 corpus, so a goal-phrased
// discovery query surfaces the plan — not just an unordered tool list —
// and the recipe's constituent tools ride along as regular matches,
// which the existing discovery nudge/auto-enable machinery activates.
//
// Recipes live here (single source of truth) instead of inside tool
// descriptions, which keep only one-line pointers: descriptions bloat
// every prompt, drift when duplicated, and reference tools that may not
// be enabled — a recipe match enables its own dependencies.
//
// Strings are localized in locales/<locale>/tools.json under
// recipe.<id>.{title,description,steps} (parity enforced by the locale
// key-parity test).

export interface ToolRecipeDefinition {
  id: string;
  /**
   * Tools the recipe cannot work without. A recipe is only surfaced in
   * search results when EVERY required tool is available in the runtime
   * catalog — a plan referencing missing capabilities is worse than no
   * plan.
   */
  tools: string[];
  /**
   * Alternate/enhancing tools mentioned in the steps (e.g. search_youtube
   * as an alternative to search_videos). Their absence — API-key gating,
   * runtime disablement — does not hide the recipe; absent ones simply
   * don't ride along in the results.
   */
  optionalTools?: string[];
}

export const TOOL_RECIPES: ToolRecipeDefinition[] = [
  {
    id: "sample-audio-from-web",
    tools: ["search_videos", "download_video", "generate_audio"],
    optionalTools: ["search_youtube", "remix_audio"],
  },
  {
    id: "mix-speech-over-music",
    tools: ["synthesize_speech", "remix_audio"],
  },
  {
    id: "build-beat-from-samples",
    tools: ["generate_audio"],
    optionalTools: ["synthesize_speech"],
  },
  {
    id: "character-voice",
    tools: ["synthesize_speech", "remix_audio"],
  },
  {
    id: "master-audio-track",
    tools: ["generate_audio", "remix_audio"],
  },
  {
    id: "transcribe-web-video",
    tools: ["search_videos", "download_video", "transcribe_audio"],
    optionalTools: ["get_youtube_video"],
  },
  {
    id: "clip-video-to-gif",
    tools: ["search_videos", "download_video", "trim_video"],
  },
  {
    id: "edit-generated-image",
    tools: ["generate_image", "manipulate_image"],
    optionalTools: ["remove_background", "describe_image"],
  },
  {
    id: "animate-generated-image",
    tools: ["generate_image", "create_vector_animation"],
  },
  {
    id: "visualize-dataset",
    tools: ["execute_python", "generate_chart"],
    optionalTools: ["query_datastore"],
  },
];

export interface LocalizedToolRecipe {
  /** Namespaced match name, e.g. "recipe:sample-audio-from-web". */
  name: string;
  id: string;
  title: string;
  description: string;
  steps: string;
  /** All tools the steps mention: required first, then optional. */
  tools: string[];
  /** The availability-gating subset — see ToolRecipeDefinition.tools. */
  requiredTools: string[];
}

const RECIPE_NAME_PREFIX = "recipe:";

export function isRecipeName(name: string): boolean {
  return name.startsWith(RECIPE_NAME_PREFIX);
}

const localizedRecipeCache = new Map<string, LocalizedToolRecipe[]>();

export function getLocalizedRecipes(locale: string): LocalizedToolRecipe[] {
  let recipes = localizedRecipeCache.get(locale);
  if (!recipes) {
    recipes = TOOL_RECIPES.map((definition) => ({
      name: `${RECIPE_NAME_PREFIX}${definition.id}`,
      id: definition.id,
      title: PromptLocaleService.get(locale, `tools.recipe.${definition.id}.title`),
      description: PromptLocaleService.get(locale, `tools.recipe.${definition.id}.description`),
      steps: PromptLocaleService.get(locale, `tools.recipe.${definition.id}.steps`),
      tools: [...definition.tools, ...(definition.optionalTools ?? [])],
      requiredTools: definition.tools,
    }));
    localizedRecipeCache.set(locale, recipes);
  }
  return recipes;
}

/**
 * A recipe is only surfaced when every REQUIRED tool is present in the
 * caller's available catalog; optional tools never gate.
 */
export function isRecipeAvailable(
  recipe: LocalizedToolRecipe,
  availableToolNames: ReadonlySet<string>,
): boolean {
  return recipe.requiredTools.every((toolName) =>
    availableToolNames.has(toolName),
  );
}

/**
 * Recipe pseudo-documents for the BM25 index — title, goal description,
 * and steps all contribute searchable terms so goal-phrased queries
 * ("combine audio", "make a gif from a video") land on the recipe.
 */
export function getRecipeSearchDocuments(
  locale: string,
): Array<{ name: string; description: string; parameters: null; recipe: LocalizedToolRecipe }> {
  return getLocalizedRecipes(locale).map((recipe) => ({
    name: recipe.name,
    description: `${recipe.title}. ${recipe.description} ${recipe.steps} ${recipe.tools.join(" ")}`,
    parameters: null,
    recipe,
  }));
}
