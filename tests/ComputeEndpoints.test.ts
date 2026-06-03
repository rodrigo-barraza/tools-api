import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import computeRoutes from "../src/routes/ComputeRoutes.ts";
import { ALLOWED_ROOTS } from "../src/services/AgenticFileService.ts";
import fs from "node:fs";
import path from "node:path";

const mockScenes = new Map();

vi.mock("../src/models/ThreeDimensionalScene.ts", () => ({
  saveThreeDimensionalScene: vi.fn(async (sceneId, sceneType, sceneData, options) => {
    mockScenes.set(sceneId, { sceneType, sceneData, options });
  }),
  getThreeDimensionalScene: vi.fn(async (sceneId) => {
    return mockScenes.get(sceneId) || null;
  }),
  setupThreeDimensionalSceneCollection: vi.fn(),
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
        width: 8,
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
        width: 8,
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

  it("successfully applies referenceTextureUrl to objects that lack explicit textures", async () => {
    const postResponse = await request(app)
      .post("/compute/3d/model")
      .send({
        referenceTextureUrl: "data:image/png;base64,texture",
        objects: [
          {
            shape: "box",
            position: [0, 0, 0],
          },
          {
            shape: "sphere",
            position: [1, 1, 1],
            material: { color: "#ffffff" },
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

  it("successfully recursively applies referenceTextureUrl to nested scene objects that lack explicit textures", async () => {
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
    expect(postResponse.body.voxelCount).toBe(1);
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
    expect(secondResponse.body.voxelCount).toBe(1);
    expect(secondResponse.body.totalVoxels).toBe(2); // 1 from first + 1 from box center voxel rasterized
    expect(secondResponse.body.isAppend).toBe(true);
  });
});


