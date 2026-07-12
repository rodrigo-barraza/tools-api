// ────────────────────────────────────────────────────────────
// Tool Definitions — Core Harness Tools
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, compute } from "./utils.ts";

export function getCoreHarnessTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "read_url",
    dataSource: onDemand("Auto-detected platform API"),
    description: translate("read_url.description"),
    endpoint: {
      path: "/knowledge/web/content",
      queryParams: [
        "url",
        "commentLimit",
        "answerLimit",
        "readme",
        "languages",
        "transcript",
        "lang",
        "maxChars",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("read_url.params.url"),
        },
        commentLimit: {
          type: "number",
          description: translate("read_url.params.commentLimit"),
        },
        answerLimit: {
          type: "number",
          description: translate("read_url.params.answerLimit"),
        },
        readme: {
          type: "string",
          description: translate("read_url.params.readme"),
          enum: ["true", "false"],
        },
        languages: {
          type: "string",
          description: translate("read_url.params.languages"),
          enum: ["true", "false"],
        },
        transcript: {
          type: "string",
          description: translate("read_url.params.transcript"),
          enum: ["true", "false"],
        },
        lang: {
          type: "string",
          description: translate("read_url.params.lang"),
        },
        maxChars: {
          type: "number",
          description: translate("read_url.params.maxChars"),
        },
      },
      required: ["url"],
    },
    display: {
      activeVerb: "Reading",
      completedVerb: "Read",
      subjectParam: "url",
      subjectFormat: "domain",
    },
  },
  {
    name: "execute_python",
    dataSource: compute("Python 3 subprocess"),
    description: translate("execute_python.description"),
    endpoint: {
      method: "POST",
      path: "/utility/python/execute",
      bodyParams: ["code", "timeout"],
    },
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: translate("execute_python.params.code"),
        },
        timeout: {
          type: "integer",
          description: translate("execute_python.params.timeout"),
        },
      },
      required: ["code"],
    },
    display: {
      activeVerb: "Executing Python code",
      completedVerb: "Executed Python code",
      subjectParam: "code",
      subjectFormat: "truncate",
    },
  },
  {
    name: "evaluate_expression",
    dataSource: compute("bignumber.js"),
    description: translate("evaluate_expression.description"),
    endpoint: {
      path: "/utility/calculate",
      queryParams: ["operation", "a", "b"],
    },
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "add",
            "subtract",
            "multiply",
            "divide",
            "modulo",
            "power",
            "sqrt",
          ],
          description: translate("evaluate_expression.params.operation"),
        },
        "a": {
          type: "string",
          description: translate("evaluate_expression.params.a"),
        },
        b: {
          type: "string",
          description: translate("evaluate_expression.params.b"),
        },
      },
      required: ["operation", "a"],
    },
    display: {
      activeVerb: "Evaluating math expression",
      completedVerb: "Evaluated math expression",
      subjectParam: "a",
      subjectFormat: "full",
    },
  },
  {
    name: "execute_javascript",
    dataSource: compute("Node.js vm"),
    description: translate("execute_javascript.description"),
    endpoint: {
      method: "POST",
      path: "/compute/js/execute",
      bodyParams: ["code", "timeout"],
    },
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: translate("execute_javascript.params.code"),
        },
        timeout: {
          type: "integer",
          description: translate("execute_javascript.params.timeout"),
        },
      },
      required: ["code"],
    },
    display: {
      activeVerb: "Executing JavaScript code",
      completedVerb: "Executed JavaScript code",
      subjectParam: "code",
      subjectFormat: "truncate",
    },
  },
  {
    name: "search_web",
    dataSource: onDemand("Brave Search / DuckDuckGo / Google CSE"),
    description: translate("search_web.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/search",
      bodyParams: ["query", "limit", "dateRestrict", "siteSearch"],
    },
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: translate("search_web.params.query"),
        },
        limit: {
          type: "integer",
          description: translate("search_web.params.limit"),
        },
        dateRestrict: {
          type: "string",
          description: translate("search_web.params.dateRestrict"),
        },
        siteSearch: {
          type: "string",
          description: translate("search_web.params.siteSearch"),
        },
      },
      required: ["query"],
    },
    display: {
      activeVerb: "Searching",
      completedVerb: "Searched",
      subjectParam: "query",
      subjectFormat: "quoted",
    },
  },
  {
    name: "save_memory",
    dataSource: compute("Prism MemoryService"),
    description: translate("save_memory.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/memory/save",
      bodyParams: ["content", "type", "title"],
    },
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: translate("save_memory.params.content"),
        },
        type: {
          type: "string",
          enum: ["user", "feedback", "project", "reference"],
          description: translate("save_memory.params.type"),
        },
        title: {
          type: "string",
          description: translate("save_memory.params.title"),
        },
      },
      required: ["content"],
    },
  },
  {
    name: "think",
    dataSource: compute("echo"),
    description: translate("think.description"),
    endpoint: {
      method: "POST",
      path: "/compute/think",
      bodyParams: ["thought"],
    },
    parameters: {
      type: "object",
      properties: {
        thought: {
          type: "string",
          description: translate("think.params.thought"),
        },
      },
      required: ["thought"],
    },
  },
  {
    name: "sleep",
    dataSource: compute("timer"),
    description: translate("sleep.description"),
    endpoint: {
      method: "POST",
      path: "/compute/sleep",
      bodyParams: ["duration_seconds", "reason"],
    },
    parameters: {
      type: "object",
      properties: {
        duration_seconds: {
          type: "number",
          description: translate("sleep.params.duration_seconds"),
        },
        reason: {
          type: "string",
          description: translate("sleep.params.reason"),
        },
      },
      required: ["duration_seconds"],
    },
  },
  {
    name: "emit_structured_output",
    dataSource: compute("json-schema"),
    description: translate("emit_structured_output.description"),
    endpoint: {
      method: "POST",
      path: "/compute/synthetic-output",
      bodyParams: ["schema", "data", "label"],
    },
    parameters: {
      type: "object",
      properties: {
        schema: {
          type: "object",
          description: translate("emit_structured_output.params.schema"),
        },
        data: {
          type: "object",
          description: translate("emit_structured_output.params.data"),
        },
        label: {
          type: "string",
          description: translate("emit_structured_output.params.label"),
        },
      },
      required: ["data"],
    },
  },
  ];
}
