// ─── Triangle Mesh 3D Builder ───────────────────────────────
// Generates self-contained HTML embeds with Three.js rendering
// raw vertex + face index data — the fundamental polygon mesh.

import { buildEmbedHtml } from "../utilities.ts";
import { THREE_JS_CDN } from "./ThreeDimensionalBaseService.ts";

// ─── Constants ─────────────────────────────────────────────────

const MAX_VERTEX_COUNT = 50_000;
const MAX_FACE_COUNT = 100_000;

// ─── Types ─────────────────────────────────────────────────────

export type MeshVertex = [number, number, number];

export type MeshFace = [number, number, number];

export interface MeshOptions {
  wireframe?: boolean;
  flatShading?: boolean;
  doubleSided?: boolean;
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  showGrid?: boolean;
  showAxes?: boolean;
  background?: string;
  meshColor?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  cameraPosition?: [number, number, number];
  title?: string;
}

interface MeshBuildInput {
  vertices: MeshVertex[];
  faces: MeshFace[];
  normals?: MeshVertex[];
  colors?: string[];
  options?: MeshOptions;
}

// ─── Validation ────────────────────────────────────────────────

export function validateMeshInput(input: MeshBuildInput): string | null {
  if (!input.vertices || !Array.isArray(input.vertices) || input.vertices.length === 0) {
    return "'vertices' is required (non-empty array of [x, y, z] triples)";
  }
  if (!input.faces || !Array.isArray(input.faces) || input.faces.length === 0) {
    return "'faces' is required (non-empty array of [v0, v1, v2] index triples)";
  }
  if (input.vertices.length > MAX_VERTEX_COUNT) {
    return `Maximum ${MAX_VERTEX_COUNT.toLocaleString()} vertices allowed (got ${input.vertices.length.toLocaleString()})`;
  }
  if (input.faces.length > MAX_FACE_COUNT) {
    return `Maximum ${MAX_FACE_COUNT.toLocaleString()} faces allowed (got ${input.faces.length.toLocaleString()})`;
  }

  for (let index = 0; index < input.vertices.length; index++) {
    const vertex = input.vertices[index];
    if (!Array.isArray(vertex) || vertex.length !== 3) {
      return `Vertex at index ${index} must be an array of exactly 3 numbers [x, y, z]`;
    }
    if (vertex.some((coordinate: number) => typeof coordinate !== "number" || !isFinite(coordinate))) {
      return `Vertex at index ${index} contains non-finite or non-numeric values`;
    }
  }

  const vertexCount = input.vertices.length;
  for (let index = 0; index < input.faces.length; index++) {
    const face = input.faces[index];
    if (!Array.isArray(face) || face.length !== 3) {
      return `Face at index ${index} must be an array of exactly 3 vertex indices`;
    }
    for (const vertexIndex of face) {
      if (typeof vertexIndex !== "number" || vertexIndex < 0 || vertexIndex >= vertexCount) {
        return `Face at index ${index} references invalid vertex index ${vertexIndex} (valid range: 0-${vertexCount - 1})`;
      }
    }
  }

  // The renderer only applies per-vertex colors/normals when their length
  // matches the vertex count — a mismatch used to silently fall back to the
  // flat mesh color while the response claimed hasVertexColors: true.
  if (input.colors !== undefined && input.colors !== null) {
    if (!Array.isArray(input.colors)) {
      return "'colors' must be an array of CSS color strings, one per vertex";
    }
    if (input.colors.length !== vertexCount) {
      return `'colors' has ${input.colors.length} entries but there are ${vertexCount} vertices — provide exactly one color per vertex, or omit 'colors' and set options.meshColor`;
    }
  }
  if (input.normals !== undefined && input.normals !== null) {
    if (!Array.isArray(input.normals)) {
      return "'normals' must be an array of [x, y, z] triples, one per vertex";
    }
    if (input.normals.length !== vertexCount) {
      return `'normals' has ${input.normals.length} entries but there are ${vertexCount} vertices — provide exactly one normal per vertex, or omit 'normals' to auto-compute them`;
    }
    for (let index = 0; index < input.normals.length; index++) {
      const normal = input.normals[index];
      if (!Array.isArray(normal) || normal.length !== 3 || normal.some((component: number) => typeof component !== "number" || !isFinite(component))) {
        return `Normal at index ${index} must be an array of exactly 3 finite numbers [x, y, z]`;
      }
    }
  }

  return null;
}

// ─── HTML Builder ──────────────────────────────────────────────

export function buildMeshEmbedHtml(input: MeshBuildInput): string {
  const {
    vertices,
    faces,
    normals,
    colors,
    options = {},
  } = input;

  const {
    wireframe = false,
    flatShading = true,
    doubleSided = true,
    autoRotate = true,
    autoRotateSpeed = 1.0,
    showGrid = true,
    showAxes = false,
    background = "#0f172a",
    meshColor = "#38bdf8",
    opacity = 1.0,
    metalness = 0.2,
    roughness = 0.6,
    cameraPosition,
    title = "",
  } = options;

  const sceneDataJson = JSON.stringify({
    vertices,
    faces,
    normals: normals || null,
    colors: colors || null,
  });

  const optionsJson = JSON.stringify({
    wireframe,
    flatShading,
    doubleSided,
    autoRotate,
    autoRotateSpeed,
    showGrid,
    showAxes,
    background,
    meshColor,
    opacity,
    metalness,
    roughness,
    cameraPosition: cameraPosition || null,
  });

  return buildEmbedHtml({
    headExtra: "",
    styles: `
  html, body {
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
    background: ${background};
  }
  #scene-container {
    width: 100%;
    height: 100%;
    position: relative;
  }
  canvas {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }
  #scene-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: linear-gradient(transparent, rgba(0,0,0,0.6));
    pointer-events: none;
  }
  #scene-title {
    color: #94a3b8;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  #scene-status {
    color: #64748b;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
  }`,
    bodyContent: `<div id="scene-container">
  <div id="scene-overlay">
    <div id="scene-title">${title}</div>
    <div id="scene-status">initializing…</div>
  </div>
</div>`,
    scripts: `<script type="importmap">
{
  "imports": {
    "three": "${THREE_JS_CDN}",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
  }
}
</${"script"}>
<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const SCENE_DATA = ${sceneDataJson};
const OPTIONS = ${optionsJson};
const statusElement = document.getElementById("scene-status");

const scene = new THREE.Scene();
scene.background = new THREE.Color(OPTIONS.background);

const container = document.getElementById("scene-container");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
container.prepend(renderer.domElement);

const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.01, 1000);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = OPTIONS.autoRotate;
controls.autoRotateSpeed = OPTIONS.autoRotateSpeed;

// ── Lighting ──
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
fillLight.position.set(-5, 3, -5);
scene.add(fillLight);

// ── Build Geometry ──
const geometry = new THREE.BufferGeometry();
const vertexPositions = new Float32Array(SCENE_DATA.vertices.flat());
geometry.setAttribute("position", new THREE.BufferAttribute(vertexPositions, 3));

const faceIndices = new Uint32Array(SCENE_DATA.faces.flat());
geometry.setIndex(new THREE.BufferAttribute(faceIndices, 1));

if (SCENE_DATA.normals && SCENE_DATA.normals.length === SCENE_DATA.vertices.length) {
  const normalValues = new Float32Array(SCENE_DATA.normals.flat());
  geometry.setAttribute("normal", new THREE.BufferAttribute(normalValues, 3));
} else {
  geometry.computeVertexNormals();
}

let hasVertexColors = false;
if (SCENE_DATA.colors && SCENE_DATA.colors.length === SCENE_DATA.vertices.length) {
  const colorValues = new Float32Array(SCENE_DATA.vertices.length * 3);
  const tempColor = new THREE.Color();
  for (let i = 0; i < SCENE_DATA.colors.length; i++) {
    tempColor.set(SCENE_DATA.colors[i]);
    colorValues[i * 3] = tempColor.r;
    colorValues[i * 3 + 1] = tempColor.g;
    colorValues[i * 3 + 2] = tempColor.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colorValues, 3));
  hasVertexColors = true;
}

const materialOptions = {
  color: hasVertexColors ? 0xffffff : new THREE.Color(OPTIONS.meshColor),
  vertexColors: hasVertexColors,
  wireframe: OPTIONS.wireframe,
  flatShading: OPTIONS.flatShading,
  side: OPTIONS.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  transparent: OPTIONS.opacity < 1.0,
  opacity: OPTIONS.opacity,
  metalness: OPTIONS.metalness,
  roughness: OPTIONS.roughness,
};
const material = new THREE.MeshStandardMaterial(materialOptions);
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// ── Auto-fit camera ──
geometry.computeBoundingBox();
geometry.computeBoundingSphere();
const boundingSphere = geometry.boundingSphere;
const boundingBox = geometry.boundingBox;

if (OPTIONS.cameraPosition) {
  camera.position.set(...OPTIONS.cameraPosition);
} else if (boundingSphere) {
  const distance = boundingSphere.radius * 2.5;
  camera.position.set(distance, distance * 0.8, distance);
}
if (boundingSphere) {
  controls.target.copy(boundingSphere.center);
}
controls.update();

// ── Grid & Axes ──
if (OPTIONS.showGrid) {
  const gridSize = boundingSphere ? Math.ceil(boundingSphere.radius * 4) : 10;
  const grid = new THREE.GridHelper(gridSize, gridSize, 0x334155, 0x1e293b);
  grid.position.y = boundingBox ? boundingBox.min.y : 0;
  scene.add(grid);
}
if (OPTIONS.showAxes) {
  const axisSize = boundingSphere ? boundingSphere.radius * 1.5 : 5;
  scene.add(new THREE.AxesHelper(axisSize));
}

// ── Status ──
const boxSize = boundingBox
  ? \`\${(boundingBox.max.x - boundingBox.min.x).toFixed(1)} × \${(boundingBox.max.y - boundingBox.min.y).toFixed(1)} × \${(boundingBox.max.z - boundingBox.min.z).toFixed(1)}\`
  : "?";
statusElement.textContent = \`\${SCENE_DATA.vertices.length.toLocaleString()} vertices · \${SCENE_DATA.faces.length.toLocaleString()} triangles · \${boxSize}\`;

// ── Render Loop ──
function onResize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ── Report size to parent iframe ──
function reportSize() {
  window.parent.postMessage({
    type: "embed-resize",
    width: container.clientWidth,
    height: container.clientHeight
  }, "*");
}
requestAnimationFrame(() => setTimeout(reportSize, 300));
</${"script"}>`,
  });
}
