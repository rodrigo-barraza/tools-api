import { describe, it, expect } from "vitest";

import {
  isValidNamespace,
  assertNoForbiddenOperators,
  prefixField,
  prefixFilter,
  validatePipeline,
} from "../AgenticDatastoreService.ts";

// ── Namespace validation ──────────────────────────────────────
describe("datastore namespace validation", () => {
  it("accepts kebab/snake namespaces", () => {
    expect(isValidNamespace("workout-logs")).toBe(true);
    expect(isValidNamespace("price_history_gpu")).toBe(true);
    expect(isValidNamespace("a")).toBe(true);
  });

  it("rejects uppercase, spaces, dots, leading dashes, and non-strings", () => {
    expect(isValidNamespace("Workout")).toBe(false);
    expect(isValidNamespace("my logs")).toBe(false);
    expect(isValidNamespace("a.b")).toBe(false);
    expect(isValidNamespace("-leading")).toBe(false);
    expect(isValidNamespace("")).toBe(false);
    expect(isValidNamespace(null)).toBe(false);
    expect(isValidNamespace(42)).toBe(false);
    expect(isValidNamespace("x".repeat(65))).toBe(false);
  });
});

// ── Forbidden operator scanning ───────────────────────────────
describe("datastore forbidden operator scan", () => {
  it("passes benign filters", () => {
    expect(
      assertNoForbiddenOperators({ weight: { $gte: 100 }, exercise: "squat" }),
    ).toBe(null);
  });

  it("catches $where at any depth", () => {
    expect(assertNoForbiddenOperators({ $where: "this.a == 1" })).toBe("$where");
    expect(
      assertNoForbiddenOperators({
        $or: [{ a: 1 }, { $where: "sleep(1000)" }],
      }),
    ).toBe("$where");
  });

  it("catches code-execution and cross-collection operators nested in arrays", () => {
    expect(
      assertNoForbiddenOperators([{ $expr: { $function: { body: "x" } } }]),
    ).toBe("$function");
    expect(assertNoForbiddenOperators([{ $lookup: { from: "requests" } }])).toBe(
      "$lookup",
    );
  });
});

// ── Field prefixing ───────────────────────────────────────────
describe("datastore field prefixing", () => {
  it("prefixes payload fields with data. and leaves meta fields alone", () => {
    expect(prefixField("weight")).toBe("data.weight");
    expect(prefixField("data.weight")).toBe("data.weight");
    expect(prefixField("key")).toBe("key");
    expect(prefixField("createdAt")).toBe("createdAt");
    expect(prefixField("updatedAt")).toBe("updatedAt");
    expect(prefixField("agent")).toBe("agent");
    expect(prefixField("username")).toBe("username");
  });

  it("rewrites flat filters, keeping operator objects on fields intact", () => {
    expect(prefixFilter({ weight: { $gte: 100 }, key: "2026-07-14" })).toEqual({
      "data.weight": { $gte: 100 },
      key: "2026-07-14",
    });
  });

  it("recurses through $and/$or/$nor", () => {
    expect(
      prefixFilter({
        $or: [{ exercise: "squat" }, { $and: [{ reps: { $gt: 5 } }] }],
      }),
    ).toEqual({
      $or: [
        { "data.exercise": "squat" },
        { $and: [{ "data.reps": { $gt: 5 } }] },
      ],
    });
  });
});

// ── Pipeline validation ───────────────────────────────────────
describe("datastore pipeline validation", () => {
  it("accepts whitelisted analytics pipelines", () => {
    expect(
      validatePipeline([
        { $match: { "data.exercise": "squat" } },
        { $group: { _id: "$data.exercise", total: { $sum: "$data.reps" } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
    ).toBe(null);
  });

  it("rejects non-arrays, empty pipelines, and multi-key stages", () => {
    expect(validatePipeline({})).toMatch(/non-empty array/);
    expect(validatePipeline([])).toMatch(/non-empty array/);
    expect(validatePipeline([{ $match: {}, $limit: 5 }])).toMatch(
      /exactly one key/,
    );
  });

  it("rejects non-whitelisted and escape-hatch stages", () => {
    expect(validatePipeline([{ $out: "other_collection" }])).toMatch(
      /not allowed/,
    );
    expect(validatePipeline([{ $merge: { into: "x" } }])).toMatch(/not allowed/);
    expect(validatePipeline([{ $lookup: { from: "requests" } }])).toMatch(
      /not allowed/,
    );
    expect(validatePipeline([{ $facet: { a: [] } }])).toMatch(/not allowed/);
  });

  it("rejects forbidden operators hidden inside allowed stages", () => {
    expect(
      validatePipeline([{ $match: { $where: "this.a == 1" } }]),
    ).toMatch(/\$where/);
    expect(
      validatePipeline([
        { $addFields: { evil: { $function: { body: "x", args: [], lang: "js" } } } },
      ]),
    ).toMatch(/\$function/);
  });

  it("caps pipeline length", () => {
    const stages = Array.from({ length: 13 }, () => ({ $limit: 1 }));
    expect(validatePipeline(stages)).toMatch(/maximum of 12 stages/);
  });
});
