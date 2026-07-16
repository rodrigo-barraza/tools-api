// ─── Email: SMTP send + IMAP read/search ─────────────────────
// nodemailer (https://github.com/nodemailer/nodemailer) for SMTP send and
// imapflow (https://github.com/postalsys/imapflow) for IMAP read/search —
// same-author pairing proven by codefuturist/email-mcp
// (https://github.com/codefuturist/email-mcp). Bodies are parsed with
// mailparser and HTML is stripped via sanitize-html before reaching the
// LLM context. Credentials come from vault config (SMTP_* / IMAP_*).

import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import sanitizeHtml from "sanitize-html";
import CONFIG from "../config.ts";

const MAX_BODY_CHARS = 20_000;
const MAX_SEARCH_RESULTS = 50;

// ─── Config guards ─────────────────────────────────────────────

function requireSmtpConfig() {
  if (!CONFIG.SMTP_HOST || !CONFIG.SMTP_USER || !CONFIG.SMTP_PASS) {
    throw new Error(
      "SMTP is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS)",
    );
  }
}

function requireImapConfig() {
  if (!CONFIG.IMAP_HOST || !CONFIG.IMAP_USER || !CONFIG.IMAP_PASS) {
    throw new Error(
      "IMAP is not configured (IMAP_HOST / IMAP_USER / IMAP_PASS)",
    );
  }
}

// ─── SMTP send ─────────────────────────────────────────────────

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  requireSmtpConfig();
  if (!transporter) {
    const port = Number(CONFIG.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: CONFIG.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: CONFIG.SMTP_USER, pass: CONFIG.SMTP_PASS },
    });
  }
  return transporter;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
}

export async function sendEmail({
  to,
  subject,
  body,
  cc,
  bcc,
  replyTo,
}: SendEmailInput) {
  const info = await getTransporter().sendMail({
    from: CONFIG.SMTP_FROM || CONFIG.SMTP_USER,
    to,
    subject,
    text: body,
    ...(cc && { cc }),
    ...(bcc && { bcc }),
    ...(replyTo && { replyTo }),
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    from: CONFIG.SMTP_FROM || CONFIG.SMTP_USER,
    to,
    subject,
  };
}

// ─── IMAP read/search ──────────────────────────────────────────
// One short-lived connection per call: the tool surface is stateless HTTP,
// and imapflow's long-lived IDLE mode doesn't fit that shape (new-mail
// watching belongs to the scheduler, not a tool call).

async function withImap<T>(
  mailbox: string,
  task: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  requireImapConfig();
  const client = new ImapFlow({
    host: CONFIG.IMAP_HOST!,
    port: Number(CONFIG.IMAP_PORT) || 993,
    secure: (Number(CONFIG.IMAP_PORT) || 993) === 993,
    auth: { user: CONFIG.IMAP_USER!, pass: CONFIG.IMAP_PASS! },
    logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock(mailbox);
    try {
      return await task(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

interface EnvelopeAddress {
  name?: string;
  address?: string;
}

function formatAddresses(addresses?: EnvelopeAddress[]): string {
  if (!addresses?.length) return "";
  return addresses
    .map((entry) =>
      entry.name ? `${entry.name} <${entry.address ?? ""}>` : entry.address ?? "",
    )
    .join(", ");
}

export interface SearchEmailInput {
  mailbox?: string;
  text?: string;
  from?: string;
  subject?: string;
  since?: string;
  unseenOnly?: boolean;
  limit?: number;
}

export async function searchEmail({
  mailbox = "INBOX",
  text,
  from,
  subject,
  since,
  unseenOnly = false,
  limit = 20,
}: SearchEmailInput) {
  const cappedLimit = Math.min(Math.max(Math.round(limit) || 20, 1), MAX_SEARCH_RESULTS);

  return withImap(mailbox, async (client) => {
    const criteria: Record<string, unknown> = {};
    if (text) criteria.text = text;
    if (from) criteria.from = from;
    if (subject) criteria.subject = subject;
    if (unseenOnly) criteria.seen = false;
    if (since) {
      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        throw new Error(`Invalid 'since' date: ${since}`);
      }
      criteria.since = sinceDate;
    }

    const uids = await client.search(
      Object.keys(criteria).length > 0 ? criteria : { all: true },
      { uid: true },
    );
    if (!uids || uids.length === 0) {
      return { mailbox, count: 0, messages: [] };
    }

    // Newest first
    const selected = uids.sort((a, b) => b - a).slice(0, cappedLimit);

    const messages: Array<Record<string, unknown>> = [];
    for await (const message of client.fetch(
      selected,
      { uid: true, envelope: true, flags: true, bodyStructure: true },
      { uid: true },
    )) {
      messages.push({
        uid: message.uid,
        date: message.envelope?.date?.toISOString?.() ?? null,
        from: formatAddresses(message.envelope?.from),
        to: formatAddresses(message.envelope?.to),
        subject: message.envelope?.subject ?? "",
        seen: message.flags?.has("\\Seen") ?? false,
        hasAttachments:
          message.bodyStructure?.childNodes?.some(
            (node) => node.disposition === "attachment",
          ) ?? false,
      });
    }
    messages.sort((a, b) => Number(b.uid) - Number(a.uid));

    return {
      mailbox,
      count: messages.length,
      totalMatched: uids.length,
      messages,
    };
  });
}

export interface ReadEmailInput {
  uid: number;
  mailbox?: string;
  markSeen?: boolean;
}

export async function readEmail({
  uid,
  mailbox = "INBOX",
  markSeen = false,
}: ReadEmailInput) {
  return withImap(mailbox, async (client) => {
    const message = await client.fetchOne(
      String(uid),
      { uid: true, source: true, flags: true },
      { uid: true },
    );
    if (!message || !message.source) {
      throw new Error(`Message uid ${uid} not found in '${mailbox}'`);
    }

    const parsed = await simpleParser(message.source);

    // Prefer the plain-text part; fall back to stripped HTML.
    let body = parsed.text?.trim() || "";
    if (!body && parsed.html) {
      body = sanitizeHtml(parsed.html, {
        allowedTags: [],
        allowedAttributes: {},
      })
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    const truncated = body.length > MAX_BODY_CHARS;
    if (truncated) body = body.slice(0, MAX_BODY_CHARS);

    if (markSeen) {
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    }

    return {
      uid,
      mailbox,
      date: parsed.date?.toISOString() ?? null,
      from: parsed.from?.text ?? "",
      to: Array.isArray(parsed.to)
        ? parsed.to.map((addr) => addr.text).join(", ")
        : parsed.to?.text ?? "",
      subject: parsed.subject ?? "",
      body,
      ...(truncated && { truncated: true }),
      attachments: parsed.attachments.map((attachment) => ({
        filename: attachment.filename ?? "(unnamed)",
        contentType: attachment.contentType,
        bytes: attachment.size,
      })),
    };
  });
}
