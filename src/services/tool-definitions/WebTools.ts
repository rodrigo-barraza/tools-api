// ────────────────────────────────────────────────────────────
// Tool Definitions — Web
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand } from "./utils.ts";

export function getWebTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "read_web_page",
    dataSource: onDemand("HTTP fetch"),
    description: translate("read_web_page.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/fetch",
      bodyParams: ["url", "selector"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("read_web_page.params.url"),
        },
        selector: {
          type: "string",
          description: translate("read_web_page.params.selector"),
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
    name: "read_pdf",
    dataSource: onDemand("pdf-parse"),
    description: translate("read_pdf.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/pdf-read",
      bodyParams: ["url", "maxPages", "maxChars", "pages", "startPage", "endPage"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("read_pdf.params.url"),
        },
        maxPages: {
          type: "integer",
          description: translate("read_pdf.params.maxPages"),
        },
        maxChars: {
          type: "integer",
          description: translate("read_pdf.params.maxChars"),
        },
        pages: {
          type: "array",
          items: { type: "integer" },
          description: translate("read_pdf.params.pages"),
        },
        startPage: {
          type: "integer",
          description: translate("read_pdf.params.startPage"),
        },
        endPage: {
          type: "integer",
          description: translate("read_pdf.params.endPage"),
        },
      },
      required: ["url"],
    },
  },
  {
    name: "read_docx",
    dataSource: onDemand("mammoth"),
    description: translate("read_docx.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/docx-read",
      bodyParams: ["url", "maxChars", "outputFormat"],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("read_docx.params.url"),
        },
        maxChars: {
          type: "integer",
          description: translate("read_docx.params.maxChars"),
        },
        outputFormat: {
          type: "string",
          description: translate("read_docx.params.outputFormat"),
          enum: ["markdown", "text"],
        },
      },
      required: ["url"],
    },
  },
  {
    name: "read_spreadsheet",
    dataSource: onDemand("exceljs"),
    description: translate("read_spreadsheet.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/spreadsheet-read",
      bodyParams: [
        "url",
        "maxRows",
        "maxChars",
        "sheet",
        "includeHeaders",
        "outputFormat",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("read_spreadsheet.params.url"),
        },
        maxRows: {
          type: "integer",
          description: translate("read_spreadsheet.params.maxRows"),
        },
        maxChars: {
          type: "integer",
          description: translate("read_spreadsheet.params.maxChars"),
        },
        sheet: {
          type: "string",
          description: translate("read_spreadsheet.params.sheet"),
        },
        includeHeaders: {
          type: "boolean",
          description: translate("read_spreadsheet.params.includeHeaders"),
        },
        outputFormat: {
          type: "string",
          description: translate("read_spreadsheet.params.outputFormat"),
          enum: ["json", "markdown", "csv"],
        },
      },
      required: ["url"],
    },
  },
  {
    name: "search_news",
    dataSource: onDemand("Brave News / Google News RSS"),
    description: translate("search_news.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/news-search",
      bodyParams: ["query", "topic", "limit", "locale", "countryEdition"],
    },
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: translate("search_news.params.query"),
        },
        topic: {
          type: "string",
          description: translate("search_news.params.topic"),
        },
        limit: {
          type: "integer",
          description: translate("search_news.params.limit"),
        },
        locale: {
          type: "string",
          description: translate("search_news.params.locale"),
        },
        countryEdition: {
          type: "string",
          description: translate("search_news.params.countryEdition"),
        },
      },
      required: [],
    },
  },
  {
    name: "search_images",
    dataSource: onDemand("Brave Image Search"),
    description: translate("search_images.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/image-search",
      bodyParams: ["query", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: translate("search_images.params.query"),
        },
        limit: {
          type: "integer",
          description: translate("search_images.params.limit"),
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_videos",
    dataSource: onDemand("Brave Video Search"),
    description: translate("search_videos.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/web/video-search",
      bodyParams: ["query", "limit", "dateRestrict"],
    },
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: translate("search_videos.params.query"),
        },
        limit: {
          type: "integer",
          description: translate("search_videos.params.limit"),
        },
        dateRestrict: {
          type: "string",
          description: translate("search_videos.params.dateRestrict"),
        },
      },
      required: ["query"],
    },
  },
  ];
}
