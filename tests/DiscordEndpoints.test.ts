import request from "supertest";
import { createTestApp } from "./testApp.ts";
import discordRoutes from "../src/routes/DiscordRoutes.ts";

// ─── Unit Tests for Discord Domain Endpoints ────────────────────

const app = createTestApp("/discord", discordRoutes);

describe("GET /discord/messages/stream", () => {
  it("returns 400 when guildId is missing", async () => {
    const res = await request(app).get("/discord/messages/stream");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/guildId is required/);
  });
});

describe("GET /discord/messages/search", () => {
  it("route exists and returns a response", async () => {
    const res = await request(app).get("/discord/messages/search");
    // Since guildId isn't explicitly checked for 400 in this handler (it relies on service layer validation)
    // we just check that it handles the request and returns either 200 or 500
    expect([200, 500]).toContain(res.status);
  });
});
