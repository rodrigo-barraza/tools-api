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
  parent?: string | null;
  zIndex?: number;
  isMask?: boolean;
  maskedBy?: string | null;
  symbol?: string;
  timeScale?: number;
  timeOffset?: number;
  symbolLoop?: boolean;
  blur?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export interface VectorSymbolInput {
  layers?: VectorLayer[];
  duration?: number;
  action?: "delete";
}

export interface VectorRetimeInput {
  scale?: number;
  offset?: number;
  layerIds?: string[];
}

export interface VectorAnimationInput {
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  background?: string;
  layers?: VectorLayer[];
  symbols?: Record<string, VectorSymbolInput | null>;
  retime?: VectorRetimeInput;
}

const VALID_SHAPE_TYPES = new Set([
  "rectangle",
  "circle",
  "ellipse",
  "line",
  "polygon",
  "path",
  "text",
  "group",
  "instance",
  // Preset shapes — baked to path layers at merge time.
  "star",
  "heart",
  "arrow",
  "gear",
]);

/** Shape types whose outline can act as a clipping mask. */
const MASKABLE_SHAPE_TYPES = new Set([
  "rectangle",
  "circle",
  "ellipse",
  "polygon",
  "path",
]);

export const VALID_EASINGS = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step",
  "discrete",
  "bounce",
  "bounce-in",
  "elastic",
  "elastic-in",
  "back",
  "back-in",
  "spring",
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
  bounce: "bounce",
  bounceout: "bounce",
  easeoutbounce: "bounce",
  bouncein: "bounce-in",
  easeinbounce: "bounce-in",
  elastic: "elastic",
  elasticout: "elastic",
  easeoutelastic: "elastic",
  elasticin: "elastic-in",
  easeinelastic: "elastic-in",
  back: "back",
  backout: "back",
  easeoutback: "back",
  backin: "back-in",
  easeinback: "back-in",
  overshoot: "back",
  spring: "spring",
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
 * Per-layer validation shared by the top-level layer list and symbol layer
 * lists. `scopeLabel` names the list in error messages ("" for top level,
 * "symbol 'walk-cycle' " for symbol scopes).
 */
function validateLayer(
  layer: VectorLayer,
  layerIndex: number,
  scopeLabel: string,
): string | null {
  if (!layer || typeof layer !== "object") {
    return `${scopeLabel}Layer at index ${layerIndex} must be an object`;
  }

  if (!layer.id || typeof layer.id !== "string") {
    return `${scopeLabel}Layer at index ${layerIndex} must have a valid 'id' string`;
  }

  if (layer.action === "delete" || layer.deleted === true) return null;

  if (layer.shapeType && !VALID_SHAPE_TYPES.has(layer.shapeType)) {
    return `${scopeLabel}Layer '${layer.id}' has invalid shapeType '${layer.shapeType}'. Valid: ${[...VALID_SHAPE_TYPES].join(", ")}`;
  }

  if (layer.shapeType === "instance" && (!layer.symbol || typeof layer.symbol !== "string")) {
    return `${scopeLabel}Layer '${layer.id}' has shapeType 'instance' but no 'symbol' — set 'symbol' to the name of a symbol defined in animation.symbols`;
  }

  if (layer.parent !== undefined && layer.parent !== null && typeof layer.parent !== "string") {
    return `${scopeLabel}Layer '${layer.id}' parent must be a layer id string (or null to unparent)`;
  }

  if (layer.maskedBy !== undefined && layer.maskedBy !== null && typeof layer.maskedBy !== "string") {
    return `${scopeLabel}Layer '${layer.id}' maskedBy must be a layer id string (or null to unmask)`;
  }

  if (layer.zIndex !== undefined && typeof layer.zIndex !== "number") {
    return `${scopeLabel}Layer '${layer.id}' zIndex must be a number`;
  }

  if (layer.timeScale !== undefined && (typeof layer.timeScale !== "number" || layer.timeScale <= 0)) {
    return `${scopeLabel}Layer '${layer.id}' timeScale must be a positive number`;
  }

  if (layer.timeOffset !== undefined && typeof layer.timeOffset !== "number") {
    return `${scopeLabel}Layer '${layer.id}' timeOffset must be a number (seconds)`;
  }

  if (layer.blur !== undefined && (typeof layer.blur !== "number" || layer.blur < 0)) {
    return `${scopeLabel}Layer '${layer.id}' blur must be a non-negative number (pixels)`;
  }

  if (
    layer.opacity !== undefined &&
    (typeof layer.opacity !== "number" || layer.opacity < 0 || layer.opacity > 1)
  ) {
    return `${scopeLabel}Layer '${layer.id}' opacity must be a number between 0 and 1`;
  }

  if (
    layer.strokeWidth !== undefined &&
    (typeof layer.strokeWidth !== "number" || layer.strokeWidth < 0)
  ) {
    return `${scopeLabel}Layer '${layer.id}' strokeWidth must be a positive number`;
  }

  const fillError = validateColorValue(layer.fillColor, layer.id, "fillColor");
  if (fillError) return scopeLabel ? `${scopeLabel}${fillError}` : fillError;
  const strokeError = validateColorValue(layer.strokeColor, layer.id, "strokeColor");
  if (strokeError) return scopeLabel ? `${scopeLabel}${strokeError}` : strokeError;

  if (layer.keyframes !== undefined && layer.keyframes !== null) {
    if (!Array.isArray(layer.keyframes)) {
      return `${scopeLabel}Layer '${layer.id}' keyframes must be an array`;
    }

    for (
      let keyframeIndex = 0;
      keyframeIndex < layer.keyframes.length;
      keyframeIndex++
    ) {
      const keyframe = layer.keyframes[keyframeIndex];
      if (!keyframe || typeof keyframe !== "object") {
        return `${scopeLabel}Keyframe at index ${keyframeIndex} in layer '${layer.id}' must be an object`;
      }

      if (keyframe.time === undefined || keyframe.time === null) {
        return `${scopeLabel}Keyframe at index ${keyframeIndex} in layer '${layer.id}' is missing required 'time' property`;
      }

      const timeValue = Number(keyframe.time);
      if (isNaN(timeValue) || timeValue < 0) {
        return `${scopeLabel}Keyframe at index ${keyframeIndex} in layer '${layer.id}' must have a positive 'time' number`;
      }

      if (!keyframe.properties || typeof keyframe.properties !== "object") {
        return `${scopeLabel}Keyframe at index ${keyframeIndex} in layer '${layer.id}' must have a valid 'properties' object`;
      }

      if (keyframe.easing !== undefined && keyframe.easing !== null) {
        if (typeof keyframe.easing !== "string" || normalizeEasing(keyframe.easing) === null) {
          return `${scopeLabel}Keyframe at index ${keyframeIndex} in layer '${layer.id}' has unknown easing ${JSON.stringify(keyframe.easing)}. Valid: ${VALID_EASINGS.join(", ")}`;
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
          return `${scopeLabel}Keyframe at index ${keyframeIndex} in layer '${layer.id}' has an invalid motionPath — pass an SVG path string or {"path": "M 0 0 L 100 100", "orientToPath": true}`;
        }
      }

      const kfProps = keyframe.properties as Record<string, unknown>;
      const kfFillError = validateColorValue(kfProps.fillColor, layer.id, "keyframe fillColor");
      if (kfFillError) return scopeLabel ? `${scopeLabel}${kfFillError}` : kfFillError;
      const kfStrokeError = validateColorValue(kfProps.strokeColor, layer.id, "keyframe strokeColor");
      if (kfStrokeError) return scopeLabel ? `${scopeLabel}${kfStrokeError}` : kfStrokeError;
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
      const layerError = validateLayer(animation.layers[layerIndex], layerIndex, "");
      if (layerError) return layerError;
    }
  }

  if (animation.retime !== undefined && animation.retime !== null) {
    const retime = animation.retime;
    if (typeof retime !== "object" || Array.isArray(retime)) {
      return "'retime' must be an object like {\"scale\": 2} (slow to half speed) or {\"offset\": 1, \"layerIds\": [\"ball\"]}";
    }
    if (retime.scale !== undefined && (typeof retime.scale !== "number" || retime.scale <= 0)) {
      return "'retime.scale' must be a positive number (2 = twice as long/slow, 0.5 = twice as fast)";
    }
    if (retime.offset !== undefined && typeof retime.offset !== "number") {
      return "'retime.offset' must be a number of seconds (positive shifts keyframes later)";
    }
    if (
      retime.layerIds !== undefined &&
      (!Array.isArray(retime.layerIds) || retime.layerIds.some((id) => typeof id !== "string"))
    ) {
      return "'retime.layerIds' must be an array of layer id strings";
    }
  }

  if (animation.symbols !== undefined && animation.symbols !== null) {
    if (typeof animation.symbols !== "object" || Array.isArray(animation.symbols)) {
      return "'symbols' must be an object mapping symbol names to {layers: [...], duration?}";
    }

    for (const [symbolName, symbolDefinition] of Object.entries(animation.symbols)) {
      if (symbolDefinition === null || symbolDefinition.action === "delete") continue;
      if (typeof symbolDefinition !== "object" || !Array.isArray(symbolDefinition.layers)) {
        return `Symbol '${symbolName}' must be an object with a 'layers' array (or null / {"action": "delete"} to remove it)`;
      }
      if (
        symbolDefinition.duration !== undefined &&
        (typeof symbolDefinition.duration !== "number" || symbolDefinition.duration <= 0)
      ) {
        return `Symbol '${symbolName}' duration must be a positive number of seconds`;
      }
      for (let layerIndex = 0; layerIndex < symbolDefinition.layers.length; layerIndex++) {
        const layerError = validateLayer(
          symbolDefinition.layers[layerIndex],
          layerIndex,
          `Symbol '${symbolName}': `,
        );
        if (layerError) return layerError;
      }
    }
  }

  return null;
}

/**
 * Structural checks that only make sense on the fully-merged session state
 * (input calls can legally reference layers/symbols added in earlier calls):
 * parent references and cycles, mask references, and symbol instance
 * references and nesting cycles. Returns an error string or null.
 */
export function validateMergedAnimation(animation: {
  layers: VectorLayer[];
  symbols?: Record<string, { layers: VectorLayer[]; duration?: number }>;
}): string | null {
  const symbols = animation.symbols || {};

  const scopes: Array<{ label: string; layers: VectorLayer[] }> = [
    { label: "", layers: animation.layers || [] },
    ...Object.entries(symbols).map(([symbolName, symbolDefinition]) => ({
      label: `Symbol '${symbolName}': `,
      layers: symbolDefinition.layers || [],
    })),
  ];

  for (const scope of scopes) {
    const byId = new Map<string, VectorLayer>();
    for (const layer of scope.layers) byId.set(layer.id, layer);

    for (const layer of scope.layers) {
      if (layer.parent) {
        if (layer.parent === layer.id) {
          return `${scope.label}Layer '${layer.id}' cannot be its own parent`;
        }
        if (!byId.has(layer.parent)) {
          return `${scope.label}Layer '${layer.id}' has parent '${layer.parent}' which does not exist in the same layer list — parenting cannot cross symbol boundaries`;
        }
        const visited = new Set<string>([layer.id]);
        let ancestor = byId.get(layer.parent);
        while (ancestor) {
          if (visited.has(ancestor.id)) {
            return `${scope.label}Layer '${layer.id}' is part of a parent cycle (${[...visited].join(" → ")} → ${ancestor.id})`;
          }
          visited.add(ancestor.id);
          ancestor = ancestor.parent ? byId.get(ancestor.parent) : undefined;
        }
      }

      if (layer.maskedBy) {
        const maskLayer = byId.get(layer.maskedBy);
        if (!maskLayer) {
          return `${scope.label}Layer '${layer.id}' has maskedBy '${layer.maskedBy}' which does not exist in the same layer list`;
        }
        if (maskLayer.shapeType && !MASKABLE_SHAPE_TYPES.has(maskLayer.shapeType)) {
          return `${scope.label}Layer '${layer.id}' is masked by '${layer.maskedBy}' whose shapeType '${maskLayer.shapeType}' cannot clip — masks must be rectangle, circle, ellipse, polygon, or path`;
        }
      }

      if (layer.shapeType === "instance") {
        if (!layer.symbol || !symbols[layer.symbol]) {
          return `${scope.label}Layer '${layer.id}' references symbol '${layer.symbol}' which is not defined in animation.symbols. Defined symbols: ${Object.keys(symbols).join(", ") || "(none)"}`;
        }
      }
    }
  }

  // Symbol nesting must be acyclic (an instance chain that revisits a symbol
  // would recurse forever in the player).
  const referencedSymbols = (layers: VectorLayer[]): string[] =>
    layers
      .filter((layer) => layer.shapeType === "instance" && layer.symbol)
      .map((layer) => layer.symbol as string);

  const visitState = new Map<string, "visiting" | "done">();
  const visitSymbol = (symbolName: string, chain: string[]): string | null => {
    if (visitState.get(symbolName) === "done") return null;
    if (visitState.get(symbolName) === "visiting") {
      return `Symbol nesting cycle detected: ${[...chain, symbolName].join(" → ")} — a symbol cannot contain an instance of itself (directly or indirectly)`;
    }
    const symbolDefinition = symbols[symbolName];
    if (!symbolDefinition) return null;
    visitState.set(symbolName, "visiting");
    for (const childName of referencedSymbols(symbolDefinition.layers || [])) {
      const cycleError = visitSymbol(childName, [...chain, symbolName]);
      if (cycleError) return cycleError;
    }
    visitState.set(symbolName, "done");
    return null;
  };

  for (const symbolName of Object.keys(symbols)) {
    const cycleError = visitSymbol(symbolName, []);
    if (cycleError) return cycleError;
  }

  return null;
}
