import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { Request, Response, Router } from "express";
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
// ─── Health ────────────────────────────────────────────────────────
export function getCommunicationHealth() {
  return {
    sms: "on-demand (Twilio)",
    lookup: "on-demand (Twilio Lookup v2)",
    account: "on-demand (Twilio API)",
    push: "on-demand (ntfy.sh)",
    webhook: "on-demand (generic HTTP)",
  };
}
export default router;
