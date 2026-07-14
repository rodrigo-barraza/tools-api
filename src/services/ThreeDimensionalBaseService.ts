// ─── Shared 3D Utilities and Constants ────────────────────────
// Single source of truth for 3D builders, defining the CDN,
// geometry factories, material creators, environment presets, and enums.

export const THREE_JS_CDN = "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js";

export const VALID_SHAPES = new Set([
  "box", "sphere", "cylinder", "cone", "pyramid", "torus", "plane", "ring",
  "dodecahedron", "icosahedron", "octahedron", "tetrahedron",
  "capsule", "circle", "torusKnot", "group", "text3d",
]);

/**
 * Validate an optional [x, y, z] parameter. Wrong-arity or non-numeric
 * vectors used to flow into Vector3.set(...) producing NaN transforms —
 * the object silently disappeared while the tool reported success.
 */
export function validateVector3(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((component) => typeof component !== "number" || !isFinite(component))
  ) {
    return `${label} must be an array of exactly 3 finite numbers [x, y, z]`;
  }
  return null;
}

export const VALID_ANIMATIONS = new Set([
  "spin", "bounce", "orbit", "pulse", "float",
]);

export const VALID_ENVIRONMENTS = new Set([
  "studio", "outdoor", "night", "sunset", "dawn", "warehouse", "neutral",
]);

// ── Client-Side JavaScript Fragments (Interpolated into Iframe Templates) ──

export const CLIENT_GEOMETRY_FACTORY = `
function createGeometry(objectDefinition) {
  const shapeType = objectDefinition.type || objectDefinition.shape;
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
    case "pyramid": {
      // Square-based pyramid: a 4-segment cone rotated so the base sits flat.
      const pyramidGeometry = new THREE.ConeGeometry(
        objectDefinition.radius || (objectDefinition.size && objectDefinition.size[0] ? objectDefinition.size[0] * Math.SQRT1_2 : 0.7),
        objectDefinition.height || 1,
        4
      );
      pyramidGeometry.rotateY(Math.PI / 4);
      return pyramidGeometry;
    }
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
    case "plane": {
      const planeSize = objectDefinition.size || [];
      return new THREE.PlaneGeometry(
        objectDefinition.width || planeSize[0] || 1,
        objectDefinition.height || planeSize[1] || 1
      );
    }
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
`;

export const CLIENT_MATERIAL_FACTORY = `
const textureCache = new Map();
function getTexture(textureUrlString) {
  if (!textureUrlString) return null;
  if (textureCache.has(textureUrlString)) return textureCache.get(textureUrlString);
  try {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");
    const texture = textureLoader.load(textureUrlString);
    textureCache.set(textureUrlString, texture);
    return texture;
  } catch (error) {
    console.warn("Failed to load texture:", textureUrlString, error);
    return null;
  }
}

function createMaterial(materialDefinition = {}) {
  const materialOptions = {
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
  };

  if (materialDefinition.textureUrl) {
    const texture = getTexture(materialDefinition.textureUrl);
    if (texture) {
      materialOptions.map = texture;
    }
  }

  return new THREE.MeshStandardMaterial(materialOptions);
}
`;

export const CLIENT_ENVIRONMENT_PRESETS = `
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
`;

export const CLIENT_ANIMATION_SYSTEM = `
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
`;
