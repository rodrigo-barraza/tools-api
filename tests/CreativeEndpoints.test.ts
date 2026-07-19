import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import creativeRoutes from "../src/routes/CreativeRoutes.ts";

const app = createTestApp("/creative", creativeRoutes);

describe("POST /creative/generate-audio", () => {
  it("rejects requests without an action (tracker workflow is the only workflow)", async () => {
    const res = await request(app).post("/creative/generate-audio").send({
      presetEffect: "coin",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("tracker workflow");
    expect(res.body.error).toContain("init");
  });

  it("rejects unknown actions", async () => {
    const res = await request(app).post("/creative/generate-audio").send({
      action: "compose",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Valid actions");
  });

  it("rejects the literal string 'null' as a sessionId with recovery guidance", async () => {
    const res = await request(app).post("/creative/generate-audio").send({
      action: "add_channel",
      sessionId: "null",
      channelId: "drums",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("sessionId");
    expect(res.body.error).toContain('action: "init"');
  });

  it("rejects unknown instruments with the valid list and drum guidance", async () => {
    const initRes = await request(app)
      .post("/creative/generate-audio")
      .send({ action: "init" });
    expect(initRes.status).toBe(200);

    const res = await request(app).post("/creative/generate-audio").send({
      action: "add_channel",
      sessionId: initRes.body.sessionId,
      channelId: "drums",
      instrument: "drum_synth",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid instrument 'drum_synth'");
    expect(res.body.error).toContain("KICK/SNARE/HAT");
  });

  it("runs the full workflow: init → add_channel with inline rows → render", async () => {
    const initRes = await request(app).post("/creative/generate-audio").send({
      action: "init",
      tempo: 120,
      linesPerBeat: 4,
    });
    expect(initRes.status).toBe(200);
    expect(initRes.body.sessionId).toBeTruthy();

    const channelRes = await request(app).post("/creative/generate-audio").send({
      action: "add_channel",
      sessionId: initRes.body.sessionId,
      channelId: "melody",
      instrument: "piano",
      rows: [
        { note: "C4", duration: 4 },
        { note: "E4", duration: 4 },
        { note: "G4", duration: 8 },
      ],
    });
    expect(channelRes.status).toBe(200);
    expect(channelRes.body.sessionId).toBe(initRes.body.sessionId);
    expect(channelRes.body.totalRows).toBe(16);
    expect(channelRes.body.previewNotation).toContain("C4");
    expect(channelRes.body.audio.mimeType).toBe("audio/wav");

    const renderRes = await request(app).post("/creative/generate-audio").send({
      action: "render",
      sessionId: initRes.body.sessionId,
      clearSession: true,
    });
    expect(renderRes.status).toBe(200);
    expect(renderRes.body.success).toBe(true);
    expect(renderRes.body.audio.mimeType).toBe("audio/wav");
    expect(typeof renderRes.body.audio.data).toBe("string");
    // 16 rows at 120 BPM / 4 LPB = 16 × 0.125s = 2s of pattern; with no
    // target duration the render adds the envelope release tail
    expect(renderRes.body.duration).toBeGreaterThanOrEqual(2.0);
    expect(renderRes.body.duration).toBeLessThan(3.0);
    expect(renderRes.body.sessionCleared).toBe(true);
  });

  it("accepts beat-fraction row durations and reports authored progress", async () => {
    const initRes = await request(app).post("/creative/generate-audio").send({
      action: "init",
      tempo: 120,
      linesPerBeat: 4,
      duration: 4,
    });
    expect(initRes.status).toBe(200);

    const channelRes = await request(app).post("/creative/generate-audio").send({
      action: "add_channel",
      sessionId: initRes.body.sessionId,
      channelId: "bass",
      instrument: "synth_bass",
    });
    expect(channelRes.status).toBe(200);
    expect(channelRes.body.targetDuration).toBe(4);
    expect(channelRes.body.authoredDuration).toBe(0);
    expect(channelRes.body.remainingDuration).toBe(4);

    // Four quarter notes = 4 beats = 2s at 120 BPM
    const writeRes = await request(app).post("/creative/generate-audio").send({
      action: "write_pattern",
      sessionId: initRes.body.sessionId,
      channelId: "bass",
      rows: [
        { note: "G1", duration: "1/4" },
        { note: "G1", duration: "1/4" },
        { note: "A1", duration: "1/4" },
        { note: "B1", duration: "1/4" },
      ],
    });
    expect(writeRes.status).toBe(200);
    expect(writeRes.body.totalRows).toBe(16); // 4 quarter notes × 4 steps each
    expect(writeRes.body.authoredDuration).toBeCloseTo(2.0, 1);
    expect(writeRes.body.remainingDuration).toBeCloseTo(2.0, 1);
    expect(writeRes.body.message).toContain("auto-loop");
  });

  it("rejects rows with uninterpretable durations", async () => {
    const initRes = await request(app)
      .post("/creative/generate-audio")
      .send({ action: "init" });
    const channelRes = await request(app).post("/creative/generate-audio").send({
      action: "add_channel",
      sessionId: initRes.body.sessionId,
      channelId: "lead",
    });
    expect(channelRes.status).toBe(200);

    const res = await request(app).post("/creative/generate-audio").send({
      action: "write_pattern",
      sessionId: initRes.body.sessionId,
      channelId: "lead",
      rows: [{ note: "C4", duration: "fast" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("invalid duration 'fast'");
    expect(res.body.error).toContain("1/4");
  });

  it("renders exactly the target duration when patterns are shorter (auto-loop + trim)", async () => {
    const initRes = await request(app).post("/creative/generate-audio").send({
      action: "init",
      tempo: 120,
      linesPerBeat: 4,
      duration: 5,
    });

    const channelRes = await request(app).post("/creative/generate-audio").send({
      action: "add_channel",
      sessionId: initRes.body.sessionId,
      channelId: "drums",
      rows: [
        { note: "KICK", duration: 4 },
        { note: "SNARE", duration: 4 },
        { note: "KICK", duration: 4 },
        { note: "SNARE", duration: 4 },
      ],
    });
    expect(channelRes.status).toBe(200);

    const renderRes = await request(app).post("/creative/generate-audio").send({
      action: "render",
      sessionId: initRes.body.sessionId,
      clearSession: true,
    });
    expect(renderRes.status).toBe(200);
    // Pattern is 2s; target is 5s — looped and trimmed to exactly 5s
    expect(renderRes.body.duration).toBeCloseTo(5.0, 2);
    expect(renderRes.body.targetDuration).toBe(5);
    expect(renderRes.body.authoredDuration).toBeCloseTo(2.0, 1);
    expect(renderRes.body.message).toContain("looped");
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
                  { offset: 1, color: "#b91c1c" },
                ],
              },
              strokeColor: "#ffffff",
              strokeWidth: 2,
              keyframes: [
                { time: 0, properties: { x: 100, y: 100 } },
                { time: 2, properties: { x: 300, y: 100 }, easing: "ease-out" },
              ],
            },
          ],
        },
        options: {
          loop: true,
          autoplay: false,
          title: "Test Animation",
        },
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
    // Intentional behavior change: sessions are created only by the server
    // (omit sessionId on the first call); unknown IDs are rejected instead of
    // silently adopted.
    const step1 = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          layers: [
            {
              id: "ball",
              shapeType: "circle",
              shapeData: { radius: 10 },
              keyframes: [
                { time: 0, properties: { x: 50 } },
                { time: 1, properties: { x: 100 } },
              ],
            },
          ],
        },
      });

    expect(step1.status).toBe(200);
    const sessionId = step1.body.sessionId;
    expect(sessionId).toBeTruthy();
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
              keyframes: [{ time: 2, properties: { x: 200 } }],
            },
            {
              id: "box",
              shapeType: "rectangle",
              shapeData: { width: 20, height: 20 },
              fillColor: "#3b82f6",
            },
          ],
        },
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
              keyframes: [{ time: 0, properties: { x: 99 } }],
            },
          ],
        },
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
              action: "delete",
            },
          ],
        },
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
              keyframes: [{ time: 0, properties: { x: 1 } }],
            },
          ],
        },
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
                  properties: { x: 50, y: 50, imageUrl: "reference" },
                },
                {
                  time: 1.5,
                  properties: { x: 150, y: 150 },
                },
              ],
            },
            {
              id: "unrelated-shape",
              shapeType: "text",
              shapeData: { text: "hello" },
            },
          ],
        },
      });

    expect(response.status).toBe(200);
    const animationId = response.body.animationId;

    const embedResponse = await request(app).get(
      `/creative/vector-animation/embed?id=${animationId}`,
    );
    expect(embedResponse.status).toBe(200);
    expect(embedResponse.text).toContain(referenceImageUrl);
  });
});

describe("GET /creative/vector-animation/embed", () => {
  it("returns 404 for non-existent animations", async () => {
    const res = await request(app).get(
      "/creative/vector-animation/embed?id=missing-id",
    );
    expect(res.status).toBe(404);
  });

  it("serves HTML player for a valid animation ID", async () => {
    const createRes = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          layers: [{ id: "test", shapeType: "circle" }],
        },
      });

    const animationId = createRes.body.animationId;
    const res = await request(app).get(
      `/creative/vector-animation/embed?id=${animationId}`,
    );

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
                  properties: { x: 50, y: 50 },
                },
                {
                  time: 1.5,
                  properties: {
                    x: 150,
                    y: 150,
                    imageUrl:
                      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                  },
                },
              ],
            },
          ],
        },
      });

    expect(createRes.status).toBe(200);
    const animationId = createRes.body.animationId;
    const res = await request(app).get(
      `/creative/vector-animation/embed?id=${animationId}`,
    );

    expect(res.status).toBe(200);
    expect(res.text).toContain(testImageUrl);
    expect(res.text).toContain(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    );
    expect(res.text).toContain("getLoadedImage");
    expect(res.text).toContain("ctx.clip()");
    expect(res.text).toContain("ctx.drawImage(");
  });

  it("player script has no references to the undefined 'd' variable (text/image layers used to crash)", async () => {
    const createRes = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          layers: [
            { id: "label", shapeType: "text", shapeData: { text: "hi", fontSize: 24 } },
          ],
        },
      });

    const res = await request(app).get(
      `/creative/vector-animation/embed?id=${createRes.body.animationId}`,
    );
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/[^a-zA-Z0-9_.]d\.(text|fontSize|fontFamily|textAlign|textBaseline|width|radius|rx|points)\b/);
    expect(res.text).toContain("shapeData.text");
  });

  it("escapes HTML in the animation title and </script> in stored strings", async () => {
    const createRes = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          layers: [
            {
              id: "sneaky",
              shapeType: "text",
              shapeData: { text: "</script><script>window.pwned=1</script>" },
            },
          ],
        },
        options: { title: "<img src=x onerror=alert(1)>" },
      });

    expect(createRes.status).toBe(200);
    const res = await request(app).get(
      `/creative/vector-animation/embed?id=${createRes.body.animationId}`,
    );
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("<img src=x onerror=alert(1)>");
    expect(res.text).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(res.text).not.toContain("</script><script>window.pwned=1</script>");
  });

  it("quantizes playback to the authored fps in the player script", async () => {
    const createRes = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          fps: 12,
          layers: [{ id: "l1", shapeType: "circle" }],
        },
      });

    const res = await request(app).get(
      `/creative/vector-animation/embed?id=${createRes.body.animationId}`,
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("quantizeTime");
  });
});

describe("POST /creative/vector-animation input validation", () => {
  it("rejects request missing animation parameter", async () => {
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({});
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("'animation' is required");
  });

  it("parses animation sent as a JSON string instead of rendering an empty animation (production model behavior)", async () => {
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: JSON.stringify({
          duration: 2,
          layers: [
            {
              id: "ball",
              shapeType: "circle",
              keyframes: [{ time: 0, properties: { x: 10 } }],
            },
          ],
        }),
      });

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.body.layerCount).toBe(1);
    expect(apiResponse.body.totalKeyframes).toBe(1);
    expect(apiResponse.body.duration).toBe(2);
  });

  it("rejects animation strings that are not valid JSON with a teaching error", async () => {
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: "a bouncing ball, 5 seconds" });

    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("JSON object");
  });

  it("unwraps accidental animation.animation nesting (production model behavior)", async () => {
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          background: "#000000",
          animation: {
            duration: 3,
            layers: [{ id: "sq", shapeType: "rectangle" }],
          },
        },
      });

    expect(apiResponse.status).toBe(200);
    expect(apiResponse.body.layerCount).toBe(1);
    expect(apiResponse.body.duration).toBe(3);
  });

  it("rejects an unknown or expired sessionId with recovery guidance", async () => {
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({
        sessionId: "hotdog-v2-a1b2c3",
        animation: { layers: [{ id: "l1", shapeType: "circle" }] },
      });

    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("not found or expired");
    expect(apiResponse.body.error).toContain("Omit sessionId");
  });

  it("rejects literal 'null'/'undefined' sessionId strings", async () => {
    for (const badSessionId of ["null", "undefined"]) {
      const apiResponse = await request(app)
        .post("/creative/vector-animation")
        .send({
          sessionId: badSessionId,
          animation: { layers: [{ id: "l1", shapeType: "circle" }] },
        });
      expect(apiResponse.status).toBe(400);
      expect(apiResponse.body.error).toContain("Invalid sessionId");
    }
  });

  it("coerces string duration to a number so the embed does not 500", async () => {
    const createResponse = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          duration: "5",
          layers: [{ id: "l1", shapeType: "circle" }],
        },
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.duration).toBe(5);

    const embedResponse = await request(app).get(
      `/creative/vector-animation/embed?id=${createResponse.body.animationId}`,
    );
    expect(embedResponse.status).toBe(200);
  });

  it("rejects gradient stops with out-of-range offsets", async () => {
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          layers: [
            {
              id: "grad",
              shapeType: "circle",
              fillColor: {
                type: "linear",
                stops: [{ offset: 50, color: "#ff0000" }],
              },
            },
          ],
        },
      });

    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("offset");
  });

  it("rejects gradients missing type/stops with an example", async () => {
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          layers: [{ id: "grad", shapeType: "circle", fillColor: { x1: 0 } }],
        },
      });

    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain('"linear" or "radial"');
  });

  it("normalizes camelCase easing aliases and rejects unknown easings", async () => {
    const okResponse = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          layers: [
            {
              id: "eased",
              shapeType: "circle",
              keyframes: [
                { time: 0, properties: { x: 0 }, easing: "easeInOut" },
                { time: 1, properties: { x: 10 } },
              ],
            },
          ],
        },
      });
    expect(okResponse.status).toBe(200);

    const badResponse = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          layers: [
            {
              id: "eased",
              shapeType: "circle",
              keyframes: [
                { time: 0, properties: { x: 0 }, easing: "wobble" },
                { time: 1, properties: { x: 10 } },
              ],
            },
          ],
        },
      });
    expect(badResponse.status).toBe(400);
    expect(badResponse.body.error).toContain("unknown easing");
    expect(badResponse.body.error).toContain("ease-in-out");
  });

  it("rejects keyframes beyond the animation duration", async () => {
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: {
          duration: 2,
          layers: [
            {
              id: "late",
              shapeType: "circle",
              keyframes: [{ time: 5, properties: { x: 0 } }],
            },
          ],
        },
      });

    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("never play");
  });

  it("rejects new layers without a shapeType", async () => {
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({
        animation: { layers: [{ id: "mystery" }] },
      });

    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("shapeType");
  });

  it("rejects non-integer animation width", async () => {
    const invalidAnimationConfig = {
      width: 640.5,
      layers: [{ id: "layer-one", shapeType: "circle" }],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toBe("Animation width must be a positive integer");
  });

  it("rejects negative animation height", async () => {
    const invalidAnimationConfig = {
      height: -480,
      layers: [{ id: "layer-one", shapeType: "circle" }],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toBe("Animation height must be a positive integer");
  });

  it("rejects negative duration", async () => {
    const invalidAnimationConfig = {
      duration: -5,
      layers: [{ id: "layer-one", shapeType: "circle" }],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toBe("Animation duration must be a positive number");
  });

  it("rejects invalid layers field type", async () => {
    const invalidAnimationConfig = {
      layers: "not-an-array",
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toBe("'layers' must be an array");
  });

  it("rejects layers containing non-object entries", async () => {
    const invalidAnimationConfig = {
      layers: ["not-an-object"],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("Layer at index 0 must be an object");
  });

  it("rejects layer missing id", async () => {
    const invalidAnimationConfig = {
      layers: [{ shapeType: "circle" }],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("Layer at index 0 must have a valid 'id' string");
  });

  it("rejects invalid layer shapeType", async () => {
    const invalidAnimationConfig = {
      layers: [{ id: "layer-one", shapeType: "triangle" }],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("has invalid shapeType 'triangle'");
  });

  it("rejects out-of-range layer opacity", async () => {
    const invalidAnimationConfig = {
      layers: [{ id: "layer-one", shapeType: "circle", opacity: 1.5 }],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("opacity must be a number between 0 and 1");
  });

  it("rejects negative strokeWidth", async () => {
    const invalidAnimationConfig = {
      layers: [{ id: "layer-one", shapeType: "circle", strokeWidth: -1 }],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("strokeWidth must be a positive number");
  });

  it("rejects keyframes that are not arrays", async () => {
    const invalidAnimationConfig = {
      layers: [{ id: "layer-one", shapeType: "circle", keyframes: "not-an-array" }],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("keyframes must be an array");
  });

  it("rejects keyframes missing time property", async () => {
    const invalidAnimationConfig = {
      layers: [
        {
          id: "layer-one",
          shapeType: "circle",
          keyframes: [{ properties: { x: 10 } }],
        },
      ],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("missing required 'time' property");
  });

  it("rejects keyframes with negative time value", async () => {
    const invalidAnimationConfig = {
      layers: [
        {
          id: "layer-one",
          shapeType: "circle",
          keyframes: [{ time: -1, properties: { x: 10 } }],
        },
      ],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("must have a positive 'time' number");
  });

  it("rejects keyframes missing properties object", async () => {
    const invalidAnimationConfig = {
      layers: [
        {
          id: "layer-one",
          shapeType: "circle",
          keyframes: [{ time: 1.5 } as unknown as { time: number; properties: Record<string, unknown> }],
        },
      ],
    };
    const apiResponse = await request(app)
      .post("/creative/vector-animation")
      .send({ animation: invalidAnimationConfig });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("must have a valid 'properties' object");
  });
});

describe("POST /creative/local-text-to-speech voice validation", () => {
  it("rejects request with unsupported voice", async () => {
    const apiResponse = await request(app)
      .post("/creative/local-text-to-speech")
      .send({
        text: "Hello world",
        voice: "invalid-voice-id",
      });
    expect(apiResponse.status).toBe(400);
    expect(apiResponse.body.error).toContain("Invalid voice 'invalid-voice-id'");
  });
});
