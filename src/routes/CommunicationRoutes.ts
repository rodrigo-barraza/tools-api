import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { type Request, type Response, Router } from "express";
import {
  sendSms,
  listMessages,
  getAccountInfo,
  lookupPhone,
  listPhoneNumbers,
} from "../services/TwilioService.ts";
import { errorMessage } from "../utilities.ts";

const router = Router();
// ─── Send SMS ──────────────────────────────────────────────────────
router.post(
  "/sms/send",
  asyncHandler(async (req: Request, res: Response) => {
    const { to, body, from } = req.body;
    if (!to || !body) {
      return res
        .status(400)
        .json({
          error:
            "Request body must include 'to' (E.164 phone number) and 'body' (message text)",
        });
    }
    if (body.length > 1600) {
      return res
        .status(400)
        .json({
          error: "Message body exceeds maximum length of 1,600 characters",
        });
    }
    try {
      const result = await sendSms(to, body, from);
      res.json(result);
    } catch (error: unknown) {
      res
        .status(502)
        .json({ error: `SMS send failed: ${errorMessage(error)}` });
    }
  }),
);
// ─── List Messages ─────────────────────────────────────────────────
router.get(
  "/sms/messages",
  asyncHandler(async (req: Request) => {
    const { to, from, limit, dateSent } = req.query as Record<
      string,
      string | undefined
    >;
    return listMessages({ to, from, limit, dateSent });
  }, "SMS message list"),
);
// ─── Account Info ──────────────────────────────────────────────────
router.get(
  "/account",
  asyncHandler(() => getAccountInfo(), "Twilio account info"),
);
// ─── Phone Lookup ──────────────────────────────────────────────────
router.get(
  "/lookup/:phone",
  asyncHandler(
    (req: Request) => lookupPhone(req.params.phone as string),
    "Phone lookup",
  ),
);
// ─── List Numbers ──────────────────────────────────────────────────
router.get(
  "/numbers",
  asyncHandler(() => listPhoneNumbers(), "Twilio phone numbers"),
);
// ─── Push Notifications (ntfy.sh) ──────────────────────────────────
import {
  sendPushNotification,
  sendWebhook,
} from "../fetchers/utility/NotificationFetcher.ts";
import CONFIG from "../config.ts";

router.post(
  "/push",
  asyncHandler(async (req: Request, res: Response) => {
    const { topic, message, title, priority, tags, clickUrl, attachmentUrl } = req.body;
    if (!topic || !message) {
      return res.status(400).json({
        error: "'topic' and 'message' are required",
      });
    }
    const baseUrl = CONFIG.NTFY_BASE_URL || "https://ntfy.sh";
    res.json(
      await sendPushNotification(
        { topic, message, title, priority, tags, clickUrl, attachmentUrl },
        baseUrl,
        CONFIG.NTFY_TOKEN,
      ),
    );
  }),
);
// ─── Webhook Sender ────────────────────────────────────────────────
router.post(
  "/webhook",
  asyncHandler(async (req: Request, res: Response) => {
    const { url, payload, method, headers } = req.body;
    if (!url || !payload) {
      return res.status(400).json({
        error: "'url' and 'payload' are required",
      });
    }
    res.json(await sendWebhook({ url, payload, method, headers }));
  }),
);
// ─── Email (SMTP send / IMAP read+search) ──────────────────────────
import { sendEmail, searchEmail, readEmail } from "../services/EmailService.ts";

router.post(
  "/email/send",
  asyncHandler(async (req: Request, res: Response) => {
    const { to, subject, body, cc, bcc, replyTo } = req.body;
    if (!to || typeof to !== "string") {
      return res.status(400).json({ error: "'to' (string) is required" });
    }
    if (!subject || typeof subject !== "string") {
      return res.status(400).json({ error: "'subject' (string) is required" });
    }
    if (!body || typeof body !== "string") {
      return res.status(400).json({ error: "'body' (string) is required" });
    }
    try {
      res.json(await sendEmail({ to, subject, body, cc, bcc, replyTo }));
    } catch (error: unknown) {
      res
        .status(502)
        .json({ error: `Email send failed: ${errorMessage(error)}` });
    }
  }),
);
router.post(
  "/email/search",
  asyncHandler(async (req: Request, res: Response) => {
    const { mailbox, text, from, subject, since, unseenOnly, limit } = req.body;
    try {
      res.json(
        await searchEmail({
          mailbox,
          text,
          from,
          subject,
          since,
          unseenOnly,
          limit,
        }),
      );
    } catch (error: unknown) {
      res
        .status(502)
        .json({ error: `Email search failed: ${errorMessage(error)}` });
    }
  }),
);
router.post(
  "/email/read",
  asyncHandler(async (req: Request, res: Response) => {
    const { uid, mailbox, markSeen } = req.body;
    const parsedUid = parseInt(uid);
    if (!Number.isFinite(parsedUid) || parsedUid <= 0) {
      return res.status(400).json({
        error: "'uid' (positive integer from search_email) is required",
      });
    }
    try {
      res.json(
        await readEmail({ uid: parsedUid, mailbox, markSeen: markSeen === true }),
      );
    } catch (error: unknown) {
      res
        .status(502)
        .json({ error: `Email read failed: ${errorMessage(error)}` });
    }
  }),
);
// ─── Health ────────────────────────────────────────────────────────
export function getCommunicationHealth() {
  return {
    sms: "on-demand (Twilio)",
    lookup: "on-demand (Twilio Lookup v2)",
    account: "on-demand (Twilio API)",
    push: "on-demand (ntfy.sh)",
    webhook: "on-demand (generic HTTP)",
    emailSend: "on-demand (nodemailer SMTP)",
    emailRead: "on-demand (imapflow IMAP)",
  };
}
export default router;
