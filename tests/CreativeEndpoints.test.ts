import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import creativeRoutes from "../src/routes/CreativeRoutes.ts";

const app = createTestApp("/creative", creativeRoutes);

describe("POST /creative/generate-audio", () => {
  it("successfully generates a coin preset sound", async () => {
    const res = await request(app).post("/creative/generate-audio").send({
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

  it("successfully generates advanced modular audio graph", async () => {
    const res = await request(app)
      .post("/creative/generate-audio")
      .send({
        soundType: "modular",
        duration: 0.5,
        nodes: {
          sub_bass: { type: "oscillator", waveform: "sine" },
          lead_osc: { type: "oscillator", waveform: "sawtooth", detune: 10.0 },
          filter_env: {
            type: "envelope",
            attack: 0.05,
            decay: 0.1,
            sustain: 0.4,
            release: 0.1,
          },
          lpf: {
            type: "biquad_filter",
            filterType: "lowpass",
            cutoff: 800,
            Q: 3.0,
            modulate: { cutoff: "filter_env" },
          },
          panner: { type: "stereo_panner", pan: -0.5 },
        },
        tracks: [
          {
            nodeChain: ["sub_bass", "destination"],
            notes: [{ time: 0.0, duration: 0.3, note: "C2" }],
          },
          {
            nodeChain: ["lead_osc", "lpf", "panner", "destination"],
            notes: [
              { time: 0.0, duration: 0.2, note: "C4" },
              { time: 0.2, duration: 0.2, note: "G4" },
            ],
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.audio.mimeType).toBe("audio/wav");
    expect(res.body.duration).toBeGreaterThan(0.3);
    expect(res.body.sampleCount).toBeGreaterThan(0);
  });

  it("successfully generates procedural drum track with time grid markers", async () => {
    const res = await request(app)
      .post("/creative/generate-audio")
      .send({
        soundType: "modular",
        tempo: 120,
        nodes: {
          drums: { type: "drum_synth" },
          reverb: { type: "reverb", wet: 0.3, decay: 0.4 },
        },
        tracks: [
          {
            nodeChain: ["drums", "reverb", "destination"],
            notes: [
              { time: "1.1.1", duration: "0.2.0", note: "KICK" },
              { time: "1.2.1", duration: "0.2.0", note: "HAT" },
              { time: "1.3.1", duration: "0.2.0", note: "SNARE" },
              { time: "1.4.1", duration: "0.2.0", note: "HAT" },
            ],
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.audio.mimeType).toBe("audio/wav");
    expect(res.body.duration).toBeGreaterThan(1.0);
    expect(res.body.sampleCount).toBeGreaterThan(0);
  });
});
