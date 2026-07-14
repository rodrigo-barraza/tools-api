// ────────────────────────────────────────────────────────────
// Tool Definitions — Compute
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { compute } from "./utils.ts";

export function getComputeTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "execute_shell",
    dataSource: compute("bash subprocess"),
    description: translate("execute_shell.description"),
    endpoint: {
      method: "POST",
      path: "/compute/shell/execute",
      bodyParams: ["command", "stdin", "timeout"],
    },
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: translate("execute_shell.params.command"),
        },
        stdin: {
          type: "string",
          description: translate("execute_shell.params.stdin"),
        },
        timeout: {
          type: "integer",
          description: translate("execute_shell.params.timeout"),
        },
      },
      required: ["command"],
    },
    display: {
      activeVerb: "Executing shell command",
      completedVerb: "Executed shell command",
      subjectParam: "command",
      subjectFormat: "truncate",
    },
  },
  {
    name: "convert_units",
    dataSource: compute("convert-units"),
    description: translate("convert_units.description"),
    endpoint: {
      path: "/compute/units/convert",
      queryParams: ["value", "from", "to"],
    },
    parameters: {
      type: "object",
      properties: {
        value: {
          type: "number",
          description: translate("convert_units.params.value"),
        },
        from: {
          type: "string",
          description: translate("convert_units.params.from"),
        },
        to: {
          type: "string",
          description: translate("convert_units.params.to"),
        },
      },
      required: ["value", "from", "to"],
    },
    display: {
      activeVerb: "Converting units of",
      completedVerb: "Converted units of",
      subjectParam: "value",
      subjectFormat: "full",
    },
  },
  {
    name: "parse_datetime",
    dataSource: compute("date-fns"),
    description: translate("parse_datetime.description"),
    endpoint: {
      method: "POST",
      path: "/compute/datetime/parse",
      bodyParams: [
        "operation",
        "date",
        "date2",
        "amount",
        "unit",
        "format",
        "timezone",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: [
            "now",
            "parse",
            "format",
            "diff",
            "add",
            "subtract",
            "startOf",
            "endOf",
            "isValid",
          ],
          description: translate("parse_datetime.params.operation"),
        },
        date: {
          type: "string",
          description: translate("parse_datetime.params.date"),
        },
        date2: {
          type: "string",
          description: translate("parse_datetime.params.date2"),
        },
        amount: {
          type: "integer",
          description: translate("parse_datetime.params.amount"),
        },
        unit: {
          type: "string",
          enum: [
            "years",
            "months",
            "weeks",
            "days",
            "hours",
            "minutes",
            "seconds",
            "year",
            "month",
            "week",
            "day",
            "hour",
            "minute",
          ],
          description: translate("parse_datetime.params.unit"),
        },
        format: {
          type: "string",
          description: translate("parse_datetime.params.format"),
        },
        timezone: {
          type: "string",
          description: translate("parse_datetime.params.timezone"),
        },
      },
      required: ["operation"],
    },
    display: {
      activeVerb: "Parsing date/time",
      completedVerb: "Parsed date/time",
      subjectParam: "operation",
      subjectFormat: "full",
    },
  },
  {
    name: "transform_json",
    dataSource: compute("jsonpath-plus"),
    description: translate("transform_json.description"),
    endpoint: {
      method: "POST",
      path: "/compute/json/transform",
      bodyParams: ["data", "expression", "operations"],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "object",
          description: translate("transform_json.params.data"),
        },
        expression: {
          type: "string",
          description: translate("transform_json.params.expression"),
        },
        operations: {
          type: "array",
          description: translate("transform_json.params.operations"),
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "flatten",
                  "unique",
                  "sort",
                  "filter",
                  "pick",
                  "omit",
                  "groupBy",
                  "count",
                  "sum",
                  "limit",
                  "reverse",
                ],
              },
            },
          },
        },
      },
      required: ["data"],
    },
    display: {
      activeVerb: "Transforming JSON data",
      completedVerb: "Transformed JSON data",
      subjectParam: "expression",
      subjectFormat: "quoted",
    },
  },
  {
    name: "generate_csv",
    dataSource: compute("internal"),
    description: translate("generate_csv.description"),
    endpoint: {
      method: "POST",
      path: "/compute/csv",
      bodyParams: ["data", "columns", "filename", "delimiter", "csvId"],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "array",
          description: translate("generate_csv.params.data"),
          items: { type: "object" },
        },
        csvId: {
          type: "string",
          description: translate("generate_csv.params.csvId"),
        },
        columns: {
          type: "array",
          description: translate("generate_csv.params.columns"),
          items: { type: "string" },
        },
        filename: {
          type: "string",
          description: translate("generate_csv.params.filename"),
        },
        delimiter: {
          type: "string",
          description: translate("generate_csv.params.delimiter"),
        },
      },
      required: ["data"],
    },
    display: {
      activeVerb: "Generating CSV dataset",
      completedVerb: "Generated CSV dataset",
      subjectParam: "filename",
      subjectFormat: "full",
    },
  },
  {
    name: "render_latex",
    dataSource: compute("KaTeX CDN"),
    description: translate("render_latex.description"),
    endpoint: {
      method: "POST",
      path: "/compute/latex",
      bodyParams: ["latex", "displayMode"],
    },
    parameters: {
      type: "object",
      properties: {
        latex: {
          type: "string",
          description: translate("render_latex.params.latex"),
        },
        displayMode: {
          type: "boolean",
          description: translate("render_latex.params.displayMode"),
        },
      },
      required: ["latex"],
    },
    display: {
      activeVerb: "Rendering LaTeX formula",
      completedVerb: "Rendered LaTeX formula",
      subjectParam: "latex",
      subjectFormat: "truncate",
    },
  },
  {
    name: "generate_diagram",
    dataSource: compute("Mermaid CDN"),
    description: translate("generate_diagram.description"),
    endpoint: {
      method: "POST",
      path: "/compute/diagram",
      bodyParams: ["definition", "theme", "diagramId"],
    },
    parameters: {
      type: "object",
      properties: {
        definition: {
          type: "string",
          description: translate("generate_diagram.params.definition"),
        },
        diagramId: {
          type: "string",
          description: translate("generate_diagram.params.diagramId"),
        },
        theme: {
          type: "string",
          enum: ["dark", "default", "forest", "neutral"],
          description: translate("generate_diagram.params.theme"),
        },
      },
      required: ["definition"],
    },
    display: {
      activeVerb: "Generating diagram",
      completedVerb: "Generated diagram",
      subjectParam: "definition",
      subjectFormat: "truncate",
    },
  },
  {
    name: "diff_text",
    dataSource: compute("diff"),
    description: translate("diff_text.description"),
    endpoint: {
      method: "POST",
      path: "/compute/diff",
      bodyParams: ["textA", "textB", "mode"],
    },
    parameters: {
      type: "object",
      properties: {
        textA: {
          type: "string",
          description: translate("diff_text.params.textA"),
        },
        textB: {
          type: "string",
          description: translate("diff_text.params.textB"),
        },
        mode: {
          type: "string",
          enum: ["lines", "words", "chars", "sentences", "json"],
          description: translate("diff_text.params.mode"),
        },
      },
      required: ["textA", "textB"],
    },
    display: {
      activeVerb: "Diffing text segments",
      completedVerb: "Diffed text segments",
      subjectParam: "mode",
      subjectFormat: "full",
    },
  },
  {
    name: "generate_hash",
    dataSource: compute("node:crypto"),
    description: translate("generate_hash.description"),
    endpoint: {
      path: "/compute/hash",
      queryParams: ["data", "algorithm", "encoding", "key"],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: translate("generate_hash.params.data"),
        },
        algorithm: {
          type: "string",
          description: translate("generate_hash.params.algorithm"),
        },
        encoding: {
          type: "string",
          description: translate("generate_hash.params.encoding"),
        },
        key: {
          type: "string",
          description: translate("generate_hash.params.key"),
        },
      },
      required: ["data"],
    },
    display: {
      activeVerb: "Generating cryptographic hash",
      completedVerb: "Generated cryptographic hash",
      subjectParam: "algorithm",
      subjectFormat: "full",
    },
  },
  {
    name: "test_regex",
    dataSource: compute("native RegExp"),
    description: translate("test_regex.description"),
    endpoint: {
      method: "POST",
      path: "/compute/regex",
      bodyParams: ["pattern", "flags", "text"],
    },
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: translate("test_regex.params.pattern"),
        },
        flags: {
          type: "string",
          description: translate("test_regex.params.flags"),
        },
        text: {
          type: "string",
          description: translate("test_regex.params.text"),
        },
      },
      required: ["pattern", "text"],
    },
    display: {
      activeVerb: "Testing regex pattern",
      completedVerb: "Tested regex pattern",
      subjectParam: "pattern",
      subjectFormat: "quoted",
    },
  },
  {
    name: "convert_encoding",
    dataSource: compute("internal"),
    description: translate("convert_encoding.description"),
    endpoint: {
      path: "/compute/encode",
      queryParams: ["data", "format", "direction"],
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: translate("convert_encoding.params.data"),
        },
        format: {
          type: "string",
          enum: [
            "base64",
            "base64url",
            "hex",
            "url",
            "html",
            "rot13",
            "binary",
            "jwt",
          ],
          description: translate("convert_encoding.params.format"),
        },
        direction: {
          type: "string",
          enum: ["encode", "decode"],
          description: translate("convert_encoding.params.direction"),
        },
      },
      required: ["data", "format"],
    },
    display: {
      activeVerb: "Converting data encoding to",
      completedVerb: "Converted data encoding to",
      subjectParam: "format",
      subjectFormat: "full",
    },
  },
  {
    name: "convert_video_to_gif",
    dataSource: compute("ffmpeg"),
    description: translate("convert_video_to_gif.description"),
    endpoint: {
      method: "POST",
      path: "/compute/video/gif",
      bodyParams: ["input", "quality", "width", "fps"],
    },
    parameters: {
      type: "object",
      properties: {
        input: {
          type: "string",
          description: translate("convert_video_to_gif.params.input"),
        },
        quality: {
          type: "string",
          enum: ["high", "low"],
          description: translate("convert_video_to_gif.params.quality"),
        },
        width: {
          type: "integer",
          description: translate("convert_video_to_gif.params.width"),
        },
        fps: {
          type: "integer",
          description: translate("convert_video_to_gif.params.fps"),
        },
      },
      required: ["input"],
    },
    display: {
      activeVerb: "Converting video to GIF",
      completedVerb: "Converted video to GIF",
      subjectParam: "input",
      subjectFormat: "basename",
      filePathParam: "input",
    },
  },
  {
    name: "parse_cron_expression",
    dataSource: compute("internal"),
    description: translate("parse_cron_expression.description"),
    endpoint: {
      path: "/compute/cron/parse",
      queryParams: ["expression", "count", "from"],
    },
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: translate("parse_cron_expression.params.expression"),
        },
        count: {
          type: "number",
          description: translate("parse_cron_expression.params.count"),
        },
        from: {
          type: "string",
          description: translate("parse_cron_expression.params.from"),
        },
      },
      required: ["expression"],
    },
    display: {
      activeVerb: "Parsing cron expression",
      completedVerb: "Parsed cron expression",
      subjectParam: "expression",
      subjectFormat: "quoted",
    },
  },
  {
    name: "analyze_csv",
    dataSource: compute("statistics"),
    description: translate("analyze_csv.description"),
    endpoint: {
      path: "/compute/csv/analyze",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: translate("analyze_csv.params.data"),
        },
        columns: {
          type: "array",
          items: { type: "string" },
          description: translate("analyze_csv.params.columns"),
        },
      },
      required: ["data"],
    },
    display: {
      activeVerb: "Analyzing CSV dataset structure",
      completedVerb: "Analyzed CSV dataset structure",
      subjectParam: "data",
      subjectFormat: "truncate",
    },
  },
  {
    name: "compare_json",
    dataSource: compute("diff"),
    description: translate("compare_json.description"),
    endpoint: {
      path: "/compute/json/compare",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        "a": {
          type: "object",
          description: translate("compare_json.params.a"),
        },
        b: {
          type: "object",
          description: translate("compare_json.params.b"),
        },
      },
      required: ["a", "b"],
    },
    display: {
      activeVerb: "Comparing JSON structures",
      completedVerb: "Compared JSON structures",
      subjectParam: "a",
      subjectFormat: "truncate",
    },
  },
  {
    name: "validate_json_schema",
    dataSource: compute("ajv"),
    description: translate("validate_json_schema.description"),
    endpoint: {
      path: "/compute/json/validate",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        data: {
          type: "object",
          description: translate("validate_json_schema.params.data"),
        },
        schema: {
          type: "object",
          description: translate("validate_json_schema.params.schema"),
        },
      },
      required: ["data", "schema"],
    },
    display: {
      activeVerb: "Validating JSON against schema",
      completedVerb: "Validated JSON against schema",
      subjectParam: "data",
      subjectFormat: "truncate",
    },
  },
  ];
}
