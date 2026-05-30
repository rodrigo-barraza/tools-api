// ─── Declarative Scene Builder 3D ───────────────────────────
// Highest-level 3D tool — generates self-contained HTML embeds
// from a declarative scene graph with hierarchical grouping,
// animations, environment presets, ground planes, and text labels.

import { buildEmbedHtml } from "../utilities.ts";

// ─── Constants ─────────────────────────────────────────────────

const MAX_OBJECT_COUNT = 300;
const MAX_NESTING_DEPTH = 5;
const THREE_JS_CDN = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

// ─── Types ─────────────────────────────────────────────────────

export const VALID_MODEL_SHAPES = new Set([
  "box", "sphere", "cylinder", "cone", "torus", "plane", "ring",
  "dodecahedron", "icosahedron", "octahedron", "tetrahedron",
  "capsule", "circle", "torusKnot", "group", "text3d",
]);

export const VALID_ANIMATION_TYPES = new Set([
  "spin", "bounce", "orbit", "pulse", "float",
]);

export const VALID_ENVIRONMENT_PRESETS = new Set([
  "studio", "outdoor", "night", "sunset", "dawn", "warehouse", "neutral",
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
}

export interface ModelAnimation {
  type: string;
  speed?: number;
  axis?: string;
  amplitude?: number;
  radius?: number;
}

export interface ModelObject {
  type: string;
  name?: string;
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
  animation?: ModelAnimation;
  children?: ModelObject[];
  content?: string;
  fontSize?: number;
}

export interface ModelSceneConfig {
  environment?: string;
  background?: string;
  ground?: {
    enabled?: boolean;
    color?: string;
    size?: number;
    opacity?: number;
  };
  camera?: {
    position?: [number, number, number];
    target?: [number, number, number];
    fov?: number;
    autoOrbit?: boolean;
    autoOrbitSpeed?: number;
  };
  fog?: {
    enabled?: boolean;
    color?: string;
    near?: number;
    far?: number;
  };
}

export interface ModelOptions {
  title?: string;
  showGrid?: boolean;
  showAxes?: boolean;
  enableShadows?: boolean;
}

interface ModelBuildInput {
  scene?: ModelSceneConfig;
  objects: ModelObject[];
  options?: ModelOptions;
}

// ─── Validation ────────────────────────────────────────────────

function countObjectsRecursive(objects: ModelObject[], depth: number = 0): { count: number; maxDepth: number } {
  let totalCount = 0;
  let maxDepthReached = depth;

  for (const sceneObject of objects) {
    totalCount++;
    if (sceneObject.children && Array.isArray(sceneObject.children)) {
      const childResult = countObjectsRecursive(sceneObject.children, depth + 1);
      totalCount += childResult.count;
      maxDepthReached = Math.max(maxDepthReached, childResult.maxDepth);
    }
  }

  return { count: totalCount, maxDepth: maxDepthReached };
}

function validateObjectsRecursive(objects: ModelObject[], depth: number = 0): string | null {
  if (depth > MAX_NESTING_DEPTH) {
    return `Maximum nesting depth of ${MAX_NESTING_DEPTH} exceeded`;
  }

  for (let index = 0; index < objects.length; index++) {
    const sceneObject = objects[index];
    if (!sceneObject.type || typeof sceneObject.type !== "string") {
      return `Object at index ${index} (depth ${depth}) must have a 'type' field`;
    }
    if (!VALID_MODEL_SHAPES.has(sceneObject.type)) {
      return `Object at index ${index} (depth ${depth}) has unknown type '${sceneObject.type}'. Valid: ${[...VALID_MODEL_SHAPES].join(", ")}`;
    }
    if (sceneObject.animation && sceneObject.animation.type) {
      if (!VALID_ANIMATION_TYPES.has(sceneObject.animation.type)) {
        return `Object at index ${index} (depth ${depth}) has unknown animation type '${sceneObject.animation.type}'. Valid: ${[...VALID_ANIMATION_TYPES].join(", ")}`;
      }
    }
    if (sceneObject.children && Array.isArray(sceneObject.children)) {
      const childError = validateObjectsRecursive(sceneObject.children, depth + 1);
      if (childError) return childError;
    }
  }

  return null;
}

export function validateModelInput(input: ModelBuildInput): string | null {
  if (!input.objects || !Array.isArray(input.objects) || input.objects.length === 0) {
    return "'objects' is required (non-empty array of scene objects)";
  }

  const { count, maxDepth } = countObjectsRecursive(input.objects);
  if (count > MAX_OBJECT_COUNT) {
    return `Maximum ${MAX_OBJECT_COUNT} total objects allowed (got ${count} including nested children)`;
  }
  if (maxDepth > MAX_NESTING_DEPTH) {
    return `Maximum nesting depth of ${MAX_NESTING_DEPTH} exceeded (got ${maxDepth})`;
  }

  if (input.scene?.environment && !VALID_ENVIRONMENT_PRESETS.has(input.scene.environment)) {
    return `Unknown environment preset '${input.scene.environment}'. Valid: ${[...VALID_ENVIRONMENT_PRESETS].join(", ")}`;
  }

  return validateObjectsRecursive(input.objects);
}

// ─── HTML Builder ──────────────────────────────────────────────

export function buildModelEmbedHtml(input: ModelBuildInput): string {
  const { scene: sceneConfig = {}, objects, options = {} } = input;

  const {
    environment = "studio",
    background = "#0f172a",
    ground = {},
    camera = {},
    fog = {},
  } = sceneConfig;

  const {
    title = "",
    showGrid = false,
    showAxes = false,
    enableShadows = true,
  } = options;

  const fullConfig = {
    environment,
    background,
    ground: {
      enabled: ground.enabled !== false,
      color: ground.color || "#1e293b",
      size: ground.size || 10,
      opacity: ground.opacity ?? 0.8,
    },
    camera: {
      position: camera.position || null,
      target: camera.target || [0, 0, 0],
      fov: camera.fov || 50,
      autoOrbit: camera.autoOrbit !== false,
      autoOrbitSpeed: camera.autoOrbitSpeed ?? 1.0,
    },
    fog: {
      enabled: fog.enabled || false,
      color: fog.color || background,
      near: fog.near || 10,
      far: fog.far || 50,
    },
    showGrid,
    showAxes,
    enableShadows,
  };

  const objectsJson = JSON.stringify(objects);
  const configJson = JSON.stringify(fullConfig);

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
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";

const OBJECTS = ${objectsJson};
const CONFIG = ${configJson};
const statusElement = document.getElementById("scene-status");

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.background);

if (CONFIG.fog.enabled) {
  scene.fog = new THREE.Fog(
    new THREE.Color(CONFIG.fog.color),
    CONFIG.fog.near,
    CONFIG.fog.far
  );
}

const container = document.getElementById("scene-container");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
if (CONFIG.enableShadows) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
container.prepend(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  CONFIG.camera.fov,
  container.clientWidth / container.clientHeight,
  0.01,
  1000
);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = CONFIG.camera.autoOrbit;
controls.autoRotateSpeed = CONFIG.camera.autoOrbitSpeed;
controls.target.set(...CONFIG.camera.target);

// ── Environment Lighting Presets ──
const ENVIRONMENT_PRESETS = {
  studio: {
    ambient: { color: 0xffffff, intensity: 0.6 },
    directional: { color: 0xffffff, intensity: 0.9, position: [5, 8, 5] },
    fill: { color: 0x8888ff, intensity: 0.3, position: [-5, 3, -5] },
    hemisphere: { sky: 0xffffff, ground: 0x444444, intensity: 0.3 },
  },
  outdoor: {
    ambient: { color: 0x87ceeb, intensity: 0.4 },
    directional: { color: 0xfffacd, intensity: 1.0, position: [10, 15, 5] },
    fill: { color: 0x87ceeb, intensity: 0.2, position: [-5, 3, -5] },
    hemisphere: { sky: 0x87ceeb, ground: 0x362d1b, intensity: 0.5 },
  },
  night: {
    ambient: { color: 0x1a1a3e, intensity: 0.2 },
    directional: { color: 0xc4d4ff, intensity: 0.4, position: [-3, 10, 5] },
    fill: { color: 0x2020aa, intensity: 0.15, position: [5, 2, -5] },
    hemisphere: { sky: 0x0a0a2e, ground: 0x080808, intensity: 0.15 },
  },
  sunset: {
    ambient: { color: 0xff7733, intensity: 0.3 },
    directional: { color: 0xff6622, intensity: 0.8, position: [-8, 3, 5] },
    fill: { color: 0xff9944, intensity: 0.2, position: [5, 5, -5] },
    hemisphere: { sky: 0xff7733, ground: 0x220000, intensity: 0.4 },
  },
  dawn: {
    ambient: { color: 0xffd4a3, intensity: 0.35 },
    directional: { color: 0xffc8a0, intensity: 0.7, position: [8, 3, 5] },
    fill: { color: 0xaabbff, intensity: 0.2, position: [-5, 5, -5] },
    hemisphere: { sky: 0xffd4a3, ground: 0x221100, intensity: 0.35 },
  },
  warehouse: {
    ambient: { color: 0xffeedd, intensity: 0.5 },
    directional: { color: 0xffffff, intensity: 0.6, position: [0, 10, 0] },
    fill: { color: 0xdddddd, intensity: 0.3, position: [5, 5, 5] },
    hemisphere: { sky: 0xffeedd, ground: 0x333333, intensity: 0.2 },
  },
  neutral: {
    ambient: { color: 0xffffff, intensity: 0.5 },
    directional: { color: 0xffffff, intensity: 0.7, position: [5, 10, 7] },
    fill: { color: 0xffffff, intensity: 0.2, position: [-5, 3, -5] },
    hemisphere: { sky: 0xffffff, ground: 0x666666, intensity: 0.3 },
  },
};

const environmentPreset = ENVIRONMENT_PRESETS[CONFIG.environment] || ENVIRONMENT_PRESETS.studio;

const ambientLight = new THREE.AmbientLight(environmentPreset.ambient.color, environmentPreset.ambient.intensity);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(environmentPreset.directional.color, environmentPreset.directional.intensity);
directionalLight.position.set(...environmentPreset.directional.position);
if (CONFIG.enableShadows) {
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

const fillLight = new THREE.DirectionalLight(environmentPreset.fill.color, environmentPreset.fill.intensity);
fillLight.position.set(...environmentPreset.fill.position);
scene.add(fillLight);

const hemisphereLight = new THREE.HemisphereLight(
  environmentPreset.hemisphere.sky,
  environmentPreset.hemisphere.ground,
  environmentPreset.hemisphere.intensity
);
scene.add(hemisphereLight);

// ── Geometry Factory ──
function createGeometry(objectDefinition) {
  const shapeType = objectDefinition.type;
  const segmentCount = objectDefinition.segments || 32;

  switch (shapeType) {
    case "box": {
      const dimensions = objectDefinition.size || [1, 1, 1];
      return new THREE.BoxGeometry(dimensions[0] || 1, dimensions[1] || 1, dimensions[2] || 1);
    }
    case "sphere":
      return new THREE.SphereGeometry(objectDefinition.radius || 0.5, segmentCount, segmentCount);
    case "cylinder":
      return new THREE.CylinderGeometry(
        objectDefinition.radiusTop ?? objectDefinition.radius ?? 0.5,
        objectDefinition.radiusBottom ?? objectDefinition.radius ?? 0.5,
        objectDefinition.height || 1,
        segmentCount
      );
    case "cone":
      return new THREE.ConeGeometry(objectDefinition.radius || 0.5, objectDefinition.height || 1, segmentCount);
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
      return new THREE.PlaneGeometry(objectDefinition.width || 1, objectDefinition.height || 1);
    case "ring":
      return new THREE.RingGeometry(
        objectDefinition.radius ? objectDefinition.radius * 0.5 : 0.25,
        objectDefinition.radius || 0.5,
        segmentCount
      );
    case "circle":
      return new THREE.CircleGeometry(objectDefinition.radius || 0.5, segmentCount);
    case "dodecahedron":
      return new THREE.DodecahedronGeometry(objectDefinition.radius || 0.5);
    case "icosahedron":
      return new THREE.IcosahedronGeometry(objectDefinition.radius || 0.5);
    case "octahedron":
      return new THREE.OctahedronGeometry(objectDefinition.radius || 0.5);
    case "tetrahedron":
      return new THREE.TetrahedronGeometry(objectDefinition.radius || 0.5);
    case "capsule":
      return new THREE.CapsuleGeometry(objectDefinition.radius || 0.3, objectDefinition.height || 1, segmentCount, segmentCount);
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
    emissive: materialDefinition.emissive ? new THREE.Color(materialDefinition.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: materialDefinition.emissiveIntensity ?? 0,
    wireframe: materialDefinition.wireframe || false,
    flatShading: materialDefinition.flatShading || false,
    side: materialDefinition.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
}

// ── Animation System ──
const animatedObjects = [];

function applyAnimation(threeObject, animationConfig) {
  if (!animationConfig || !animationConfig.type) return;
  animatedObjects.push({ object: threeObject, config: animationConfig, startTime: performance.now() });
}

function updateAnimations(timestamp) {
  for (const entry of animatedObjects) {
    const elapsed = (timestamp - entry.startTime) / 1000;
    const speed = entry.config.speed || 1.0;
    const amplitude = entry.config.amplitude || 0.5;

    switch (entry.config.type) {
      case "spin": {
        const axis = entry.config.axis || "y";
        entry.object.rotation[axis] += speed * 0.02;
        break;
      }
      case "bounce": {
        const baseY = entry.object.userData.originalY ?? entry.object.position.y;
        if (entry.object.userData.originalY === undefined) {
          entry.object.userData.originalY = entry.object.position.y;
        }
        entry.object.position.y = baseY + Math.abs(Math.sin(elapsed * speed * 2)) * amplitude;
        break;
      }
      case "orbit": {
        const orbitRadius = entry.config.radius || 2;
        const centerX = entry.object.userData.originalX ?? 0;
        const centerZ = entry.object.userData.originalZ ?? 0;
        if (entry.object.userData.originalX === undefined) {
          entry.object.userData.originalX = entry.object.position.x;
          entry.object.userData.originalZ = entry.object.position.z;
        }
        entry.object.position.x = centerX + Math.cos(elapsed * speed) * orbitRadius;
        entry.object.position.z = centerZ + Math.sin(elapsed * speed) * orbitRadius;
        break;
      }
      case "pulse": {
        const pulseScale = 1 + Math.sin(elapsed * speed * 3) * amplitude * 0.3;
        entry.object.scale.setScalar(pulseScale);
        break;
      }
      case "float": {
        const baseFloatY = entry.object.userData.originalY ?? entry.object.position.y;
        if (entry.object.userData.originalY === undefined) {
          entry.object.userData.originalY = entry.object.position.y;
        }
        entry.object.position.y = baseFloatY + Math.sin(elapsed * speed * 1.5) * amplitude;
        break;
      }
    }
  }
}

// ── Build Scene Graph ──
let totalObjectCount = 0;
let loadedFont = null;

function buildObject(objectDefinition, parentGroup) {
  if (objectDefinition.type === "group") {
    const group = new THREE.Group();
    if (objectDefinition.name) group.name = objectDefinition.name;
    if (objectDefinition.position) group.position.set(...objectDefinition.position);
    if (objectDefinition.rotation) {
      group.rotation.set(
        objectDefinition.rotation[0] * Math.PI / 180,
        objectDefinition.rotation[1] * Math.PI / 180,
        objectDefinition.rotation[2] * Math.PI / 180
      );
    }
    if (objectDefinition.scale) group.scale.set(...objectDefinition.scale);

    if (objectDefinition.children) {
      for (const child of objectDefinition.children) {
        buildObject(child, group);
      }
    }

    applyAnimation(group, objectDefinition.animation);
    parentGroup.add(group);
    totalObjectCount++;
    return;
  }

  if (objectDefinition.type === "text3d") {
    totalObjectCount++;
    const textContent = objectDefinition.content || "Text";
    const textFontSize = objectDefinition.fontSize || 0.5;

    // Fallback: create text using a sprite for reliable rendering
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const pixelFontSize = Math.round(textFontSize * 128);
    canvas.width = textContent.length * pixelFontSize * 0.7;
    canvas.height = pixelFontSize * 1.4;
    context.font = pixelFontSize + "px system-ui, -apple-system, sans-serif";
    context.fillStyle = objectDefinition.material?.color || "#ffffff";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(textContent, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    const aspectRatio = canvas.width / canvas.height;
    sprite.scale.set(textFontSize * aspectRatio * 2, textFontSize * 2, 1);

    if (objectDefinition.position) sprite.position.set(...objectDefinition.position);
    if (objectDefinition.name) sprite.name = objectDefinition.name;

    applyAnimation(sprite, objectDefinition.animation);
    parentGroup.add(sprite);
    return;
  }

  // Standard geometry object
  const geometry = createGeometry(objectDefinition);
  const material = createMaterial(objectDefinition.material);
  const meshObject = new THREE.Mesh(geometry, material);

  if (objectDefinition.position) meshObject.position.set(...objectDefinition.position);
  if (objectDefinition.rotation) {
    meshObject.rotation.set(
      objectDefinition.rotation[0] * Math.PI / 180,
      objectDefinition.rotation[1] * Math.PI / 180,
      objectDefinition.rotation[2] * Math.PI / 180
    );
  }
  if (objectDefinition.scale) meshObject.scale.set(...objectDefinition.scale);
  if (objectDefinition.name) meshObject.name = objectDefinition.name;

  if (CONFIG.enableShadows) {
    meshObject.castShadow = true;
    meshObject.receiveShadow = true;
  }

  applyAnimation(meshObject, objectDefinition.animation);
  parentGroup.add(meshObject);
  totalObjectCount++;
}

const sceneGroup = new THREE.Group();
for (const objectDefinition of OBJECTS) {
  buildObject(objectDefinition, sceneGroup);
}
scene.add(sceneGroup);

// ── Ground Plane ──
if (CONFIG.ground.enabled) {
  const groundGeometry = new THREE.PlaneGeometry(CONFIG.ground.size, CONFIG.ground.size);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CONFIG.ground.color),
    roughness: 0.9,
    metalness: 0.0,
    transparent: CONFIG.ground.opacity < 1.0,
    opacity: CONFIG.ground.opacity,
    side: THREE.DoubleSide,
  });
  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;

  const sceneBounds = new THREE.Box3().setFromObject(sceneGroup);
  groundMesh.position.y = sceneBounds.min.y - 0.01;

  if (CONFIG.enableShadows) groundMesh.receiveShadow = true;
  scene.add(groundMesh);
}

// ── Auto-fit Camera ──
const sceneBoundingBox = new THREE.Box3().setFromObject(sceneGroup);
const sceneCenter = sceneBoundingBox.getCenter(new THREE.Vector3());
const sceneSize = sceneBoundingBox.getSize(new THREE.Vector3());
const maxDimension = Math.max(sceneSize.x, sceneSize.y, sceneSize.z);
const fitDistance = maxDimension * 2.0;

if (CONFIG.camera.position) {
  camera.position.set(...CONFIG.camera.position);
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
if (CONFIG.showGrid) {
  const gridSize = Math.ceil(maxDimension * 3);
  const grid = new THREE.GridHelper(gridSize, gridSize, 0x334155, 0x1e293b);
  grid.position.y = sceneBoundingBox.min.y;
  scene.add(grid);
}
if (CONFIG.showAxes) {
  scene.add(new THREE.AxesHelper(maxDimension * 1.5));
}

// ── Status ──
statusElement.textContent = \`\${totalObjectCount} object\${totalObjectCount !== 1 ? "s" : ""} · \${animatedObjects.length} animation\${animatedObjects.length !== 1 ? "s" : ""} · \${CONFIG.environment}\`;

// ── Render Loop ──
function onResize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener("resize", onResize);

function animate(timestamp) {
  requestAnimationFrame(animate);
  updateAnimations(timestamp);
  controls.update();
  renderer.render(scene, camera);
}
animate(performance.now());

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
