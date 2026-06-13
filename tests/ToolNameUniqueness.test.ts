import { describe, it, expect } from "vitest";
import { TOOL_DEFINITIONS } from "../src/services/ToolSchemaService.ts";

/**
 * Guard test: ensures no two tool definitions in TOOL_DEFINITIONS share the
 * same `name` property. Duplicate names cause Anthropic (and potentially other
 * providers) to reject the request with "tools: Tool names must be unique".
 *
 * This test also protects against accidental collisions with tool names
 * registered in prism-service's InternalToolRegistry (e.g. ReminderTools),
 * since both sources are merged at runtime in ToolOrchestratorService.
 */
describe("Tool Definition Name Uniqueness", () => {
  it("TOOL_DEFINITIONS contains no duplicate tool names", () => {
    const allToolNames = TOOL_DEFINITIONS.map((tool) => tool.name);

    const duplicateToolNames = allToolNames.filter(
      (toolName, index) => allToolNames.indexOf(toolName) !== index,
    );

    expect(
      duplicateToolNames,
      `Duplicate tool names found in TOOL_DEFINITIONS: [${[...new Set(duplicateToolNames)].join(", ")}]. ` +
      `Each tool name must be globally unique — these schemas are merged with ` +
      `InternalToolRegistry and orchestrator tools at runtime in prism-service.`,
    ).toEqual([]);
  });

  it("all tool names follow snake_case convention", () => {
    const invalidToolNames = TOOL_DEFINITIONS
      .map((tool) => tool.name)
      .filter((toolName) => toolName !== toolName.toLowerCase() || /\s/.test(toolName));

    expect(
      invalidToolNames,
      `Tool names must be lowercase snake_case: [${invalidToolNames.join(", ")}]`,
    ).toEqual([]);
  });
});
