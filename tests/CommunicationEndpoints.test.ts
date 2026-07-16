import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import communicationRoutes from "../src/routes/CommunicationRoutes.ts";

// ─── Mocks ──────────────────────────────────────────────────

vi.mock("../src/services/TwilioService.ts", () => ({
  sendSms: vi.fn(async (to: string, body: string) => ({
    sid: "SM" + "a".repeat(32),
    to,
    body,
    status: "queued",
    dateCreated: "2025-06-01T10:00:00Z",
  })),
  listMessages: vi.fn(async () => ({
    messages: [
      { sid: "SM1", to: "+1234567890", body: "Hello", status: "delivered" },
    ],
    total: 1,
  })),
  getAccountInfo: vi.fn(async () => ({
    sid: "AC_test",
    friendlyName: "Test Account",
    status: "active",
  })),
  lookupPhone: vi.fn(async (phone: string) => ({
    phoneNumber: phone,
    countryCode: "US",
    carrier: { name: "Test Carrier", type: "mobile" },
  })),
  listPhoneNumbers: vi.fn(async () => ({
    numbers: [
      { phoneNumber: "+1234567890", friendlyName: "Main" },
    ],
    total: 1,
  })),
}));

vi.mock("../src/fetchers/utility/NotificationFetcher.ts", () => ({
  sendPushNotification: vi.fn(async (options: Record<string, unknown>) => ({
    success: true,
    topic: options.topic,
    message: options.message,
  })),
  sendWebhook: vi.fn(async (options: Record<string, unknown>) => ({
    success: true,
    statusCode: 200,
    url: options.url,
  })),
}));

vi.mock("../src/config.ts", () => ({
  default: {
    NTFY_BASE_URL: "https://ntfy.sh",
    NTFY_TOKEN: "test-token",
  },
}));

const app = createTestApp("/communication", communicationRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════
//  POST /communication/sms/send
// ═══════════════════════════════════════════════════════════════

describe("POST /communication/sms/send", () => {
  it("returns 400 when 'to' is missing", async () => {
    const response = await request(app)
      .post("/communication/sms/send")
      .send({ body: "Hello" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("to");
  });

  it("returns 400 when 'body' is missing", async () => {
    const response = await request(app)
      .post("/communication/sms/send")
      .send({ to: "+1234567890" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("body");
  });

  it("returns 400 when body exceeds 1600 characters", async () => {
    const response = await request(app)
      .post("/communication/sms/send")
      .send({ to: "+1234567890", body: "x".repeat(1601) });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("1,600");
  });

  it("sends an SMS successfully", async () => {
    const response = await request(app)
      .post("/communication/sms/send")
      .send({ to: "+1234567890", body: "Test message" });
    expect(response.status).toBe(200);
    expect(response.body.sid).toBeTruthy();
    expect(response.body.to).toBe("+1234567890");
    expect(response.body.status).toBe("queued");
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /communication/sms/messages
// ═══════════════════════════════════════════════════════════════

describe("GET /communication/sms/messages", () => {
  it("lists SMS messages", async () => {
    const response = await request(app).get("/communication/sms/messages");
    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.total).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /communication/account
// ═══════════════════════════════════════════════════════════════

describe("GET /communication/account", () => {
  it("returns Twilio account info", async () => {
    const response = await request(app).get("/communication/account");
    expect(response.status).toBe(200);
    expect(response.body.sid).toBe("AC_test");
    expect(response.body.status).toBe("active");
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /communication/lookup/:phone
// ═══════════════════════════════════════════════════════════════

describe("GET /communication/lookup/:phone", () => {
  it("looks up a phone number", async () => {
    const response = await request(app).get(
      "/communication/lookup/+1234567890",
    );
    expect(response.status).toBe(200);
    expect(response.body.phoneNumber).toBe("+1234567890");
    expect(response.body.countryCode).toBe("US");
    expect(response.body.carrier.type).toBe("mobile");
  });
});

// ═══════════════════════════════════════════════════════════════
//  GET /communication/numbers
// ═══════════════════════════════════════════════════════════════

describe("GET /communication/numbers", () => {
  it("lists phone numbers", async () => {
    const response = await request(app).get("/communication/numbers");
    expect(response.status).toBe(200);
    expect(response.body.numbers).toHaveLength(1);
    expect(response.body.total).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
//  POST /communication/push
// ═══════════════════════════════════════════════════════════════

describe("POST /communication/push", () => {
  it("returns 400 when topic or message is missing", async () => {
    const response = await request(app)
      .post("/communication/push")
      .send({ topic: "alerts" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("message");
  });

  it("sends a push notification", async () => {
    const response = await request(app)
      .post("/communication/push")
      .send({ topic: "alerts", message: "Server restarted" });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.topic).toBe("alerts");
  });
});

// ═══════════════════════════════════════════════════════════════
//  POST /communication/webhook
// ═══════════════════════════════════════════════════════════════

describe("POST /communication/webhook", () => {
  it("returns 400 when url or payload is missing", async () => {
    const response = await request(app)
      .post("/communication/webhook")
      .send({ url: "https://example.com/hook" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("payload");
  });

  it("sends a webhook successfully", async () => {
    const response = await request(app)
      .post("/communication/webhook")
      .send({
        url: "https://example.com/hook",
        payload: { event: "deploy", status: "success" },
      });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.statusCode).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Email — /communication/email/* (SMTP/IMAP unconfigured in tests)
// ═══════════════════════════════════════════════════════════════

describe("POST /communication/email/send", () => {
  it("returns 400 when required fields are missing", async () => {
    const missingTo = await request(app)
      .post("/communication/email/send")
      .send({ subject: "s", body: "b" });
    expect(missingTo.status).toBe(400);
    expect(missingTo.body.error).toContain("to");

    const missingSubject = await request(app)
      .post("/communication/email/send")
      .send({ to: "a@b.c", body: "b" });
    expect(missingSubject.status).toBe(400);
    expect(missingSubject.body.error).toContain("subject");

    const missingBody = await request(app)
      .post("/communication/email/send")
      .send({ to: "a@b.c", subject: "s" });
    expect(missingBody.status).toBe(400);
    expect(missingBody.body.error).toContain("body");
  });

  it("returns 502 with a clear message when SMTP is not configured", async () => {
    const res = await request(app)
      .post("/communication/email/send")
      .send({ to: "a@b.c", subject: "s", body: "b" });
    expect(res.status).toBe(502);
    expect(res.body.error).toContain("SMTP is not configured");
  });
});

describe("POST /communication/email/read", () => {
  it("returns 400 for a missing or invalid uid", async () => {
    const res = await request(app)
      .post("/communication/email/read")
      .send({ uid: "not-a-number" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("uid");
  });
});

describe("POST /communication/email/search", () => {
  it("returns 502 with a clear message when IMAP is not configured", async () => {
    const res = await request(app).post("/communication/email/search").send({});
    expect(res.status).toBe(502);
    expect(res.body.error).toContain("IMAP is not configured");
  });
});
