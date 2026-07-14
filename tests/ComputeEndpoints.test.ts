import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import computeRoutes from "../src/routes/ComputeRoutes.ts";
import { ALLOWED_ROOTS } from "../src/services/AgenticFileService.ts";
import fs from "node:fs";
import path from "node:path";

const mockScenes = new Map();

vi.mock("../src/models/ThreeDimensionalScene.ts", () => ({
  saveThreeDimensionalScene: vi.fn(async (sceneId, sceneType, sceneData, options, sessionId, createdBy) => {
    mockScenes.set(sceneId, { sceneType, sceneData, options, sessionId, createdBy });
  }),
  getThreeDimensionalScene: vi.fn(async (sceneId) => {
    return mockScenes.get(sceneId) || null;
  }),
  setupThreeDimensionalSceneCollection: vi.fn(),
}));

const mockTurtleDrawings = new Map();

vi.mock("../src/models/TurtleDrawing.ts", () => ({
  saveTurtleDrawing: vi.fn(async (drawingId, commands, options, sessionId, createdBy) => {
    mockTurtleDrawings.set(drawingId, { commands, options, sessionId, createdBy });
  }),
  getTurtleDrawing: vi.fn(async (drawingId) => {
    return mockTurtleDrawings.get(drawingId) || null;
  }),
  setupTurtleDrawingCollection: vi.fn(),
}));

const app = createTestApp("/compute", computeRoutes);

// A simple 1x1 black pixel PNG data URI for lightweight test execution
const TEST_PNG_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const TEST_PNG_BUFFER = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

describe("POST /compute/image/ascii", () => {
  const testRoot = "/tmp/image-ascii-test";
  const testFilePath = path.join(testRoot, "test-pixel.png");

  beforeAll(() => {
    if (!ALLOWED_ROOTS.includes(testRoot)) {
      ALLOWED_ROOTS.push(testRoot);
    }
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }
    fs.writeFileSync(testFilePath, TEST_PNG_BUFFER);
  });

  afterAll(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    if (fs.existsSync(testRoot)) {
      fs.rmdirSync(testRoot);
    }
  });

  it("returns 400 when input is missing", async () => {
    const res = await request(app)
      .post("/compute/image/ascii")
      .send({ width: 50 });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("input");
  });

  it("successfully converts a base64 image to ASCII and returns details", async () => {
    const res = await request(app)
      .post("/compute/image/ascii")
      .send({
        input: TEST_PNG_BASE64,
        width: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.ascii).toBe("string");
    expect(typeof res.body.ansi).toBe("string");
    expect(typeof res.body.asciiEmbedUrl).toBe("string");
    expect(res.body.asciiId).toBeTruthy();
    expect(res.body.width).toBeLessThanOrEqual(10);
    expect(res.body.height).toBeGreaterThan(0);
  });

  it("successfully converts a local file image path to ASCII", async () => {
    const res = await request(app)
      .post("/compute/image/ascii")
      .send({
        input: testFilePath,
        width: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.ascii).toBe("string");
    expect(res.body.asciiId).toBeTruthy();
  });

  it("successfully converts a file:// URL to ASCII", async () => {
    const res = await request(app)
      .post("/compute/image/ascii")
      .send({
        input: `file://${testFilePath}`,
        width: 10,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.ascii).toBe("string");
    expect(res.body.asciiId).toBeTruthy();
  });
});

describe("GET /compute/image/ascii/embed", () => {
  it("returns 400 when id is missing", async () => {
    const res = await request(app).get("/compute/image/ascii/embed");
    expect(res.status).toBe(400);
  });

  it("returns 404 for nonexistent id", async () => {
    const res = await request(app).get("/compute/image/ascii/embed?id=nonexistent");
    expect(res.status).toBe(404);
  });

  it("returns 200 and interactive HTML page for a valid stored ascii id", async () => {
    // 1. Generate stored ASCII
    const postRes = await request(app)
      .post("/compute/image/ascii")
      .send({
        input: TEST_PNG_BASE64,
        width: 10,
      });
    
    expect(postRes.status).toBe(200);
    const asciiId = postRes.body.asciiId;

    // 2. Fetch the embed
    const embedRes = await request(app)
      .get(`/compute/image/ascii/embed?id=${asciiId}`);
    
    expect(embedRes.status).toBe(200);
    expect(embedRes.headers["content-type"]).toContain("text/html");
    expect(embedRes.text).toContain("High-Fidelity ASCII Art Generator");
    expect(embedRes.text).toContain("ascii-pre");
  });
});

describe("POST /compute/3d/model", () => {
  it("successfully starts a new 3D model session and returns sessionId", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/model")
      .send({
        objects: [
          {
            shape: "box",
            position: [0, 0, 0],
            material: { color: "#ff6347" },
          },
        ],
      });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.sceneEmbedUrl).toBeTruthy();
    expect(postResponse.body.sceneId).toBeTruthy();
    expect(postResponse.body.sessionId).toBeTruthy();
    expect(postResponse.body.objectCount).toBe(1);
    expect(postResponse.body.totalObjects).toBe(1);
    expect(postResponse.body.isAppend).toBe(false);
  });

  it("renders a pyramid shape and accepts 'type' as an alias for 'shape' (production model behavior)", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/model")
      .send({
        objects: [
          { shape: "box", position: [0, 0, 0] },
          { type: "pyramid", position: [0, 1, 0], radius: 0.7, height: 1 },
        ],
      });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.objectCount).toBe(2);
  });

  it("rejects wrong-arity transform vectors with a teaching error", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/model")
      .send({
        objects: [{ shape: "box", position: [1, 2] }],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("'position'");
    expect(postResponse.body.error).toContain("exactly 3");
  });

  it("rejects an unknown or expired sessionId instead of silently restarting", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/model")
      .send({
        sessionId: "model-session-that-never-existed",
        objects: [{ shape: "box" }],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("not found or expired");
  });

  it("successfully creates a 3D model with a textureUrl and doubleSided material", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/model")
      .send({
        objects: [
          {
            shape: "box",
            position: [0, 0, 0],
            material: {
              color: "#ff6347",
              doubleSided: true,
              textureUrl: "https://example.com/texture.png",
            },
          },
        ],
      });

    expect(postResponse.status).toBe(200);
    const sceneId = postResponse.body.sceneId;

    // Fetch the embed to verify the texture loader script is output correctly
    const embedResponse = await request(app)
      .get(`/compute/3d/embed?id=${sceneId}`);

    expect(embedResponse.status).toBe(200);
    expect(embedResponse.text).toContain("textureLoader");
    expect(embedResponse.text).toContain("https://example.com/texture.png");
  });

  it("successfully appends objects to an existing 3D model session", async () => {
    const firstResponse = await request(app)
      .post("/compute/3d/model")
      .send({
        objects: [
          {
            shape: "box",
            position: [0, 0, 0],
          },
        ],
      });

    expect(firstResponse.status).toBe(200);
    const sessionId = firstResponse.body.sessionId;

    const secondResponse = await request(app)
      .post("/compute/3d/model")
      .send({
        sessionId,
        objects: [
          {
            shape: "sphere",
            position: [1, 2, 3],
          },
        ],
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.sessionId).toBe(sessionId);
    expect(secondResponse.body.objectCount).toBe(1);
    expect(secondResponse.body.totalObjects).toBe(2);
    expect(secondResponse.body.isAppend).toBe(true);
  });

  it("successfully applies referenceTextureUrl to objects that have placeholder or reference texture values", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/model")
      .send({
        referenceTextureUrl: "data:image/png;base64,texture",
        objects: [
          {
            shape: "box",
            position: [0, 0, 0],
            material: { textureUrl: "reference" },
          },
          {
            shape: "sphere",
            position: [1, 1, 1],
            material: { textureUrl: "placeholder", color: "#ffffff" },
          },
          {
            shape: "cone",
            position: [2, 2, 2],
            material: { textureUrl: "https://example.com/explicit.png" },
          },
        ],
      });

    expect(postResponse.status).toBe(200);
    const sceneId = postResponse.body.sceneId;
    const savedScene = mockScenes.get(sceneId);
    expect(savedScene).toBeTruthy();
    expect(savedScene.sceneData.objects[0].material.textureUrl).toBe("data:image/png;base64,texture");
    expect(savedScene.sceneData.objects[1].material.textureUrl).toBe("data:image/png;base64,texture");
    expect(savedScene.sceneData.objects[2].material.textureUrl).toBe("https://example.com/explicit.png");
  });
});

describe("POST /compute/3d/mesh", () => {
  it("successfully starts a new 3D mesh session and returns sessionId", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/mesh")
      .send({
        vertices: [[0, 1, 0], [1, -1, 0], [-1, -1, 0]],
        faces: [[0, 1, 2]],
      });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.sceneEmbedUrl).toBeTruthy();
    expect(postResponse.body.sceneId).toBeTruthy();
    expect(postResponse.body.sessionId).toBeTruthy();
    expect(postResponse.body.vertexCount).toBe(3);
    expect(postResponse.body.faceCount).toBe(1);
    expect(postResponse.body.totalVertices).toBe(3);
    expect(postResponse.body.totalFaces).toBe(1);
    expect(postResponse.body.isAppend).toBe(false);
  });

  it("successfully appends vertices and faces to an existing 3D mesh session", async () => {
    const firstResponse = await request(app)
      .post("/compute/3d/mesh")
      .send({
        vertices: [[0, 1, 0], [1, -1, 0], [-1, -1, 0]],
        faces: [[0, 1, 2]],
      });

    expect(firstResponse.status).toBe(200);
    const sessionId = firstResponse.body.sessionId;

    // Intentional behavior change: face indices in append calls are ABSOLUTE
    // across the accumulated mesh (matching the tool docs), no longer rebased
    // by the previous vertex count.
    const secondResponse = await request(app)
      .post("/compute/3d/mesh")
      .send({
        sessionId,
        vertices: [[0, 2, 0], [2, -2, 0], [-2, -2, 0]],
        faces: [[3, 4, 5]],
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.sessionId).toBe(sessionId);
    expect(secondResponse.body.vertexCount).toBe(3);
    expect(secondResponse.body.faceCount).toBe(1);
    expect(secondResponse.body.totalVertices).toBe(6);
    expect(secondResponse.body.totalFaces).toBe(2);
    expect(secondResponse.body.isAppend).toBe(true);

    const sceneId = secondResponse.body.sceneId;
    const savedScene = mockScenes.get(sceneId);
    expect(savedScene).toBeTruthy();
    expect(savedScene.sceneData.vertices).toEqual([
      [0, 1, 0], [1, -1, 0], [-1, -1, 0],
      [0, 2, 0], [2, -2, 0], [-2, -2, 0]
    ]);
    expect(savedScene.sceneData.faces).toEqual([
      [0, 1, 2],
      [3, 4, 5]
    ]);
  });

  it("allows appended faces to stitch to vertices from earlier calls", async () => {
    const firstResponse = await request(app)
      .post("/compute/3d/mesh")
      .send({
        vertices: [[0, 1, 0], [1, -1, 0], [-1, -1, 0]],
        faces: [[0, 1, 2]],
      });
    const sessionId = firstResponse.body.sessionId;

    const secondResponse = await request(app)
      .post("/compute/3d/mesh")
      .send({
        sessionId,
        vertices: [[0, 0, 2]],
        faces: [[0, 1, 3]],
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.totalVertices).toBe(4);
    const savedScene = mockScenes.get(secondResponse.body.sceneId);
    expect(savedScene.sceneData.faces).toEqual([[0, 1, 2], [0, 1, 3]]);
  });

  it("coerces geometry arrays sent as JSON strings (production model behavior)", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/mesh")
      .send({
        vertices: "[[0, 1, 0], [1, -1, 0], [-1, -1, 0]]",
        faces: "[[0, 1, 2]]",
      });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.totalVertices).toBe(3);
    expect(postResponse.body.totalFaces).toBe(1);
  });

  it("coerces bracketless vertex strings (production model behavior)", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/mesh")
      .send({
        vertices: "[0, 1, 0], [1, -1, 0], [-1, -1, 0]",
        faces: [[0, 1, 2]],
      });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.totalVertices).toBe(3);
  });

  it("rejects code-expression strings with a teaching error (production model behavior)", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/mesh")
      .send({
        vertices: "[[0, i, 1+i] for i in range(10)]",
        faces: [[0, 1, 2]],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("not evaluated");
  });

  it("rejects an unknown or expired sessionId instead of silently restarting", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/mesh")
      .send({
        sessionId: "expired-session-id",
        vertices: [[0, 1, 0], [1, -1, 0], [-1, -1, 0]],
        faces: [[0, 1, 2]],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("not found or expired");
    expect(postResponse.body.error).toContain("Omit sessionId");
  });

  it("rejects literal 'null'/'undefined' sessionId strings", async () => {
    for (const badSessionId of ["null", "undefined"]) {
      const postResponse = await request(app)
        .post("/compute/3d/mesh")
        .send({
          sessionId: badSessionId,
          vertices: [[0, 1, 0], [1, -1, 0], [-1, -1, 0]],
          faces: [[0, 1, 2]],
        });
      expect(postResponse.status).toBe(400);
      expect(postResponse.body.error).toContain("Invalid sessionId");
    }
  });

  it("rejects colors whose length does not match the vertex count", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/mesh")
      .send({
        vertices: [[0, 1, 0], [1, -1, 0], [-1, -1, 0]],
        faces: [[0, 1, 2]],
        colors: ["#ff0000", "#00ff00"],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("one color per vertex");
  });
});

describe("POST /compute/3d/scene", () => {
  it("successfully starts a new 3D scene session and returns sessionId", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        objects: [
          {
            type: "box",
            position: [0, 0, 0],
            material: { color: "#ff6347" },
          },
        ],
      });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.sceneEmbedUrl).toBeTruthy();
    expect(postResponse.body.sceneId).toBeTruthy();
    expect(postResponse.body.sessionId).toBeTruthy();
    expect(postResponse.body.objectCount).toBe(1);
    expect(postResponse.body.totalObjects).toBe(1);
    expect(postResponse.body.isAppend).toBe(false);
  });

  it("accepts 'shape' as an alias for 'type' on scene objects (production model behavior)", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        objects: [{ shape: "sphere", radius: 1 }],
      });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.objectCount).toBe(1);
  });

  it("rejects children on non-group objects with wrap guidance", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        objects: [{ type: "box", children: [{ type: "sphere" }] }],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain('only type "group" renders children');
  });

  it("rejects text3d objects without content", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        objects: [{ type: "text3d" }],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("'content'");
  });

  it("rejects invalid animation axis values", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        objects: [{ type: "box", animation: { type: "spin", axis: "vertical" } }],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("axis");
    expect(postResponse.body.error).toContain("x, y, z");
  });

  it("rejects an unknown or expired sessionId instead of silently restarting", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        sessionId: "scene-session-that-never-existed",
        objects: [{ type: "box" }],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("not found or expired");
  });

  it("places a saved mesh build into a scene via {type: 'asset', assetId}", async () => {
    const meshResponse = await request(app)
      .post("/compute/3d/mesh")
      .send({
        vertices: [[0, 1, 0], [1, -1, 0], [-1, -1, 0]],
        faces: [[0, 1, 2]],
        colors: ["#ff0000", "#00ff00", "#0000ff"],
      });
    expect(meshResponse.status).toBe(200);
    const meshAssetId = meshResponse.body.sceneId;

    const sceneResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        objects: [
          { type: "asset", assetId: meshAssetId, position: [0, 2, 0], scale: [2, 2, 2] },
          { type: "box", position: [0, 0, 0] },
        ],
      });

    expect(sceneResponse.status).toBe(200);
    expect(sceneResponse.body.objectCount).toBe(2);

    const savedScene = mockScenes.get(sceneResponse.body.sceneId);
    const inlinedMesh = savedScene.sceneData.objects.find((sceneObject) => sceneObject.type === "mesh");
    expect(inlinedMesh).toBeTruthy();
    expect(inlinedMesh.vertices).toEqual([[0, 1, 0], [1, -1, 0], [-1, -1, 0]]);
    expect(inlinedMesh.position).toEqual([0, 2, 0]);
    expect(inlinedMesh.colors).toEqual(["#ff0000", "#00ff00", "#0000ff"]);

    // Embed renders the inlined geometry via BufferGeometry
    const embedResponse = await request(app).get(`/compute/3d/embed?id=${sceneResponse.body.sceneId}`);
    expect(embedResponse.status).toBe(200);
    expect(embedResponse.text).toContain("BufferGeometry");
  });

  it("places a saved scene build into another scene as a group", async () => {
    const modelResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        objects: [
          { type: "sphere", radius: 1, position: [0, 1, 0] },
          { type: "sphere", radius: 0.7, position: [0, 2.2, 0] },
        ],
      });
    const assetId = modelResponse.body.sceneId;

    const sceneResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        objects: [
          { type: "asset", assetId, position: [5, 0, 0], name: "snowman" },
        ],
      });

    expect(sceneResponse.status).toBe(200);
    const savedScene = mockScenes.get(sceneResponse.body.sceneId);
    const placedGroup = savedScene.sceneData.objects[0];
    expect(placedGroup.type).toBe("group");
    expect(placedGroup.name).toBe("snowman");
    expect(placedGroup.position).toEqual([5, 0, 0]);
    expect(placedGroup.children).toHaveLength(2);
  });

  it("teaches recovery when an assetId does not exist or is missing", async () => {
    const missingResponse = await request(app)
      .post("/compute/3d/scene")
      .send({ objects: [{ type: "asset", assetId: "no-such-build" }] });
    expect(missingResponse.status).toBe(400);
    expect(missingResponse.body.error).toContain("No saved 3D build");

    const noIdResponse = await request(app)
      .post("/compute/3d/scene")
      .send({ objects: [{ type: "asset" }] });
    expect(noIdResponse.status).toBe(400);
    expect(noIdResponse.body.error).toContain("no 'assetId'");
  });

  it("rejects voxel builds as scene assets with guidance", async () => {
    const voxelResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({ palette: { r: "red" }, slices: [{ rows: ["r"] }] });
    const voxelAssetId = voxelResponse.body.sceneId;

    const sceneResponse = await request(app)
      .post("/compute/3d/scene")
      .send({ objects: [{ type: "asset", assetId: voxelAssetId }] });

    expect(sceneResponse.status).toBe(400);
    expect(sceneResponse.body.error).toContain("voxel build");
  });

  it("applies lighting overrides and consolidated geometry fields (absorbed from create_3d_model)", async () => {
    const sceneResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        objects: [
          { type: "cylinder", radiusTop: 0, radiusBottom: 1, height: 2, segments: 16 },
          { type: "torus", radius: 1, tube: 0.3 },
        ],
        options: { ambientLightIntensity: 0.9, directionalLightIntensity: 0.1 },
      });

    expect(sceneResponse.status).toBe(200);
    const embedResponse = await request(app).get(`/compute/3d/embed?id=${sceneResponse.body.sceneId}`);
    expect(embedResponse.status).toBe(200);
    expect(embedResponse.text).toContain('"ambientIntensity":0.9');
    expect(embedResponse.text).toContain('"directionalIntensity":0.1');
    expect(embedResponse.text).toContain('"radiusTop":0');
  });

  it("successfully creates a 3D scene with a textureUrl and doubleSided material", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        objects: [
          {
            type: "box",
            position: [0, 0, 0],
            material: {
              color: "#ff6347",
              doubleSided: true,
              textureUrl: "https://example.com/scene-texture.png",
            },
          },
        ],
      });

    expect(postResponse.status).toBe(200);
    const sceneId = postResponse.body.sceneId;

    // Fetch the embed to verify the texture loader script is output correctly
    const embedResponse = await request(app)
      .get(`/compute/3d/embed?id=${sceneId}`);

    expect(embedResponse.status).toBe(200);
    expect(embedResponse.text).toContain("textureLoader");
    expect(embedResponse.text).toContain("https://example.com/scene-texture.png");
  });

  it("successfully appends objects to an existing 3D scene session", async () => {
    const firstResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        objects: [
          {
            type: "box",
            position: [0, 0, 0],
          },
        ],
      });

    expect(firstResponse.status).toBe(200);
    const sessionId = firstResponse.body.sessionId;

    const secondResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        sessionId,
        objects: [
          {
            type: "sphere",
            position: [1, 2, 3],
          },
        ],
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.sessionId).toBe(sessionId);
    expect(secondResponse.body.objectCount).toBe(1);
    expect(secondResponse.body.totalObjects).toBe(2);
    expect(secondResponse.body.isAppend).toBe(true);
  });

  it("successfully recursively applies referenceTextureUrl to nested scene objects that have placeholder or reference texture values", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/scene")
      .send({
        referenceTextureUrl: "data:image/png;base64,texture",
        objects: [
          {
            type: "group",
            position: [0, 0, 0],
            children: [
              {
                type: "box",
                position: [0, 0, 0],
                material: { textureUrl: "reference" },
              },
              {
                type: "sphere",
                position: [1, 1, 1],
                material: { textureUrl: "https://example.com/explicit.png" },
              },
              {
                type: "text3d",
                content: "Hello",
                position: [2, 2, 2],
              },
            ],
          },
        ],
      });

    expect(postResponse.status).toBe(200);
    const sceneId = postResponse.body.sceneId;
    const savedScene = mockScenes.get(sceneId);
    expect(savedScene).toBeTruthy();
    
    const groupObject = savedScene.sceneData.objects[0];
    expect(groupObject.material).toBeUndefined();
    expect(groupObject.children[0].material.textureUrl).toBe("data:image/png;base64,texture");
    expect(groupObject.children[1].material.textureUrl).toBe("https://example.com/explicit.png");
    expect(groupObject.children[2].material).toBeUndefined();
  });
});

describe("POST /compute/3d/voxel", () => {
  it("successfully starts a new 3D voxel session and returns sessionId", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({
        voxels: [
          {
            position: [0, 0, 0],
            color: "#ff6347",
          },
        ],
      });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.sceneEmbedUrl).toBeTruthy();
    expect(postResponse.body.sceneId).toBeTruthy();
    expect(postResponse.body.sessionId).toBeTruthy();
    expect(postResponse.body.addedVoxels).toBe(1);
    expect(postResponse.body.addedShapes).toBe(0);
    expect(postResponse.body.totalVoxels).toBe(1);
    expect(postResponse.body.isAppend).toBe(false);
  });

  it("successfully appends voxels and shapes to an existing 3D voxel session", async () => {
    const firstResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({
        voxels: [
          {
            position: [0, 0, 0],
          },
        ],
      });

    expect(firstResponse.status).toBe(200);
    const sessionId = firstResponse.body.sessionId;

    const secondResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({
        sessionId,
        shapes: [
          {
            type: "box",
            center: [1, 1, 1],
            size: [1, 1, 1],
          },
        ],
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.sessionId).toBe(sessionId);
    expect(secondResponse.body.addedVoxels).toBe(0);
    expect(secondResponse.body.addedShapes).toBe(1);
    expect(secondResponse.body.totalVoxels).toBe(2); // 1 from first + 1 from box center voxel rasterized
    expect(secondResponse.body.isAppend).toBe(true);
  });

  it("rejects unknown shape types against the real registry", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({
        shapes: [{ type: "cube", center: [0, 0, 0], size: [2, 2, 2] }],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("unknown type 'cube'");
    expect(postResponse.body.error).toContain("box");
  });

  it("rejects shapes whose extent exceeds the rasterization bound", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({
        shapes: [{ type: "sphere", center: [0, 0, 0], radius: 5000 }],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("maximum of 64");
  });

  it("accepts a pyramid with an array 'size' (matches the published schema)", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({
        shapes: [{ type: "pyramid", center: [0, 0, 0], size: [4, 4, 4], height: 4 }],
      });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.totalVoxels).toBeGreaterThan(0);
  });

  it("builds from palette + slices text grids", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({
        palette: { r: "#ef4444", w: "#ffffff" },
        slices: [
          { rows: ["..r..", ".rrr.", "..r.."] },
          { rows: ["..w..", ".w.w.", "..w.."] },
        ],
      });

    expect(postResponse.status).toBe(200);
    // slice 0: 5 'r' cells; slice 1 (y defaults to index 1): 4 'w' cells
    expect(postResponse.body.totalVoxels).toBe(9);
    expect(postResponse.body.addedVoxels).toBe(9);

    const savedScene = mockScenes.get(postResponse.body.sceneId);
    const savedVoxels = savedScene.sceneData.voxels;
    expect(savedVoxels).toContainEqual({ position: [2, 0, 0], color: "#ef4444" });
    expect(savedVoxels).toContainEqual({ position: [1, 1, 1], color: "#ffffff" });
  });

  it("respects explicit slice y levels and combines slices with shapes", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({
        palette: { g: "green" },
        slices: [{ y: 5, rows: ["g"] }],
        shapes: [{ type: "box", center: [10, 0, 0], size: [1, 1, 1] }],
      });

    expect(postResponse.status).toBe(200);
    const savedVoxels = mockScenes.get(postResponse.body.sceneId).sceneData.voxels;
    expect(savedVoxels).toContainEqual({ position: [0, 5, 0], color: "green" });
    expect(postResponse.body.addedShapes).toBe(1);
  });

  it("teaches when a slice character is not in the palette", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({
        palette: { r: "#ef4444" },
        slices: [{ rows: ["rq"] }],
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("Unknown character 'q'");
    expect(postResponse.body.error).toContain("'r'");
  });

  it("requires a palette when slices are used", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({ slices: [{ rows: ["x"] }] });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("'palette' is required");
  });

  it("rejects all-empty slices", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({ palette: { r: "red" }, slices: [{ rows: ["...", ". ."] }] });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("paint no voxels");
  });

  it("appends slices to an existing voxel session", async () => {
    const firstResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({ palette: { r: "red" }, slices: [{ rows: ["r"] }] });
    const sessionId = firstResponse.body.sessionId;

    const secondResponse = await request(app)
      .post("/compute/3d/voxel")
      .send({
        sessionId,
        palette: { b: "blue" },
        slices: [{ y: 1, rows: ["b"] }],
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.isAppend).toBe(true);
    expect(secondResponse.body.totalVoxels).toBe(2);
  });
});

describe("POST /compute/turtle", () => {
  it("returns 400 when code is missing or empty", async () => {
    const postResponse = await request(app)
      .post("/compute/turtle")
      .send({});

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toContain("'code' (non-empty LOGO source code string) is required.");
  });

  it("successfully executes a LOGO turtle program and returns drawing details", async () => {
    const postResponse = await request(app)
      .post("/compute/turtle")
      .send({
        code: "setpencolor 3 fd 100 rt 90",
      });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body.turtleEmbedUrl).toBeTruthy();
    expect(postResponse.body.drawingId).toBeTruthy();
    expect(postResponse.body.commandCount).toBeGreaterThan(0);
    expect(postResponse.body.canvasSize).toBe("800x600");
    expect(postResponse.body.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns 400 when LOGO code has syntax errors", async () => {
    const postResponse = await request(app)
      .post("/compute/turtle")
      .send({
        code: "repeat 4 fd 100",
      });

    expect(postResponse.status).toBe(400);
    expect(postResponse.body.error).toBeTruthy();
  });

  it("supports iterative drawing via drawingId", async () => {
    const firstResponse = await request(app)
      .post("/compute/turtle")
      .send({
        code: "fd 100 rt 90",
      });

    expect(firstResponse.status).toBe(200);
    const drawingId = firstResponse.body.drawingId;

    const secondResponse = await request(app)
      .post("/compute/turtle")
      .send({
        code: "fd 100 rt 90",
        drawingId,
      });

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.drawingId).toBe(drawingId);
    expect(secondResponse.body.commandCount).toBeGreaterThan(firstResponse.body.commandCount);
    expect(secondResponse.body.newCommandCount).toBeGreaterThan(0);
  });
});



