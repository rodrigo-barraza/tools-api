import request from "supertest";
import { createTestApp } from "./testApp.js";
import gamingRoutes from "../src/routes/GamingRoutes.js";

// ─── Unit Tests for Gaming Domain Endpoints ────────────────────

const app = createTestApp("/gaming", gamingRoutes);

describe("GET /gaming/dota", () => {
  it("returns 400 when action is missing", async () => {
    const res = await request(app).get("/gaming/dota");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/'action' is required/);
    expect(Array.isArray(res.body.actions)).toBeTruthy();
  });

  it("returns 400 for unknown action", async () => {
    const res = await request(app).get("/gaming/dota?action=unknown_action");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown action/);
  });

  it("returns 400 when query is missing for hero action", async () => {
    const res = await request(app).get("/gaming/dota?action=hero");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/'query' is required/);
  });

  it("returns 400 when heroId is missing for matchups action", async () => {
    const res = await request(app).get("/gaming/dota?action=matchups");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/'heroId' is required/);
  });

  it("returns 400 when accountId is missing for player action", async () => {
    const res = await request(app).get("/gaming/dota?action=player");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/'accountId' is required/);
  });
});
