import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import utilityRoutes from "../src/routes/UtilityRoutes.ts";

// ─── Unit Tests for Utility Domain Endpoints ────────────────────

const app = createTestApp("/utility", utilityRoutes);

// ═══════════════════════════════════════════════════════════════════
//  Airports — in-memory CSV data
// ═══════════════════════════════════════════════════════════════════

describe("GET /utility/airports/search", () => {
  it("returns 400 when q is missing", async () => {
    const res = await request(app).get("/utility/airports/search");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("returns airport search results", async () => {
    const res = await request(app).get("/utility/airports/search?q=vancouver&limit=5");
    expect(res.status).toBe(200);
    expect(typeof res.body.count === "number").toBeTruthy();
    expect(res.body.count > 0).toBeTruthy();
    expect(Array.isArray(res.body.airports)).toBeTruthy();
    expect(res.body.airports[0].name).toBeTruthy();
    expect(res.body.airports[0].iataCode).toBeTruthy();
  });
});

describe("GET /utility/airports/code/:code", () => {
  it("returns airport data for YVR", async () => {
    const res = await request(app).get("/utility/airports/code/YVR");
    expect(res.status).toBe(200);
    expect(res.body.iataCode).toBe("YVR");
    expect(res.body.name).toBeTruthy();
    expect(res.body.city).toBeTruthy();
    expect(res.body.countryCode).toBeTruthy();
    expect(typeof res.body.latitude === "number").toBeTruthy();
    expect(typeof res.body.longitude === "number").toBeTruthy();
  });

  it("returns 404 for nonexistent code", async () => {
    const res = await request(app).get("/utility/airports/code/ZZZZZ");
    expect(res.status).toBe(404);
  });
});

describe("GET /utility/airports/country/:code", () => {
  it("returns airports for a country", async () => {
    const res = await request(app).get("/utility/airports/country/CA?limit=10");
    expect(res.status).toBe(200);
    expect(typeof res.body.count === "number").toBeTruthy();
    expect(res.body.count > 0).toBeTruthy();
    expect(Array.isArray(res.body.airports)).toBeTruthy();
    expect(res.body.countryCode).toBe("CA");
  });
});

describe("GET /utility/airports/nearest", () => {
  it("returns 400 when lat/lng are missing", async () => {
    const res = await request(app).get("/utility/airports/nearest");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it("returns nearest airports to Vancouver", async () => {
    const res = await request(app).get("/utility/airports/nearest?lat=49.19&lng=-123.18&limit=3");
    expect(res.status).toBe(200);
    expect(typeof res.body.count === "number").toBeTruthy();
    expect(res.body.count > 0).toBeTruthy();
    expect(Array.isArray(res.body.airports)).toBeTruthy();
    expect(typeof res.body.airports[0].distanceKm === "number").toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Currency — validation-only (external API)
// ═══════════════════════════════════════════════════════════════════

describe("GET /utility/currency/convert (validation)", () => {
  it("returns 400 when from/to are missing", async () => {
    const res = await request(app).get("/utility/currency/convert?amount=100");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("GET /utility/currency/list", () => {
  it("returns available currencies", async () => {
    const currencyFetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        result: "success",
        base_code: "USD",
        time_last_update_utc: "Thu, 04 Jun 2026 00:00:00 +0000",
        time_next_update_utc: "Fri, 05 Jun 2026 00:00:00 +0000",
        rates: {
          USD: 1.0,
          CAD: 1.37,
          EUR: 0.92,
        },
      }),
    } as Response);

    const res = await request(app).get("/utility/currency/list");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
    expect(res.body.currencies).toEqual(["CAD", "EUR", "USD"]);

    currencyFetchSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Places — validation-only (external API)
// ═══════════════════════════════════════════════════════════════════

describe("GET /utility/places/nearby (validation)", () => {
  it("returns 400 when type is missing", async () => {
    const res = await request(app).get("/utility/places/nearby");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("GET /utility/places/search (validation)", () => {
  it("returns 400 when q is missing", async () => {
    const res = await request(app).get("/utility/places/search");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("GET /utility/scrape/metadata (validation)", () => {
  it("returns 400 when url is missing", async () => {
    const res = await request(app).get("/utility/scrape/metadata");
    expect(res.status).toBe(400);
  });
});

describe("POST /utility/python/execute", () => {
  it("returns 400 when code is missing", async () => {
    const res = await request(app).post("/utility/python/execute").send({});
    expect(res.status).toBe(400);
  });

  it("executes valid python code successfully", async () => {
    const res = await request(app)
      .post("/utility/python/execute")
      .send({ code: "print('Hello, World!')" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stdout.trim()).toBe("Hello, World!");
  });

  it("returns execution failure on syntax error", async () => {
    const res = await request(app)
      .post("/utility/python/execute")
      .send({ code: "invalid python code!" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.stderr).toContain("SyntaxError");
  });
});


