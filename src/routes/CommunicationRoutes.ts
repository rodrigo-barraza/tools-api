import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import { Router } from "express";
import {
  sendSms,
  listMessages,
  getAccountInfo,
  lookupPhone,
  listPhoneNumbers,
} from "../services/TwilioService.ts";
const router = Router();
// ─── Send SMS ──────────────────────────────────────────────────────
router.post("/sms/send", asyncHandler(async (req: any, res: any) => {
  const { to, body, from } = req.body;
  if (!to || !body) {
    return res
      .status(400)
      .json({ error: "Request body must include 'to' (E.164 phone number) and 'body' (message text)" });
  }
  if (body.length > 1600) {
    return res
      .status(400)
      .json({ error: "Message body exceeds maximum length of 1,600 characters" });
  }
  try {
    const result = await sendSms(to, body, from);
    res.json(result);
  } catch (error: any) {
    res.status(502).json({ error: `SMS send failed: ${error.message}` });
  }
}));
// ─── List Messages ─────────────────────────────────────────────────
router.get("/sms/messages", asyncHandler(
  async (req: any) => {
    const { to, from, limit, dateSent } = req.query as any;
    return listMessages({ to, from, limit, dateSent });
  },
  "SMS message list",
));
// ─── Account Info ──────────────────────────────────────────────────
router.get("/account", asyncHandler(
  () => getAccountInfo(),
  "Twilio account info",
));
// ─── Phone Lookup ──────────────────────────────────────────────────
router.get("/lookup/:phone", asyncHandler(
  (req: any) => lookupPhone(req.params.phone as string),
  "Phone lookup",
));
// ─── List Numbers ──────────────────────────────────────────────────
router.get("/numbers", asyncHandler(
  () => listPhoneNumbers(),
  "Twilio phone numbers",
));
// ─── Health ────────────────────────────────────────────────────────
export function getCommunicationHealth() {
  return {
    sms: "on-demand (Twilio)",
    lookup: "on-demand (Twilio Lookup v2)",
    account: "on-demand (Twilio API)",
  };
}
export default router;
