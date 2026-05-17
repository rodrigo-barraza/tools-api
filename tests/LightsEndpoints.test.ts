// @ts-nocheck
import request from "supertest";
import { createTestApp } from "./testApp.js";
import lightsRoutes from "../routes/LightsRoutes.js";

// ─── Unit Tests for Lights Domain Endpoints ────────────────────

const app = createTestApp("/lights", lightsRoutes);

describe("GET /lights/list", () => {
  it("route exists and returns 200 or 502", async () => {
    const res = await request(app).get("/lights/list");
    expect([200, 502]).toContain(res.status);
  });
});

describe("PUT /lights/states", () => {
  it("returns 400 when states array is missing or empty", async () => {
    const res = await request(app).put("/lights/states").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/states must be a non-empty array/);

    const res2 = await request(app).put("/lights/states").send({ states: [] });
    expect(res2.status).toBe(400);
    expect(res2.body.error).toMatch(/states must be a non-empty array/);
  });
});

describe("POST /lights/scenes/activate", () => {
  it("returns 400 when sceneId is missing", async () => {
    const res = await request(app).post("/lights/scenes/activate").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sceneId is required/);
  });
});

describe("POST /lights/nightlock", () => {
  it("returns 400 for 'set' action without locked parameter", async () => {
    const res = await request(app).post("/lights/nightlock").send({ action: "set" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/locked \(boolean\) is required/);
  });
});

describe("POST /lights/nightlock/set", () => {
  it("returns 400 when locked parameter is missing", async () => {
    const res = await request(app).post("/lights/nightlock/set").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/locked \(boolean\) is required/);
  });
});
