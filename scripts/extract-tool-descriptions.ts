#!/usr/bin/env node
/**
 * extract-tool-descriptions.ts
 * 
 * Automated extraction script for tools-service ToolSchemaService.ts.
 * Parses the TOOL_DEFINITIONS array and extracts all localizable
 * description strings (tool-level + parameter-level) into a flat
 * JSON locale file suitable for PromptLocaleService.
 *
 * Usage:
 *   node --import tsx scripts/extract-tool-descriptions.ts
 *
 * Output:
 *   src/locales/en/tools.json — flat key-value map of all descriptions
 */

import {
  TOOL_DEFINITIONS,
} from "../src/services/ToolSchemaService.ts";

interface LocaleOutput {
  [key: string]: string;
}

function extractDescriptions(): LocaleOutput {
  const output: LocaleOutput = {};

  for (const tool of TOOL_DEFINITIONS) {
    const toolName = tool.name;

    // Tool-level description
    if (tool.description) {
      output[`${toolName}.description`] = tool.description;
    }

    // Parameter-level descriptions (recursive for nested objects)
    if (tool.parameters?.properties) {
      extractParameterDescriptions(
        tool.parameters.properties as Record<string, ParameterProperty>,
        toolName,
        output,
      );
    }
  }

  return output;
}

interface ParameterProperty {
  description?: string;
  type?: string;
  properties?: Record<string, ParameterProperty>;
  items?: ParameterProperty;
}

function extractParameterDescriptions(
  properties: Record<string, ParameterProperty>,
  keyPrefix: string,
  output: LocaleOutput,
) {
  for (const [parameterName, parameterDefinition] of Object.entries(properties)) {
    if (parameterDefinition.description) {
      output[`${keyPrefix}.params.${parameterName}`] = parameterDefinition.description;
    }

    // Recurse into nested object properties
    if (parameterDefinition.properties) {
      extractParameterDescriptions(
        parameterDefinition.properties,
        `${keyPrefix}.params.${parameterName}`,
        output,
      );
    }

    // Recurse into array item properties
    if (parameterDefinition.items?.properties) {
      extractParameterDescriptions(
        parameterDefinition.items.properties,
        `${keyPrefix}.params.${parameterName}.items`,
        output,
      );
    }
  }
}

const descriptions = extractDescriptions();
const sortedDescriptions: LocaleOutput = {};
for (const key of Object.keys(descriptions).sort()) {
  sortedDescriptions[key] = descriptions[key];
}

const outputJson = JSON.stringify(sortedDescriptions, null, 2);

const toolCount = TOOL_DEFINITIONS.length;
const descriptionCount = Object.keys(sortedDescriptions).length;

console.log(`Extracted ${descriptionCount} description keys from ${toolCount} tools.`);
console.log(outputJson);
