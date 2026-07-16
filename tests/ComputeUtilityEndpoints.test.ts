import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createTestApp } from "./testApp.ts";
import computeRoutes from "../src/routes/ComputeRoutes.ts";

vi.mock("../src/models/ThreeDimensionalScene.ts", () => ({
  saveThreeDimensionalScene: vi.fn(),
  getThreeDimensionalScene: vi.fn(),
  setupThreeDimensionalSceneCollection: vi.fn(),
}));

vi.mock("../src/models/TurtleDrawing.ts", () => ({
  saveTurtleDrawing: vi.fn(),
  getTurtleDrawing: vi.fn(),
  setupTurtleDrawingCollection: vi.fn(),
}));

const app = createTestApp("/compute", computeRoutes);

// ═══════════════════════════════════════════════════════════════
//  3. Unit Conversion — /compute/units/convert
// ═══════════════════════════════════════════════════════════════

describe("GET /compute/units/convert", () => {
  it("converts kilograms to pounds", async () => {
    const response = await request(app).get(
      "/compute/units/convert?value=1&from=kg&to=lb",
    );
    expect(response.status).toBe(200);
    expect(response.body.value).toBe(1);
    expect(response.body.from.abbr).toBe("kg");
    expect(response.body.to.abbr).toBe("lb");
    expect(typeof response.body.result).toBe("number");
    expect(response.body.result).toBeCloseTo(2.20462, 2);
  });

  it("converts meters to feet", async () => {
    const response = await request(app).get(
      "/compute/units/convert?value=10&from=m&to=ft",
    );
    expect(response.status).toBe(200);
    expect(response.body.result).toBeCloseTo(32.8084, 1);
  });

  it("returns 400 when missing required parameters", async () => {
    const response = await request(app).get(
      "/compute/units/convert?value=1&from=kg",
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toBeTruthy();
  });

  it("returns 400 for invalid units", async () => {
    const response = await request(app).get(
      "/compute/units/convert?value=1&from=kg&to=invalidunit",
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toBeTruthy();
  });

  it("returns 400 for non-numeric value", async () => {
    const response = await request(app).get(
      "/compute/units/convert?value=abc&from=kg&to=lb",
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("number");
  });
});

describe("GET /compute/units/list", () => {
  it("returns all measures when no filter is specified", async () => {
    const response = await request(app).get("/compute/units/list");
    expect(response.status).toBe(200);
    expect(response.body.measureCount).toBeGreaterThan(0);
    expect(typeof response.body.measures).toBe("object");
  });

  it("returns units for a specific measure", async () => {
    const response = await request(app).get(
      "/compute/units/list?measure=mass",
    );
    expect(response.status).toBe(200);
    expect(response.body.measure).toBe("mass");
    expect(response.body.count).toBeGreaterThan(0);
    expect(Array.isArray(response.body.units)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  4. DateTime Parsing & Arithmetic — /compute/datetime/parse
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/datetime/parse", () => {
  it("returns 400 when operation is missing", async () => {
    const response = await request(app)
      .post("/compute/datetime/parse")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("operation");
  });

  it("returns current timestamp for 'now' operation", async () => {
    const response = await request(app)
      .post("/compute/datetime/parse")
      .send({ operation: "now" });
    expect(response.status).toBe(200);
    expect(response.body.operation).toBe("now");
    expect(response.body.iso).toBeTruthy();
    expect(response.body.unix).toBeGreaterThan(0);
  });

  it("parses an ISO date string", async () => {
    const response = await request(app)
      .post("/compute/datetime/parse")
      .send({ operation: "parse", date: "2025-06-15T10:30:00Z" });
    expect(response.status).toBe(200);
    expect(response.body.operation).toBe("parse");
    expect(response.body.dayOfWeek).toBe("Sunday");
    expect(response.body.isWeekend).toBe(true);
    expect(typeof response.body.weekNumber).toBe("number");
  });

  it("computes diff between two dates", async () => {
    const response = await request(app)
      .post("/compute/datetime/parse")
      .send({
        operation: "diff",
        date: "2025-01-01T00:00:00Z",
        date2: "2025-01-08T00:00:00Z",
      });
    expect(response.status).toBe(200);
    expect(response.body.days).toBe(7);
    expect(response.body.weeks).toBe(1);
    expect(response.body.hours).toBe(168);
  });

  it("adds days to a date", async () => {
    const response = await request(app)
      .post("/compute/datetime/parse")
      .send({
        operation: "add",
        date: "2025-06-01T00:00:00Z",
        amount: 5,
        unit: "days",
      });
    expect(response.status).toBe(200);
    expect(response.body.iso).toContain("2025-06-06");
  });

  it("subtracts months from a date", async () => {
    const response = await request(app)
      .post("/compute/datetime/parse")
      .send({
        operation: "subtract",
        date: "2025-06-15T00:00:00Z",
        amount: 3,
        unit: "months",
      });
    expect(response.status).toBe(200);
    expect(response.body.iso).toContain("2025-03-15");
  });

  it("computes startOf a month", async () => {
    const response = await request(app)
      .post("/compute/datetime/parse")
      .send({
        operation: "startOf",
        date: "2025-06-15T14:30:00Z",
        unit: "month",
      });
    expect(response.status).toBe(200);
    expect(response.body.iso).toContain("2025-06-01");
  });

  it("computes endOf a day", async () => {
    const response = await request(app)
      .post("/compute/datetime/parse")
      .send({
        operation: "endOf",
        date: "2025-06-15T14:30:00Z",
        unit: "day",
      });
    expect(response.status).toBe(200);
    // The ISO result reflects local timezone conversion to UTC,
    // so we just verify the response shape is correct
    expect(response.body.iso).toBeTruthy();
    expect(response.body.iso).toContain("59:59");
  });

  it("validates a correct date", async () => {
    const response = await request(app)
      .post("/compute/datetime/parse")
      .send({ operation: "isValid", date: "2025-06-15T00:00:00Z" });
    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(true);
  });

  it("validates an invalid date", async () => {
    const response = await request(app)
      .post("/compute/datetime/parse")
      .send({ operation: "isValid", date: "not-a-date" });
    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(false);
  });

  it("returns 400 for unknown operation", async () => {
    const response = await request(app)
      .post("/compute/datetime/parse")
      .send({ operation: "bogus" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Unknown operation");
  });
});

// ═══════════════════════════════════════════════════════════════
//  5. JSON Transform — /compute/json/transform
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/json/transform", () => {
  it("returns 400 when data is missing", async () => {
    const response = await request(app)
      .post("/compute/json/transform")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("data");
  });

  it("extracts values using JSONPath expression", async () => {
    const response = await request(app)
      .post("/compute/json/transform")
      .send({
        data: { users: [{ name: "Alice" }, { name: "Bob" }] },
        expression: "$.users[*].name",
      });
    expect(response.status).toBe(200);
    expect(response.body.result).toEqual(["Alice", "Bob"]);
    expect(response.body.count).toBe(2);
  });

  it("sorts an array by key", async () => {
    const response = await request(app)
      .post("/compute/json/transform")
      .send({
        data: [
          { name: "Charlie", age: 25 },
          { name: "Alice", age: 30 },
          { name: "Bob", age: 20 },
        ],
        operations: [{ type: "sort", key: "age" }],
      });
    expect(response.status).toBe(200);
    expect(response.body.result[0].name).toBe("Bob");
    expect(response.body.result[2].name).toBe("Alice");
  });

  it("filters an array by value", async () => {
    const response = await request(app)
      .post("/compute/json/transform")
      .send({
        data: [
          { name: "Alice", active: true },
          { name: "Bob", active: false },
          { name: "Charlie", active: true },
        ],
        operations: [
          { type: "filter", key: "active", value: true, operator: "eq" },
        ],
      });
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
  });

  it("picks specific keys from objects", async () => {
    const response = await request(app)
      .post("/compute/json/transform")
      .send({
        data: [
          { name: "Alice", age: 30, email: "alice@example.com" },
          { name: "Bob", age: 25, email: "bob@example.com" },
        ],
        operations: [{ type: "pick", keys: ["name", "age"] }],
      });
    expect(response.status).toBe(200);
    expect(response.body.result[0]).toEqual({ name: "Alice", age: 30 });
    expect(response.body.result[0].email).toBeUndefined();
  });

  it("groups by a key", async () => {
    const response = await request(app)
      .post("/compute/json/transform")
      .send({
        data: [
          { department: "Engineering", name: "Alice" },
          { department: "Marketing", name: "Bob" },
          { department: "Engineering", name: "Charlie" },
        ],
        operations: [{ type: "groupBy", key: "department" }],
      });
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.result["Engineering"])).toBe(true);
    expect(response.body.result["Engineering"].length).toBe(2);
  });

  it("computes sum of a numeric key", async () => {
    const response = await request(app)
      .post("/compute/json/transform")
      .send({
        data: [{ score: 10 }, { score: 20 }, { score: 30 }],
        operations: [{ type: "sum", key: "score" }],
      });
    expect(response.status).toBe(200);
    expect(response.body.result).toBe(60);
  });

  it("chains multiple operations", async () => {
    const response = await request(app)
      .post("/compute/json/transform")
      .send({
        data: [
          { name: "Alice", score: 90 },
          { name: "Bob", score: 70 },
          { name: "Charlie", score: 85 },
          { name: "Diana", score: 60 },
        ],
        operations: [
          { type: "filter", key: "score", value: 75, operator: "gte" },
          { type: "sort", key: "score", order: "desc" },
          { type: "limit", count: 2 },
        ],
      });
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(response.body.result[0].name).toBe("Alice");
    expect(response.body.result[1].name).toBe("Charlie");
  });
});

// ═══════════════════════════════════════════════════════════════
//  6. CSV Generation — /compute/csv
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/csv", () => {
  it("returns 400 when data is missing", async () => {
    const response = await request(app)
      .post("/compute/csv")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("data");
  });

  it("returns 400 when data is an empty array", async () => {
    const response = await request(app)
      .post("/compute/csv")
      .send({ data: [] });
    expect(response.status).toBe(400);
  });

  it("generates CSV from data array", async () => {
    const response = await request(app)
      .post("/compute/csv")
      .send({
        data: [
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 },
        ],
      });
    expect(response.status).toBe(200);
    expect(response.body.rows).toBe(2);
    expect(response.body.columns).toBe(2);
    expect(response.body.downloadUrl).toBeTruthy();
    expect(response.body.csvId).toBeTruthy();
  });

  it("uses custom delimiter", async () => {
    const response = await request(app)
      .post("/compute/csv")
      .send({
        data: [{ name: "Alice", age: 30 }],
        delimiter: "\t",
      });
    expect(response.status).toBe(200);
    expect(response.body.rows).toBe(1);
  });

  it("uses explicit column selection", async () => {
    const response = await request(app)
      .post("/compute/csv")
      .send({
        data: [{ name: "Alice", age: 30, email: "alice@example.com" }],
        columns: ["name", "age"],
      });
    expect(response.status).toBe(200);
    expect(response.body.columns).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
//  CSV Analysis — /compute/csv/analyze
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/csv/analyze", () => {
  it("returns 400 when data is missing", async () => {
    const response = await request(app)
      .post("/compute/csv/analyze")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("data");
  });

  it("analyzes array of objects with numeric columns", async () => {
    const response = await request(app)
      .post("/compute/csv/analyze")
      .send({
        data: [
          { name: "Alice", score: 90 },
          { name: "Bob", score: 70 },
          { name: "Charlie", score: 80 },
        ],
      });
    expect(response.status).toBe(200);
    expect(response.body.rowCount).toBe(3);
    expect(response.body.columnCount).toBe(2);
    expect(response.body.statistics.score.type).toBe("numeric");
    expect(response.body.statistics.score.mean).toBe(80);
    expect(response.body.statistics.score.min).toBe(70);
    expect(response.body.statistics.score.max).toBe(90);
    expect(response.body.statistics.name.type).toBe("categorical");
  });

  it("analyzes raw CSV string input", async () => {
    const response = await request(app)
      .post("/compute/csv/analyze")
      .send({ data: "name,value\nAlice,10\nBob,20\nCharlie,30" });
    expect(response.status).toBe(200);
    expect(response.body.rowCount).toBe(3);
    expect(response.body.statistics.value.type).toBe("numeric");
    expect(response.body.statistics.value.mean).toBe(20);
  });

  it("analyzes specific columns when selected", async () => {
    const response = await request(app)
      .post("/compute/csv/analyze")
      .send({
        data: [
          { name: "Alice", score: 90, grade: "A" },
          { name: "Bob", score: 70, grade: "C" },
        ],
        columns: ["score"],
      });
    expect(response.status).toBe(200);
    expect(response.body.statistics.score).toBeTruthy();
    expect(response.body.statistics.name).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  7. QR Code Generation — /compute/qr
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/qr", () => {
  it("returns 400 when data is missing", async () => {
    const response = await request(app)
      .post("/compute/qr")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("data");
  });

  it("returns 400 when data exceeds capacity", async () => {
    const response = await request(app)
      .post("/compute/qr")
      .send({ data: "x".repeat(5000) });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("capacity");
  });

  it("generates a QR code from a URL", async () => {
    const response = await request(app)
      .post("/compute/qr")
      .send({ data: "https://example.com" });
    expect(response.status).toBe(200);
    expect(response.body.qrImageUrl).toBeTruthy();
    expect(response.body.qrId).toBeTruthy();
    expect(response.body.dataLength).toBe(19);
  });

  it("accepts custom size and error correction parameters", async () => {
    const response = await request(app)
      .post("/compute/qr")
      .send({
        data: "test data",
        size: 400,
        errorCorrection: "H",
        darkColor: "#333333",
        lightColor: "#eeeeee",
      });
    expect(response.status).toBe(200);
    expect(response.body.qrId).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
//  7b. Barcode / QR Scanning — /compute/barcode/scan
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/barcode/scan", () => {
  it("returns 400 when input is missing", async () => {
    const response = await request(app).post("/compute/barcode/scan").send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("input");
  });

  it("decodes a generated QR code (round-trip with the QR tool)", async () => {
    const qrcode = await import("qrcode");
    const png = await qrcode.default.toBuffer("https://rod.dev/roundtrip?x=1", {
      width: 300,
    });
    const response = await request(app)
      .post("/compute/barcode/scan")
      .send({ input: `data:image/png;base64,${png.toString("base64")}` });

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.barcodes[0].text).toBe("https://rod.dev/roundtrip?x=1");
    expect(response.body.barcodes[0].format).toBe("QRCode");
    expect(response.body.message).toContain("QRCode");
  }, 30_000);

  it("reports zero symbols for an image without codes", async () => {
    const sharp = (await import("sharp")).default;
    const blank = await sharp({
      create: {
        width: 120,
        height: 120,
        channels: 3,
        background: "#ffffff",
      },
    })
      .png()
      .toBuffer();
    const response = await request(app)
      .post("/compute/barcode/scan")
      .send({ input: `data:image/png;base64,${blank.toString("base64")}` });

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(0);
    expect(response.body.message).toContain("No barcode");
  }, 30_000);
});

// ═══════════════════════════════════════════════════════════════
//  7c. Code → Image — /compute/code-image
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/code-image", () => {
  it("returns 400 when code is missing", async () => {
    const response = await request(app).post("/compute/code-image").send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("code");
  });

  it("rejects code over the line cap", async () => {
    const response = await request(app)
      .post("/compute/code-image")
      .send({ code: "x = 1\n".repeat(400) });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("lines");
  });

  it("renders a code card PNG served by the fallback endpoint", async () => {
    const response = await request(app)
      .post("/compute/code-image")
      .send({
        code: 'const answer: number = 42;\nconsole.log("answer", answer);',
        lang: "typescript",
        title: "example.ts",
      });

    expect(response.status).toBe(200);
    expect(response.body.codeImageUrl).toContain("/compute/code-image/render?id=");
    expect(response.body.codeImageId).toBeTruthy();
    expect(response.body.lineCount).toBe(2);
    expect(response.body.display?.kind).toBe("image");

    const image = await request(app).get(
      `/compute/code-image/render?id=${response.body.codeImageId}`,
    );
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");
    expect(image.body.subarray(0, 4).toString("hex")).toBe("89504e47");
  }, 60_000);

  it("falls back to plain text for unknown languages and says so", async () => {
    const response = await request(app)
      .post("/compute/code-image")
      .send({ code: "nuqneH tera'ngan", lang: "klingon" });

    expect(response.status).toBe(200);
    expect(response.body.lang).toBe("text");
    expect(response.body.message).toContain("klingon");
  }, 60_000);

  it("rejects unknown themes with the available list", async () => {
    const response = await request(app)
      .post("/compute/code-image")
      .send({ code: "x = 1", theme: "hotdog-stand" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("github-dark");
  });
});

// ═══════════════════════════════════════════════════════════════
//  8. LaTeX Rendering — /compute/latex
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/latex", () => {
  it("returns 400 when latex is missing", async () => {
    const response = await request(app)
      .post("/compute/latex")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("latex");
  });

  it("returns 400 when latex exceeds 10k characters", async () => {
    const response = await request(app)
      .post("/compute/latex")
      .send({ latex: "x".repeat(10_001) });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("10,000");
  });

  it("generates a LaTeX embed URL", async () => {
    const response = await request(app)
      .post("/compute/latex")
      .send({ latex: "E = mc^2" });
    expect(response.status).toBe(200);
    expect(response.body.latexEmbedUrl).toBeTruthy();
    expect(response.body.latexId).toBeTruthy();
  });

  it("accepts displayMode parameter", async () => {
    const response = await request(app)
      .post("/compute/latex")
      .send({ latex: "\\int_0^1 x^2 dx", displayMode: false });
    expect(response.status).toBe(200);
    expect(response.body.latexId).toBeTruthy();
  });
});

describe("GET /compute/latex/embed", () => {
  it("returns 400 when id is missing", async () => {
    const response = await request(app).get("/compute/latex/embed");
    expect(response.status).toBe(400);
  });

  it("returns 404 for nonexistent id", async () => {
    const response = await request(app).get(
      "/compute/latex/embed?id=nonexistent",
    );
    expect(response.status).toBe(404);
  });

  it("returns an HTML embed for a valid LaTeX id", async () => {
    const createResponse = await request(app)
      .post("/compute/latex")
      .send({ latex: "x^2 + y^2 = r^2" });
    expect(createResponse.status).toBe(200);

    const embedResponse = await request(app).get(
      `/compute/latex/embed?id=${createResponse.body.latexId}`,
    );
    expect(embedResponse.status).toBe(200);
    expect(embedResponse.headers["content-type"]).toContain("text/html");
    expect(embedResponse.text).toContain("katex");
  });
});

// ═══════════════════════════════════════════════════════════════
//  9. Mermaid Diagram — /compute/diagram
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/diagram", () => {
  it("returns 400 when definition is missing", async () => {
    const response = await request(app)
      .post("/compute/diagram")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("definition");
  });

  it("returns 400 when definition exceeds 50k characters", async () => {
    const response = await request(app)
      .post("/compute/diagram")
      .send({ definition: "x".repeat(50_001) });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("50,000");
  });

  it("generates a diagram embed URL from Mermaid syntax", async () => {
    const response = await request(app)
      .post("/compute/diagram")
      .send({ definition: "graph TD\n  A-->B\n  B-->C" });
    expect(response.status).toBe(200);
    expect(response.body.diagramEmbedUrl).toBeTruthy();
    expect(response.body.diagramId).toBeTruthy();
  });

  it("accepts a custom theme", async () => {
    const response = await request(app)
      .post("/compute/diagram")
      .send({
        definition: "graph LR\n  Start-->End",
        theme: "forest",
      });
    expect(response.status).toBe(200);
    expect(response.body.diagramId).toBeTruthy();
  });
});

describe("GET /compute/diagram/embed", () => {
  it("returns 400 when id is missing", async () => {
    const response = await request(app).get("/compute/diagram/embed");
    expect(response.status).toBe(400);
  });

  it("returns 404 for nonexistent id", async () => {
    const response = await request(app).get(
      "/compute/diagram/embed?id=nonexistent",
    );
    expect(response.status).toBe(404);
  });

  it("returns an HTML embed for a valid diagram id", async () => {
    const createResponse = await request(app)
      .post("/compute/diagram")
      .send({ definition: "flowchart TD\n  A-->B" });
    expect(createResponse.status).toBe(200);

    const embedResponse = await request(app).get(
      `/compute/diagram/embed?id=${createResponse.body.diagramId}`,
    );
    expect(embedResponse.status).toBe(200);
    expect(embedResponse.headers["content-type"]).toContain("text/html");
    expect(embedResponse.text).toContain("mermaid");
  });
});

// ═══════════════════════════════════════════════════════════════
//  10. Text Diff — /compute/diff
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/diff", () => {
  it("returns 400 when inputs are missing", async () => {
    const response = await request(app)
      .post("/compute/diff")
      .send({ textA: "hello" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("textB");
  });

  it("detects identical texts", async () => {
    const response = await request(app)
      .post("/compute/diff")
      .send({ textA: "hello world", textB: "hello world" });
    expect(response.status).toBe(200);
    expect(response.body.identical).toBe(true);
    expect(response.body.stats.additions).toBe(0);
    expect(response.body.stats.deletions).toBe(0);
  });

  it("detects line-level changes by default", async () => {
    const response = await request(app)
      .post("/compute/diff")
      .send({ textA: "line1\nline2\n", textB: "line1\nline3\n" });
    expect(response.status).toBe(200);
    expect(response.body.identical).toBe(false);
    expect(response.body.mode).toBe("lines");
    expect(response.body.stats.additions).toBeGreaterThan(0);
    expect(response.body.stats.deletions).toBeGreaterThan(0);
    expect(response.body.patch).toBeTruthy();
  });

  it("supports word-level diff mode", async () => {
    const response = await request(app)
      .post("/compute/diff")
      .send({ textA: "hello world", textB: "hello earth", mode: "words" });
    expect(response.status).toBe(200);
    expect(response.body.mode).toBe("words");
    expect(response.body.changes.length).toBeGreaterThan(0);
  });

  it("supports character-level diff mode", async () => {
    const response = await request(app)
      .post("/compute/diff")
      .send({ textA: "abc", textB: "axc", mode: "chars" });
    expect(response.status).toBe(200);
    expect(response.body.mode).toBe("chars");
  });

  it("supports JSON diff mode", async () => {
    const response = await request(app)
      .post("/compute/diff")
      .send({
        textA: JSON.stringify({ name: "Alice", age: 30 }),
        textB: JSON.stringify({ name: "Alice", age: 31 }),
        mode: "json",
      });
    expect(response.status).toBe(200);
    expect(response.body.mode).toBe("json");
    expect(response.body.identical).toBe(false);
  });

  it("returns 400 for invalid JSON in json mode", async () => {
    const response = await request(app)
      .post("/compute/diff")
      .send({ textA: "not json", textB: "also not json", mode: "json" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("JSON");
  });
});

// ═══════════════════════════════════════════════════════════════
//  11. Cryptographic Hashing — /compute/hash
// ═══════════════════════════════════════════════════════════════

describe("GET /compute/hash", () => {
  it("returns 400 when data is missing", async () => {
    const response = await request(app).get("/compute/hash");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("data");
  });

  it("generates a SHA-256 hash by default", async () => {
    const response = await request(app).get("/compute/hash?data=hello");
    expect(response.status).toBe(200);
    expect(response.body.algorithm).toBe("sha256");
    expect(response.body.encoding).toBe("hex");
    expect(response.body.hash).toBeTruthy();
    expect(response.body.dataLength).toBe(5);
  });

  it("generates an MD5 hash", async () => {
    const response = await request(app).get(
      "/compute/hash?data=hello&algorithm=md5",
    );
    expect(response.status).toBe(200);
    expect(response.body.algorithm).toBe("md5");
    expect(response.body.hash).toBe("5d41402abc4b2a76b9719d911017c592");
  });

  it("generates a hash with base64 encoding", async () => {
    const response = await request(app).get(
      "/compute/hash?data=hello&encoding=base64",
    );
    expect(response.status).toBe(200);
    expect(response.body.encoding).toBe("base64");
  });

  it("generates an HMAC hash with a key", async () => {
    const response = await request(app).get(
      "/compute/hash?data=hello&key=secret",
    );
    expect(response.status).toBe(200);
    expect(response.body.algorithm).toBe("hmac-sha256");
  });

  it("returns 400 for an invalid algorithm", async () => {
    const response = await request(app).get(
      "/compute/hash?data=hello&algorithm=bogus",
    );
    expect(response.status).toBe(400);
    expect(response.body.supportedAlgorithms).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
//  UUID Generation — /compute/uuid
// ═══════════════════════════════════════════════════════════════

describe("GET /compute/uuid", () => {
  it("generates unique identifiers", async () => {
    const response = await request(app).get("/compute/uuid");
    expect(response.status).toBe(200);
    expect(response.body.uuid).toBeTruthy();
    expect(response.body.v4).toBeTruthy();
    expect(response.body.hex).toBeTruthy();
    expect(response.body.base64).toBeTruthy();
    expect(response.body.uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

// ═══════════════════════════════════════════════════════════════
//  12. Regex Tester — /compute/regex
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/regex", () => {
  it("returns 400 when pattern or text is missing", async () => {
    const response = await request(app)
      .post("/compute/regex")
      .send({ pattern: "\\d+" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("text");
  });

  it("finds matches in text", async () => {
    const response = await request(app)
      .post("/compute/regex")
      .send({ pattern: "\\d+", text: "abc 123 def 456" });
    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(true);
    expect(response.body.matchCount).toBe(2);
    expect(response.body.matches[0].match).toBe("123");
    expect(response.body.matches[1].match).toBe("456");
  });

  it("returns named capture groups", async () => {
    const response = await request(app)
      .post("/compute/regex")
      .send({
        pattern: "(?<year>\\d{4})-(?<month>\\d{2})",
        text: "Date: 2025-06",
        flags: "g",
      });
    expect(response.status).toBe(200);
    expect(response.body.matches[0].namedGroups.year).toBe("2025");
    expect(response.body.matches[0].namedGroups.month).toBe("06");
  });

  it("reports invalid regex patterns gracefully", async () => {
    const response = await request(app)
      .post("/compute/regex")
      .send({ pattern: "(unclosed", text: "test" });
    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(false);
    expect(response.body.error).toBeTruthy();
  });

  it("handles explicit flags", async () => {
    const response = await request(app)
      .post("/compute/regex")
      .send({ pattern: "\\d+", text: "123 456", flags: "i" });
    expect(response.status).toBe(200);
    // Non-global flag: only matches the first occurrence
    expect(response.body.matchCount).toBe(1);
    expect(response.body.matches[0].match).toBe("123");
  });
});

// ═══════════════════════════════════════════════════════════════
//  13. Encode / Decode — /compute/encode
// ═══════════════════════════════════════════════════════════════

describe("GET /compute/encode", () => {
  it("returns 400 when data or format is missing", async () => {
    const response = await request(app).get("/compute/encode?data=hello");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("format");
  });

  it("encodes text to base64", async () => {
    const response = await request(app).get(
      "/compute/encode?data=hello&format=base64",
    );
    expect(response.status).toBe(200);
    expect(response.body.format).toBe("base64");
    expect(response.body.direction).toBe("encode");
    expect(response.body.result).toBe("aGVsbG8=");
  });

  it("decodes base64 text", async () => {
    const response = await request(app).get(
      "/compute/encode?data=aGVsbG8=&format=base64&direction=decode",
    );
    expect(response.status).toBe(200);
    expect(response.body.result).toBe("hello");
  });

  it("encodes text to hex", async () => {
    const response = await request(app).get(
      "/compute/encode?data=hi&format=hex",
    );
    expect(response.status).toBe(200);
    expect(response.body.result).toBe("6869");
  });

  it("decodes hex text", async () => {
    const response = await request(app).get(
      "/compute/encode?data=6869&format=hex&direction=decode",
    );
    expect(response.status).toBe(200);
    expect(response.body.result).toBe("hi");
  });

  it("URL-encodes text", async () => {
    const response = await request(app).get(
      "/compute/encode?data=hello%20world%26foo&format=url",
    );
    expect(response.status).toBe(200);
    expect(response.body.format).toBe("url");
  });

  it("applies ROT13 cipher", async () => {
    const response = await request(app).get(
      "/compute/encode?data=hello&format=rot13",
    );
    expect(response.status).toBe(200);
    expect(response.body.result).toBe("uryyb");
  });

  it("encodes text to binary", async () => {
    const response = await request(app).get(
      "/compute/encode?data=AB&format=binary",
    );
    expect(response.status).toBe(200);
    expect(response.body.result).toBe("01000001 01000010");
  });

  it("returns 400 for unknown format", async () => {
    const response = await request(app).get(
      "/compute/encode?data=hello&format=unknown",
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Unknown format");
  });
});

// ═══════════════════════════════════════════════════════════════
//  14. Color Converter — /compute/color/convert
// ═══════════════════════════════════════════════════════════════

describe("GET /compute/color/convert", () => {
  it("returns 400 when color is missing", async () => {
    const response = await request(app).get("/compute/color/convert");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("color");
  });

  it("converts a hex color to all formats", async () => {
    const response = await request(app).get(
      "/compute/color/convert?color=%23ff0000",
    );
    expect(response.status).toBe(200);
    expect(response.body.hex).toBe("#ff0000");
    expect(response.body.rgbValues.r).toBe(255);
    expect(response.body.rgbValues.g).toBe(0);
    expect(response.body.rgbValues.b).toBe(0);
    expect(response.body.hslValues.h).toBe(0);
    expect(response.body.hsvValues.h).toBe(0);
    expect(response.body.cmykValues).toEqual({ c: 0, m: 100, y: 100, k: 0 });
  });

  it("converts a named CSS color", async () => {
    const response = await request(app).get(
      "/compute/color/convert?color=tomato",
    );
    expect(response.status).toBe(200);
    expect(response.body.hex).toBe("#ff6347");
  });

  it("converts an RGB function color", async () => {
    const response = await request(app).get(
      "/compute/color/convert?color=rgb(0,%20128,%20255)",
    );
    expect(response.status).toBe(200);
    expect(response.body.rgbValues.r).toBe(0);
    expect(response.body.rgbValues.g).toBe(128);
    expect(response.body.rgbValues.b).toBe(255);
  });

  it("generates a complementary palette", async () => {
    const response = await request(app).get(
      "/compute/color/convert?color=%23ff0000&palette=complementary",
    );
    expect(response.status).toBe(200);
    expect(response.body.palette).toBeTruthy();
    expect(response.body.palette.type).toBe("complementary");
    expect(response.body.palette.colors.length).toBe(2);
  });

  it("generates a triadic palette", async () => {
    const response = await request(app).get(
      "/compute/color/convert?color=%23ff0000&palette=triadic",
    );
    expect(response.status).toBe(200);
    expect(response.body.palette.colors.length).toBe(3);
  });

  it("returns 400 for invalid color string", async () => {
    const response = await request(app).get(
      "/compute/color/convert?color=notacolor",
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Cannot parse color");
  });
});

// ═══════════════════════════════════════════════════════════════
//  Think — /compute/think
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/think", () => {
  it("acknowledges any input", async () => {
    const response = await request(app)
      .post("/compute/think")
      .send({ thought: "I need to analyze this further" });
    expect(response.status).toBe(200);
    expect(response.body.acknowledged).toBe(true);
  });

  it("acknowledges empty body", async () => {
    const response = await request(app)
      .post("/compute/think")
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.acknowledged).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Cron Expression Parser — /compute/cron/parse
// ═══════════════════════════════════════════════════════════════

describe("GET /compute/cron/parse", () => {
  it("returns 400 when expression is missing", async () => {
    const response = await request(app).get("/compute/cron/parse");
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("expression");
  });

  it("returns 400 for incorrect number of fields", async () => {
    const response = await request(app).get(
      "/compute/cron/parse?expression=*%20*%20*",
    );
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("5 fields");
  });

  it("parses a simple every-5-minutes expression", async () => {
    const response = await request(app).get(
      "/compute/cron/parse?expression=*/5%20*%20*%20*%20*",
    );
    expect(response.status).toBe(200);
    expect(response.body.expression).toBe("*/5 * * * *");
    expect(response.body.fields.minute.values).toEqual([
      0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55,
    ]);
    expect(response.body.explanation).toBeTruthy();
    expect(response.body.nextExecutions.length).toBe(5);
  });

  it("parses a specific time expression (9:30 AM weekdays)", async () => {
    const response = await request(app).get(
      "/compute/cron/parse?expression=30%209%20*%20*%201-5",
    );
    expect(response.status).toBe(200);
    expect(response.body.fields.minute.values).toEqual([30]);
    expect(response.body.fields.hour.values).toEqual([9]);
    expect(response.body.fields.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
  });

  it("accepts custom count for next executions", async () => {
    const response = await request(app).get(
      "/compute/cron/parse?expression=0%20*%20*%20*%20*&count=10",
    );
    expect(response.status).toBe(200);
    expect(response.body.nextExecutions.length).toBe(10);
  });

  it("returns 400 for invalid field values", async () => {
    const response = await request(app).get(
      "/compute/cron/parse?expression=99%20*%20*%20*%20*",
    );
    expect(response.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Sleep — /compute/sleep
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/sleep", () => {
  it("acknowledges with the correct sleep duration", async () => {
    const response = await request(app)
      .post("/compute/sleep")
      .send({ duration_seconds: 1, reason: "test pause" });

    expect(response.status).toBe(200);
    expect(response.body.acknowledged).toBe(true);
    expect(response.body.slept_seconds).toBe(1);
    expect(response.body.reason).toBe("test pause");
  });

  it("defaults duration to 5 seconds when falsy", async () => {
    const response = await request(app)
      .post("/compute/sleep")
      .send({ duration_seconds: 0 });
    expect(response.status).toBe(200);
    // Implementation: Math.max(1, Math.min(120, 0 || 5)) = 5
    expect(response.body.slept_seconds).toBe(5);
  });

  it("clamps duration to 120 seconds maximum", async () => {
    const response = await request(app)
      .post("/compute/sleep")
      .send({ duration_seconds: 999 });
    expect(response.status).toBe(200);
    expect(response.body.slept_seconds).toBe(120);
  });
});

// ═══════════════════════════════════════════════════════════════
//  Synthetic Output — /compute/synthetic-output
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/synthetic-output", () => {
  it("returns 400 when data is missing", async () => {
    const response = await request(app)
      .post("/compute/synthetic-output")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("data");
  });

  it("echoes data back with acknowledgement", async () => {
    const response = await request(app)
      .post("/compute/synthetic-output")
      .send({ data: { status: "complete", count: 42 }, label: "result" });
    expect(response.status).toBe(200);
    expect(response.body.acknowledged).toBe(true);
    expect(response.body.data).toEqual({ status: "complete", count: 42 });
    expect(response.body.label).toBe("result");
    expect(response.body._synthetic).toBe(true);
  });

  it("validates data against a provided JSON schema", async () => {
    const response = await request(app)
      .post("/compute/synthetic-output")
      .send({
        data: { name: "Alice", age: "not-a-number" },
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name", "age"],
        },
      });
    expect(response.status).toBe(200);
    expect(response.body.acknowledged).toBe(true);
    expect(response.body.validationWarnings).toBeTruthy();
    expect(response.body.validationWarnings.length).toBeGreaterThan(0);
  });

  it("returns no warnings for valid data against schema", async () => {
    const response = await request(app)
      .post("/compute/synthetic-output")
      .send({
        data: { name: "Alice", age: 30 },
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
        },
      });
    expect(response.status).toBe(200);
    expect(response.body.validationWarnings).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  JSON Compare — /compute/json/compare
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/json/compare", () => {
  it("returns 400 when inputs are missing", async () => {
    const response = await request(app)
      .post("/compute/json/compare")
      .send({ a: { foo: 1 } });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("'a' and 'b'");
  });

  it("detects identical objects", async () => {
    const response = await request(app)
      .post("/compute/json/compare")
      .send({ a: { x: 1, y: 2 }, b: { x: 1, y: 2 } });
    expect(response.status).toBe(200);
    expect(response.body.isIdentical).toBe(true);
    expect(response.body.differenceCount).toBe(0);
  });

  it("detects changed values", async () => {
    const response = await request(app)
      .post("/compute/json/compare")
      .send({ a: { name: "Alice" }, b: { name: "Bob" } });
    expect(response.status).toBe(200);
    expect(response.body.isIdentical).toBe(false);
    expect(response.body.differenceCount).toBe(1);
    expect(response.body.differences[0].type).toBe("changed");
    expect(response.body.differences[0].path).toBe("name");
  });

  it("detects added keys", async () => {
    const response = await request(app)
      .post("/compute/json/compare")
      .send({ a: { x: 1 }, b: { x: 1, y: 2 } });
    expect(response.status).toBe(200);
    expect(response.body.differences.some(
      (difference: { type: string }) => difference.type === "added",
    )).toBe(true);
  });

  it("detects removed keys", async () => {
    const response = await request(app)
      .post("/compute/json/compare")
      .send({ a: { x: 1, y: 2 }, b: { x: 1 } });
    expect(response.status).toBe(200);
    expect(response.body.differences.some(
      (difference: { type: string }) => difference.type === "removed",
    )).toBe(true);
  });

  it("detects type changes", async () => {
    const response = await request(app)
      .post("/compute/json/compare")
      .send({ a: { value: 42 }, b: { value: "42" } });
    expect(response.status).toBe(200);
    expect(response.body.differences[0].type).toBe("type_changed");
  });

  it("diffs nested objects recursively", async () => {
    const response = await request(app)
      .post("/compute/json/compare")
      .send({
        a: { user: { name: "Alice", settings: { theme: "dark" } } },
        b: { user: { name: "Alice", settings: { theme: "light" } } },
      });
    expect(response.status).toBe(200);
    expect(response.body.differenceCount).toBe(1);
    expect(response.body.differences[0].path).toBe(
      "user.settings.theme",
    );
  });

  it("diffs arrays element by element", async () => {
    const response = await request(app)
      .post("/compute/json/compare")
      .send({ a: [1, 2, 3], b: [1, 2, 4] });
    expect(response.status).toBe(200);
    expect(response.body.differenceCount).toBe(1);
    expect(response.body.differences[0].path).toBe("[2]");
  });
});

// ═══════════════════════════════════════════════════════════════
//  JSON Schema Validation — /compute/json/validate
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/json/validate", () => {
  it("returns 400 when data or schema is missing", async () => {
    const response = await request(app)
      .post("/compute/json/validate")
      .send({ data: { foo: 1 } });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("schema");
  });

  it("validates correct data against a schema", async () => {
    const response = await request(app)
      .post("/compute/json/validate")
      .send({
        data: { name: "Alice", age: 30 },
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "integer", minimum: 0 },
          },
          required: ["name", "age"],
        },
      });
    expect(response.status).toBe(200);
    expect(response.body.isValid).toBe(true);
    expect(response.body.errorCount).toBe(0);
  });

  it("reports validation errors for invalid data", async () => {
    const response = await request(app)
      .post("/compute/json/validate")
      .send({
        data: { name: 123, age: "not-a-number" },
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "integer" },
          },
          required: ["name", "age"],
        },
      });
    expect(response.status).toBe(200);
    expect(response.body.isValid).toBe(false);
    expect(response.body.errorCount).toBeGreaterThan(0);
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(response.body.errors[0].message).toBeTruthy();
  });

  it("reports missing required fields", async () => {
    const response = await request(app)
      .post("/compute/json/validate")
      .send({
        data: { name: "Alice" },
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
          },
          required: ["name", "email"],
        },
      });
    expect(response.status).toBe(200);
    expect(response.body.isValid).toBe(false);
    expect(response.body.errors.some(
      (validationError: { message: string }) =>
        validationError.message.includes("required"),
    )).toBe(true);
  });

  it("validates nested object schemas", async () => {
    const response = await request(app)
      .post("/compute/json/validate")
      .send({
        data: {
          user: { name: "Alice", address: { city: "Vancouver", zip: 12345 } },
        },
        schema: {
          type: "object",
          properties: {
            user: {
              type: "object",
              properties: {
                name: { type: "string" },
                address: {
                  type: "object",
                  properties: {
                    city: { type: "string" },
                    zip: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      });
    expect(response.status).toBe(200);
    expect(response.body.isValid).toBe(true);
  });

  it("returns 400 for an invalid schema definition", async () => {
    const response = await request(app)
      .post("/compute/json/validate")
      .send({
        data: { x: 1 },
        schema: { type: "nonexistent_type" },
      });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("compilation failed");
  });
});

// ═══════════════════════════════════════════════════════════════
//  JavaScript Execution — /compute/js/execute
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/js/execute", () => {
  it("returns 400 when code is missing", async () => {
    const response = await request(app)
      .post("/compute/js/execute")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("code");
  });

  it("executes simple JavaScript and returns output", async () => {
    const response = await request(app)
      .post("/compute/js/execute")
      .send({ code: "console.log(2 + 2)" });
    expect(response.status).toBe(200);
    expect(response.body.output).toContain("4");
    expect(response.body.success).toBe(true);
  });

  it("returns error for invalid JavaScript", async () => {
    const response = await request(app)
      .post("/compute/js/execute")
      .send({ code: "throw new Error('test error')" });
    expect(response.status).toBe(200);
    expect(response.body.error).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════
//  Shell Execution — /compute/shell/execute
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/shell/execute", () => {
  it("returns 400 when command is missing", async () => {
    const response = await request(app)
      .post("/compute/shell/execute")
      .send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("command");
  });

  it("executes an allowed shell command", async () => {
    const response = await request(app)
      .post("/compute/shell/execute")
      .send({ command: "echo hello" });
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.stdout).toContain("hello");
  });
});

// ═══════════════════════════════════════════════════════════════
//  Iterative CSV building — POST /compute/csv with csvId
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/csv (iterative)", () => {
  it("appends rows to an existing CSV under the same csvId", async () => {
    const first = await request(app)
      .post("/compute/csv")
      .send({
        data: [{ name: "Ada", born: 1815 }],
        filename: "people.csv",
      });
    expect(first.status).toBe(200);
    expect(first.body.csvId).toBeTruthy();
    expect(first.body.rows).toBe(1);
    expect(first.body.newRows).toBe(1);
    expect(first.body.message).toContain(first.body.csvId);

    const second = await request(app)
      .post("/compute/csv")
      .send({
        csvId: first.body.csvId,
        data: [{ name: "Grace", born: 1906 }, { name: "Alan", born: 1912 }],
      });
    expect(second.status).toBe(200);
    expect(second.body.csvId).toBe(first.body.csvId);
    expect(second.body.rows).toBe(3);
    expect(second.body.newRows).toBe(2);

    const download = await request(app).get(
      `/compute/csv/download?id=${first.body.csvId}`,
    );
    expect(download.status).toBe(200);
    const lines = download.text.split("\n");
    expect(lines).toHaveLength(4); // header + 3 rows
    expect(lines[0]).toBe("name,born");
    expect(lines[1]).toContain("Ada");
    expect(lines[3]).toContain("Alan");
    expect(download.headers["content-disposition"]).toContain("people.csv");
  });

  it("maps appended rows onto the original columns", async () => {
    const first = await request(app)
      .post("/compute/csv")
      .send({ data: [{ a: 1, b: 2 }] });
    const second = await request(app)
      .post("/compute/csv")
      .send({
        csvId: first.body.csvId,
        data: [{ b: 20, c: 99 }], // 'c' is not a column; 'a' missing
      });
    expect(second.status).toBe(200);

    const download = await request(app).get(
      `/compute/csv/download?id=${first.body.csvId}`,
    );
    expect(download.text.split("\n")[2]).toBe(",20"); // a empty, b=20, c dropped
  });

  it("rejects an unknown csvId with recovery guidance", async () => {
    const response = await request(app)
      .post("/compute/csv")
      .send({ csvId: "does-not-exist", data: [{ a: 1 }] });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("not found or expired");
    expect(response.body.error).toContain("Omit csvId");
  });

  it("rejects the literal string 'null' as csvId", async () => {
    const response = await request(app)
      .post("/compute/csv")
      .send({ csvId: "null", data: [{ a: 1 }] });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Invalid csvId");
  });

  it("rejects conflicting columns when appending", async () => {
    const first = await request(app)
      .post("/compute/csv")
      .send({ data: [{ a: 1, b: 2 }] });
    const second = await request(app)
      .post("/compute/csv")
      .send({
        csvId: first.body.csvId,
        columns: ["x", "y"],
        data: [{ x: 1, y: 2 }],
      });
    expect(second.status).toBe(400);
    expect(second.body.error).toContain("Column mismatch");
  });

  it("rejects conflicting delimiter when appending", async () => {
    const first = await request(app)
      .post("/compute/csv")
      .send({ data: [{ a: 1 }], delimiter: ";" });
    const second = await request(app)
      .post("/compute/csv")
      .send({ csvId: first.body.csvId, data: [{ a: 2 }], delimiter: "," });
    expect(second.status).toBe(400);
    expect(second.body.error).toContain("Delimiter mismatch");
  });
});

// ═══════════════════════════════════════════════════════════════
//  Iterative diagram building — POST /compute/diagram with diagramId
// ═══════════════════════════════════════════════════════════════

describe("POST /compute/diagram (iterative)", () => {
  it("appends definition lines to an existing diagram", async () => {
    const first = await request(app)
      .post("/compute/diagram")
      .send({ definition: "flowchart TD\n  A-->B" });
    expect(first.status).toBe(200);
    expect(first.body.diagramId).toBeTruthy();
    expect(first.body.totalLines).toBe(2);
    expect(first.body.message).toContain(first.body.diagramId);

    const second = await request(app)
      .post("/compute/diagram")
      .send({ diagramId: first.body.diagramId, definition: "  B-->C\n  C-->A" });
    expect(second.status).toBe(200);
    expect(second.body.diagramId).toBe(first.body.diagramId);
    expect(second.body.totalLines).toBe(4);

    const embed = await request(app).get(
      `/compute/diagram/embed?id=${first.body.diagramId}`,
    );
    expect(embed.status).toBe(200);
    expect(embed.text).toContain("A-->B");
    expect(embed.text).toContain("B-->C");
    expect(embed.text).toContain("C-->A");
  });

  it("keeps the original theme when extending unless overridden", async () => {
    const first = await request(app)
      .post("/compute/diagram")
      .send({ definition: "flowchart TD\n  A-->B", theme: "forest" });
    const second = await request(app)
      .post("/compute/diagram")
      .send({ diagramId: first.body.diagramId, definition: "  B-->C" });
    expect(second.status).toBe(200);

    const embed = await request(app).get(
      `/compute/diagram/embed?id=${first.body.diagramId}`,
    );
    expect(embed.text).toContain("forest");
  });

  it("rejects an unknown diagramId with recovery guidance", async () => {
    const response = await request(app)
      .post("/compute/diagram")
      .send({ diagramId: "does-not-exist", definition: "  B-->C" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("not found or expired");
    expect(response.body.error).toContain("Omit diagramId");
  });

  it("rejects the literal string 'undefined' as diagramId", async () => {
    const response = await request(app)
      .post("/compute/diagram")
      .send({ diagramId: "undefined", definition: "flowchart TD\n  A-->B" });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Invalid diagramId");
  });

  it("enforces the 50k character cap on the combined definition", async () => {
    const first = await request(app)
      .post("/compute/diagram")
      .send({ definition: "flowchart TD\n" + "  A-->B\n".repeat(3000) });
    expect(first.status).toBe(200);
    const second = await request(app)
      .post("/compute/diagram")
      .send({
        diagramId: first.body.diagramId,
        definition: "  X-->Y\n".repeat(4000),
      });
    expect(second.status).toBe(400);
    expect(second.body.error).toContain("50,000");
  });
});
