#!/usr/bin/env node
/**
 * apply-locale-extraction.ts
 *
 * Transforms ToolSchemaService.ts to read all descriptions from locale JSON
 * instead of hardcoded strings (full extraction).
 *
 * Strategy:
 * 1. Convert `const TOOL_DEFINITIONS` → factory fn `createLocalizedToolDefinitions(translate)`
 * 2. Replace each static `description: "..."` with `translate("key")`
 * 3. Leave dynamic descriptions (template literals with ${}) in place
 * 4. Add per-locale caching + backwards-compatible TOOL_DEFINITIONS const
 *
 * Usage:
 *   node --import tsx scripts/apply-locale-extraction.ts
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolSchemaServicePath = path.join(currentDirectory, "..", "src", "services", "ToolSchemaService.ts");
const toolsJsonPath = path.join(currentDirectory, "..", "src", "locales", "en", "tools.json");

const sourceContent = fs.readFileSync(toolSchemaServicePath, "utf-8");
const toolsLocale: Record<string, string> = JSON.parse(fs.readFileSync(toolsJsonPath, "utf-8"));

// Build reverse map: normalized description value → locale key
const descriptionValueToKey = new Map<string, string>();
for (const [key, value] of Object.entries(toolsLocale)) {
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  descriptionValueToKey.set(normalizedValue, key);
}

const sourceLines = sourceContent.split("\n");
const outputLines: string[] = [];

// ── Locate TOOL_DEFINITIONS boundaries ──────────────────────
let toolDefinitionsStartLine = -1;
let toolDefinitionsEndLine = -1;

for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex++) {
  const line = sourceLines[lineIndex];
  if (line.match(/^const TOOL_DEFINITIONS:\s*ToolDefinition\[\]\s*=\s*\[/)) {
    toolDefinitionsStartLine = lineIndex;
  }
  // The array closes with a standalone `];` on its own line
  if (toolDefinitionsStartLine >= 0 && toolDefinitionsEndLine < 0 && line.match(/^];$/)) {
    toolDefinitionsEndLine = lineIndex;
  }
}

console.log(`TOOL_DEFINITIONS: lines ${toolDefinitionsStartLine + 1}–${toolDefinitionsEndLine + 1}`);
console.log(`Locale keys available: ${Object.keys(toolsLocale).length}`);

// ── Statistics ──────────────────────────────────────────────
let staticReplacements = 0;
let dynamicSkipped = 0;
let unmatchedDescriptions = 0;

// ── State machine ───────────────────────────────────────────
let currentToolName = "";
let isAccumulatingDescription = false;
let accumulatedLines: string[] = [];
let descriptionIndentation = "";

// ── Transform pass ──────────────────────────────────────────
for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex++) {
  const line = sourceLines[lineIndex];

  // ── Rewrite TOOL_DEFINITIONS declaration ──────────────────
  if (lineIndex === toolDefinitionsStartLine) {
    outputLines.push(
      "function createLocalizedToolDefinitions(translate: (key: string, variables?: Record<string, string>) => string): ToolDefinition[] {",
      "  return [",
    );
    continue;
  }

  // ── Rewrite TOOL_DEFINITIONS closing ──────────────────────
  if (lineIndex === toolDefinitionsEndLine) {
    outputLines.push("  ];");
    outputLines.push("}");
    outputLines.push("");
    outputLines.push("// Per-locale definition cache — rebuilt once per locale, never on hot path");
    outputLines.push("const localizedDefinitionsCache = new Map<string, ToolDefinition[]>();");
    outputLines.push("");
    outputLines.push("function getLocalizedToolDefinitions(locale: string): ToolDefinition[] {");
    outputLines.push("  let definitions = localizedDefinitionsCache.get(locale);");
    outputLines.push("  if (!definitions) {");
    outputLines.push("    const translate = (key: string, variables?: Record<string, string>) =>");
    outputLines.push("      PromptLocaleService.get(locale, `tools.${key}`, variables);");
    outputLines.push("    definitions = createLocalizedToolDefinitions(translate);");
    outputLines.push("    localizedDefinitionsCache.set(locale, definitions);");
    outputLines.push("  }");
    outputLines.push("  return definitions;");
    outputLines.push("}");
    outputLines.push("");
    outputLines.push("// Default English definitions — backwards-compatible direct access");
    outputLines.push("const TOOL_DEFINITIONS: ToolDefinition[] = getLocalizedToolDefinitions(PromptLocaleService.getDefaultLocale());");
    continue;
  }

  // ── Outside TOOL_DEFINITIONS: pass through ────────────────
  if (lineIndex < toolDefinitionsStartLine || lineIndex > toolDefinitionsEndLine) {
    outputLines.push(line);
    continue;
  }

  // ── Inside TOOL_DEFINITIONS ───────────────────────────────

  // Track current tool name
  const toolNameMatch = line.match(/^\s*name:\s*"([^"]+)"/);
  if (toolNameMatch) {
    currentToolName = toolNameMatch[1];
  }

  // ── Handle multi-line description accumulation ────────────
  if (isAccumulatingDescription) {
    accumulatedLines.push(line);

    // Check if the description closes on this line
    // A description line is "complete" when it ends with a string close + optional comma
    // BUT NOT followed by a + continuation on the same or next logical line
    const trimmed = line.trimEnd();
    const endsWithStringClose = trimmed.endsWith('",') || trimmed.endsWith('"') || trimmed.endsWith('`,') || trimmed.endsWith('`');
    const hasContinuation = trimmed.endsWith('" +') || trimmed.endsWith('` +');

    if (endsWithStringClose && !hasContinuation) {
      processAccumulatedDescription();
    }
    continue;
  }

  // ── Detect description start ──────────────────────────────
  const descriptionMatch = line.match(/^(\s*)description:\s*(.*)/);
  if (descriptionMatch && currentToolName) {
    descriptionIndentation = descriptionMatch[1];
    const afterColon = descriptionMatch[2];

    // Dynamic template literal with interpolation — keep as-is
    if (afterColon.includes("${")) {
      outputLines.push(line);
      dynamicSkipped++;
      continue;
    }

    // Complete single-line description: description: "...",
    if (afterColon.match(/^"[^"]*",?\s*$/) || afterColon.match(/^`[^`]*`,?\s*$/)) {
      const value = extractStringValue(afterColon);
      if (value !== null) {
        const result = tryReplace(value, line);
        outputLines.push(result);
      } else {
        outputLines.push(line);
        unmatchedDescriptions++;
      }
      continue;
    }

    // Multi-line: description starts here but doesn't end on this line
    isAccumulatingDescription = true;
    accumulatedLines = [line];
    continue;
  }

  // Regular line — pass through
  outputLines.push(line);
}

function processAccumulatedDescription() {
  const fullText = accumulatedLines.join("\n");

  // Check for dynamic interpolation
  if (fullText.includes("${")) {
    outputLines.push(...accumulatedLines);
    dynamicSkipped++;
    isAccumulatingDescription = false;
    accumulatedLines = [];
    return;
  }

  // Extract the string value from the accumulated text
  const value = extractMultiLineStringValue(fullText);
  if (value !== null) {
    const result = tryReplace(value, fullText);
    outputLines.push(result);
  } else {
    outputLines.push(...accumulatedLines);
    unmatchedDescriptions++;
  }

  isAccumulatingDescription = false;
  accumulatedLines = [];
}

function extractStringValue(text: string): string | null {
  // Match "..." or `...`
  const doubleQuoteMatch = text.match(/"((?:[^"\\]|\\.)*)"/);
  const templateMatch = text.match(/`((?:[^`\\]|\\.)*)`/);

  if (doubleQuoteMatch) {
    return doubleQuoteMatch[1]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\")
      .trim();
  }
  if (templateMatch) {
    return templateMatch[1].trim();
  }
  return null;
}

function extractMultiLineStringValue(fullText: string): string | null {
  // Handle string concatenation: "..." + "..." + "..."
  // First, try to extract all concatenated string parts
  const concatenatedParts: string[] = [];
  const stringPartRegex = /"((?:[^"\\]|\\.)*)"/g;
  let partMatch: RegExpExecArray | null;

  // Find all double-quoted strings in the full text (after "description:")
  const afterDescription = fullText.replace(/^[\s\S]*?description:\s*\n?\s*/, "");
  while ((partMatch = stringPartRegex.exec(afterDescription)) !== null) {
    concatenatedParts.push(partMatch[1]);
  }

  if (concatenatedParts.length > 0) {
    return concatenatedParts
      .join("")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\")
      .replace(/\\'/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Try template literal
  const templateMatch = fullText.match(/description:\s*\n?\s*`((?:[^`\\]|\\.)*)`\s*,?/s);
  if (templateMatch) {
    return templateMatch[1]
      .replace(/\s+/g, " ")
      .trim();
  }

  return null;
}

function tryReplace(descriptionValue: string, originalText: string): string {
  const normalizedValue = descriptionValue.replace(/\s+/g, " ").trim();
  const localeKey = descriptionValueToKey.get(normalizedValue);

  if (localeKey) {
    staticReplacements++;
    const hasTrailingComma = originalText.trimEnd().endsWith(",");
    const comma = hasTrailingComma ? "," : "";
    return `${descriptionIndentation}description: translate("${localeKey}")${comma}`;
  }

  unmatchedDescriptions++;
  if (normalizedValue.length > 0) {
    console.log(`  UNMATCHED [${currentToolName}]: "${normalizedValue.substring(0, 70)}..."`);
  }
  return originalText;
}

// ── Write output ────────────────────────────────────────────
const outputContent = outputLines.join("\n");
fs.writeFileSync(toolSchemaServicePath, outputContent, "utf-8");

console.log(`\n═══════════════════════════════════════════`);
console.log(`  Full Extraction Results`);
console.log(`═══════════════════════════════════════════`);
console.log(`  ✅ Static replacements:    ${staticReplacements}`);
console.log(`  ⚡ Dynamic (kept inline):  ${dynamicSkipped}`);
console.log(`  ⚠️  Unmatched (kept as-is): ${unmatchedDescriptions}`);
console.log(`  📊 Total:                  ${staticReplacements + dynamicSkipped + unmatchedDescriptions}`);
console.log(`═══════════════════════════════════════════`);
