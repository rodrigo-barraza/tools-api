export interface VectorKeyframe {
  time: number | string;
  properties: Record<string, unknown>;
  easing?: string;
  motionPath?: string;
}

export interface VectorLayer {
  id: string;
  shapeType?: string;
  shapeData?: Record<string, unknown>;
  opacity?: number;
  fillColor?: string | Record<string, unknown>;
  strokeColor?: string | Record<string, unknown>;
  strokeWidth?: number;
  keyframes?: VectorKeyframe[];
  action?: "delete" | "modify";
  deleted?: boolean;
}

export interface VectorAnimationInput {
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  background?: string;
  layers?: VectorLayer[];
}

const VALID_SHAPE_TYPES = new Set([
  "rectangle",
  "circle",
  "ellipse",
  "line",
  "polygon",
  "path",
  "text",
]);

/**
 * Validates vector animation inputs to prevent agents from getting false successes.
 * Returns a string detailing the validation error, or null if validation passes.
 */
export function validateVectorAnimationInput(
  animation: VectorAnimationInput,
): string | null {
  if (animation.width !== undefined && animation.width !== null) {
    const widthValue = Number(animation.width);
    if (isNaN(widthValue) || widthValue <= 0 || !Number.isInteger(widthValue)) {
      return "Animation width must be a positive integer";
    }
  }

  if (animation.height !== undefined && animation.height !== null) {
    const heightValue = Number(animation.height);
    if (isNaN(heightValue) || heightValue <= 0 || !Number.isInteger(heightValue)) {
      return "Animation height must be a positive integer";
    }
  }

  if (animation.duration !== undefined && animation.duration !== null) {
    const durationValue = Number(animation.duration);
    if (isNaN(durationValue) || durationValue <= 0) {
      return "Animation duration must be a positive number";
    }
  }

  if (animation.fps !== undefined && animation.fps !== null) {
    const fpsValue = Number(animation.fps);
    if (isNaN(fpsValue) || fpsValue <= 0 || !Number.isInteger(fpsValue)) {
      return "Animation fps must be a positive integer";
    }
  }

  if (animation.layers !== undefined && animation.layers !== null) {
    if (!Array.isArray(animation.layers)) {
      return "'layers' must be an array";
    }

    for (let layerIndex = 0; layerIndex < animation.layers.length; layerIndex++) {
      const layer = animation.layers[layerIndex];
      if (!layer || typeof layer !== "object") {
        return `Layer at index ${layerIndex} must be an object`;
      }

      if (!layer.id || typeof layer.id !== "string") {
        return `Layer at index ${layerIndex} must have a valid 'id' string`;
      }

      if (layer.action !== "delete" && layer.deleted !== true) {
        if (layer.shapeType && !VALID_SHAPE_TYPES.has(layer.shapeType)) {
          return `Layer '${layer.id}' has invalid shapeType '${layer.shapeType}'. Valid: ${[...VALID_SHAPE_TYPES].join(", ")}`;
        }

        if (
          layer.opacity !== undefined &&
          (typeof layer.opacity !== "number" || layer.opacity < 0 || layer.opacity > 1)
        ) {
          return `Layer '${layer.id}' opacity must be a number between 0 and 1`;
        }

        if (
          layer.strokeWidth !== undefined &&
          (typeof layer.strokeWidth !== "number" || layer.strokeWidth < 0)
        ) {
          return `Layer '${layer.id}' strokeWidth must be a positive number`;
        }

        if (layer.keyframes !== undefined && layer.keyframes !== null) {
          if (!Array.isArray(layer.keyframes)) {
            return `Layer '${layer.id}' keyframes must be an array`;
          }

          for (
            let keyframeIndex = 0;
            keyframeIndex < layer.keyframes.length;
            keyframeIndex++
          ) {
            const keyframe = layer.keyframes[keyframeIndex];
            if (!keyframe || typeof keyframe !== "object") {
              return `Keyframe at index ${keyframeIndex} in layer '${layer.id}' must be an object`;
            }

            if (keyframe.time === undefined || keyframe.time === null) {
              return `Keyframe at index ${keyframeIndex} in layer '${layer.id}' is missing required 'time' property`;
            }

            const timeValue = Number(keyframe.time);
            if (isNaN(timeValue) || timeValue < 0) {
              return `Keyframe at index ${keyframeIndex} in layer '${layer.id}' must have a positive 'time' number`;
            }

            if (!keyframe.properties || typeof keyframe.properties !== "object") {
              return `Keyframe at index ${keyframeIndex} in layer '${layer.id}' must have a valid 'properties' object`;
            }
          }
        }
      }
    }
  }

  return null;
}
