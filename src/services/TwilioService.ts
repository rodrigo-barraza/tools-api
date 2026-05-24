// ─── Programmable SMS & Phone Lookup ────────────────────────

import twilio from "twilio";
import CONFIG from "../config.ts";

// ─── Lazy Client ───────────────────────────────────────────────────

let client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!client) {
    if (!CONFIG.TWILIO_ACCOUNT_SID || !CONFIG.TWILIO_AUTH_TOKEN) {
      throw new Error("Twilio credentials not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)");
    }
    client = twilio(CONFIG.TWILIO_ACCOUNT_SID, CONFIG.TWILIO_AUTH_TOKEN);
  }
  return client;
}

// ─── SMS ───────────────────────────────────────────────────────────

/**
 * Send an SMS message.


 */
export async function sendSms(to: string, body: string, from: string) {
  const twilioClient = getClient();

  // Resolve sender if not provided
  let fromNumber = from;
  if (!fromNumber) {
    const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 1 });
    if (numbers.length === 0) {
      throw new Error("No Twilio phone numbers available on this account");
    }
    fromNumber = numbers[0].phoneNumber;
  }

  const message = await twilioClient.messages.create({
    to,
    from: fromNumber,
    body,
  });

  return {
    sid: message.sid,
    to: message.to,
    from: message.from,
    body: message.body,
    status: message.status,
    dateCreated: message.dateCreated,
    direction: message.direction,
    price: message.price,
    priceUnit: message.priceUnit,
  };
}

/**
 * List recent messages on the account.


 */
export async function listMessages(filters: Record<string, unknown> = {}) {
  const twilioClient = getClient();

  const options: Record<string, unknown> = {
    limit: Math.min(parseInt(filters.limit as string) || 20, 100),
  };
  if (filters.to) options.to = filters.to;
  if (filters.from) options.from = filters.from;
  if (filters.dateSent) options.dateSent = new Date(filters.dateSent as string);

  const messages = await twilioClient.messages.list(options);

  return {
    count: messages.length,
    messages: messages.map((m) => ({
      sid: m.sid,
      to: m.to,
      from: m.from,
      body: m.body,
      status: m.status,
      direction: m.direction,
      dateCreated: m.dateCreated,
      dateSent: m.dateSent,
      price: m.price,
      priceUnit: m.priceUnit,
      errorCode: m.errorCode || null,
      errorMessage: m.errorMessage || null,
    })),
  };
}

// ─── Account ───────────────────────────────────────────────────────

/**
 * Get account info (balance, status, friendly name).

 */
export async function getAccountInfo() {
  const twilioClient = getClient();
  const account = await twilioClient.api.accounts(CONFIG.TWILIO_ACCOUNT_SID!).fetch();
  const balance = await twilioClient.balance.fetch();

  return {
    sid: account.sid,
    friendlyName: account.friendlyName,
    status: account.status,
    type: account.type,
    dateCreated: account.dateCreated,
    balance: balance.balance,
    currency: balance.currency,
  };
}

// ─── Phone Number Lookup ───────────────────────────────────────────

/**
 * Look up information about a phone number via Twilio Lookup API v2.


 */
export async function lookupPhone(phone: string) {
  const twilioClient = getClient();
  const result = await twilioClient.lookups.v2.phoneNumbers(phone).fetch({
    fields: "line_type_intelligence",
  });

  return {
    phoneNumber: result.phoneNumber,
    nationalFormat: result.nationalFormat,
    countryCode: result.countryCode,
    callerName: result.callerName || null,
    carrier: (result as unknown as Record<string, unknown>).carrier || null,
    lineTypeIntelligence: result.lineTypeIntelligence || null,
    valid: result.valid,
    validationErrors: result.validationErrors || [],
  };
}

// ─── Phone Numbers ─────────────────────────────────────────────────

/**
 * List Twilio phone numbers on the account.

 */
export async function listPhoneNumbers() {
  const twilioClient = getClient();
  const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 50 });

  return {
    count: numbers.length,
    phoneNumbers: numbers.map((n) => ({
      sid: n.sid,
      phoneNumber: n.phoneNumber,
      friendlyName: n.friendlyName,
      capabilities: n.capabilities,
      dateCreated: n.dateCreated,
    })),
  };
}
