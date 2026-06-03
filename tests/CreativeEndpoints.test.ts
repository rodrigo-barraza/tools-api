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

describe("POST /creative/vector-animation", () => {
  it("successfully creates a new vector animation session", async () => {
    const res = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          width: 640,
          height: 480,
          duration: 3.5,
          fps: 30,
          background: "#1e293b",
          layers: [
            {
              id: "red-circle",
              shapeType: "circle",
              shapeData: { radius: 25 },
              fillColor: {
                type: "linear",
                x1: 0,
                y1: 0,
                x2: 50,
                y2: 50,
                stops: [
                  { offset: 0, color: "#ef4444" },
                  { offset: 1, color: "#b91c1c" }
                ]
              },
              strokeColor: "#ffffff",
              strokeWidth: 2,
              keyframes: [
                { time: 0, properties: { x: 100, y: 100 } },
                { time: 2, properties: { x: 300, y: 100 }, easing: "ease-out" }
              ]
            }
          ]
        },
        options: {
          loop: true,
          autoplay: false,
          title: "Test Animation"
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.embedUrl).toContain("creative/vector-animation/embed");
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.animationId).toBeDefined();
    expect(res.body.duration).toBe(3.5);
    expect(res.body.layerCount).toBe(1);
    expect(res.body.totalKeyframes).toBe(2);
    expect(res.body.canvasSize).toBe("640x480");
    expect(res.body.isAppend).toBe(false);
  });

  it("successively appends/edits layers progressively using the same sessionId", async () => {
    const sessionId = "session-" + Math.random().toString(36).slice(2, 8);

    // Step 1: Create initial ball
    const step1 = await request(app)
      .post("/creative/vector-animation")
      .send({
        sessionId,
        animation: {
          layers: [
            {
              id: "ball",
              shapeType: "circle",
              shapeData: { radius: 10 },
              keyframes: [
                { time: 0, properties: { x: 50 } },
                { time: 1, properties: { x: 100 } }
              ]
            }
          ]
        }
      });

    expect(step1.status).toBe(200);
    expect(step1.body.sessionId).toBe(sessionId);
    expect(step1.body.layerCount).toBe(1);
    expect(step1.body.totalKeyframes).toBe(2);
    expect(step1.body.isAppend).toBe(false);

    // Step 2: Add a square layer and append a keyframe to the ball
    const step2 = await request(app)
      .post("/creative/vector-animation")
      .send({
        sessionId,
        animation: {
          layers: [
            {
              id: "ball",
              shapeType: "circle", // Optional if existing
              keyframes: [
                { time: 2, properties: { x: 200 } }
              ]
            },
            {
              id: "box",
              shapeType: "rectangle",
              shapeData: { width: 20, height: 20 },
              fillColor: "#3b82f6"
            }
          ]
        }
      });

    expect(step2.status).toBe(200);
    expect(step2.body.sessionId).toBe(sessionId);
    expect(step2.body.layerCount).toBe(2);
    expect(step2.body.totalKeyframes).toBe(3); // ball (time 0, 1, 2) = 3 keyframes, box = 0 keyframes
    expect(step2.body.isAppend).toBe(true);

    // Step 3: Replace keyframes of the ball
    const step3 = await request(app)
      .post("/creative/vector-animation")
      .send({
        sessionId,
        animation: {
          layers: [
            {
              id: "ball",
              shapeType: "circle",
              replaceKeyframes: true,
              keyframes: [
                { time: 0, properties: { x: 99 } }
              ]
            }
          ]
        }
      });

    expect(step3.status).toBe(200);
    expect(step3.body.layerCount).toBe(2);
    expect(step3.body.totalKeyframes).toBe(1); // ball was reset to 1 keyframe, box has 0
    expect(step3.body.isAppend).toBe(true);

    // Step 4: Delete the ball layer
    const step4 = await request(app)
      .post("/creative/vector-animation")
      .send({
        sessionId,
        animation: {
          layers: [
            {
              id: "ball",
              shapeType: "circle",
              action: "delete"
            }
          ]
        }
      });

    expect(step4.status).toBe(200);
    expect(step4.body.layerCount).toBe(1); // ball is deleted, only box remains
    expect(step4.body.totalKeyframes).toBe(0);

    // Step 5: Clear session
    const step5 = await request(app)
      .post("/creative/vector-animation")
      .send({
        sessionId,
        animation: {
          clearSession: true,
          layers: [
            {
              id: "fresh-layer",
              shapeType: "circle",
              keyframes: [{ time: 0, properties: { x: 1 } }]
            }
          ]
        }
      });

    expect(step5.status).toBe(200);
    expect(step5.body.layerCount).toBe(1); // box is cleared, only fresh-layer exists
    expect(step5.body.totalKeyframes).toBe(1);
  });

  it("injects referenceImageUrl into shape layers and keyframes when provided", async () => {
    const referenceImageUrl = "data:image/png;base64,referencedataurl";
    const response = await request(app)
      .post("/creative/vector-animation")
      .send({
        referenceImageUrl,
        animation: {
          layers: [
            {
              id: "target-shape",
              shapeType: "rectangle",
              shapeData: { width: 100, height: 100 },
              imageUrl: "placeholder",
              keyframes: [
                {
                  time: 0,
                  properties: { x: 50, y: 50, imageUrl: "reference" }
                },
                {
                  time: 1.5,
                  properties: { x: 150, y: 150 }
                }
              ]
            },
            {
              id: "unrelated-shape",
              shapeType: "text",
              shapeData: { text: "hello" }
            }
          ]
        }
      });

    expect(response.status).toBe(200);
    const animationId = response.body.animationId;

    const embedResponse = await request(app).get(`/creative/vector-animation/embed?id=${animationId}`);
    expect(embedResponse.status).toBe(200);
    expect(embedResponse.text).toContain(referenceImageUrl);
  });
});

describe("GET /creative/vector-animation/embed", () => {
  it("returns 404 for non-existent animations", async () => {
    const res = await request(app).get("/creative/vector-animation/embed?id=missing-id");
    expect(res.status).toBe(404);
  });

  it("serves HTML player for a valid animation ID", async () => {
    const createRes = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          layers: [{ id: "test", shapeType: "circle" }]
        }
      });

    const animationId = createRes.body.animationId;
    const res = await request(app).get(`/creative/vector-animation/embed?id=${animationId}`);
    
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("<!DOCTYPE html>");
    expect(res.text).toContain("animation-canvas");
    expect(res.text).toContain("resolveStyle");
    expect(res.text).toContain("interpolateGradient");
  });

  it("successfully embeds image textures and clipping logic in vector animation", async () => {
    const testImageUrl = "https://example.com/test-texture.png";
    const createRes = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          layers: [
            {
              id: "image-shape",
              shapeType: "rectangle",
              shapeData: { width: 120, height: 80 },
              imageUrl: testImageUrl,
              keyframes: [
                {
                  time: 0,
                  properties: { x: 50, y: 50 }
                },
                {
                  time: 1.5,
                  properties: { x: 150, y: 150, imageUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" }
                }
              ]
            }
          ]
        }
      });

    expect(createRes.status).toBe(200);
    const animationId = createRes.body.animationId;
    const res = await request(app).get(`/creative/vector-animation/embed?id=${animationId}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain(testImageUrl);
    expect(res.text).toContain("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
    expect(res.text).toContain("getLoadedImage");
    expect(res.text).toContain("ctx.clip()");
    expect(res.text).toContain("ctx.drawImage(");
  });
});

