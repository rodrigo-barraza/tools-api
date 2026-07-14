// ────────────────────────────────────────────────────────────
// Agentic input coercion
//
// LLM agents — especially small local models — routinely send numbers as
// strings ("10"), booleans as strings ("true"), human-ish values ("60s",
// "last"), or plain junk ("abc"). The historical failure mode was silent:
// `Math.min(parseInt(x), cap)` turns "abc" into NaN, NaN sails through
// `min/max` clamps, and the tool "succeeds" with a degenerate value
// (reads 0 lines, waits 1ms, deletes cell 0). These helpers make coercion
// explicit: accept the intuitive forms models actually send, and reject
// anything uninterpretable with an error that teaches the valid shape —
// never a silent default.
// ────────────────────────────────────────────────────────────

export interface CoercionOk<T> {
  ok: true;
  value: T;
  /** Set when the value was accepted but adjusted (e.g. clamped to a cap). */
  note?: string;
}
export interface CoercionErr {
  ok: false;
  error: string;
}
export type CoercionResult<T> = CoercionOk<T> | CoercionErr;

/**
 * Coerce a value to an integer. Accepts real numbers and integer-like strings
 * ("10", " 10 "). Rejects floats, NaN, Infinity, booleans, and non-numeric
 * strings with a teaching error. Optionally clamps to [min, max] and reports
 * the clamp via `note` rather than applying it silently.
 */
export function coerceInt(
  value: unknown,
  opts: {
    name: string;
    min?: number;
    max?: number;
    /** Returned (ok) when value is null/undefined. Omit to make it required. */
    default?: number;
  },
): CoercionResult<number> {
  const { name, min, max } = opts;
  if (value === null || value === undefined || value === "") {
    if (opts.default !== undefined) return { ok: true, value: opts.default };
    return { ok: false, error: `'${name}' is required (integer)` };
  }

  let n: number;
  if (typeof value === "number") {
    n = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    // Strict integer string: optional sign then digits only. Rejects "60s",
    // "1.5", "1e3", "0x10", "" — the model gets told what's valid.
    if (!/^[+-]?\d+$/.test(trimmed)) {
      return {
        ok: false,
        error: `'${name}' must be an integer; received ${JSON.stringify(value)}. Send a whole number like ${min ?? 1}.`,
      };
    }
    n = Number(trimmed);
  } else {
    return {
      ok: false,
      error: `'${name}' must be an integer; received ${typeof value}.`,
    };
  }

  if (!Number.isInteger(n)) {
    return {
      ok: false,
      error: `'${name}' must be a whole integer; received ${JSON.stringify(value)}.`,
    };
  }

  let note: string | undefined;
  if (min !== undefined && n < min) {
    note = `'${name}' ${n} was below the minimum ${min}; using ${min}.`;
    n = min;
  }
  if (max !== undefined && n > max) {
    note = `'${name}' ${n} exceeded the maximum ${max}; using ${max}.`;
    n = max;
  }
  return note ? { ok: true, value: n, note } : { ok: true, value: n };
}

/**
 * Coerce a value to a boolean. Accepts real booleans and the strings
 * "true"/"false" (case-insensitive). Rejects everything else so a typo can't
 * silently read as false. null/undefined yields the provided default.
 */
export function coerceBool(
  value: unknown,
  name: string,
  defaultValue: boolean,
): CoercionResult<boolean> {
  if (value === null || value === undefined) return { ok: true, value: defaultValue };
  if (typeof value === "boolean") return { ok: true, value };
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return { ok: true, value: true };
    if (v === "false") return { ok: true, value: false };
  }
  return {
    ok: false,
    error: `'${name}' must be a boolean (true or false); received ${JSON.stringify(value)}.`,
  };
}
