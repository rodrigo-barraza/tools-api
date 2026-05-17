// @ts-nocheck
import request from "supertest";
import { createTestApp } from "./testApp.js";
import adminRoutes from "../src/routes/AdminRoutes.js";

// ─── Unit Tests for Admin Endpoints ────────────────────

const app = createTestApp("/admin", adminRoutes);

describe("GET /admin/tool-schemas", () => {
  it("returns tool schemas", async () => {
    const res = await request(app).get("/admin/tool-schemas");
    expect(res.status).toBe(200);
    expect(typeof res.body === "object").toBeTruthy();
  });
});

describe("GET /admin/tool-schemas/ai", () => {
  it("returns AI tool schemas", async () => {
    const res = await request(app).get("/admin/tool-schemas/ai");
    expect(res.status).toBe(200);
    expect(typeof res.body === "object").toBeTruthy();
  });
});

describe("GET /admin/tool-schemas/disabled", () => {
  it("returns disabled tool schemas", async () => {
    const res = await request(app).get("/admin/tool-schemas/disabled");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBeTruthy();
  });
});

describe("PUT /admin/config/workspaces", () => {
  it("returns 400 when roots is missing or not an array", async () => {
    const res = await request(app).put("/admin/config/workspaces").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/'roots' must be an array/);

    const res2 = await request(app).put("/admin/config/workspaces").send({ roots: "not-array" });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/'roots' must be an array/);
  });
});

describe("POST /admin/config/workspaces/validate", () => {
  it("returns 400 when path is missing", async () => {
    const res = await request(app).post("/admin/config/workspaces/validate").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/'path' is required/);
  });
});
