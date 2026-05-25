import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import creativeRoutes from "../src/routes/CreativeRoutes.ts";

const app = createTestApp("/creative", creativeRoutes);

describe("POST /creative/generate-audio", () => {
  it("successfully generates a coin preset sound", async () => {
    const res = await request(app)
      .post("/creative/generate-audio")
      .send({
        presetEffect: "coin",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain("retro sound preset: 'coin'");
    expect(res.body.audio.mimeType).toBe("audio/wav");
    expect(typeof res.body.audio.data).toBe("string"); // base64
    expect(res.body.duration).toBeCloseTo(0.38, 2); // 0.08 + 0.3 seconds
    expect(res.body.sampleCount).toBeGreaterThan(0);
  });

  it("successfully generates a custom sweep sound", async () => {
    const res = await request(app)
      .post("/creative/generate-audio")
      .send({
        soundType: "synthesizer",
        duration: 0.5,
        waveform: "triangle",
        frequency: 440,
        endFrequency: 220,
        envelope: {
          attack: 0.05,
          decay: 0.05,
          sustain: 0.6,
          release: 0.1,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.audio.mimeType).toBe("audio/wav");
    expect(typeof res.body.audio.data).toBe("string");
    expect(res.body.duration).toBe(0.5);
    expect(res.body.sampleCount).toBe(Math.floor(0.5 * 44100));
  });

  it("successfully generates a custom melody sequence", async () => {
    const res = await request(app)
      .post("/creative/generate-audio")
      .send({
        soundType: "melody",
        melody: [
          { note: "C4", duration: 0.1 },
          { note: "E4", duration: 0.1 },
          { note: "G4", duration: 0.2 },
        ],
        waveform: "sine",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.audio.mimeType).toBe("audio/wav");
    expect(res.body.duration).toBeCloseTo(0.4, 2);
    expect(res.body.sampleCount).toBeGreaterThan(0);
  });
});
