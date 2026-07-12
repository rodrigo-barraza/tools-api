// ────────────────────────────────────────────────────────────
// Tool Definitions — Communication
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, compute } from "./utils.ts";

export function getCommunicationTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  {
    name: "send_sms",
    dataSource: onDemand("Twilio"),
    description: translate("send_sms.description"),
    endpoint: { path: "/communication/sms/send", method: "POST" },
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: translate("send_sms.params.to"),
        },
        body: {
          type: "string",
          description: translate("send_sms.params.body"),
        },
        from: {
          type: "string",
          description: translate("send_sms.params.from"),
        },
      },
      required: ["to", "body"],
    },
  },
  {
    name: "list_sms_messages",
    dataSource: onDemand("Twilio"),
    description: translate("list_sms_messages.description"),
    endpoint: {
      path: "/communication/sms/messages",
      queryParams: ["to", "from", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: translate("list_sms_messages.params.to"),
        },
        from: {
          type: "string",
          description: translate("list_sms_messages.params.from"),
        },
        limit: {
          type: "integer",
          description: translate("list_sms_messages.params.limit"),
        },
      },
    },
  },
  {
    name: "get_sms_account",
    dataSource: onDemand("Twilio"),
    description: translate("get_sms_account.description"),
    endpoint: { path: "/communication/account" },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "lookup_phone_number",
    dataSource: onDemand("Twilio Lookup v2"),
    description: translate("lookup_phone_number.description"),
    endpoint: { path: "/communication/lookup/:phone", pathParams: ["phone"] },
    parameters: {
      type: "object",
      properties: {
        phone: {
          type: "string",
          description: translate("lookup_phone_number.params.phone"),
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "list_phone_numbers",
    dataSource: onDemand("Twilio"),
    description: translate("list_phone_numbers.description"),
    endpoint: { path: "/communication/numbers" },
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "send_push_notification",
    dataSource: onDemand("ntfy.sh"),
    description: translate("send_push_notification.description"),
    endpoint: {
      path: "/communication/push",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: translate("send_push_notification.params.topic"),
        },
        message: {
          type: "string",
          description: translate("send_push_notification.params.message"),
        },
        title: {
          type: "string",
          description: translate("send_push_notification.params.title"),
        },
        priority: {
          type: "string",
          enum: ["min", "low", "default", "high", "urgent"],
          description: translate("send_push_notification.params.priority"),
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: translate("send_push_notification.params.tags"),
        },
        clickUrl: {
          type: "string",
          description: translate("send_push_notification.params.clickUrl"),
        },
      },
      required: ["topic", "message"],
    },
    display: {
      activeVerb: "Sending push notification",
      completedVerb: "Sent push notification",
      subjectParam: "topic",
      subjectFormat: "full",
    },
  },
  {
    name: "send_webhook",
    dataSource: compute("http"),
    description: translate("send_webhook.description"),
    endpoint: {
      path: "/communication/webhook",
      method: "POST",
    },
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: translate("send_webhook.params.url"),
        },
        payload: {
          type: "object",
          description: translate("send_webhook.params.payload"),
        },
        method: {
          type: "string",
          enum: ["POST", "PUT", "PATCH"],
          description: translate("send_webhook.params.method"),
        },
        headers: {
          type: "object",
          description: translate("send_webhook.params.headers"),
        },
      },
      required: ["url", "payload"],
    },
    display: {
      activeVerb: "Sending webhook to",
      completedVerb: "Sent webhook to",
      subjectParam: "url",
      subjectFormat: "domain",
    },
  },
  ];
}
