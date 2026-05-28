// ─── Field Projection Middleware (Sparse Fieldsets) ─────────

import type { Request, Response, NextFunction } from "express";

/**
 * Known wrapper keys that contain arrays of domain objects.
 * When projecting, these arrays' items get projected individually,
 * while top-level metadata (count, query, etc.) is preserved.
 */
const ARRAY_WRAPPER_KEYS = new Set([
  "events",
  "products",
  "trends",
  "articles",
  "earnings",
  "snapshots",
  "commodities",
  "predictions",
  "requests",
  "foods",
  "comparison",
  "places",
  "results",
  "stops",
  "vessels",
  "messages",
  "toolCalls",
]);

/**
 * Internal/MongoDB fields to always strip from API responses,
 * regardless of whether field projection is active.
 */
const INTERNAL_FIELDS = new Set(["_id", "__v", "firstSeen", "lastSeen"]);

/**
 * Pick only the specified field paths from an object.
 * Supports dot-notation paths (e.g. "venue.name").
 */
function pickFields(
  object: Record<string, unknown>,
  fieldPaths: string[],
): Record<string, unknown> {
  if (!object || typeof object !== "object" || Array.isArray(object))
    return object;

  const result: Record<string, unknown> = {};

  for (const path of fieldPaths) {
    const parts = path.split(".");
    let source: Record<string, unknown> = object;
    let target: Record<string, unknown> = result;

    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      if (source == null || typeof source !== "object") break;

      if (i === parts.length - 1) {
        // Leaf — copy the value
        if (key in source) {
          target[key] = source[key];
        }
      } else {
        // Branch — create nested object if needed
        if (!(key in target)) {
          target[key] = {};
        }
        target = target[key] as Record<string, unknown>;
        source = source[key] as Record<string, unknown>;
      }
    }
  }

  return result;
}

/**
 * Strip internal/MongoDB fields from an object (shallow).
 */
function stripInternal(
  object: Record<string, unknown>,
): Record<string, unknown> {
  if (!object || typeof object !== "object" || Array.isArray(object))
    return object;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) {
    if (!INTERNAL_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Apply field projection and internal-field stripping to a response body.
 */
function projectResponse(data: unknown, fields: string[] | null): unknown {
  if (data == null || typeof data !== "object") return data;

  // Single array response (rare — e.g. /commodities/categories)
  if (Array.isArray(data)) {
    if (!fields)
      return data.map((item) => stripInternal(item as Record<string, unknown>));
    return data.map((item) =>
      typeof item === "object" && item !== null
        ? pickFields(stripInternal(item as Record<string, unknown>), fields)
        : item,
    );
  }

  // Object response — check for wrapper arrays
  const cleaned = stripInternal(data as Record<string, unknown>) as Record<
    string,
    unknown
  >;

  // Find wrapper array keys present in this response
  const wrapperKey = Object.keys(cleaned).find(
    (key) => ARRAY_WRAPPER_KEYS.has(key) && Array.isArray(cleaned[key]),
  );

  if (wrapperKey) {
    // Strip internal fields from array items
    cleaned[wrapperKey] = (
      cleaned[wrapperKey] as Record<string, unknown>[]
    ).map(stripInternal);

    // Apply field projection to array items if requested
    if (fields) {
      const prefix = wrapperKey + ".";
      const hasWrapperPrefix = fields.some((field) => field.startsWith(prefix));

      // Separate fields targeting wrapper items vs top-level metadata
      const itemFields: string[] = [];
      const topFields: string[] = [];

      for (const item of fields) {
        if (item.startsWith(prefix)) {
          // "foods.name" → "name" (strip wrapper key prefix)
          itemFields.push(item.slice(prefix.length));
        } else if (item === wrapperKey) {
          // Just "foods" — keep entire array, no item projection
        } else if (hasWrapperPrefix) {
          // When wrapper-prefixed fields exist, non-prefixed fields
          // are treated as top-level metadata selectors
          topFields.push(item);
        } else {
          // No wrapper-prefixed fields at all — bare fields target items
          // (backward compatible: "name,value" → project each item)
          itemFields.push(item);
        }
      }

      // Project items only if there are item-level fields
      if (itemFields.length > 0) {
        cleaned[wrapperKey] = (
          cleaned[wrapperKey] as Record<string, unknown>[]
        ).map((item) =>
          typeof item === "object" && item !== null
            ? pickFields(item, itemFields)
            : item,
        );
      }

      // If top-level metadata fields were specified, project those too
      if (topFields.length > 0) {
        const projected = pickFields(cleaned, topFields) as Record<
          string,
          unknown
        >;
        projected[wrapperKey] = cleaned[wrapperKey];
        return projected;
      }
    }

    return cleaned;
  }

  // Plain object — apply projection directly
  if (fields) {
    return pickFields(cleaned, fields);
  }

  return cleaned;
}

/**
 * Express middleware that enables sparse fieldsets via ?fields=a,b,c.d.
 * Also strips internal MongoDB fields (_id, __v, etc.) from all responses.
 */
export function fieldProjectionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const fieldsParam = req.query.fields as string | undefined;
  const fields = fieldsParam
    ? fieldsParam
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : null;

  // Override res.json to intercept the response
  const originalJson = res.json.bind(res);

  res.json = (data: unknown) => {
    return originalJson(projectResponse(data, fields));
  };

  next();
}
