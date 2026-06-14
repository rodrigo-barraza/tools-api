import { describe, it, expect } from "vitest";
import { validateSceneInput } from "../ThreeDimensionalSceneService.ts";
import { validateMeshInput } from "../ThreeDimensionalMeshService.ts";
import { validateModelInput } from "../ThreeDimensionalModelService.ts";
import { validateVoxelInput } from "../ThreeDimensionalVoxelService.ts";

describe("validateSceneInput", () => {
  it("returns null for a valid scene with a single box object", () => {
    const result = validateSceneInput({
      objects: [{ type: "box", position: [0, 0, 0] }],
    });
    expect(result).toBeNull();
  });

  it("rejects missing objects array", () => {
    const result = validateSceneInput({ objects: [] });
    expect(result).toContain("'objects' is required");
  });

  it("rejects object with missing type field", () => {
    const result = validateSceneInput({
      objects: [{ position: [0, 0, 0] } as never],
    });
    expect(result).toContain("must have a 'type' field");
  });

  it("rejects object with unknown type", () => {
    const result = validateSceneInput({
      objects: [{ type: "hexagon" }],
    });
    expect(result).toContain("unknown type 'hexagon'");
  });

  it("rejects object with unknown animation type", () => {
    const result = validateSceneInput({
      objects: [{ type: "box", animation: { type: "teleport" } }],
    });
    expect(result).toContain("unknown animation type 'teleport'");
  });

  it("rejects invalid environment preset", () => {
    const result = validateSceneInput({
      scene: { environment: "underwater" },
      objects: [{ type: "box" }],
    });
    expect(result).toContain("Unknown environment preset 'underwater'");
  });

  it("rejects exceeding maximum object count", () => {
    const manyObjects = Array.from({ length: 301 }, () => ({ type: "box" }));
    const result = validateSceneInput({ objects: manyObjects });
    expect(result).toContain("Maximum 300 total objects");
  });

  it("validates nested group children recursively", () => {
    const result = validateSceneInput({
      objects: [
        {
          type: "group",
          children: [{ type: "invalid_child" }],
        },
      ],
    });
    expect(result).toContain("unknown type 'invalid_child'");
  });

  it("rejects excessive nesting depth", () => {
    let current: Record<string, unknown> = { type: "box" };
    for (let i = 0; i < 7; i++) {
      current = { type: "group", children: [current] };
    }
    const result = validateSceneInput({ objects: [current as never] });
    expect(result).toContain("nesting depth");
  });

  it("accepts valid environment preset", () => {
    const result = validateSceneInput({
      scene: { environment: "studio" },
      objects: [{ type: "sphere" }],
    });
    expect(result).toBeNull();
  });
});

describe("validateMeshInput", () => {
  it("returns null for a valid triangle mesh", () => {
    const result = validateMeshInput({
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      faces: [[0, 1, 2]],
    });
    expect(result).toBeNull();
  });

  it("rejects missing vertices", () => {
    const result = validateMeshInput({
      vertices: [],
      faces: [[0, 1, 2]],
    });
    expect(result).toContain("'vertices' is required");
  });

  it("rejects missing faces", () => {
    const result = validateMeshInput({
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      faces: [],
    });
    expect(result).toContain("'faces' is required");
  });

  it("rejects vertex with wrong number of components", () => {
    const result = validateMeshInput({
      vertices: [[0, 0] as never],
      faces: [[0, 0, 0]],
    });
    expect(result).toContain("Vertex at index 0");
    expect(result).toContain("exactly 3 numbers");
  });

  it("rejects vertex with non-finite values", () => {
    const result = validateMeshInput({
      vertices: [[NaN, 0, 0]],
      faces: [[0, 0, 0]],
    });
    expect(result).toContain("non-finite");
  });

  it("rejects face with wrong number of indices", () => {
    const result = validateMeshInput({
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      faces: [[0, 1] as never],
    });
    expect(result).toContain("Face at index 0");
    expect(result).toContain("exactly 3 vertex indices");
  });

  it("rejects face referencing out-of-bounds vertex index", () => {
    const result = validateMeshInput({
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]],
      faces: [[0, 1, 5]],
    });
    expect(result).toContain("invalid vertex index 5");
  });

  it("rejects exceeding maximum vertex count", () => {
    const vertices = Array.from({ length: 50001 }, (_, i) => [i, 0, 0] as [number, number, number]);
    const result = validateMeshInput({
      vertices,
      faces: [[0, 1, 2]],
    });
    expect(result).toContain("Maximum 50,000 vertices");
  });

  it("rejects exceeding maximum face count", () => {
    const vertices: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
    const faces = Array.from({ length: 100001 }, () => [0, 1, 2] as [number, number, number]);
    const result = validateMeshInput({ vertices, faces });
    expect(result).toContain("Maximum 100,000 faces");
  });
});

describe("validateModelInput", () => {
  it("returns null for a valid model with a single box", () => {
    const result = validateModelInput({
      objects: [{ shape: "box" }],
    });
    expect(result).toBeNull();
  });

  it("rejects missing objects", () => {
    const result = validateModelInput({ objects: [] });
    expect(result).toContain("'objects' is required");
  });

  it("rejects object without shape field", () => {
    const result = validateModelInput({
      objects: [{ position: [0, 0, 0] } as never],
    });
    expect(result).toContain("must have a 'shape' field");
  });

  it("rejects object with unknown shape", () => {
    const result = validateModelInput({
      objects: [{ shape: "hexagonal_prism" }],
    });
    expect(result).toContain("unknown shape 'hexagonal_prism'");
  });

  it("accepts all valid primitive shapes", () => {
    const validShapes = [
      "box", "sphere", "cylinder", "cone", "torus", "plane",
      "ring", "dodecahedron", "icosahedron", "octahedron",
      "tetrahedron", "capsule", "circle", "torusKnot",
    ];
    for (const shape of validShapes) {
      const result = validateModelInput({
        objects: [{ shape }],
      });
      expect(result).toBeNull();
    }
  });

  it("rejects exceeding maximum object count", () => {
    const objects = Array.from({ length: 201 }, () => ({ shape: "box" }));
    const result = validateModelInput({ objects });
    expect(result).toContain("Maximum 200 objects");
  });
});

describe("validateVoxelInput", () => {
  it("returns null for valid explicit voxels", () => {
    const result = validateVoxelInput({
      voxels: [
        { position: [0, 0, 0], color: "#ff0000" },
        { position: [1, 0, 0], color: "#00ff00" },
      ],
    });
    expect(result).toBeNull();
  });

  it("returns null for valid shape definition", () => {
    const result = validateVoxelInput({
      shapes: [
        { type: "sphere", center: [0, 0, 0], radius: 3 },
      ],
    });
    expect(result).toBeNull();
  });

  it("rejects missing both voxels and shapes", () => {
    const result = validateVoxelInput({});
    expect(result).toContain("'voxels'");
    expect(result).toContain("'shapes'");
  });

  it("rejects voxel with missing position", () => {
    const result = validateVoxelInput({
      voxels: [{ color: "#ff0000" } as never],
    });
    expect(result).toContain("Voxel at index 0");
    expect(result).toContain("'position'");
  });

  it("rejects voxel with non-finite position", () => {
    const result = validateVoxelInput({
      voxels: [{ position: [Infinity, 0, 0] }],
    });
    expect(result).toContain("non-finite");
  });

  it("rejects voxel with invalid opacity", () => {
    const result = validateVoxelInput({
      voxels: [{ position: [0, 0, 0], opacity: 1.5 }],
    });
    expect(result).toContain("opacity");
    expect(result).toContain("between 0 and 1");
  });

  it("rejects shape with missing type", () => {
    const result = validateVoxelInput({
      shapes: [{ center: [0, 0, 0] } as never],
    });
    expect(result).toContain("missing its 'type'");
  });

  it("rejects shape with invalid center", () => {
    const result = validateVoxelInput({
      shapes: [{ type: "box", center: [0, 0] as never, size: [3, 3, 3] }],
    });
    expect(result).toContain("'center' array of exactly 3 numbers");
  });

  it("rejects sphere shape missing radius", () => {
    const result = validateVoxelInput({
      shapes: [{ type: "sphere", center: [0, 0, 0] }],
    });
    expect(result).toContain("positive 'radius'");
  });

  it("rejects box shape missing size", () => {
    const result = validateVoxelInput({
      shapes: [{ type: "box", center: [0, 0, 0] }],
    });
    expect(result).toContain("'size' array of exactly 3 numbers");
  });

  it("rejects cylinder shape missing radius", () => {
    const result = validateVoxelInput({
      shapes: [{ type: "cylinder", center: [0, 0, 0], height: 5 }],
    });
    expect(result).toContain("positive 'radius'");
  });

  it("rejects cylinder shape missing height", () => {
    const result = validateVoxelInput({
      shapes: [{ type: "cylinder", center: [0, 0, 0], radius: 3 }],
    });
    expect(result).toContain("positive 'height'");
  });

  it("rejects torus shape missing majorRadius", () => {
    const result = validateVoxelInput({
      shapes: [{ type: "torus", center: [0, 0, 0], minorRadius: 2 }],
    });
    expect(result).toContain("positive 'majorRadius'");
  });

  it("rejects torus shape missing minorRadius", () => {
    const result = validateVoxelInput({
      shapes: [{ type: "torus", center: [0, 0, 0], majorRadius: 5 }],
    });
    expect(result).toContain("positive 'minorRadius'");
  });

  it("rejects ellipsoid shape with wrong radii format", () => {
    const result = validateVoxelInput({
      shapes: [{ type: "ellipsoid", center: [0, 0, 0], radii: [3, 4] as never }],
    });
    expect(result).toContain("'radii' array of exactly 3");
  });

  it("accepts valid torus shape with all required parameters", () => {
    const result = validateVoxelInput({
      shapes: [{ type: "torus", center: [0, 0, 0], majorRadius: 5, minorRadius: 2 }],
    });
    expect(result).toBeNull();
  });
});
