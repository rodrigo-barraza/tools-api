// ────────────────────────────────────────────────────────────
// Tool Definitions — Communication
// ────────────────────────────────────────────────────────────

import type { ToolDefinition } from "../../types/tools.ts";
import { onDemand, compute } from "./utils.ts";

export function getCommunicationTools(
  translate: (key: string, variables?: Record<string, string>) => string
): ToolDefinition[] {
  

  return [
  // Email trio: nodemailer SMTP + imapflow IMAP (same-author pairing,
  // https://github.com/nodemailer/nodemailer + https://github.com/postalsys/imapflow;
  // combo proven by https://github.com/codefuturist/email-mcp).
  {
    name: "send_email",
    dataSource: onDemand("SMTP"),
    description: translate("send_email.description"),
    endpoint: {
      path: "/communication/email/send",
      method: "POST",
      bodyParams: ["to", "subject", "body", "cc", "bcc", "replyTo"],
    },
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: translate("send_email.params.to"),
        },
        subject: {
          type: "string",
          description: translate("send_email.params.subject"),
        },
        body: {
          type: "string",
          description: translate("send_email.params.body"),
        },
        cc: {
          type: "string",
          description: translate("send_email.params.cc"),
        },
        bcc: {
          type: "string",
          description: translate("send_email.params.cc"),
        },
        replyTo: {
          type: "string",
          description: translate("send_email.params.replyTo"),
        },
      },
      required: ["to", "subject", "body"],
    },
    display: {
      activeVerb: "Sending email to",
      completedVerb: "Sent email to",
      subjectParam: "to",
      subjectFormat: "truncate",
    },
  },
  {
    name: "search_email",
    dataSource: onDemand("IMAP"),
    description: translate("search_email.description"),
    endpoint: {
      path: "/communication/email/search",
      method: "POST",
      bodyParams: ["mailbox", "text", "from", "subject", "since", "unseenOnly", "limit"],
    },
    parameters: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description: translate("search_email.params.mailbox"),
        },
        text: {
          type: "string",
          description: translate("search_email.params.text"),
        },
        from: {
          type: "string",
          description: translate("search_email.params.from"),
        },
        subject: {
          type: "string",
          description: translate("search_email.params.subject"),
        },
        since: {
          type: "string",
          description: translate("search_email.params.since"),
        },
        unseenOnly: {
          type: "boolean",
          description: translate("search_email.params.unseenOnly"),
        },
        limit: {
          type: "integer",
          description: translate("search_email.params.limit"),
        },
      },
      required: [],
    },
    display: {
      activeVerb: "Searching email",
      completedVerb: "Searched email",
      subjectParam: "text",
      subjectFormat: "truncate",
    },
  },
  {
    name: "read_email",
    dataSource: onDemand("IMAP"),
    description: translate("read_email.description"),
    endpoint: {
      path: "/communication/email/read",
      method: "POST",
      bodyParams: ["uid", "mailbox", "markSeen"],
    },
    parameters: {
      type: "object",
      properties: {
        uid: {
          type: "integer",
          description: translate("read_email.params.uid"),
        },
        mailbox: {
          type: "string",
          description: translate("read_email.params.mailbox"),
        },
        markSeen: {
          type: "boolean",
          description: translate("read_email.params.markSeen"),
        },
      },
      required: ["uid"],
    },
    display: {
      activeVerb: "Reading email",
      completedVerb: "Read email",
      subjectParam: "uid",
      subjectFormat: "full",
    },
  },
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
