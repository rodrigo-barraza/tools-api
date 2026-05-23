/**
 * Tool Schema System TypeScript Definitions
 */

// ─── Tool Endpoint ─────────────────────────────────────────────

export interface ToolConditionalPath {
  param: string;
  template: string;
}

export interface ToolEndpoint {
  path: string;
  method?: "GET" | "POST";
  queryParams?: string[];
  pathParams?: string[];
  bodyParams?: string[];
  conditionalPath?: ToolConditionalPath;
}

// ─── Tool Definition ───────────────────────────────────────────

export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
}

export interface ToolParameters {
  type: string;
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

// ─── Data Source Metadata ───────────────────────────────────────

export interface CachedDataSource {
  type: "cached";
  provider: string;
  intervalSeconds: number;
}

export interface OnDemandDataSource {
  type: "onDemand";
  provider: string;
}

export interface StaticDataSource {
  type: "static";
  provider: string;
  dataset: string;
}

export interface ComputeDataSource {
  type: "compute";
  provider: string;
  runtime: string;
}

export type ToolDataSource = CachedDataSource | OnDemandDataSource | StaticDataSource | ComputeDataSource;

// ─── Tool Definition ───────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  dataSource?: ToolDataSource;
  endpoint?: ToolEndpoint;
  parameters?: ToolParameters;
}

// ─── Enriched Tool Schema (returned by getToolSchemas) ─────────

export interface ToolSchema extends ToolDefinition {
  domain: string;
  labels: string[];
  emoji: string | null;
}

// ─── Stripped schema for AI consumption ─────────────────────────

export type ToolSchemaForAI = Omit<ToolDefinition, "endpoint" | "dataSource">;

// ─── Scored match from AgenticToolSearchService ─────────────────

export interface ScoredToolMatch {
  schema: ToolSchema;
  score: number;
}

// ─── Tool search result entry ───────────────────────────────────

export interface ToolSearchMatch {
  name: string;
  description: string;
  domain: string | null;
  labels: string[] | null;
  parameters: ToolParameters | null;
}
