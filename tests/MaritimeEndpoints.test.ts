import request from "supertest";
import { createTestApp } from "./testApp.ts";
import maritimeRoutes from "../src/routes/MaritimeRoutes.ts";

// ─── Unit Tests for Maritime Domain Endpoints ────────────────────

const app = createTestApp("/maritime", maritimeRoutes);

describe("GET /maritime/search", () => {
  it("returns 400 when query parameter 'q' is missing", async () => {
    const res = await request(app).get("/maritime/search");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Query parameter 'q' is required/);
  });
});

describe("GET /maritime/area", () => {
  it("returns 400 when lat/lng parameters are missing", async () => {
    const res = await request(app).get("/maritime/area");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Parameters minLat, maxLat, minLng, maxLng are required/);
  });

  it("returns 400 when only some lat/lng parameters are provided", async () => {
    const res = await request(app).get("/maritime/area?minLat=1&maxLat=2&minLng=1");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Parameters minLat, maxLat, minLng, maxLng are required/);
  });
});

describe("GET /maritime/vessels/:mmsi", () => {
  it("returns 404 for unknown vessel MMSI", async () => {
    const res = await request(app).get("/maritime/vessels/999999999");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found in buffer/);
  });
});
