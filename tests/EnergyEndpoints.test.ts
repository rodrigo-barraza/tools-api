import request from "supertest";
import { createTestApp } from "./testApp.js";
import energyRoutes from "../src/routes/EnergyRoutes.js";

// ─── Unit Tests for Energy Domain Endpoints ────────────────────

const app = createTestApp("/energy", energyRoutes);

describe("GET /energy/browse", () => {
  it("route exists and returns 200 or 502", async () => {
    const res = await request(app).get("/energy/browse");
    expect([200, 502]).toContain(res.status);
  });
});

describe("GET /energy/facets", () => {
  it("returns 400 when route and facetId are missing", async () => {
    const res = await request(app).get("/energy/facets");
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("GET /energy/data", () => {
  it("returns a handled error object when route is missing", async () => {
    const res = await request(app).get("/energy/data");
    // Since EnergyRoutes uses asyncHandler but returns { error: ... } directly for missing param
    expect(res.status).toBe(200); 
    expect(res.body.error).toMatch(/Parameter 'route' is required/);
  });
});
