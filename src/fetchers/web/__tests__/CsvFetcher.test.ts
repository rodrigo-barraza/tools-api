import { describe, it, expect } from "vitest";
import {
  parseCsvText,
  detectDelimiter,
  readCsvSource,
} from "../CsvFetcher.ts";

// ═══════════════════════════════════════════════════════════════
// CsvFetcher — read_csv Tests
//
// Covers the RFC 4180-style parser, delimiter auto-detection, and
// the full readCsvSource profile (headers, row counts, per-column
// type inference, numeric stats, sampling, column selection) via
// data: URIs so no network is involved.
// ═══════════════════════════════════════════════════════════════

function toDataUri(csv: string): string {
  return `data:text/csv;base64,${Buffer.from(csv, "utf-8").toString("base64")}`;
}

const SAMPLE_CSV = [
  "name,age,city,active,joined",
  "Ada,36,London,true,2020-01-15",
  'Grace,45,"New York, NY",false,2019-06-01',
  "Linus,,Helsinki,true,2021-11-30",
  'Margaret,52,"Boston",true,2018-03-22',
].join("\n");

// ─── parseCsvText ─────────────────────────────────────────────

describe("parseCsvText", () => {
  it("parses simple rows", () => {
    expect(parseCsvText("a,b,c\n1,2,3", ",")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields containing the delimiter", () => {
    expect(parseCsvText('a,"b,c",d', ",")).toEqual([["a", "b,c", "d"]]);
  });

  it("handles escaped double quotes", () => {
    expect(parseCsvText('say,"he said ""hi"""', ",")).toEqual([
      ["say", 'he said "hi"'],
    ]);
  });

  it("handles quoted newlines inside a field", () => {
    expect(parseCsvText('a,"line1\nline2",b', ",")).toEqual([
      ["a", "line1\nline2", "b"],
    ]);
  });

  it("handles \\r\\n row terminators and skips blank lines", () => {
    expect(parseCsvText("a,b\r\n1,2\r\n\r\n3,4\r\n", ",")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("supports alternative delimiters", () => {
    expect(parseCsvText("a|b|c\n1|2|3", "|")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
});

// ─── detectDelimiter ──────────────────────────────────────────

describe("detectDelimiter", () => {
  it.each([
    ["a,b,c\n1,2,3", ","],
    ["a;b;c\n1;2;3", ";"],
    ["a\tb\tc\n1\t2\t3", "\t"],
    ["a|b|c\n1|2|3", "|"],
  ])("detects the delimiter in %j", (text, expected) => {
    expect(detectDelimiter(text)).toBe(expected);
  });

  it("prefers the delimiter with consistent column counts", () => {
    // Commas appear inside quoted fields; semicolons are the real separator
    const text = 'name;note\n"Doe, John";"a, b, c"\n"Roe, Jane";"d"';
    expect(detectDelimiter(text)).toBe(";");
  });

  it("falls back to comma for a single-column file", () => {
    expect(detectDelimiter("header\nvalue1\nvalue2")).toBe(",");
  });
});

// ─── readCsvSource ────────────────────────────────────────────

describe("readCsvSource — profile output", () => {
  it("returns headers, counts, sample rows, and inferred types", async () => {
    const result = await readCsvSource(toDataUri(SAMPLE_CSV));
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;

    expect(result.headers).toEqual(["name", "age", "city", "active", "joined"]);
    expect(result.columnCount).toBe(5);
    expect(result.totalRows).toBe(4);
    expect(result.delimiter).toBe(",");
    expect(result.delimiterName).toBe("comma");
    expect(result.sampleRowCount).toBe(4);
    expect(result.sampleTruncated).toBe(false);
    expect(result.sampleRows[1]).toEqual({
      name: "Grace",
      age: "45",
      city: "New York, NY",
      active: "false",
      joined: "2019-06-01",
    });

    const types = Object.fromEntries(
      result.columns.map((column) => [column.name, column.type]),
    );
    expect(types).toEqual({
      name: "string",
      age: "number",
      city: "string",
      active: "boolean",
      joined: "date",
    });
  });

  it("computes min/max/mean for numeric columns (ignoring empties)", async () => {
    const result = await readCsvSource(toDataUri(SAMPLE_CSV));
    if ("error" in result) throw new Error(result.error);
    const age = result.columns.find((column) => column.name === "age");
    expect(age).toMatchObject({ type: "number", min: 36, max: 52 });
    expect(age?.mean).toBeCloseTo((36 + 45 + 52) / 3, 3);
  });

  it("omits stats on non-numeric columns", async () => {
    const result = await readCsvSource(toDataUri(SAMPLE_CSV));
    if ("error" in result) throw new Error(result.error);
    const city = result.columns.find((column) => column.name === "city");
    expect(city).not.toHaveProperty("min");
    expect(city).not.toHaveProperty("mean");
  });

  it("caps the sample with maxRows while totals cover the whole file", async () => {
    const bigCsv =
      "n\n" + Array.from({ length: 50 }, (_, index) => String(index)).join("\n");
    const result = await readCsvSource(toDataUri(bigCsv), { maxRows: 5 });
    if ("error" in result) throw new Error(result.error);
    expect(result.sampleRowCount).toBe(5);
    expect(result.totalRows).toBe(50);
    expect(result.sampleTruncated).toBe(true);
    const column = result.columns[0];
    expect(column).toMatchObject({ type: "number", min: 0, max: 49 });
  });

  it("defaults the sample to 20 rows", async () => {
    const bigCsv =
      "n\n" + Array.from({ length: 50 }, (_, index) => String(index)).join("\n");
    const result = await readCsvSource(toDataUri(bigCsv));
    if ("error" in result) throw new Error(result.error);
    expect(result.sampleRowCount).toBe(20);
  });

  it("restricts sample and stats to selected columns (case-insensitive)", async () => {
    const result = await readCsvSource(toDataUri(SAMPLE_CSV), {
      columns: ["Name", "AGE"],
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.headers).toEqual(["name", "age"]);
    expect(result.columnCount).toBe(2);
    expect(result.sampleRows[0]).toEqual({ name: "Ada", age: "36" });
  });

  it("errors with available headers when a selected column is missing", async () => {
    const result = await readCsvSource(toDataUri(SAMPLE_CSV), {
      columns: ["salary"],
    });
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("Column(s) not found: salary"),
    );
    expect((result as { error: string }).error).toContain("Available: name, age");
  });

  it("honors an explicit delimiter override", async () => {
    const result = await readCsvSource(toDataUri("a;b\n1;2"), {
      delimiter: ";",
    });
    if ("error" in result) throw new Error(result.error);
    expect(result.headers).toEqual(["a", "b"]);
    expect(result.totalRows).toBe(1);
  });

  it("rejects multi-character delimiters", async () => {
    const result = await readCsvSource(toDataUri("a,b\n1,2"), {
      delimiter: ";;",
    });
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("Invalid delimiter"),
    );
  });

  it("names blank headers Column_N", async () => {
    const result = await readCsvSource(toDataUri(",b\n1,2"));
    if ("error" in result) throw new Error(result.error);
    expect(result.headers).toEqual(["Column_1", "b"]);
  });

  it("labels all-empty columns as empty", async () => {
    const result = await readCsvSource(toDataUri("a,b\n1,\n2,"));
    if ("error" in result) throw new Error(result.error);
    const emptyColumn = result.columns.find((column) => column.name === "b");
    expect(emptyColumn?.type).toBe("empty");
  });
});

describe("readCsvSource — input validation", () => {
  it("returns the standard re-attach error for the unresolved sentinel", async () => {
    const result = await readCsvSource("attached");
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("No attached document was found"),
    );
  });

  it("rejects non-URL, non-data sources", async () => {
    const result = await readCsvSource("just some text");
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("Invalid source"),
    );
  });

  it("rejects an empty source", async () => {
    const result = await readCsvSource("");
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("'source' is required"),
    );
  });

  it("rejects an empty CSV body", async () => {
    const result = await readCsvSource(toDataUri("   \n  "));
    expect(result).toHaveProperty(
      "error",
      expect.stringContaining("empty"),
    );
  });

  it("accepts non-base64 (URL-encoded) data URIs", async () => {
    const result = await readCsvSource(
      `data:text/csv,${encodeURIComponent("a,b\n1,2")}`,
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.headers).toEqual(["a", "b"]);
  });

  it("echoes a short label for data URIs instead of the payload", async () => {
    const uri = toDataUri(SAMPLE_CSV);
    const result = await readCsvSource(uri);
    if ("error" in result) throw new Error(result.error);
    expect(result.source).toMatch(/^data: URI \(\d+ chars\)$/);
    expect(result.source.length).toBeLessThan(60);
  });
});
