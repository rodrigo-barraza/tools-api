// ─── Primitive Shape Composer 3D Builder ────────────────────
// Generates self-contained HTML embeds composing 3D scenes from
// primitive shapes (box, sphere, cylinder, etc.) with transforms
// and PBR materials.

import { buildEmbedHtml } from "../utilities.ts";
import {
  THREE_JS_CDN,
  CLIENT_GEOMETRY_FACTORY,
  CLIENT_MATERIAL_FACTORY,
  validateVector3,
} from "./ThreeDimensionalBaseService.ts";

// ─── Constants ─────────────────────────────────────────────────

const MAX_OBJECT_COUNT = 200;

export const VALID_PRIMITIVE_SHAPES = new Set([
  "box",
  "sphere",
  "cylinder",
  "cone",
  "pyramid",
  "torus",
  "plane",
  "ring",
  "dodecahedron",
  "icosahedron",
  "octahedron",
  "tetrahedron",
  "capsule",
  "circle",
  "torusKnot",
]);

export interface ModelMaterial {
  color?: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
  wireframe?: boolean;
  flatShading?: boolean;
  doubleSided?: boolean;
  textureUrl?: string;
}

export interface ModelObject {
  shape: string;
  size?: number[];
  radius?: number;
  width?: number;
  height?: number;
  depth?: number;
  radiusTop?: number;
  radiusBottom?: number;
  segments?: number;
  tube?: number;
  radialSegments?: number;
  tubularSegments?: number;
  arc?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  material?: ModelMaterial;
  name?: string;
}

export interface ModelOptions {
  autoRotate?: boolean;
  autoRotateSpeed?: number;
  showGrid?: boolean;
  showAxes?: boolean;
  background?: string;
  ambientLightColor?: string;
  ambientLightIntensity?: number;
  directionalLightColor?: string;
  directionalLightIntensity?: number;
  directionalLightPosition?: [number, number, number];
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  fieldOfView?: number;
  enableShadows?: boolean;
  title?: string;
}

interface ModelBuildInput {
  objects: ModelObject[];
  options?: ModelOptions;
}

// ─── Validation ────────────────────────────────────────────────

export function validateModelInput(input: ModelBuildInput): string | null {
  if (!input.objects || !Array.isArray(input.objects) || input.objects.length === 0) {
    return "'objects' is required (non-empty array of shape objects)";
  }
  if (input.objects.length > MAX_OBJECT_COUNT) {
    return `Maximum ${MAX_OBJECT_COUNT} objects allowed (got ${input.objects.length})`;
  }

  for (let index = 0; index < input.objects.length; index++) {
    const modelObject = input.objects[index];
    if (!modelObject.shape || typeof modelObject.shape !== "string") {
      return `Object at index ${index} must have a 'shape' field (string)`;
    }
    if (!VALID_PRIMITIVE_SHAPES.has(modelObject.shape)) {
      return `Object at index ${index} has unknown shape '${modelObject.shape}'. Valid: ${[...VALID_PRIMITIVE_SHAPES].join(", ")}`;
    }
    for (const [vectorField, vectorValue] of [
      ["position", modelObject.position],
      ["rotation", modelObject.rotation],
      ["scale", modelObject.scale],
      ["size", modelObject.size],
    ] as const) {
      const vectorError = validateVector3(vectorValue, `Object at index ${index}: '${vectorField}'`);
      if (vectorError) return vectorError;
    }
  }

  const cameraError = validateVector3(input.options?.cameraPosition, "options.cameraPosition");
  if (cameraError) return cameraError;
  const targetError = validateVector3(input.options?.cameraTarget, "options.cameraTarget");
  if (targetError) return targetError;

  return null;
}

// ─── HTML Builder ──────────────────────────────────────────────

export function buildModelEmbedHtml(input: ModelBuildInput): string {
  const { objects, options = {} } = input;

  const {
    autoRotate = true,
    autoRotateSpeed = 1.0,
    showGrid = true,
    showAxes = false,
    background = "#0f172a",
    ambientLightColor = "#ffffff",
    ambientLightIntensity = 0.5,
    directionalLightColor = "#ffffff",
    directionalLightIntensity = 0.8,
    directionalLightPosition = [5, 10, 7],
    cameraPosition,
    cameraTarget = [0, 0, 0],
    fieldOfView = 50,
    enableShadows = true,
    title = "",
  } = options;

  const objectsJson = JSON.stringify(objects);
  const optionsJson = JSON.stringify({
    autoRotate,
    autoRotateSpeed,
    showGrid,
    showAxes,
    background,
    ambientLightColor,
    ambientLightIntensity,
    directionalLightColor,
    directionalLightIntensity,
    directionalLightPosition,
    cameraPosition: cameraPosition || null,
    cameraTarget,
    fieldOfView,
    enableShadows,
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
</script>
<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const OBJECTS = ${objectsJson};
const OPTIONS = ${optionsJson};
const statusElement = document.getElementById("scene-status");

const scene = new THREE.Scene();
scene.background = new THREE.Color(OPTIONS.background);

const container = document.getElementById("scene-container");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
if (OPTIONS.enableShadows) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.prepend(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  OPTIONS.fieldOfView,
  container.clientWidth / container.clientHeight,
  0.01,
  1000
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = OPTIONS.autoRotate;
controls.autoRotateSpeed = OPTIONS.autoRotateSpeed;
controls.target.set(...OPTIONS.cameraTarget);

// ── Lighting ──
const ambientLight = new THREE.AmbientLight(
  new THREE.Color(OPTIONS.ambientLightColor),
  OPTIONS.ambientLightIntensity
);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(
  new THREE.Color(OPTIONS.directionalLightColor),
  OPTIONS.directionalLightIntensity
);
directionalLight.position.set(...OPTIONS.directionalLightPosition);
if (OPTIONS.enableShadows) {
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(1024, 1024);
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 50;
  directionalLight.shadow.camera.left = -10;
  directionalLight.shadow.camera.right = 10;
  directionalLight.shadow.camera.top = 10;
  directionalLight.shadow.camera.bottom = -10;
}
scene.add(directionalLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.2);
fillLight.position.set(-5, 3, -5);
scene.add(fillLight);

const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x362d1b, 0.3);
scene.add(hemisphereLight);

// ── Geometry & Material Factories ──
${CLIENT_GEOMETRY_FACTORY}

${CLIENT_MATERIAL_FACTORY}

// ── Build Objects ──
let totalTriangleCount = 0;
const sceneGroup = new THREE.Group();

for (const objectDefinition of OBJECTS) {
  const geometry = createGeometry(objectDefinition);
  const material = createMaterial(objectDefinition.material);
  const meshObject = new THREE.Mesh(geometry, material);

  if (objectDefinition.position) {
    meshObject.position.set(...objectDefinition.position);
  }
  if (objectDefinition.rotation) {
    meshObject.rotation.set(
      objectDefinition.rotation[0] * Math.PI / 180,
      objectDefinition.rotation[1] * Math.PI / 180,
      objectDefinition.rotation[2] * Math.PI / 180
    );
  }
  if (objectDefinition.scale) {
    meshObject.scale.set(...objectDefinition.scale);
  }

  if (OPTIONS.enableShadows) {
    meshObject.castShadow = true;
    meshObject.receiveShadow = true;
  }

  if (objectDefinition.name) {
    meshObject.name = objectDefinition.name;
  }

  const indexAttribute = geometry.getIndex();
  totalTriangleCount += indexAttribute
    ? indexAttribute.count / 3
    : geometry.attributes.position.count / 3;

  sceneGroup.add(meshObject);
}

scene.add(sceneGroup);

// ── Auto-fit Camera ──
const sceneBoundingBox = new THREE.Box3().setFromObject(sceneGroup);
const sceneCenter = sceneBoundingBox.getCenter(new THREE.Vector3());
const sceneSize = sceneBoundingBox.getSize(new THREE.Vector3());
const maxDimension = Math.max(sceneSize.x, sceneSize.y, sceneSize.z);
const fitDistance = maxDimension * 2.0;

if (OPTIONS.cameraPosition) {
  camera.position.set(...OPTIONS.cameraPosition);
} else {
  camera.position.set(
    sceneCenter.x + fitDistance,
    sceneCenter.y + fitDistance * 0.7,
    sceneCenter.z + fitDistance
  );
}
controls.target.copy(sceneCenter);
controls.update();

// ── Grid & Axes ──
if (OPTIONS.showGrid) {
  const gridSize = Math.ceil(maxDimension * 3);
  const grid = new THREE.GridHelper(gridSize, gridSize, 0x334155, 0x1e293b);
  grid.position.y = sceneBoundingBox.min.y;
  if (OPTIONS.enableShadows) grid.receiveShadow = true;
  scene.add(grid);
}
if (OPTIONS.showAxes) {
  scene.add(new THREE.AxesHelper(maxDimension * 1.5));
}

// ── Status ──
statusElement.textContent = \`\${OBJECTS.length} object\${OBJECTS.length !== 1 ? "s" : ""} · \${Math.round(totalTriangleCount).toLocaleString()} triangles\`;

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

function reportSize() {
  window.parent.postMessage({
    type: "embed-resize",
    width: container.clientWidth,
    height: container.clientHeight
  }, "*");
}
requestAnimationFrame(() => setTimeout(reportSize, 300));
</` + `script>`,
  });
}
