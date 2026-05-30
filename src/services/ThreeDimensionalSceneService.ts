// ─── Primitive Shape Composer 3D Builder ────────────────────
// Generates self-contained HTML embeds composing 3D scenes from
// primitive shapes (box, sphere, cylinder, etc.) with transforms
// and PBR materials.

import { buildEmbedHtml } from "../utilities.ts";

// ─── Constants ─────────────────────────────────────────────────

const MAX_OBJECT_COUNT = 200;
const THREE_JS_CDN = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

// ─── Types ─────────────────────────────────────────────────────

export const VALID_PRIMITIVE_SHAPES = new Set([
  "box",
  "sphere",
  "cylinder",
  "cone",
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

export interface SceneMaterial {
  color?: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
  wireframe?: boolean;
  flatShading?: boolean;
  doubleSided?: boolean;
}

export interface SceneObject {
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
  material?: SceneMaterial;
  name?: string;
}

export interface SceneOptions {
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

interface SceneBuildInput {
  objects: SceneObject[];
  options?: SceneOptions;
}

// ─── Validation ────────────────────────────────────────────────

export function validateSceneInput(input: SceneBuildInput): string | null {
  if (!input.objects || !Array.isArray(input.objects) || input.objects.length === 0) {
    return "'objects' is required (non-empty array of shape objects)";
  }
  if (input.objects.length > MAX_OBJECT_COUNT) {
    return `Maximum ${MAX_OBJECT_COUNT} objects allowed (got ${input.objects.length})`;
  }

  for (let index = 0; index < input.objects.length; index++) {
    const sceneObject = input.objects[index];
    if (!sceneObject.shape || typeof sceneObject.shape !== "string") {
      return `Object at index ${index} must have a 'shape' field (string)`;
    }
    if (!VALID_PRIMITIVE_SHAPES.has(sceneObject.shape)) {
      return `Object at index ${index} has unknown shape '${sceneObject.shape}'. Valid: ${[...VALID_PRIMITIVE_SHAPES].join(", ")}`;
    }
  }

  return null;
}

// ─── HTML Builder ──────────────────────────────────────────────

export function buildSceneEmbedHtml(input: SceneBuildInput): string {
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
</${"script"}>
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

// ── Geometry Factory ──
function createGeometry(objectDefinition) {
  const shape = objectDefinition.shape;
  const segmentCount = objectDefinition.segments || 32;

  switch (shape) {
    case "box": {
      const dimensions = objectDefinition.size || [1, 1, 1];
      return new THREE.BoxGeometry(
        dimensions[0] || 1,
        dimensions[1] || 1,
        dimensions[2] || 1
      );
    }
    case "sphere":
      return new THREE.SphereGeometry(
        objectDefinition.radius || 0.5,
        segmentCount,
        segmentCount
      );
    case "cylinder":
      return new THREE.CylinderGeometry(
        objectDefinition.radiusTop ?? objectDefinition.radius ?? 0.5,
        objectDefinition.radiusBottom ?? objectDefinition.radius ?? 0.5,
        objectDefinition.height || 1,
        segmentCount
      );
    case "cone":
      return new THREE.ConeGeometry(
        objectDefinition.radius || 0.5,
        objectDefinition.height || 1,
        segmentCount
      );
    case "torus":
      return new THREE.TorusGeometry(
        objectDefinition.radius || 0.5,
        objectDefinition.tube || 0.15,
        objectDefinition.radialSegments || 16,
        objectDefinition.tubularSegments || 48,
        objectDefinition.arc ? objectDefinition.arc * Math.PI / 180 : Math.PI * 2
      );
    case "torusKnot":
      return new THREE.TorusKnotGeometry(
        objectDefinition.radius || 0.5,
        objectDefinition.tube || 0.15,
        objectDefinition.tubularSegments || 64,
        objectDefinition.radialSegments || 8
      );
    case "plane":
      return new THREE.PlaneGeometry(
        objectDefinition.width || 1,
        objectDefinition.height || 1,
        segmentCount,
        segmentCount
      );
    case "ring":
      return new THREE.RingGeometry(
        objectDefinition.radius ? objectDefinition.radius * 0.5 : 0.25,
        objectDefinition.radius || 0.5,
        segmentCount
      );
    case "circle":
      return new THREE.CircleGeometry(
        objectDefinition.radius || 0.5,
        segmentCount
      );
    case "dodecahedron":
      return new THREE.DodecahedronGeometry(objectDefinition.radius || 0.5);
    case "icosahedron":
      return new THREE.IcosahedronGeometry(objectDefinition.radius || 0.5);
    case "octahedron":
      return new THREE.OctahedronGeometry(objectDefinition.radius || 0.5);
    case "tetrahedron":
      return new THREE.TetrahedronGeometry(objectDefinition.radius || 0.5);
    case "capsule":
      return new THREE.CapsuleGeometry(
        objectDefinition.radius || 0.3,
        objectDefinition.height || 1,
        segmentCount,
        segmentCount
      );
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function createMaterial(materialDefinition = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(materialDefinition.color || "#38bdf8"),
    metalness: materialDefinition.metalness ?? 0.2,
    roughness: materialDefinition.roughness ?? 0.6,
    transparent: (materialDefinition.opacity ?? 1.0) < 1.0,
    opacity: materialDefinition.opacity ?? 1.0,
    emissive: materialDefinition.emissive
      ? new THREE.Color(materialDefinition.emissive)
      : new THREE.Color(0x000000),
    emissiveIntensity: materialDefinition.emissiveIntensity ?? 0,
    wireframe: materialDefinition.wireframe || false,
    flatShading: materialDefinition.flatShading || false,
    side: materialDefinition.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
}

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
</${"script"}>`,
  });
}
