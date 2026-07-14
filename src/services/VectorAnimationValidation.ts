export interface VectorMotionPath {
  path: string;
  orientToPath?: boolean;
}

export interface VectorKeyframe {
  time: number | string;
  properties: Record<string, unknown>;
  easing?: string;
  motionPath?: string | VectorMotionPath;
}

export interface VectorLayer {
  id: string;
  shapeType?: string;
  shapeData?: Record<string, unknown>;
  opacity?: number;
  fillColor?: string | Record<string, unknown>;
  strokeColor?: string | Record<string, unknown>;
  strokeWidth?: number;
  imageUrl?: string;
  keyframes?: VectorKeyframe[];
  replaceKeyframes?: boolean;
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

export const VALID_EASINGS = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step",
  "discrete",
  "cubic-bezier(x1, y1, x2, y2)",
];

const EASING_ALIASES: Record<string, string> = {
  linear: "linear",
  easein: "ease-in",
  easeout: "ease-out",
  easeinout: "ease-in-out",
  ease: "ease-in-out",
  step: "step",
  steps: "step",
  discrete: "discrete",
  hold: "step",
};

/**
 * Map an easing name to the engine's canonical form. Models routinely send
 * camelCase ("easeInOut") or CSS names ("ease"); those coerce cleanly.
 * Returns null for names the engine has no equivalent for.
 */
export function normalizeEasing(easing: string): string | null {
  if (easing.startsWith("cubic-bezier")) return easing;
  const normalized = EASING_ALIASES[easing.toLowerCase().replace(/[-_\s]/g, "")];
  return normalized ?? null;
}

function validateGradient(
  value: Record<string, unknown>,
  layerId: string,
  field: string,
): string | null {
  const example = `{"type": "linear", "x1": 0, "y1": 0, "x2": 100, "y2": 0, "stops": [{"offset": 0, "color": "#ff0000"}, {"offset": 1, "color": "#0000ff"}]}`;
  if (value.type !== "linear" && value.type !== "radial") {
    return `Layer '${layerId}' ${field} gradient must have type "linear" or "radial" (got: ${JSON.stringify(value.type ?? null)}). Example: ${example}`;
  }
  if (!Array.isArray(value.stops) || value.stops.length === 0) {
    return `Layer '${layerId}' ${field} gradient must have a non-empty 'stops' array. Example: ${example}`;
  }
  for (let stopIndex = 0; stopIndex < value.stops.length; stopIndex++) {
    const stop = value.stops[stopIndex] as Record<string, unknown> | null;
    if (!stop || typeof stop !== "object") {
      return `Layer '${layerId}' ${field} gradient stop at index ${stopIndex} must be an object like {"offset": 0.5, "color": "#ff0000"}`;
    }
    const offset = Number(stop.offset);
    if (isNaN(offset) || offset < 0 || offset > 1) {
      return `Layer '${layerId}' ${field} gradient stop at index ${stopIndex} has invalid offset ${JSON.stringify(stop.offset ?? null)} — offsets must be numbers between 0 and 1`;
    }
    if (typeof stop.color !== "string" || stop.color.length === 0) {
      return `Layer '${layerId}' ${field} gradient stop at index ${stopIndex} is missing a 'color' string (e.g. "#ff0000")`;
    }
  }
  return null;
}

function validateColorValue(
  value: unknown,
  layerId: string,
  field: string,
): string | null {
  if (value === undefined || value === null || typeof value === "string") return null;
  if (typeof value === "object") {
    return validateGradient(value as Record<string, unknown>, layerId, field);
  }
  return `Layer '${layerId}' ${field} must be a color string or a gradient object`;
}

/**
 * Cross-check incoming keyframe times against the animation duration.
 * Keyframes past the duration are unreachable at playback, so accepting
 * them silently inflates the model's sense of progress.
 */
export function findKeyframeBeyondDuration(
  layers: VectorLayer[],
  durationSeconds: number,
): string | null {
  for (const layer of layers) {
    if (layer.action === "delete" || layer.deleted === true) continue;
    for (const keyframe of layer.keyframes ?? []) {
      const timeValue = Number(keyframe.time);
      if (timeValue > durationSeconds) {
        return (
          `Layer '${layer.id}' has a keyframe at time ${timeValue}s, past the animation ` +
          `duration of ${durationSeconds}s — it would never play. Increase ` +
          `animation.duration or move the keyframe to ${durationSeconds}s or earlier.`
        );
      }
    }
  }
  return null;
}

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
    if (isNaN(fpsValue) || !Number.isInteger(fpsValue) || fpsValue < 1 || fpsValue > 60) {
      return "Animation fps must be an integer between 1 and 60";
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

        const fillError = validateColorValue(layer.fillColor, layer.id, "fillColor");
        if (fillError) return fillError;
        const strokeError = validateColorValue(layer.strokeColor, layer.id, "strokeColor");
        if (strokeError) return strokeError;

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

            if (keyframe.easing !== undefined && keyframe.easing !== null) {
              if (typeof keyframe.easing !== "string" || normalizeEasing(keyframe.easing) === null) {
                return `Keyframe at index ${keyframeIndex} in layer '${layer.id}' has unknown easing ${JSON.stringify(keyframe.easing)}. Valid: ${VALID_EASINGS.join(", ")}`;
              }
            }

            if (keyframe.motionPath !== undefined && keyframe.motionPath !== null) {
              const motionPath = keyframe.motionPath;
              const pathString =
                typeof motionPath === "string"
                  ? motionPath
                  : typeof motionPath === "object"
                    ? (motionPath as VectorMotionPath).path
                    : undefined;
              if (typeof pathString !== "string" || pathString.trim().length === 0) {
                return `Keyframe at index ${keyframeIndex} in layer '${layer.id}' has an invalid motionPath — pass an SVG path string or {"path": "M 0 0 L 100 100", "orientToPath": true}`;
              }
            }

            const kfProps = keyframe.properties as Record<string, unknown>;
            const kfFillError = validateColorValue(kfProps.fillColor, layer.id, "keyframe fillColor");
            if (kfFillError) return kfFillError;
            const kfStrokeError = validateColorValue(kfProps.strokeColor, layer.id, "keyframe strokeColor");
            if (kfStrokeError) return kfStrokeError;
          }
        }
      }
    }
  }

  return null;
}
