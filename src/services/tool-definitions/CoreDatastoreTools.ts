// ────────────────────────────────────────────────────────────
// Tool Definitions — Core Datastore Tools
// ────────────────────────────────────────────────────────────
//
// Structured, queryable record store — the SQL-flavored counterpart
// to semantic memory. Namespaces are shared across agents within a
// project; provenance is stamped server-side per record.

import type { ToolDefinition } from "../../types/tools.ts";
import { compute } from "./utils.ts";

export function getCoreDatastoreTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {


  return [
  {
    name: "write_datastore",
    dataSource: compute("MongoDB agent_datastore"),
    description: translate("write_datastore.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/datastore/write",
      bodyParams: ["project", "namespace", "records", "keyField"],
    },
    parameters: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: translate("write_datastore.params.namespace"),
        },
        records: {
          type: "array",
          items: { type: "object" },
          description: translate("write_datastore.params.records"),
        },
        keyField: {
          type: "string",
          description: translate("write_datastore.params.keyField"),
        },
      },
      required: ["namespace", "records"],
    },
    display: {
      activeVerb: "Writing",
      completedVerb: "Wrote",
      subjectParam: "namespace",
      subjectFormat: "quoted",
    },
  },
  {
    name: "query_datastore",
    dataSource: compute("MongoDB agent_datastore"),
    description: translate("query_datastore.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/datastore/query",
      bodyParams: [
        "project",
        "namespace",
        "filter",
        "sort",
        "fields",
        "limit",
        "skip",
        "pipeline",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: translate("query_datastore.params.namespace"),
        },
        filter: {
          type: "object",
          description: translate("query_datastore.params.filter"),
        },
        sort: {
          type: "object",
          description: translate("query_datastore.params.sort"),
        },
        fields: {
          type: "array",
          items: { type: "string" },
          description: translate("query_datastore.params.fields"),
        },
        limit: {
          type: "integer",
          description: translate("query_datastore.params.limit"),
        },
        skip: {
          type: "integer",
          description: translate("query_datastore.params.skip"),
        },
        pipeline: {
          type: "array",
          items: { type: "object" },
          description: translate("query_datastore.params.pipeline"),
        },
      },
      required: [],
    },
    display: {
      activeVerb: "Querying",
      completedVerb: "Queried",
      subjectParam: "namespace",
      subjectFormat: "quoted",
    },
  },
  {
    name: "delete_datastore",
    dataSource: compute("MongoDB agent_datastore"),
    description: translate("delete_datastore.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/datastore/delete",
      bodyParams: ["project", "namespace", "ids", "filter", "all"],
    },
    parameters: {
      type: "object",
      properties: {
        namespace: {
          type: "string",
          description: translate("delete_datastore.params.namespace"),
        },
        ids: {
          type: "array",
          items: { type: "string" },
          description: translate("delete_datastore.params.ids"),
        },
        filter: {
          type: "object",
          description: translate("delete_datastore.params.filter"),
        },
        all: {
          type: "boolean",
          description: translate("delete_datastore.params.all"),
        },
      },
      required: ["namespace"],
    },
    display: {
      activeVerb: "Deleting from",
      completedVerb: "Deleted from",
      subjectParam: "namespace",
      subjectFormat: "quoted",
    },
  },
  ];
}
