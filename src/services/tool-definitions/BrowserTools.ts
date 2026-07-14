// ────────────────────────────────────────────────────────────
// Tool Definitions — Browser
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { compute } from "./utils.ts";

export function getBrowserTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "control_browser",
    dataSource: compute("headless Chromium (Playwright)"),
    description: translate("control_browser.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/browser/action",
      bodyParams: [
        "action",
        "sessionId",
        "url",
        "selector",
        "text",
        "pressEnter",
        "fullPage",
        "direction",
        "amount",
        "expression",
        "format",
        "timeout",
        "state",
        "limit",
        "ref",
        "value",
      ],
    },
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: translate("control_browser.params.action"),
          enum: [
            "navigate",
            "screenshot",
            "click",
            "type",
            "scroll",
            "evaluate",
            "get_content",
            "get_elements",
            "wait",
            "close",
            "snapshot",
            "click_ref",
            "type_ref",
            "hover_ref",
            "select_ref",
          ],
        },
        sessionId: {
          type: "string",
          description: translate("control_browser.params.sessionId"),
        },
        url: {
          type: "string",
          description: translate("control_browser.params.url"),
        },
        selector: {
          type: "string",
          description: translate("control_browser.params.selector"),
        },
        ref: {
          type: "string",
          description: translate("control_browser.params.ref"),
        },
        text: {
          type: "string",
          description: translate("control_browser.params.text"),
        },
        value: {
          type: "string",
          description: translate("control_browser.params.value"),
        },
        pressEnter: {
          type: "boolean",
          description: translate("control_browser.params.pressEnter"),
        },
        fullPage: {
          type: "boolean",
          description: translate("control_browser.params.fullPage"),
        },
        direction: {
          type: "string",
          description: translate("control_browser.params.direction"),
        },
        amount: {
          type: "integer",
          description: translate("control_browser.params.amount"),
        },
        expression: {
          type: "string",
          description: translate("control_browser.params.expression"),
        },
        format: {
          type: "string",
          description: translate("control_browser.params.format"),
        },
        timeout: {
          type: "integer",
          description: translate("control_browser.params.timeout"),
        },
        state: {
          type: "string",
          description: translate("control_browser.params.state"),
        },
        limit: {
          type: "integer",
          description: translate("control_browser.params.limit"),
        },
      },
      required: ["action"],
    },
    display: {
      activeVerb: "Browser:",
      completedVerb: "Browser:",
      subjectParam: "action",
      subjectFormat: "full",
    },
  },
  {
    name: "execute_browser_script",
    dataSource: compute("headless Chromium (Playwright subprocess)"),
    description: translate("execute_browser_script.description"),
    endpoint: {
      method: "POST",
      path: "/agentic/browser/script",
      bodyParams: ["script", "timeout"],
    },
    parameters: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: translate("execute_browser_script.params.script"),
        },
        timeout: {
          type: "integer",
          description: translate("execute_browser_script.params.timeout"),
        },
      },
      required: ["script"],
    },
  },
  ];
}
