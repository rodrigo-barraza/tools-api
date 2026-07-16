import { asyncHandler } from "@rodrigo-barraza/utilities-library/express";
import {
  setupStreamingServerSentEvents,
  lazyImport,
} from "@rodrigo-barraza/utilities-library/express";
import { getErrorMessage, validateMaxLength } from "@rodrigo-barraza/utilities-library";
import {
  parseHex as hexToRgb,
  toHex as rgbToHex,
  rgbToHsl,
  hslToRgb,
} from "@rodrigo-barraza/utilities-library/color";
// ─── Process-Based Tool Endpoints ───────────────────────────
import { Request, Response, Router } from "express";
import {
  executeJavaScript,
  getJsInterpreterInfo,
} from "../services/JavaScriptInterpreterService.ts";
import {
  executeShell,
  executeShellStreaming,
  getAllowedBinaries,
} from "../services/ShellExecutorService.ts";
import { MAX_CODE_LENGTH, MAX_COMMAND_LENGTH } from "../constants.ts";
import crypto from "node:crypto";
import {
  buildDisplay,
  buildLocalUrl,
  buildEmbedHtml,
  errorMessage,
  extractCallerContext,
} from "../utilities.ts";
import { PersistentStore } from "../models/EmbedAsset.ts";
import MinioService from "../services/MinioService.ts";
import {
  saveTurtleDrawing,
  getTurtleDrawing,
} from "../models/TurtleDrawing.ts";
import {
  executeLogoProgram,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
} from "../services/LogoInterpreterService.ts";
import {
  saveThreeDimensionalScene,
  getThreeDimensionalScene,
} from "../models/ThreeDimensionalScene.ts";
import {
  validateMeshInput,
  buildMeshEmbedHtml,
} from "../services/ThreeDimensionalMeshService.ts";
import type { MeshVertex, MeshFace } from "../services/ThreeDimensionalMeshService.ts";
import {
  validateSceneInput,
  buildSceneEmbedHtml,
} from "../services/ThreeDimensionalSceneService.ts";
import type { SceneObject, SceneConfig, SceneOptions } from "../services/ThreeDimensionalSceneService.ts";
import {
  validateModelInput,
  buildModelEmbedHtml,
} from "../services/ThreeDimensionalModelService.ts";
import type { ModelObject, ModelOptions } from "../services/ThreeDimensionalModelService.ts";
import {
  validateVoxelInput,
  buildVoxelEmbedHtml,
  resolveVoxels,
  expandVoxelSlices,
  MAX_RENDERABLE_VOXELS,
} from "../services/ThreeDimensionalVoxelService.ts";
import type { Voxel, VoxelShape, VoxelOptions } from "../services/ThreeDimensionalVoxelService.ts";
import { processImage, convertToAscii, scanImageBarcodes, type AsciiPixel } from "../services/ImageService.ts";
import { renderCodeImage } from "../services/CodeImageService.ts";
import { generateAvatar } from "../services/AvatarService.ts";
import { convertVideoToGif } from "../services/VideoService.ts";
// ─── Lazy-loaded dependencies ──────────────────────────────────────
// These are loaded on first use to avoid blocking startup.
interface ConvertUnitsInstance {
  (value: number): {
    from: (unit: string) => {
      to: (unit: string) => number;
    };
  };
  (): {
    describe: (unit: string) => {
      singular: string;
      plural: string;
      measure: string;
    };
    possibilities: (measure?: string) => string[];
    measures: () => string[];
  };
}

const getConvertUnits = lazyImport<ConvertUnitsInstance>("convert-units");
const getDateFns = lazyImport<typeof import("date-fns")>(
  "date-fns",
  (importedModule: unknown) => importedModule as typeof import("date-fns"),
);
const getDateFnsTz = lazyImport<typeof import("date-fns-tz")>(
  "date-fns-tz",
  (importedModule: unknown) => importedModule as typeof import("date-fns-tz"),
);
const getJSONPath = lazyImport<typeof import("jsonpath-plus").JSONPath>(
  "jsonpath-plus",
  (importedModule: unknown) =>
    (importedModule as Record<string, unknown>)
      .JSONPath as typeof import("jsonpath-plus").JSONPath,
);
const getQRCode = lazyImport<typeof import("qrcode")>("qrcode");
const getDiff = lazyImport<typeof import("diff")>(
  "diff",
  (importedModule: unknown) => importedModule as typeof import("diff"),
);
const router = Router();
// ─── 1. JavaScript Interpreter (vm sandbox) ─────────────────
router.post("/js/execute", (req: Request, res: Response) => {
  const { code, timeout } = req.body;
  if (!code || typeof code !== "string") {
    return res
      .status(400)
      .json({ error: "Request body must include 'code' (string)" });
  }
  const lengthError = validateMaxLength(code, MAX_CODE_LENGTH, "Code");
  if (lengthError) return res.status(400).json({ error: lengthError });
  const result = executeJavaScript(code, {
    timeout: timeout
      ? Math.min(Math.max(parseInt(timeout), 100), 30_000)
      : undefined,
  });
  res.json(result);
});
router.get("/js/info", (_req: Request, res: Response) => {
  res.json(getJsInterpreterInfo());
});
// ── JS Streaming (SSE) — synchronous vm, but follows the same SSE pattern ──
router.post("/js/stream", (req: Request, res: Response) => {
  const { code, timeout } = req.body;
  if (!code || typeof code !== "string") {
    return res
      .status(400)
      .json({ error: "Request body must include 'code' (string)" });
  }
  const lengthError = validateMaxLength(code, MAX_CODE_LENGTH, "Code");
  if (lengthError) return res.status(400).json({ error: lengthError });
  const send = setupStreamingServerSentEvents(res);
  send({ event: "start", language: "javascript" });
  const result = executeJavaScript(code, {
    timeout: timeout
      ? Math.min(Math.max(parseInt(timeout), 100), 30_000)
      : undefined,
  });
  // Emit console output as stdout chunks
  if (result.output) {
    send({ event: "stdout", data: result.output + "\n" });
  }
  if (result.error) {
    send({ event: "stderr", data: result.error + "\n" });
  }
  send({
    event: "exit",
    exitCode: result.error ? 1 : 0,
    executionTimeMs: result.executionTimeMs,
    success: result.success,
  });
  res.end();
});
// ─── 2. Shell Executor (allowlisted commands) ───────────────
router.post(
  "/shell/execute",
  asyncHandler(async (req: Request, res: Response) => {
    const { command, stdin, timeout } = req.body;
    if (!command || typeof command !== "string") {
      return res
        .status(400)
        .json({ error: "Request body must include 'command' (string)" });
    }
    const lengthError = validateMaxLength(command, MAX_COMMAND_LENGTH, "Command");
    if (lengthError) return res.status(400).json({ error: lengthError });
    const result = await executeShell(command, {
      stdin: stdin || "",
      timeout: timeout
        ? Math.min(Math.max(parseInt(timeout), 500), 30_000)
        : undefined,
    });
    res.json(result);
  }),
);
router.get("/shell/binaries", (_req: Request, res: Response) => {
  const binaries = getAllowedBinaries();
  res.json({ count: binaries.length, binaries });
});
// ── Shell Streaming (SSE) ─────────────────────────────────────
router.post(
  "/shell/stream",
  asyncHandler(async (req: Request, res: Response) => {
    const { command, stdin, timeout } = req.body;
    if (!command || typeof command !== "string") {
      return res
        .status(400)
        .json({ error: "Request body must include 'command' (string)" });
    }
    const lengthError = validateMaxLength(command, MAX_COMMAND_LENGTH, "Command");
    if (lengthError) return res.status(400).json({ error: lengthError });
    const send = setupStreamingServerSentEvents(res);
    send({ event: "start", command });
    const result = await executeShellStreaming(command, {
      stdin: stdin || "",
      timeout: timeout
        ? Math.min(Math.max(parseInt(timeout), 500), 30_000)
        : undefined,
      onChunk: (event: string, data: string) => send({ event, data }),
    });
    send({
      event: "exit",
      exitCode: result.exitCode,
      executionTimeMs: result.executionTimeMs,
      success: result.success,
      timedOut: result.timedOut,
      error: result.error || undefined,
    });
    res.end();
  }),
);
// ─── 3. Unit Conversion ─────────────────────────────────────
router.get(
  "/units/convert",
  asyncHandler(async (req: Request, res: Response) => {
    const { value, from, to } = req.query as Record<string, string>;
    if (!value || !from || !to) {
      return res
        .status(400)
        .json({
          error: "Query parameters 'value', 'from', and 'to' are required",
        });
    }
    try {
      const convert = await getConvertUnits();
      const parsedNumberValue = parseFloat(value);
      if (isNaN(parsedNumberValue)) {
        return res
          .status(400)
          .json({ error: "'value' must be a valid number" });
      }
      const result = convert(parsedNumberValue).from(from).to(to);
      const fromUnit = convert().describe(from);
      const toUnit = convert().describe(to);
      res.json({
        value: parsedNumberValue,
        from: {
          abbr: from,
          singular: fromUnit.singular,
          plural: fromUnit.plural,
        },
        to: { abbr: to, singular: toUnit.singular, plural: toUnit.plural },
        result,
      });
    } catch (error: unknown) {
      res
        .status(400)
        .json({ error: `Conversion failed: ${errorMessage(error)}` });
    }
  }),
);
router.get(
  "/units/list",
  asyncHandler(async (req: Request, res: Response) => {
    const { measure } = req.query as Record<string, string>;
    try {
      const convert = await getConvertUnits();
      if (measure) {
        const units = convert().possibilities(measure);
        const described = units.map((unit: string) => {
          const unitDescription = convert().describe(unit);
          return {
            abbr: unit,
            singular: unitDescription.singular,
            plural: unitDescription.plural,
            measure: unitDescription.measure,
          };
        });
        return res.json({ measure, count: described.length, units: described });
      }
      const measures = convert().measures();
      const all: Record<string, unknown> = {};
      for (const measure of measures) {
        const units = convert().possibilities(measure);
        all[measure] = units.map((unit: string) => {
          const unitDescription = convert().describe(unit);
          return { abbr: unit, singular: unitDescription.singular };
        });
      }
      res.json({ measureCount: measures.length, measures: all });
    } catch (error: unknown) {
      res
        .status(400)
        .json({ error: `Unit listing failed: ${errorMessage(error)}` });
    }
  }),
);
// ─── 4. DateTime Parsing & Arithmetic ───────────────────────
router.post(
  "/datetime/parse",
  asyncHandler(async (req: Request, res: Response) => {
    const { operation, date, date2, amount, unit, format, timezone } = req.body;
    if (!operation) {
      return res.status(400).json({
        error:
          "Request body must include 'operation' (parse|format|diff|add|subtract|startOf|endOf|isValid|now)",
      });
    }
    try {
      const fns = await getDateFns();
      const timeZoneLib = await getDateFnsTz();
      const parseDate = (dateInput: unknown) => {
        if (!dateInput) return new Date();
        if (dateInput === "now") return new Date();
        const parsed =
          typeof dateInput === "number" ? new Date(dateInput) : fns.parseISO(dateInput as string);
        if (isNaN(parsed.getTime())) throw new Error(`Invalid date: ${dateInput}`);
        return parsed;
      };
      const formatDate = (dateValue: Date) => {
        if (timezone) {
          return timeZoneLib.formatInTimeZone(
            dateValue,
            timezone,
            format || "yyyy-MM-dd'T'HH:mm:ssXXX",
          );
        }
        return format ? fns.format(dateValue, format) : dateValue.toISOString();
      };
      let result: unknown;
      switch (operation) {
        case "now": {
          const now = new Date();
          result = {
            iso: now.toISOString(),
            unix: now.getTime(),
            formatted: formatDate(now),
          };
          if (timezone) {
            (result as Record<string, unknown>).inTimezone =
              timeZoneLib.formatInTimeZone(
                now,
                timezone,
                "yyyy-MM-dd HH:mm:ss zzz",
              );
          }
          break;
        }
        case "parse": {
          const parsedDate = parseDate(date);
          result = {
            iso: parsedDate.toISOString(),
            unix: parsedDate.getTime(),
            formatted: formatDate(parsedDate),
            dayOfWeek: fns.format(parsedDate, "EEEE"),
            dayOfYear: fns.getDayOfYear(parsedDate),
            weekNumber: fns.getISOWeek(parsedDate),
            isLeapYear: fns.isLeapYear(parsedDate),
            isWeekend: fns.isWeekend(parsedDate),
          };
          break;
        }
        case "format": {
          const parsedDate = parseDate(date);
          result = { formatted: formatDate(parsedDate) };
          break;
        }
        case "diff": {
          const d1 = parseDate(date);
          const d2 = parseDate(date2);
          result = {
            milliseconds: fns.differenceInMilliseconds(d2, d1),
            seconds: fns.differenceInSeconds(d2, d1),
            minutes: fns.differenceInMinutes(d2, d1),
            hours: fns.differenceInHours(d2, d1),
            days: fns.differenceInDays(d2, d1),
            weeks: fns.differenceInWeeks(d2, d1),
            months: fns.differenceInMonths(d2, d1),
            years: fns.differenceInYears(d2, d1),
            businessDays: fns.differenceInBusinessDays(d2, d1),
            humanReadable: fns.formatDistanceStrict(d1, d2),
          };
          break;
        }
        case "add": {
          const parsedDate = parseDate(date);
          if (!amount || !unit)
            throw new Error("'amount' and 'unit' are required for add");
          const ADDERS: Record<string, (date: Date, amount: number) => Date> = {
            years: fns.addYears,
            months: fns.addMonths,
            weeks: fns.addWeeks,
            days: fns.addDays,
            hours: fns.addHours,
            minutes: fns.addMinutes,
            seconds: fns.addSeconds,
          };
          const adder = ADDERS[unit];
          if (!adder)
            throw new Error(
              `Invalid unit: ${unit}. Use: ${Object.keys(ADDERS).join(", ")}`,
            );
          const added = adder(parsedDate, parseInt(amount));
          result = {
            original: formatDate(parsedDate),
            result: formatDate(added),
            iso: added.toISOString(),
          };
          break;
        }
        case "subtract": {
          const parsedDate = parseDate(date);
          if (!amount || !unit)
            throw new Error("'amount' and 'unit' are required for subtract");
          const SUBBERS: Record<string, (date: Date, amount: number) => Date> =
            {
              years: fns.subYears,
              months: fns.subMonths,
              weeks: fns.subWeeks,
              days: fns.subDays,
              hours: fns.subHours,
              minutes: fns.subMinutes,
              seconds: fns.subSeconds,
            };
          const subber = SUBBERS[unit];
          if (!subber)
            throw new Error(
              `Invalid unit: ${unit}. Use: ${Object.keys(SUBBERS).join(", ")}`,
            );
          const subtracted = subber(parsedDate, parseInt(amount));
          result = {
            original: formatDate(parsedDate),
            result: formatDate(subtracted),
            iso: subtracted.toISOString(),
          };
          break;
        }
        case "startOf": {
          const parsedDate = parseDate(date);
          if (!unit) throw new Error("'unit' is required for startOf");
          const STARTERS: Record<string, (date: Date) => Date> = {
            year: fns.startOfYear,
            month: fns.startOfMonth,
            week: fns.startOfWeek,
            day: fns.startOfDay,
            hour: fns.startOfHour,
            minute: fns.startOfMinute,
          };
          const startFunction = STARTERS[unit];
          if (!startFunction)
            throw new Error(
              `Invalid unit: ${unit}. Use: ${Object.keys(STARTERS).join(", ")}`,
            );
          const started = startFunction(parsedDate);
          result = {
            original: formatDate(parsedDate),
            result: formatDate(started),
            iso: started.toISOString(),
          };
          break;
        }
        case "endOf": {
          const parsedDate = parseDate(date);
          if (!unit) throw new Error("'unit' is required for endOf");
          const ENDERS: Record<string, (date: Date) => Date> = {
            year: fns.endOfYear,
            month: fns.endOfMonth,
            week: fns.endOfWeek,
            day: fns.endOfDay,
            hour: fns.endOfHour,
            minute: fns.endOfMinute,
          };
          const endFunction = ENDERS[unit];
          if (!endFunction)
            throw new Error(
              `Invalid unit: ${unit}. Use: ${Object.keys(ENDERS).join(", ")}`,
            );
          const ended = endFunction(parsedDate);
          result = {
            original: formatDate(parsedDate),
            result: formatDate(ended),
            iso: ended.toISOString(),
          };
          break;
        }
        case "isValid": {
          try {
            const parsedDate = parseDate(date);
            result = {
              valid: !isNaN(parsedDate.getTime()),
              parsed: parsedDate.toISOString(),
            };
          } catch {
            result = { valid: false, parsed: null };
          }
          break;
        }
        default:
          return res.status(400).json({
            error: `Unknown operation: ${operation}. Use: now, parse, format, diff, add, subtract, startOf, endOf, isValid`,
          });
      }
      res.json({ operation, ...(result as Record<string, unknown>) });
    } catch (error: unknown) {
      res
        .status(400)
        .json({ error: `DateTime operation failed: ${errorMessage(error)}` });
    }
  }),
);
// ─── 5. JSON Transform (JSONPath) ───────────────────────────
router.post(
  "/json/transform",
  asyncHandler(async (req: Request, res: Response) => {
    const { data, expression, operations } = req.body;
    if (!data) {
      return res
        .status(400)
        .json({ error: "Request body must include 'data' (object or array)" });
    }
    try {
      let result = data;
      if (expression) {
        const jsonPathLib = await getJSONPath();
        result = jsonPathLib({ path: expression, json: data, wrap: true });
      }
      // Chained operations
      if (operations && Array.isArray(operations)) {
        for (const op of operations) {
          switch (op.type) {
            case "flatten":
              result = Array.isArray(result)
                ? result.flat(op.depth ?? Infinity)
                : result;
              break;
            case "unique":
              result = Array.isArray(result)
                ? [
                    ...new Set(
                      result.map((x: unknown) =>
                        typeof x === "object" ? JSON.stringify(x) : x,
                      ),
                    ),
                  ].map((x: unknown) => {
                    try {
                      return JSON.parse(x as string);
                    } catch {
                      return x;
                    }
                  })
                : result;
              break;
            case "sort":
              if (Array.isArray(result)) {
                const key = op.key;
                const order = op.order === "desc" ? -1 : 1;
                result = [...result].sort(
                  (
                    itemA: Record<string, unknown> | number | string,
                    itemB: Record<string, unknown> | number | string,
                  ) => {
                    const valueA = key
                      ? (itemA as Record<string, unknown>)?.[key]
                      : itemA;
                    const valueB = key
                      ? (itemB as Record<string, unknown>)?.[key]
                      : itemB;
                    if (
                      typeof valueA === "number" &&
                      typeof valueB === "number"
                    )
                      return (valueA - valueB) * order;
                    return String(valueA).localeCompare(String(valueB)) * order;
                  },
                );
              }
              break;
            case "filter":
              if (Array.isArray(result) && op.key && op.value !== undefined) {
                const opType = op.operator || "eq";
                result = result.filter((item: Record<string, unknown>) => {
                  const value = item?.[op.key];
                  switch (opType) {
                    case "eq":
                      return value === op.value;
                    case "neq":
                      return value !== op.value;
                    case "gt":
                      return (value as number) > (op.value as number);
                    case "gte":
                      return (value as number) >= (op.value as number);
                    case "lt":
                      return (value as number) < (op.value as number);
                    case "lte":
                      return (value as number) <= (op.value as number);
                    case "contains":
                      return String(value).includes(String(op.value));
                    case "startsWith":
                      return String(value).startsWith(String(op.value));
                    default:
                      return true;
                  }
                });
              }
              break;
            case "pick":
              if (Array.isArray(result) && Array.isArray(op.keys)) {
                result = result.map((item: Record<string, unknown>) => {
                  const picked: Record<string, unknown> = {};
                  for (const key of op.keys) {
                    if (key in item) picked[key] = item[key];
                  }
                  return picked;
                });
              } else if (typeof result === "object" && Array.isArray(op.keys)) {
                const picked: Record<string, unknown> = {};
                for (const key of op.keys) {
                  if (key in result) picked[key] = result[key];
                }
                result = picked;
              }
              break;
            case "omit":
              if (Array.isArray(result) && Array.isArray(op.keys)) {
                result = result.map((item: Record<string, unknown>) => {
                  const omitted = { ...item };
                  for (const key of op.keys) delete omitted[key];
                  return omitted;
                });
              } else if (typeof result === "object" && Array.isArray(op.keys)) {
                result = { ...result };
                for (const key of op.keys) delete result[key];
              }
              break;
            case "groupBy":
              if (Array.isArray(result) && op.key) {
                const groups: Record<string, unknown> = {};
                for (const item of result) {
                  const groupKey = String(item?.[op.key] ?? "undefined");
                  if (!groups[groupKey]) groups[groupKey] = [];
                  (groups[groupKey] as unknown[]).push(item);
                }
                result = groups;
              }
              break;
            case "count":
              result = Array.isArray(result)
                ? result.length
                : typeof result === "object"
                  ? Object.keys(result).length
                  : 1;
              break;
            case "sum":
              if (Array.isArray(result)) {
                result = result.reduce(
                  (acc: number, item: Record<string, unknown>) => {
                    const value = op.key ? item?.[op.key] : item;
                    return acc + (typeof value === "number" ? value : 0);
                  },
                  0,
                );
              }
              break;
            case "limit":
              if (Array.isArray(result) && op.count) {
                result = result.slice(0, op.count);
              }
              break;
            case "reverse":
              if (Array.isArray(result)) {
                result = [...result].reverse();
              }
              break;
            default:
              // Skip unknown operations
              break;
          }
        }
      }
      const count = Array.isArray(result)
        ? result.length
        : typeof result === "object"
          ? Object.keys(result).length
          : 1;
      res.json({ count, result });
    } catch (error: unknown) {
      res
        .status(400)
        .json({ error: `JSON transform failed: ${errorMessage(error)}` });
    }
  }),
);
// ─── 6. CSV Generation ──────────────────────────────────────
const MAX_CSV_CHARS = 4_000_000;
const csvStore = new PersistentStore<{
  csv: string;
  filename: string;
  columns?: string[];
  delimiter?: string;
  rowCount?: number;
}>("csv");
router.post("/csv", asyncHandler(async (req: Request, res: Response) => {
  const { data, columns, filename, delimiter, csvId } = req.body;
  if (!data || !Array.isArray(data) || data.length === 0) {
    return res
      .status(400)
      .json({ error: "'data' must be a non-empty array of objects" });
  }

  // Iterative mode: load the existing file and append rows to it.
  let existing: { csv: string; filename: string; columns?: string[]; delimiter?: string; rowCount?: number } | null = null;
  if (csvId !== undefined && csvId !== null && csvId !== "") {
    if (typeof csvId !== "string" || csvId === "null" || csvId === "undefined") {
      return res.status(400).json({
        error:
          `Invalid csvId (got: ${JSON.stringify(csvId)}). Pass the exact csvId string ` +
          `returned by a previous call, or omit it to create a new CSV.`,
      });
    }
    existing = await csvStore.getWithFallback(csvId);
    if (!existing) {
      return res.status(400).json({
        error:
          `CSV '${csvId}' not found or expired. Omit csvId to create a new CSV — the ` +
          `response returns a csvId you can pass back to append more rows.`,
      });
    }
    if (!existing.columns) {
      return res.status(400).json({
        error:
          `CSV '${csvId}' predates append support and cannot be extended. Omit csvId and ` +
          `resend the full data to create a new appendable CSV.`,
      });
    }
    if (delimiter && existing.delimiter && delimiter !== existing.delimiter) {
      return res.status(400).json({
        error:
          `Delimiter mismatch: CSV '${csvId}' uses ${JSON.stringify(existing.delimiter)}. ` +
          `Omit 'delimiter' when appending.`,
      });
    }
    if (columns && JSON.stringify(columns) !== JSON.stringify(existing.columns)) {
      return res.status(400).json({
        error:
          `Column mismatch: CSV '${csvId}' has columns [${existing.columns.join(", ")}]. ` +
          `Omit 'columns' when appending — new rows are mapped onto the existing columns.`,
      });
    }
  }

  try {
    const delimiterValue = existing?.delimiter || delimiter || ",";
    // Determine columns from the existing file, explicit list, or first object keys
    const resolvedColumns = existing?.columns || columns || Object.keys(data[0]);
    // Escape CSV values
    const escape = (value: unknown) => {
      if (value === null || value === undefined) return "";
      const stringValue = String(value);
      if (
        stringValue.includes(delimiterValue) ||
        stringValue.includes('"') ||
        stringValue.includes("\n")
      ) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    };
    const lines = existing ? [] : [resolvedColumns.map(escape).join(delimiterValue)];
    for (const row of data) {
      lines.push(
        resolvedColumns
          .map((column: string) => escape((row as Record<string, unknown>)[column]))
          .join(delimiterValue),
      );
    }
    const csv = existing ? existing.csv + "\n" + lines.join("\n") : lines.join("\n");
    if (csv.length > MAX_CSV_CHARS) {
      return res.status(400).json({
        error: `CSV would exceed ${MAX_CSV_CHARS.toLocaleString()} characters. Split the data into separate files.`,
      });
    }
    const totalRows = (existing?.rowCount || 0) + data.length;
    const entry = {
      csv,
      filename: filename || existing?.filename || "export.csv",
      columns: resolvedColumns,
      delimiter: delimiterValue,
      rowCount: totalRows,
    };
    let id: string;
    if (existing && typeof csvId === "string") {
      id = csvId;
      csvStore.setWithId(id, entry);
    } else {
      id = csvStore.set(entry);
    }
    const downloadUrl = buildLocalUrl("compute/csv/download", { id });
    res.json({
      message:
        `CSV ${existing ? "extended" : "created"}: ${totalRows} row(s), ` +
        `${resolvedColumns.length} column(s). To append more rows, call again with ` +
        `csvId '${id}' and only the new rows in 'data'.`,
      downloadUrl,
      csvId: id,
      rows: totalRows,
      newRows: data.length,
      columns: resolvedColumns.length,
    });
  } catch (error: unknown) {
    res
      .status(400)
      .json({ error: `CSV generation failed: ${errorMessage(error)}` });
  }
}));
router.get("/csv/download", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as Record<string, string>;
  if (!id) return res.status(400).send("Missing 'id' parameter");
  const entry = await csvStore.getWithFallback(id);
  if (!entry) {
    return res.status(404).send("CSV not found or expired");
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${entry.filename}"`,
  );
  res.send(entry.csv);
}));
// ─── 7. QR Code Generation ──────────────────────────────────
const qrStore = new PersistentStore<{ buffer: Buffer }>("qr");
router.post(
  "/qr",
  asyncHandler(async (req: Request, res: Response) => {
    const { data, size, errorCorrection, darkColor, lightColor } = req.body;
    if (!data || typeof data !== "string") {
      return res
        .status(400)
        .json({
          error: "'data' (string) is required — URL, text, WiFi config, etc.",
        });
    }
    if (data.length > 4296) {
      return res
        .status(400)
        .json({ error: "Data exceeds QR code capacity (max ~4296 chars)" });
    }
    try {
      const qrcode = await getQRCode();
      const pngBuffer = await qrcode.toBuffer(data, {
        width: Math.min(size || 800, 1024),
        errorCorrectionLevel: errorCorrection || "M",
        color: {
          dark: darkColor || "#000000",
          light: lightColor || "#ffffff",
        },
        margin: 2,
      });

      // Upload to MinIO for permanent URL, fall back to render endpoint
      const minioUrl = await MinioService.uploadToolAsset(pngBuffer, "image/png");
      const id = qrStore.set({ buffer: pngBuffer });
      const qrImageUrl = minioUrl || buildLocalUrl("compute/qr/render", { id });

      res.json({
        qrImageUrl,
        qrId: id,
        dataLength: data.length,
        display: buildDisplay("image", qrImageUrl, { title: "QR Code" }),
      });
    } catch (error: unknown) {
      res
        .status(400)
        .json({ error: `QR code generation failed: ${errorMessage(error)}` });
    }
  }),
);
router.get("/qr/render", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as Record<string, string>;
  if (!id) return res.status(400).send("Missing 'id' parameter");
  const entry = await qrStore.getWithFallback(id);
  if (!entry) {
    return res.status(404).send("QR code not found or expired");
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(Buffer.from(entry.buffer));
}));
// ─── 7b. Barcode / QR Scanning (inverse of QR generation) ───
router.post(
  "/barcode/scan",
  asyncHandler(async (req: Request, res: Response) => {
    const { input } = req.body;
    if (!input || typeof input !== "string") {
      return res.status(400).json({
        error:
          "'input' (string) is required — image URL, base64 data URI, imageId, or local path",
      });
    }
    try {
      const { barcodes } = await scanImageBarcodes({ input });
      if (barcodes.length === 0) {
        return res.json({
          count: 0,
          barcodes: [],
          message:
            "No barcode or QR code detected. Try a sharper/larger image, or crop closer to the code.",
        });
      }
      res.json({
        count: barcodes.length,
        barcodes,
        message: `Decoded ${barcodes.length} symbol(s): ${barcodes
          .map((barcode) => barcode.format)
          .join(", ")}`,
      });
    } catch (error: unknown) {
      res
        .status(400)
        .json({ error: `Barcode scan failed: ${errorMessage(error)}` });
    }
  }),
);
// ─── 7c. Code → Image (carbon.now.sh-style screenshot) ──────
const codeImageStore = new PersistentStore<{ buffer: Buffer }>("code-image");
router.post(
  "/code-image",
  asyncHandler(async (req: Request, res: Response) => {
    const { code, lang, theme, title, windowChrome, background, fontSize } =
      req.body;
    if (!code || typeof code !== "string") {
      return res
        .status(400)
        .json({ error: "'code' (string) is required" });
    }
    try {
      const rendered = await renderCodeImage({
        code,
        lang,
        theme,
        title,
        windowChrome: windowChrome !== false,
        background,
        fontSize,
      });

      const minioUrl = await MinioService.uploadToolAsset(
        rendered.buffer,
        "image/png",
      );
      const id = codeImageStore.set({ buffer: rendered.buffer });
      const codeImageUrl =
        minioUrl || buildLocalUrl("compute/code-image/render", { id });

      res.json({
        codeImageUrl,
        codeImageId: id,
        lang: rendered.lang,
        theme: rendered.theme,
        lineCount: rendered.lineCount,
        display: buildDisplay("image", codeImageUrl, { title: "Code" }),
        message:
          `Rendered ${rendered.lineCount} line(s) as a ${rendered.theme} code card — the user can see it now.` +
          (rendered.langFallback
            ? ` (Unknown language '${rendered.langFallback}' — highlighted as plain text.)`
            : ""),
      });
    } catch (error: unknown) {
      res
        .status(400)
        .json({ error: `Code image rendering failed: ${errorMessage(error)}` });
    }
  }),
);
router.get(
  "/code-image/render",
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.query as Record<string, string>;
    if (!id) return res.status(400).send("Missing 'id' parameter");
    const entry = await codeImageStore.getWithFallback(id);
    if (!entry) {
      return res.status(404).send("Code image not found or expired");
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(entry.buffer));
  }),
);
// ─── 7c-bis. ASCII Banner (figlet) ──────────────────────────
// Inverse of convert_image_to_ascii: text → FIGfont ASCII lettering via
// figlet.js (https://github.com/patorjk/figlet.js), the full FIGfont spec
// with all kerning/smushing layout modes.
const getFiglet = lazyImport<(typeof import("figlet"))["default"]>("figlet");
const MAX_BANNER_TEXT_LENGTH = 60;
const POPULAR_BANNER_FONTS = [
  "Standard", "Big", "Slant", "Small", "Banner", "Block", "Doom", "Ghost",
  "Graffiti", "Isometric1", "Larry 3D", "Ogre", "Shadow", "Small Slant",
  "Speed", "Star Wars", "Sub-Zero", "ANSI Shadow", "3-D", "Bloody",
];
let bannerFontSet: Set<string> | null = null;
router.post(
  "/ascii-banner",
  asyncHandler(async (req: Request, res: Response) => {
    const { text, font, width } = req.body;
    if (!text || typeof text !== "string") {
      return res
        .status(400)
        .json({ error: "'text' (string) is required" });
    }
    if (text.length > MAX_BANNER_TEXT_LENGTH) {
      return res.status(400).json({
        error: `Text exceeds ${MAX_BANNER_TEXT_LENGTH} characters — banners are for short phrases`,
      });
    }
    try {
      const figlet = await getFiglet();
      bannerFontSet ??= new Set<string>(figlet.fontsSync());
      const chosenFont = font || "Standard";
      if (!bannerFontSet.has(chosenFont)) {
        return res.status(400).json({
          error:
            `Unknown font '${chosenFont}'. Popular fonts: ${POPULAR_BANNER_FONTS.join(", ")} ` +
            `(${bannerFontSet.size} available in total).`,
        });
      }
      const banner = figlet.textSync(text, {
        font: chosenFont as import("figlet").FontName,
        width: Math.min(Math.max(parseInt(width) || 80, 40), 200),
        whitespaceBreak: true,
      });
      const lines = banner.replace(/\s+$/, "").split("\n");
      const lineLengths = lines.map((line: string) => line.length);
      res.json({
        banner,
        font: chosenFont,
        lineCount: lines.length,
        widestLine: Math.max(...lineLengths, 0),
        message:
          "Present the banner inside a fenced code block (```) so the monospace art lines up.",
      });
    } catch (error: unknown) {
      res
        .status(400)
        .json({ error: `Banner generation failed: ${errorMessage(error)}` });
    }
  }),
);
// ─── 7d. Deterministic Avatars (DiceBear) ───────────────────
const avatarStore = new PersistentStore<{ buffer: Buffer; mimeType: string }>(
  "avatar",
);
router.post(
  "/avatar",
  asyncHandler(async (req: Request, res: Response) => {
    const { seed, style, size, backgroundColor, format } = req.body;
    if (!seed || typeof seed !== "string") {
      return res.status(400).json({
        error: "'seed' (string) is required — any name or phrase; the same seed always yields the same avatar",
      });
    }
    try {
      const avatar = await generateAvatar({
        seed,
        style,
        size,
        backgroundColor,
        format,
      });

      const minioUrl = await MinioService.uploadToolAsset(
        avatar.buffer,
        avatar.mimeType,
      );
      const id = avatarStore.set({
        buffer: avatar.buffer,
        mimeType: avatar.mimeType,
      });
      const avatarUrl =
        minioUrl || buildLocalUrl("compute/avatar/render", { id });

      res.json({
        avatarUrl,
        avatarId: id,
        seed: avatar.seed,
        style: avatar.style,
        size: avatar.size,
        format: avatar.format,
        display: buildDisplay("image", avatarUrl, { title: "Avatar" }),
        message:
          `Generated a ${avatar.style} avatar for seed '${avatar.seed}' — the user can see it now. ` +
          "The same seed + style always reproduces this exact avatar; vary the seed for a different face. " +
          "The avatarUrl can be passed directly as create_custom_agent's 'avatar' parameter.",
      });
    } catch (error: unknown) {
      res
        .status(400)
        .json({ error: `Avatar generation failed: ${errorMessage(error)}` });
    }
  }),
);
router.get(
  "/avatar/render",
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.query as Record<string, string>;
    if (!id) return res.status(400).send("Missing 'id' parameter");
    const entry = await avatarStore.getWithFallback(id);
    if (!entry) {
      return res.status(404).send("Avatar not found or expired");
    }
    res.setHeader("Content-Type", entry.mimeType);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(Buffer.from(entry.buffer));
  }),
);
// ─── 8. LaTeX Rendering (KaTeX CDN embed) ───────────────────
const latexStore = new PersistentStore<{
  latex: string;
  displayMode: boolean;
}>("latex");
function buildLatexEmbedHtml(latex: string, displayMode: boolean = true) {
  return buildEmbedHtml({
    headExtra: `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js"></${"script"}>
`,
    styles: `  #math{
    color:#1e293b;
    font-size:1.4em;
    max-width:100%;
    overflow-x:auto;
  }
  .katex{font-size:1.4em}
  .katex .base{color:#1e293b}`,
    bodyContent: `<div id="math"></div>`,
    scripts: `<script>
  try {
    katex.render(${JSON.stringify(latex)}, document.getElementById("math"), {
      displayMode: ${displayMode},
      throwOnError: false,
      output: "html",
      strict: false,
      trust: true,
    });
  } catch (error) {
    document.getElementById("math").textContent = "LaTeX error: " + e.message;
  }
</${"script"}>`,
  });
}
router.post("/latex", (req: Request, res: Response) => {
  const { latex, displayMode } = req.body;
  if (!latex || typeof latex !== "string") {
    return res.status(400).json({ error: "'latex' (string) is required" });
  }
  if (latex.length > 10_000) {
    return res
      .status(400)
      .json({ error: "LaTeX expression exceeds 10,000 characters" });
  }
  const id = latexStore.set({
    latex,
    displayMode: displayMode !== false,
  });
  const latexEmbedUrl = buildLocalUrl("compute/latex/embed", { id });
  res.json({
    latexEmbedUrl,
    latexId: id,
    display: buildDisplay("embed", latexEmbedUrl, { height: 160, title: "LaTeX" }),
  });
});
router.get("/latex/embed", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as Record<string, string>;
  if (!id) return res.status(400).send("Missing 'id' parameter");
  const entry = await latexStore.getWithFallback(id);
  if (!entry) {
    return res.status(404).send("LaTeX not found or expired");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(buildLatexEmbedHtml(entry.latex, entry.displayMode));
}));
// ─── 9. Mermaid Diagram Rendering (CDN embed) ───────────────
const diagramStore = new PersistentStore<{
  definition: string;
  theme: string;
}>("diagram");
function buildMermaidEmbedHtml(definition: string, theme: string = "default") {
  return buildEmbedHtml({
    styles: `  #diagram{
    max-width:100%;
    overflow-x:auto;
  }
  #diagram svg{
    max-width:100%;
    height:auto;
  }`,
    bodyContent: `<div id="diagram"></div>`,
    scripts: `<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({
    startOnLoad: false,
    theme: '${theme}',
    securityLevel: 'strict',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  });
  try {
    const { svg } = await mermaid.render('mermaid-svg', ${JSON.stringify(definition)});
    document.getElementById('diagram').innerHTML = svg;
  } catch (error) {
    document.getElementById('diagram').textContent = 'Diagram error: ' + error.message;
  }
</${"script"}>`,
  });
}
router.post("/diagram", asyncHandler(async (req: Request, res: Response) => {
  const { definition, theme, diagramId } = req.body;
  if (!definition || typeof definition !== "string") {
    return res
      .status(400)
      .json({ error: "'definition' (Mermaid syntax string) is required" });
  }

  // Iterative mode: append new lines to a previously created diagram.
  let existing: { definition: string; theme: string } | null = null;
  if (diagramId !== undefined && diagramId !== null && diagramId !== "") {
    if (typeof diagramId !== "string" || diagramId === "null" || diagramId === "undefined") {
      return res.status(400).json({
        error:
          `Invalid diagramId (got: ${JSON.stringify(diagramId)}). Pass the exact diagramId ` +
          `string returned by a previous call, or omit it to create a new diagram.`,
      });
    }
    existing = await diagramStore.getWithFallback(diagramId);
    if (!existing) {
      return res.status(400).json({
        error:
          `Diagram '${diagramId}' not found or expired. Omit diagramId and send the complete ` +
          `definition (including the diagram type header) to create a new diagram.`,
      });
    }
  }

  const combinedDefinition = existing
    ? existing.definition + "\n" + definition
    : definition;
  if (combinedDefinition.length > 50_000) {
    return res
      .status(400)
      .json({ error: "Diagram definition exceeds 50,000 characters" });
  }

  const entry = {
    definition: combinedDefinition,
    theme: theme || existing?.theme || "default",
  };
  let id: string;
  if (existing && typeof diagramId === "string") {
    id = diagramId;
    diagramStore.setWithId(id, entry);
  } else {
    id = diagramStore.set(entry);
  }
  const diagramEmbedUrl = buildLocalUrl("compute/diagram/embed", { id });
  const totalLines = combinedDefinition.split("\n").length;
  res.json({
    message:
      `Diagram ${existing ? "extended" : "created"}: ${totalLines} line(s). The user can ` +
      `see this version now. To build on it, call again with diagramId '${id}' and only ` +
      `the new lines (nodes, edges, participants...) in 'definition' — they are appended ` +
      `to the existing diagram. Omit diagramId to start a fresh diagram instead.`,
    diagramEmbedUrl,
    diagramId: id,
    totalLines,
    display: buildDisplay("embed", diagramEmbedUrl, { height: 420, title: "Diagram" }),
  });
}));
router.get("/diagram/embed", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as Record<string, string>;
  if (!id) return res.status(400).send("Missing 'id' parameter");
  const entry = await diagramStore.getWithFallback(id);
  if (!entry) {
    return res.status(404).send("Diagram not found or expired");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(buildMermaidEmbedHtml(entry.definition, entry.theme));
}));
// ─── 10. Text Diff ──────────────────────────────────────────
router.post(
  "/diff",
  asyncHandler(async (req: Request, res: Response) => {
    const { textA, textB, mode } = req.body;
    if (textA === undefined || textB === undefined) {
      return res
        .status(400)
        .json({ error: "'textA' and 'textB' are required" });
    }
    try {
      const diff = await getDiff();
      const diffMode = mode || "lines";
      let changes: import("diff").Change[] = [];
      switch (diffMode) {
        case "chars":
          changes = diff.diffChars(textA, textB);
          break;
        case "words":
          changes = diff.diffWords(textA, textB);
          break;
        case "sentences":
          changes = diff.diffSentences(textA, textB);
          break;
        case "json":
          try {
            const objectA = typeof textA === "string" ? JSON.parse(textA) : textA;
            const objectB = typeof textB === "string" ? JSON.parse(textB) : textB;
            changes = diff.diffJson(objectA, objectB);
          } catch {
            return res
              .status(400)
              .json({ error: "For json mode, both inputs must be valid JSON" });
          }
          break;
        case "lines":
        default:
          changes = diff.diffLines(textA, textB);
          break;
      }
      // Also generate unified patch
      const patch = diff.createPatch(
        "diff",
        textA,
        textB,
        "original",
        "modified",
      );
      // Compute stats
      let additions = 0;
      let deletions = 0;
      let unchanged = 0;
      for (const change of changes) {
        if (change.added) additions += change.count || 1;
        else if (change.removed) deletions += change.count || 1;
        else unchanged += change.count || 1;
      }
      res.json({
        mode: diffMode,
        identical: additions === 0 && deletions === 0,
        stats: { additions, deletions, unchanged },
        changes: changes.map((change: import("diff").Change) => ({
          value: change.value,
          added: change.added || false,
          removed: change.removed || false,
          count: change.count,
        })),
        patch,
      });
    } catch (error: unknown) {
      res.status(400).json({ error: `Diff failed: ${errorMessage(error)}` });
    }
  }),
);
// ─── 11. Cryptographic Hashing ──────────────────────────────
router.get("/hash", (req: Request, res: Response) => {
  const { data, algorithm, encoding, key } = req.query as Record<
    string,
    string
  >;
  if (!data) {
    return res
      .status(400)
      .json({ error: "Query parameter 'data' is required" });
  }
  const algo = (algorithm || "sha256").toLowerCase();
  const enc = (encoding || "hex") as crypto.BinaryToTextEncoding;
  try {
    let hash: string | Buffer;
    if (key) {
      // HMAC
      hash = crypto.createHmac(algo, key).update(data).digest(enc);
    } else {
      hash = crypto.createHash(algo).update(data).digest(enc);
    }
    res.json({
      algorithm: key ? `hmac-${algo}` : algo,
      encoding: enc,
      hash,
      dataLength: data.length,
    });
  } catch (error: unknown) {
    const algos = crypto.getHashes().filter((h: string) => !h.includes("RSA"));
    res.status(400).json({
      error: `Hashing failed: ${errorMessage(error)}`,
      supportedAlgorithms: algos.slice(0, 20),
    });
  }
});
// UUID generation
router.get("/uuid", (_req: Request, res: Response) => {
  res.json({
    uuid: crypto.randomUUID(),
    v4: crypto.randomUUID(),
    hex: crypto.randomBytes(16).toString("hex"),
    base64: crypto.randomBytes(16).toString("base64"),
  });
});
// ─── 12. Regex Tester ───────────────────────────────────────
router.post("/regex", (req: Request, res: Response) => {
  const { pattern, flags, text } = req.body;
  if (!pattern || text === undefined) {
    return res.status(400).json({ error: "'pattern' and 'text' are required" });
  }
  try {
    const regex = new RegExp(pattern, flags || "g");
    const matches: Record<string, unknown>[] = [];
    let match: RegExpExecArray | null;
    let iterations = 0;
    const MAX_MATCHES = 1000;
    if (regex.global || regex.sticky) {
      while ((match = regex.exec(text)) !== null && iterations < MAX_MATCHES) {
        matches.push({
          match: match[0],
          index: match.index,
          groups: match.slice(1).length > 0 ? match.slice(1) : undefined,
          namedGroups: match.groups || undefined,
        });
        iterations++;
        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) regex.lastIndex++;
      }
    } else {
      match = regex.exec(text);
      if (match) {
        matches.push({
          match: match[0],
          index: match.index,
          groups: match.slice(1).length > 0 ? match.slice(1) : undefined,
          namedGroups: match.groups || undefined,
        });
      }
    }
    res.json({
      pattern,
      flags: flags || "g",
      matchCount: matches.length,
      matches,
      valid: true,
    });
  } catch (error: unknown) {
    res.json({
      pattern,
      flags: flags || "g",
      matchCount: 0,
      matches: [],
      valid: false,
      error: errorMessage(error),
    });
  }
});
// ─── 13. Encode / Decode ────────────────────────────────────
router.get("/encode", (req: Request, res: Response) => {
  const { data, format, direction } = req.query as Record<string, string>;
  if (!data || !format) {
    return res
      .status(400)
      .json({ error: "Query parameters 'data' and 'format' are required" });
  }
  const dir = direction || "encode";
  try {
    let result: unknown;
    switch (format.toLowerCase()) {
      case "base64":
        result =
          dir === "decode"
            ? Buffer.from(data, "base64").toString("utf-8")
            : Buffer.from(data).toString("base64");
        break;
      case "base64url":
        result =
          dir === "decode"
            ? Buffer.from(data, "base64url").toString("utf-8")
            : Buffer.from(data).toString("base64url");
        break;
      case "hex":
        result =
          dir === "decode"
            ? Buffer.from(data, "hex").toString("utf-8")
            : Buffer.from(data).toString("hex");
        break;
      case "url":
        result =
          dir === "decode"
            ? decodeURIComponent(data)
            : encodeURIComponent(data);
        break;
      case "html":
        if (dir === "decode") {
          result = data
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) =>
              String.fromCharCode(parseInt(hex, 16)),
            )
            .replace(/&#(\d+);/g, (_: string, dec: string) =>
              String.fromCharCode(parseInt(dec)),
            );
        } else {
          result = data
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }
        break;
      case "rot13":
        result = data.replace(/[a-zA-Z]/g, (client: string) => {
          const base = client <= "Z" ? 65 : 97;
          return String.fromCharCode(
            ((client.charCodeAt(0) - base + 13) % 26) + base,
          );
        });
        break;
      case "binary":
        if (dir === "decode") {
          result = data
            .split(" ")
            .map((b: string) => String.fromCharCode(parseInt(b, 2)))
            .join("");
        } else {
          result = [...data]
            .map((client: string) => client.charCodeAt(0).toString(2).padStart(8, "0"))
            .join(" ");
        }
        break;
      case "jwt": {
        // Decode only — no verify (we don't have the secret)
        if (dir !== "decode") {
          return res
            .status(400)
            .json({ error: "JWT format only supports 'decode' direction" });
        }
        const parts = data.split(".");
        if (parts.length < 2) {
          return res.status(400).json({ error: "Invalid JWT format" });
        }
        const header = JSON.parse(
          Buffer.from(parts[0], "base64url").toString(),
        );
        const payload = JSON.parse(
          Buffer.from(parts[1], "base64url").toString(),
        );
        result = { header, payload, signaturePresent: parts.length === 3 };
        return res.json({ format: "jwt", direction: dir, result });
      }
      default:
        return res.status(400).json({
          error: `Unknown format: ${format}. Supported: base64, base64url, hex, url, html, rot13, binary, jwt`,
        });
    }
    res.json({
      format: format.toLowerCase(),
      direction: dir,
      result,
      inputLength: data.length,
      outputLength: typeof result === "string" ? result.length : undefined,
    });
  } catch (error: unknown) {
    res.status(400).json({ error: `Encoding failed: ${errorMessage(error)}` });
  }
});
// ─── 14. Color Converter ────────────────────────────────────
interface HslColor {
  h: number;
  s: number;
  l: number;
}

// ─── Color Math (service-specific — not in shared library) ──
function rgbToHsv({ r, g, b }: { r: number; g: number; b: number }) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  let hue = 0;
  const saturation = max === 0 ? 0 : delta / max;
  const value = max;
  if (max !== min) {
    switch (max) {
      case rNorm:
        hue = ((gNorm - bNorm) / delta + (gNorm < bNorm ? 6 : 0)) / 6;
        break;
      case gNorm:
        hue = ((bNorm - rNorm) / delta + 2) / 6;
        break;
      case bNorm:
        hue = ((rNorm - gNorm) / delta + 4) / 6;
        break;
    }
  }
  return {
    "h": Math.round(hue * 360),
    "s": Math.round(saturation * 100),
    "v": Math.round(value * 100),
  };
}
function rgbToCmyk({ r, g, b }: { r: number; g: number; b: number }) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const blackLevel = 1 - Math.max(rNorm, gNorm, bNorm);
  if (blackLevel === 1) return { "c": 0, "m": 0, "y": 0, "k": 100 };
  return {
    "c": Math.round(((1 - rNorm - blackLevel) / (1 - blackLevel)) * 100),
    "m": Math.round(((1 - gNorm - blackLevel) / (1 - blackLevel)) * 100),
    "y": Math.round(((1 - bNorm - blackLevel) / (1 - blackLevel)) * 100),
    "k": Math.round(blackLevel * 100),
  };
}
/**
 * Parse any common color format into RGB.
 */
function parseColorToRgb(color: string) {
  const trimmedColor = color.trim();
  // HEX
  if (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmedColor)) {
    return hexToRgb(trimmedColor);
  }
  // rgb(r, g, b)
  const rgbMatch = trimmedColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    };
  }
  // hsl(h, s%, l%)
  const hslMatch = trimmedColor.match(/^hsla?\((\d+),\s*(\d+)%?,\s*(\d+)%?/);
  if (hslMatch) {
    return hslToRgb({
      h: parseInt(hslMatch[1]),
      s: parseInt(hslMatch[2]),
      l: parseInt(hslMatch[3]),
    });
  }
  // CSS named colors (top 30)
  const NAMED: Record<string, string> = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    green: "#008000",
    blue: "#0000ff",
    yellow: "#ffff00",
    cyan: "#00ffff",
    magenta: "#ff00ff",
    orange: "#ffa500",
    purple: "#800080",
    pink: "#ffc0cb",
    brown: "#a52a2a",
    gray: "#808080",
    grey: "#808080",
    lime: "#00ff00",
    navy: "#000080",
    teal: "#008080",
    maroon: "#800000",
    olive: "#808000",
    aqua: "#00ffff",
    silver: "#c0c0c0",
    gold: "#ffd700",
    indigo: "#4b0082",
    violet: "#ee82ee",
    coral: "#ff7f50",
    salmon: "#fa8072",
    khaki: "#f0e68c",
    tomato: "#ff6347",
    turquoise: "#40e0d0",
    plum: "#dda0dd",
  };
  const named = NAMED[trimmedColor.toLowerCase() as keyof typeof NAMED];
  if (named) return hexToRgb(named);
  throw new Error(
    `Cannot parse color: ${color}. Use HEX (#ff0000), rgb(255,0,0), hsl(0,100%,50%), or CSS named colors.`,
  );
}
/**
 * Generate color harmonies from a base hue.
 */
function generatePalette(hsl: HslColor, type: string) {
  const palettes = {
    complementary: [{ ...hsl }, { ...hsl, h: (hsl.h + 180) % 360 }],
    analogous: [
      { ...hsl, h: (hsl.h - 30 + 360) % 360 },
      { ...hsl },
      { ...hsl, h: (hsl.h + 30) % 360 },
    ],
    triadic: [
      { ...hsl },
      { ...hsl, h: (hsl.h + 120) % 360 },
      { ...hsl, h: (hsl.h + 240) % 360 },
    ],
    splitComplementary: [
      { ...hsl },
      { ...hsl, h: (hsl.h + 150) % 360 },
      { ...hsl, h: (hsl.h + 210) % 360 },
    ],
    tetradic: [
      { ...hsl },
      { ...hsl, h: (hsl.h + 90) % 360 },
      { ...hsl, h: (hsl.h + 180) % 360 },
      { ...hsl, h: (hsl.h + 270) % 360 },
    ],
    monochromatic: [
      { ...hsl, l: Math.max(hsl.l - 30, 10) },
      { ...hsl, l: Math.max(hsl.l - 15, 10) },
      { ...hsl },
      { ...hsl, l: Math.min(hsl.l + 15, 90) },
      { ...hsl, l: Math.min(hsl.l + 30, 90) },
    ],
  };
  const colors = palettes[type as keyof typeof palettes];
  if (!colors)
    throw new Error(
      `Unknown palette type: ${type}. Use: ${Object.keys(palettes).join(", ")}`,
    );
  return colors.map((h: HslColor) => {
    const rgb = hslToRgb(h);
    return {
      hex: rgbToHex(rgb),
      rgb,
      hsl: h,
    };
  });
}
router.get("/color/convert", (req: Request, res: Response) => {
  const { color, palette } = req.query as Record<string, string>;
  if (!color) {
    return res
      .status(400)
      .json({ error: "Query parameter 'color' is required" });
  }
  try {
    const rgb = parseColorToRgb(color);
    const hex = rgbToHex(rgb);
    const hsl = rgbToHsl(rgb);
    const hsv = rgbToHsv(rgb);
    const cmyk = rgbToCmyk(rgb);
    const result: Record<string, unknown> = {
      input: color,
      hex,
      rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      rgbValues: rgb,
      hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
      hslValues: hsl,
      hsv: `hsv(${hsv.h}, ${hsv.s}%, ${hsv.v}%)`,
      hsvValues: hsv,
      cmyk: `cmyk(${cmyk.c}%, ${cmyk.m}%, ${cmyk.y}%, ${cmyk.k}%)`,
      cmykValues: cmyk,
    };
    // Generate palette if requested
    if (palette) {
      result.palette = {
        type: palette,
        colors: generatePalette(hsl, palette),
      };
    }
    res.json(result);
  } catch (error: unknown) {
    res.status(400).json({ error: errorMessage(error) });
  }
});
// ─── 15. LOGO Turtle Graphics ───────────────────────────────
function buildTurtleEmbedHtml(
  commands: string[],
  options: Record<string, unknown> = {},
) {
  const {
    canvasWidth = 800,
    canvasHeight = 600,
    background = "#000000",
    animated = true,
    stepDelay = 40,
    title = "",
    previousCommandCount = 0,
  } = options;
  const commandsJson = JSON.stringify(commands);
  return buildEmbedHtml({
    styles: `
  html, body {
    width: 100% !important;
    height: 100% !important;
    margin: 0 !important;
    padding: 12px !important;
    overflow: hidden !important;
  }
  #container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    gap: 8px;
    overflow: hidden;
  }
  canvas {
    max-width: 100%;
    max-height: calc(100% - 40px);
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 2px;
    box-shadow: 0 4px 24px rgba(15, 23, 42, 0.18);
  }
  #title {
    color: #475569;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  #status {
    color: #64748b;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 11px;
    height: 16px;
    transition: color 0.3s;
  }
  #status.active { color: #0284c7; }
  #status.done { color: #16a34a; }`,
    bodyContent: `<div id="container">
  ${title ? '<div id="title">' + title + '</div>' : ""}
  <canvas id="turtle" width="${canvasWidth}" height="${canvasHeight}"></canvas>
  <div id="status">initializing…</div>
</div>`,
    scripts: `<script>
(function() {
  const canvas = document.getElementById("turtle");
  const ctx = canvas.getContext("2d");
  const status = document.getElementById("status");
  const COMMANDS = ${commandsJson};
  const ANIMATED = ${animated};
  const STEP_DELAY = ${stepDelay};
  const BG = "${background}";
  const PREV_COUNT = ${Number(previousCommandCount) || 0};
  // ── Turtle State ──
  let x = canvas.width / 2;
  let y = canvas.height / 2;
  let angle = -90; // 0 = east, -90 = north (LOGO default: heading north)
  let penDown = true;
  let penColor = "#38bdf8";
  let penWidth = 2;
  let fillColor = "#38bdf8";
  let filling = false;
  let fillPath = [];
  let turtleSpeed = 5;
  let showTurtle = true;
  // ── Drawing Layer (persistent) ──
  const drawCanvas = document.createElement("canvas");
  drawCanvas.width = canvas.width;
  drawCanvas.height = canvas.height;
  const drawCtx = drawCanvas.getContext("2d");
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  function clearCanvas() {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  }
  function resetState() {
    x = canvas.width / 2;
    y = canvas.height / 2;
    angle = -90;
    penDown = true;
    penColor = "#38bdf8";
    penWidth = 2;
    fillColor = "#38bdf8";
    filling = false;
    fillPath = [];
    turtleSpeed = 5;
    showTurtle = true;
    clearCanvas();
  }
  function degreesToRadians(degrees) { return degrees * Math.PI / 180; }
  function drawTurtle() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Draw the persistent drawing layer
    ctx.drawImage(drawCanvas, 0, 0);
    if (!showTurtle) return;
    // Turtle cursor — a triangle pointing in the heading direction
    const size = 12;
    const rad = degreesToRadians(angle);
    const tipX = x + Math.cos(rad) * size * 1.5;
    const tipY = y + Math.sin(rad) * size * 1.5;
    const leftX = x + Math.cos(rad + 2.4) * size;
    const leftY = y + Math.sin(rad + 2.4) * size;
    const rightX = x + Math.cos(rad - 2.4) * size;
    const rightY = y + Math.sin(rad - 2.4) * size;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fillStyle = penColor;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // ── Execute a single command ──
  function executeCommand(cmd) {
    const action = cmd.action || cmd.command || cmd.cmd;
    const commandValue = cmd.value !== undefined ? cmd.value : cmd.distance || cmd.angle || cmd.amount || 0;
    const commandValue2 = cmd.value2 !== undefined ? cmd.value2 : cmd.extent || 0;
    switch (action) {
      case "forward": case "fd": {
        const distanceValue = Number(commandValue);
        const rad = degreesToRadians(angle);
        const nextX = x + Math.cos(rad) * distanceValue;
        const nextY = y + Math.sin(rad) * distanceValue;
        if (penDown) {
          drawCtx.beginPath();
          drawCtx.moveTo(x, y);
          drawCtx.lineTo(nextX, nextY);
          drawCtx.strokeStyle = penColor;
          drawCtx.lineWidth = penWidth;
          drawCtx.stroke();
        }
        if (filling) fillPath.push({ x: nextX, y: nextY });
        x = nextX; y = nextY;
        break;
      }
      case "backward": case "bk": case "back": {
        const distanceValue = -Number(commandValue);
        const rad = degreesToRadians(angle);
        const nextX = x + Math.cos(rad) * distanceValue;
        const nextY = y + Math.sin(rad) * distanceValue;
        if (penDown) {
          drawCtx.beginPath();
          drawCtx.moveTo(x, y);
          drawCtx.lineTo(nextX, nextY);
          drawCtx.strokeStyle = penColor;
          drawCtx.lineWidth = penWidth;
          drawCtx.stroke();
        }
        if (filling) fillPath.push({ x: nextX, y: nextY });
        x = nextX; y = nextY;
        break;
      }
      case "right": case "rt":
        angle += Number(commandValue);
        break;
      case "left": case "lt":
        angle -= Number(commandValue);
        break;
      case "penup": case "pu":
        penDown = false;
        break;
      case "pendown": case "pd":
        penDown = true;
        break;
      case "color": case "pencolor":
        penColor = cmd.color || cmd.value || "#38bdf8";
        break;
      case "width": case "pensize":
        penWidth = Number(commandValue) || 2;
        break;
      case "goto": case "setposition": case "setpos": {
        const goalX = canvas.width / 2 + Number(cmd.x !== undefined ? cmd.x : commandValue);
        const goalY = canvas.height / 2 - Number(cmd.y !== undefined ? cmd.y : commandValue2);
        if (penDown) {
          drawCtx.beginPath();
          drawCtx.moveTo(x, y);
          drawCtx.lineTo(goalX, goalY);
          drawCtx.strokeStyle = penColor;
          drawCtx.lineWidth = penWidth;
          drawCtx.stroke();
        }
        if (filling) fillPath.push({ x: goalX, y: goalY });
        x = goalX; y = goalY;
        break;
      }
      case "setheading": case "seth":
        angle = Number(commandValue) - 90;
        break;
      case "home":
        x = canvas.width / 2;
        y = canvas.height / 2;
        angle = -90;
        break;
      case "circle": {
        const radius = Number(commandValue);
        const extent = 360;
        const headingAngleRadians = degreesToRadians(angle);
        const centerX = x + radius * Math.sin(headingAngleRadians);
        const centerY = y - radius * Math.cos(headingAngleRadians);
        const startAngleRadians = Math.atan2(y - centerY, x - centerX);
        const sweepAngleRadians = -degreesToRadians(extent) * Math.sign(radius);
        const endAngleRadians = startAngleRadians + sweepAngleRadians;
        if (penDown) {
          drawCtx.beginPath();
          drawCtx.arc(centerX, centerY, Math.abs(radius), startAngleRadians, endAngleRadians, sweepAngleRadians < 0);
          drawCtx.strokeStyle = penColor;
          drawCtx.lineWidth = penWidth;
          drawCtx.stroke();
        }
        if (filling) {
          const interpolationSteps = 36;
          for (let stepIndex = 1; stepIndex <= interpolationSteps; stepIndex++) {
            const currentAngleRadians = startAngleRadians + (sweepAngleRadians * stepIndex) / interpolationSteps;
            fillPath.push({
              x: centerX + Math.abs(radius) * Math.cos(currentAngleRadians),
              y: centerY + Math.abs(radius) * Math.sin(currentAngleRadians),
            });
          }
        }
        x = centerX + Math.abs(radius) * Math.cos(endAngleRadians);
        y = centerY + Math.abs(radius) * Math.sin(endAngleRadians);
        angle = angle - extent * Math.sign(radius);
        break;
      }
      case "arc": {
        const radius = Number(commandValue);
        const extent = Number(commandValue2) || 360;
        const headingAngleRadians = degreesToRadians(angle);
        const centerX = x + radius * Math.sin(headingAngleRadians);
        const centerY = y - radius * Math.cos(headingAngleRadians);
        const startAngleRadians = Math.atan2(y - centerY, x - centerX);
        const sweepAngleRadians = -degreesToRadians(extent) * Math.sign(radius);
        const endAngleRadians = startAngleRadians + sweepAngleRadians;
        if (penDown) {
          drawCtx.beginPath();
          drawCtx.arc(centerX, centerY, Math.abs(radius), startAngleRadians, endAngleRadians, sweepAngleRadians < 0);
          drawCtx.strokeStyle = penColor;
          drawCtx.lineWidth = penWidth;
          drawCtx.stroke();
        }
        if (filling) {
          const interpolationSteps = Math.max(12, Math.floor(Math.abs(extent) / 10));
          for (let stepIndex = 1; stepIndex <= interpolationSteps; stepIndex++) {
            const currentAngleRadians = startAngleRadians + (sweepAngleRadians * stepIndex) / interpolationSteps;
            fillPath.push({
              x: centerX + Math.abs(radius) * Math.cos(currentAngleRadians),
              y: centerY + Math.abs(radius) * Math.sin(currentAngleRadians),
            });
          }
        }
        x = centerX + Math.abs(radius) * Math.cos(endAngleRadians);
        y = centerY + Math.abs(radius) * Math.sin(endAngleRadians);
        angle = angle - extent * Math.sign(radius);
        break;
      }
      case "dot": case "stamp": {
        const dotSize = Number(commandValue) || 5;
        drawCtx.beginPath();
        drawCtx.arc(x, y, dotSize, 0, Math.PI * 2);
        drawCtx.fillStyle = penColor;
        drawCtx.fill();
        break;
      }
      case "label": case "write": {
        const text = cmd.text || cmd.value || "";
        drawCtx.font = (cmd.fontSize || 14) + "px system-ui, sans-serif";
        drawCtx.fillStyle = penColor;
        drawCtx.fillText(text, x + 4, y - 4);
        break;
      }
      case "fillcolor":
        fillColor = cmd.color || cmd.value || fillColor;
        break;
      case "begin_fill":
        filling = true;
        fillPath = [{ x, y }];
        break;
      case "end_fill":
        if (filling && fillPath.length > 2) {
          drawCtx.beginPath();
          drawCtx.moveTo(fillPath[0].x, fillPath[0].y);
          for (let i = 1; i < fillPath.length; i++) {
            drawCtx.lineTo(fillPath[i].x, fillPath[i].y);
          }
          drawCtx.closePath();
          drawCtx.fillStyle = fillColor;
          drawCtx.globalAlpha = 0.35;
          drawCtx.fill();
          drawCtx.globalAlpha = 1;
        }
        filling = false;
        fillPath = [];
        break;
      case "speed":
        turtleSpeed = Math.max(1, Math.min(10, Number(commandValue) || 5));
        break;
      case "hideturtle": case "ht":
        showTurtle = false;
        break;
      case "showturtle": case "st":
        showTurtle = true;
        break;
      case "reset":
        x = canvas.width / 2;
        y = canvas.height / 2;
        angle = -90;
        penDown = true;
        penColor = "#38bdf8";
        penWidth = 2;
        showTurtle = true;
        filling = false;
        fillPath = [];
        clearCanvas();
        break;
      case "clear":
        clearCanvas();
        break;
    }
  }
  // ── Animate or instant draw ──
  function run(animateFromIndex) {
    var startIndex = animateFromIndex || 0;
    drawTurtle();
    if (!ANIMATED || COMMANDS.length === 0) {
      for (const cmd of COMMANDS) executeCommand(cmd);
      drawTurtle();
      status.textContent = COMMANDS.length + " commands · done";
      status.className = "done";
      reportSize();
      return;
    }
    // Instantly execute previously-drawn commands (no animation)
    for (var i = 0; i < startIndex && i < COMMANDS.length; i++) {
      executeCommand(COMMANDS[i]);
    }
    if (startIndex >= COMMANDS.length) {
      drawTurtle();
      status.textContent = COMMANDS.length + " commands · done";
      status.className = "done";
      reportSize();
      return;
    }
    drawTurtle();
    var index = startIndex;
    status.className = "active";
    function step() {
      if (index >= COMMANDS.length) {
        drawTurtle();
        status.textContent = COMMANDS.length + " commands · done";
        status.className = "done";
        reportSize();
        return;
      }
      const cmd = COMMANDS[index];
      executeCommand(cmd);
      drawTurtle();
      status.textContent = (index + 1) + "/" + COMMANDS.length + " · " + (cmd.action || cmd.command || "?");
      index++;
      setTimeout(step, STEP_DELAY);
    }
    step();
  }
  // Replay handler — listen for postMessage from parent frame
  window.addEventListener("message", function(event) {
    if (event.data && event.data.type === "turtle-replay") {
      resetState();
      run(0);
    }
  });
  function reportSize() {
    var element = document.body;
    window.parent.postMessage({ type: "embed-resize", width: element.scrollWidth, height: element.scrollHeight }, "*");
  }
  run(PREV_COUNT);
})();
</${"script"}>`,
  });
}
router.post("/turtle", asyncHandler(async (req: Request, res: Response) => {
  const { code, drawingId, width, height } = req.body;

  if (!code || typeof code !== "string" || code.trim().length === 0) {
    return res.status(400).json({
      error: "'code' (non-empty LOGO source code string) is required.",
    });
  }

  const lengthError = validateMaxLength(code, MAX_CODE_LENGTH, "LOGO code");
  if (lengthError) return res.status(400).json({ error: lengthError });

  if (width !== undefined && (typeof width !== "number" || !isFinite(width) || width < 1)) {
    return res.status(400).json({
      error: "'width' must be a positive number (100–1920). Got: " + JSON.stringify(width),
    });
  }
  if (height !== undefined && (typeof height !== "number" || !isFinite(height) || height < 1)) {
    return res.status(400).json({
      error: "'height' must be a positive number (100–1080). Got: " + JSON.stringify(height),
    });
  }

  if (drawingId !== undefined && drawingId !== null) {
    if (typeof drawingId !== "string" || drawingId.length > 36 || !/^[a-zA-Z0-9_-]+$/.test(drawingId)) {
      return res.status(400).json({
        error: "'drawingId' must be an alphanumeric string (max 36 chars, hyphens and underscores allowed)",
      });
    }
  }

  // Resolve canvas dimensions
  const canvasWidth = Math.min(Math.max(width || DEFAULT_CANVAS_WIDTH, 100), 1920);
  const canvasHeight = Math.min(Math.max(height || DEFAULT_CANVAS_HEIGHT, 100), 1080);

  // If drawingId is provided, load previous commands for iterative drawing
  let previousCommands: unknown[] = [];
  let previousOptions: Record<string, unknown> = {};
  if (drawingId && typeof drawingId === "string") {
    const existingDrawing = await getTurtleDrawing(drawingId);
    if (existingDrawing) {
      previousCommands = existingDrawing.commands;
      previousOptions = existingDrawing.options;
    }
  }

  const logoResult = executeLogoProgram(code, {
    timeout: 30_000,
    canvasWidth: (previousOptions.canvasWidth as number) || canvasWidth,
    canvasHeight: (previousOptions.canvasHeight as number) || canvasHeight,
  });

  if (!logoResult.success) {
    return res.status(400).json({
      error: logoResult.error || "LOGO program execution failed",
      executionTimeMs: logoResult.executionTimeMs,
    });
  }

  // Combine with previous commands for iterative drawing
  const allCommands = [...previousCommands, ...logoResult.commands];
  const totalCommandCount = allCommands.length;

  if (totalCommandCount > 50_000) {
    return res.status(400).json({
      error: `Drawing contains ${totalCommandCount} total commands (max 50,000). Simplify the pattern or reduce iterations.`,
    });
  }

  const { username: callerUsername } = extractCallerContext(req);

  // Auto-scale animation speed based on command complexity
  let stepDelay = 40;
  if (totalCommandCount > 2000) stepDelay = 2;
  else if (totalCommandCount > 1000) stepDelay = 4;
  else if (totalCommandCount > 500) stepDelay = 8;
  else if (totalCommandCount > 200) stepDelay = 15;
  else if (totalCommandCount > 50) stepDelay = 25;

  const turtleOptions = {
    canvasWidth: logoResult.canvasWidth,
    canvasHeight: logoResult.canvasHeight,
    background: logoResult.background || "#000000",
    animated: true,
    stepDelay,
    title: "",
    previousCommandCount: previousCommands.length,
  };

  const embedId = drawingId || crypto.randomUUID().slice(0, 12);
  await saveTurtleDrawing(embedId, allCommands, turtleOptions, null, callerUsername);
  const turtleEmbedUrl = buildLocalUrl("compute/turtle/embed", { id: embedId });

  res.json({
    turtleEmbedUrl,
    display: buildDisplay("embed", turtleEmbedUrl, { height: 420, title: "Turtle Graphics" }),
    drawingId: embedId,
    commandCount: totalCommandCount,
    newCommandCount: logoResult.commands.length,
    canvasSize: `${turtleOptions.canvasWidth}x${turtleOptions.canvasHeight}`,
    executionTimeMs: logoResult.executionTimeMs,
  });
}));
router.get("/turtle/embed", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as Record<string, string>;
  if (!id) return res.status(400).send("Missing 'id' parameter");
  const entry = await getTurtleDrawing(id);
  if (!entry) {
    return res.status(404).send("Turtle drawing not found or expired");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(buildTurtleEmbedHtml(entry.commands as string[], entry.options));
}));
// ─── Agentic: Think (Echo Scratchpad) ───────────────────────
// No-op tool — the LLM uses this to write private reasoning.
// We simply acknowledge receipt; the thought is already captured
// in the tool_result appended to the conversation context.
router.post("/think", (req: Request, res: Response) => {
  res.json({ acknowledged: true });
});
// ─── Cron Expression Parser ─────────────────────────────────
// Pure-compute — no external dependencies.
// Parses standard 5-field cron expressions, explains them in
// human-readable English, and computes next N execution times.
const CRON_FIELD_NAMES = ["minute", "hour", "dayOfMonth", "month", "dayOfWeek"];
const CRON_FIELD_RANGES = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 6 },
];
const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function parseCronField(
  field: string,
  { min, max }: { min: number; max: number },
) {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    // Handle step syntax: */5, 1-10/2
    const [rangePart, stepString] = part.split("/");
    const step = stepString ? parseInt(stepString) : 1;
    if (isNaN(step) || step < 1) throw new Error(`Invalid step: ${part}`);
    if (rangePart === "*") {
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (rangePart.includes("-")) {
      const [startString, endString] = rangePart.split("-");
      const start = parseInt(startString);
      const end = parseInt(endString);
      if (
        isNaN(start) ||
        isNaN(end) ||
        start < min ||
        end > max ||
        start > end
      ) {
        throw new Error(`Invalid range: ${part} (valid: ${min}-${max})`);
      }
      for (let i = start; i <= end; i += step) values.add(i);
    } else {
      const value = parseInt(rangePart);
      if (isNaN(value) || value < min || value > max) {
        throw new Error(`Invalid value: ${part} (valid: ${min}-${max})`);
      }
      values.add(value);
    }
  }
  return [...values].sort(
    (
      agent: Record<string, unknown> | number | string,
      b: Record<string, unknown> | number | string,
    ) => (agent as number) - (b as number),
  );
}
function explainCronField(values: number[], fieldIndex: number) {
  const { min, max } = CRON_FIELD_RANGES[fieldIndex];
  const name = CRON_FIELD_NAMES[fieldIndex];
  // Wildcard — all values
  if (values.length === max - min + 1) return `every ${name}`;
  // Single value
  if (values.length === 1) {
    const firstValue = values[0];
    if (fieldIndex === 3) return `in ${MONTH_NAMES[firstValue]}`;
    if (fieldIndex === 4) return `on ${DAY_NAMES[firstValue]}`;
    if (fieldIndex === 0) return `at minute ${firstValue}`;
    if (fieldIndex === 1) return `at hour ${firstValue}`;
    if (fieldIndex === 2) return `on day ${firstValue}`;
    return `${name} ${firstValue}`;
  }
  // Step pattern detection
  if (values.length > 2) {
    const diffs = values.slice(1).map((value: number, i: number) => value - values[i]);
    if (diffs.every((diff: number) => diff === diffs[0])) {
      return `every ${diffs[0]} ${name}s${values[0] !== min ? ` from ${values[0]}` : ""}`;
    }
  }
  // List
  if (fieldIndex === 3)
    return `in ${values.map((value: number) => MONTH_NAMES[value]).join(", ")}`;
  if (fieldIndex === 4)
    return `on ${values.map((value: number) => DAY_NAMES[value]).join(", ")}`;
  return `${name} ${values.join(", ")}`;
}
function getNextCronExecutions(
  parsed: number[][],
  count: number,
  fromDate: Date,
) {
  const results: Date[] = [];
  const currentDate = new Date(fromDate);
  currentDate.setSeconds(0, 0);
  currentDate.setMinutes(currentDate.getMinutes() + 1); // Start from next minute
  const maxIterations = 525960; // ~1 year of minutes
  let iterations = 0;
  while (results.length < count && iterations < maxIterations) {
    iterations++;
    const month = currentDate.getMonth() + 1;
    const dom = currentDate.getDate();
    const dow = currentDate.getDay();
    const hour = currentDate.getHours();
    const minute = currentDate.getMinutes();
    if (
      parsed[3].includes(month) &&
      parsed[2].includes(dom) &&
      parsed[4].includes(dow) &&
      parsed[1].includes(hour) &&
      parsed[0].includes(minute)
    ) {
      results.push(new Date(currentDate));
    }
    currentDate.setMinutes(currentDate.getMinutes() + 1);
  }
  return results;
}
router.get("/cron/parse", (req: Request, res: Response) => {
  const { expression, count, from } = req.query as Record<string, string>;
  if (!expression) {
    return res
      .status(400)
      .json({
        error: "Query parameter 'expression' is required (e.g. '*/5 * * * *')",
      });
  }
  try {
    const fields = expression.trim().split(/\s+/);
    if (fields.length !== 5) {
      return res.status(400).json({
        error: `Expected 5 fields (minute hour day month weekday), got ${fields.length}`,
        hint: "Standard cron: minute(0-59) hour(0-23) day(1-31) month(1-12) weekday(0-6, 0=Sun)",
      });
    }
    const parsed = fields.map((field: string, i: number) =>
      parseCronField(field, CRON_FIELD_RANGES[i]),
    );
    const explanations = parsed.map((vals: number[], i: number) =>
      explainCronField(vals, i),
    );
    const humanReadable = explanations
      .filter(
        (explanation: string) =>
          !explanation.startsWith("every ") ||
          explanation !== `every ${CRON_FIELD_NAMES[explanations.indexOf(explanation)]}`,
      )
      .join(", ");
    const nextCount = Math.min(Math.max(parseInt(count) || 5, 1), 25);
    const fromDate = from ? new Date(from) : new Date();
    const nextExecutions = getNextCronExecutions(parsed, nextCount, fromDate);
    res.json({
      expression,
      fields: Object.fromEntries(
        CRON_FIELD_NAMES.map((name: string, i: number) => [
          name,
          { raw: fields[i], values: parsed[i] },
        ]),
      ),
      explanation: humanReadable,
      descriptions: Object.fromEntries(
        CRON_FIELD_NAMES.map((name: string, i: number) => [
          name,
          explanations[i],
        ]),
      ),
      nextExecutions: nextExecutions.map((date: Date) => date.toISOString()),
      nextExecutionCount: nextExecutions.length,
      fromDate: fromDate.toISOString(),
    });
  } catch (error: unknown) {
    res
      .status(400)
      .json({ error: `Cron parse failed: ${errorMessage(error)}` });
  }
});
// ─── Agentic: Sleep (Timed Pause) ───────────────────────────
// Blocks for `duration_seconds` before responding.
// Max 120s. AbortSignal from upstream will short-circuit.
router.post(
  "/sleep",
  asyncHandler(async (req: Request, res: Response) => {
    const { duration_seconds, reason } = req.body;
    const duration = Math.max(1, Math.min(120, duration_seconds || 5));
    const durationMs = duration * 1000;
    await new Promise<void>((resolve: () => void) => {
      const timer = setTimeout(resolve, durationMs);
      // If the request is aborted (client disconnect), resolve immediately
      req.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    res.json({
      acknowledged: true,
      slept_seconds: duration,
      reason: reason || null,
    });
  }),
);
// ─── Agentic: Synthetic Output (Structured JSON Response) ───
// Validates `data` against an optional JSON Schema and returns it.
// Lightweight validator — handles type, required, enum, nested objects/arrays.
function validateJsonSchema(
  data: unknown,
  schema: Record<string, unknown>,
  path: string = "",
  errors: string[] = [],
) {
  if (!schema || typeof schema !== "object") return;
  const currentPath = path || "root";
  if (schema.type) {
    const expected = schema.type;
    if (
      expected === "object" &&
      (typeof data !== "object" || data === null || Array.isArray(data))
    ) {
      errors.push(
        `${currentPath}: expected object, got ${Array.isArray(data) ? "array" : typeof data}`,
      );
      return;
    }
    if (expected === "array" && !Array.isArray(data)) {
      errors.push(`${currentPath}: expected array, got ${typeof data}`);
      return;
    }
    if (expected === "string" && typeof data !== "string")
      errors.push(`${currentPath}: expected string, got ${typeof data}`);
    if (expected === "number" && typeof data !== "number")
      errors.push(`${currentPath}: expected number, got ${typeof data}`);
    if (expected === "boolean" && typeof data !== "boolean")
      errors.push(`${currentPath}: expected boolean, got ${typeof data}`);
  }
  if (
    schema.enum &&
    Array.isArray(schema.enum) &&
    !schema.enum.includes(data)
  ) {
    errors.push(
      `${currentPath}: value must be one of [${schema.enum.join(", ")}]`,
    );
  }
  if (typeof data === "string") {
    if (
      schema.minLength !== undefined &&
      (data as string).length < (schema.minLength as number)
    )
      errors.push(
        `${currentPath}: string length ${(data as string).length} < minLength ${schema.minLength}`,
      );
    if (
      schema.maxLength !== undefined &&
      (data as string).length > (schema.maxLength as number)
    )
      errors.push(
        `${currentPath}: string length ${(data as string).length} > maxLength ${schema.maxLength}`,
      );
  }
  if (typeof data === "number") {
    if (
      schema.minimum !== undefined &&
      (data as number) < (schema.minimum as number)
    )
      errors.push(`${currentPath}: ${data} < minimum ${schema.minimum}`);
    if (
      schema.maximum !== undefined &&
      (data as number) > (schema.maximum as number)
    )
      errors.push(`${currentPath}: ${data} > maximum ${schema.maximum}`);
  }
  if (
    schema.required &&
    Array.isArray(schema.required) &&
    typeof data === "object" &&
    data !== null
  ) {
    for (const key of schema.required) {
      if ((data as Record<string, unknown>)[key] === undefined)
        errors.push(`${currentPath}: missing required field "${key}"`);
    }
  }
  if (
    schema.properties &&
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data)
  ) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if ((data as Record<string, unknown>)[key] !== undefined)
        validateJsonSchema(
          (data as Record<string, unknown>)[key],
          propSchema,
          `${path ? path + "." : ""}${key}`,
          errors,
        );
    }
  }
  if ((schema.items as Record<string, unknown>) && Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      validateJsonSchema(
        (data as unknown[])[i],
        schema.items as Record<string, unknown>,
        `${path}[${i}]`,
        errors,
      );
    }
  }
}
router.post("/synthetic-output", (req: Request, res: Response) => {
  const { schema, data, label } = req.body;
  if (!data || typeof data !== "object") {
    return res
      .status(400)
      .json({ error: "'data' is required and must be an object" });
  }
  const validationErrors: string[] = [];
  if (schema && typeof schema === "object") {
    try {
      validateJsonSchema(data, schema, "", validationErrors);
    } catch (error: unknown) {
      validationErrors.push(`Validation error: ${errorMessage(error)}`);
    }
  }
  const result: Record<string, unknown> = {
    acknowledged: true,
    label: label || null,
    data,
    _synthetic: true,
  };
  if (validationErrors.length > 0) {
    result.validationWarnings = validationErrors;
  }
  res.json(result);
});
// ─── Image Processing (Sharp + ImageMagick) ─────────────────
const imageStore = new PersistentStore<{ buffer: Buffer; mimeType: string }>("image");
router.post(
  "/image/process",
  asyncHandler(async (req: Request, res: Response) => {
    const { input, operations, outputFormat, outputQuality } = req.body;
    if (!input) {
      return res
        .status(400)
        .json({
          error:
            "'input' is required (URL, base64 data URI, or previous imageId)",
        });
    }
    if (!operations || !Array.isArray(operations) || operations.length === 0) {
      return res
        .status(400)
        .json({
          error: "'operations' must be a non-empty array of operation objects",
        });
    }
    try {
      // processImage returns a union of metadata-only or buffer result shapes
      const result = (await processImage({
        input,
        operations,
        outputFormat: outputFormat || "png",
        outputQuality: outputQuality || 80,
        store: imageStore,
      })) as {
        buffer?: Buffer;
        mimeType?: string;
        metadata?: Record<string, unknown>;
      };
      // Metadata-only request
      if (result.metadata && !result.buffer) {
        return res.json({
          success: true,
          metadata: result.metadata,
        });
      }
      // Upload to MinIO for permanent URL, keep ephemeral store for imageId chains
      const minioUrl = await MinioService.uploadToolAsset(result.buffer!, result.mimeType!);
      const id = imageStore.set({
        buffer: result.buffer!,
        mimeType: result.mimeType!,
      });
      const imageUrl = minioUrl || buildLocalUrl("compute/image/render", { id });
      const response: Record<string, unknown> = {
        success: true,
        imageUrl,
        imageId: id,
        mimeType: result.mimeType,
        display: buildDisplay("image", imageUrl, { title: "Image" }),
      };
      if (result.metadata) response.metadata = result.metadata;
      res.json(response);
    } catch (error: unknown) {
      res
        .status(400)
        .json({ error: `Image processing failed: ${errorMessage(error)}` });
    }
  }),
);
router.get("/image/render", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as Record<string, string>;
  if (!id) return res.status(400).send("Missing 'id' parameter");
  const entry = await imageStore.getWithFallback(id);
  if (!entry) {
    return res.status(404).send("Image not found or expired");
  }
  res.setHeader("Content-Type", entry.mimeType || "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(Buffer.from(entry.buffer));
}));
// ─── Video to GIF Conversion ─────────────────────────────────
router.post(
  "/video/gif",
  asyncHandler(async (req: Request, res: Response) => {
    const { input, quality, width, fps } = req.body;
    if (!input) {
      return res
        .status(400)
        .json({ error: "'input' is required (URL or local path)" });
    }
    try {
      const conversionResult = await convertVideoToGif({
        input,
        quality,
        width: width ? parseInt(width, 10) : undefined,
        fps: fps ? parseInt(fps, 10) : undefined,
      });
      // Upload to MinIO for permanent URL
      const minioUrl = await MinioService.uploadToolAsset(
        conversionResult.buffer,
        conversionResult.mimeType,
      );
      const uniqueImageId = imageStore.set({
        buffer: conversionResult.buffer,
        mimeType: conversionResult.mimeType,
      });
      const gifUrl = minioUrl || buildLocalUrl("compute/image/render", {
        id: uniqueImageId,
      });
      res.json({
        success: true,
        imageUrl: gifUrl,
        imageId: uniqueImageId,
        mimeType: conversionResult.mimeType,
        display: buildDisplay("image", gifUrl, { title: "GIF" }),
      });
    } catch (error: unknown) {
      res
        .status(400)
        .json({
          error: `Video to GIF conversion failed: ${errorMessage(error)}`,
        });
    }
  }),
);
// ─── Image to ASCII Art ─────────────────────────────────────
interface AsciiStoreEntry {
  ascii: string;
  ansi: string;
  width: number;
  height: number;
  pixels: AsciiPixel[][];
}
const asciiStore = new PersistentStore<AsciiStoreEntry>("ascii");

function buildAsciiEmbedHtml(entry: AsciiStoreEntry) {
  const pixelsJson = JSON.stringify(entry.pixels);

  return buildEmbedHtml({
    headExtra: `<title>High-Fidelity ASCII Art Generator</title>`,
    styles: `
  body {
    font-family: system-ui, -apple-system, sans-serif;
    color: #e2e8f0;
    margin: 0;
    padding: 24px;
    min-height: 100vh;
    background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
  }
  #app {
    width: 100%;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 20px;
    align-items: center;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 24px;
    background: rgba(30, 41, 59, 0.7);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    padding: 16px 28px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    width: 100%;
    max-width: 800px;
  }
  .control-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .control-group label {
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .control-group input[type="range"] {
    accent-color: #38bdf8;
    width: 120px;
    height: 6px;
    border-radius: 3px;
    cursor: pointer;
  }
  #font-size-value {
    font-size: 12px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: #38bdf8;
    font-weight: 600;
    min-width: 38px;
  }
  .control-group select {
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    outline: none;
    cursor: pointer;
    transition: all 0.2s;
  }
  .control-group select:hover {
    border-color: #38bdf8;
    background: #1e293b;
  }
  .toggles {
    gap: 24px;
  }
  .toggle-switch {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    font-weight: 600;
    color: #e2e8f0;
    cursor: pointer;
    user-select: none;
  }
  .toggle-switch input {
    display: none;
  }
  .toggle-switch .slider {
    width: 40px;
    height: 22px;
    background-color: rgba(255, 255, 255, 0.1);
    border-radius: 22px;
    position: relative;
    transition: background-color 0.3s;
  }
  .toggle-switch .slider::before {
    content: "";
    position: absolute;
    width: 16px;
    height: 16px;
    left: 3px;
    bottom: 3px;
    background-color: #e2e8f0;
    border-radius: 50%;
    transition: transform 0.3s;
  }
  .toggle-switch input:checked + .slider {
    background-color: #38bdf8;
  }
  .toggle-switch input:checked + .slider::before {
    transform: translateX(18px);
    background-color: #0f172a;
  }
  #copy-button {
    background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%);
    color: #0f172a;
    border: none;
    border-radius: 10px;
    padding: 10px 20px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(56, 189, 248, 0.3);
    transition: all 0.2s;
  }
  #copy-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(56, 189, 248, 0.4);
  }
  #copy-button:active {
    transform: translateY(0);
  }
  #ascii-container {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 32px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    max-width: 100%;
    width: fit-content;
    overflow: auto;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  #ascii-pre {
    margin: 0;
    font-family: 'SF Mono', 'Fira Code', 'Courier New', monospace;
    font-weight: 700;
    line-height: 0.9;
    letter-spacing: 0px;
    text-align: left;
    white-space: pre;
    transition: font-size 0.15s;
  }
`,
    bodyContent: `
<div id="app">
  <div class="toolbar">
    <div class="control-group">
      <label for="font-size">Zoom</label>
      <input type="range" id="font-size" min="4" max="24" value="8" step="1" oninput="updateFont(this.value)">
      <span id="font-size-value">8px</span>
    </div>
    
    <div class="control-group">
      <label for="charset-select">Style</label>
      <select id="charset-select" onchange="changeCharset(this.value)">
        <option value="high">High Fidelity</option>
        <option value="medium">Medium Fidelity</option>
        <option value="simple">Simple</option>
        <option value="blocks">Blocks (Text Image)</option>
      </select>
    </div>
    
    <div class="control-group toggles">
      <label class="toggle-switch">
        <input type="checkbox" id="color-toggle" checked onchange="toggleColor(this.checked)">
        <span class="slider"></span>
        Color
      </label>
      
      <label class="toggle-switch">
        <input type="checkbox" id="reverse-toggle" onchange="toggleReverse(this.checked)">
        <span class="slider"></span>
        Invert
      </label>
    </div>

    <button id="copy-button" onclick="copyRawAscii()">Copy Raw ASCII</button>
  </div>
  
  <div id="ascii-container">
    <pre id="ascii-pre"></pre>
  </div>
</div>
`,
    scripts: `
<script>
(function() {
  const PIXELS = ${pixelsJson};
  const CHARSETS = {
    high: "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\\\|()1{}[]?-_+~<>i!lI;:,\\"^\\\`'. ",
    medium: "@#S%?*+;:-. ",
    simple: "@#*+=-:.  ",
    blocks: "█▓▒░ "
  };

  let currentSize = 8;
  let currentCharset = 'high';
  let isColored = true;
  let isReversed = false;

  window.updateFont = function(size) {
    currentSize = parseInt(size);
    document.getElementById('font-size-value').textContent = size + 'px';
    document.getElementById('ascii-pre').style.fontSize = size + 'px';
    reportSize();
  };

  window.changeCharset = function(newCharset) {
    currentCharset = newCharset;
    renderAscii();
  };

  window.toggleColor = function(checked) {
    isColored = checked;
    renderAscii();
  };

  window.toggleReverse = function(checked) {
    isReversed = checked;
    renderAscii();
  };

  function renderAscii() {
    const pre = document.getElementById('ascii-pre');
    const charset = CHARSETS[currentCharset];
    const charsetLength = charset.length;
    
    let html = '';
    
    for (let y = 0; y < PIXELS.length; y++) {
      const row = PIXELS[y];
      for (let x = 0; x < row.length; x++) {
        const pixel = row[x];
        const brightness = pixel.brightness;
        
        let characterIndex = Math.floor((brightness / 255) * (charsetLength - 1));
        if (isReversed) {
          characterIndex = (charsetLength - 1) - characterIndex;
        }
        const char = charset[characterIndex];
        
        // Escape HTML special characters
        let escChar = char;
        if (char === '<') escChar = '&lt;';
        else if (char === '>') escChar = '&gt;';
        else if (char === '&') escChar = '&amp;';
        else if (char === ' ') escChar = '&nbsp;';
        
        if (isColored) {
          html += '<span style="color: ' + pixel.hex + '">' + escChar + '</span>';
        } else {
          html += escChar;
        }
      }
      html += '\\n';
    }
    
    pre.innerHTML = html;
    reportSize();
  }

  window.copyRawAscii = function() {
    const charset = CHARSETS[currentCharset];
    const charsetLength = charset.length;
    let text = '';
    
    for (let y = 0; y < PIXELS.length; y++) {
      const row = PIXELS[y];
      for (let x = 0; x < row.length; x++) {
        const pixel = row[x];
        let characterIndex = Math.floor((pixel.brightness / 255) * (charsetLength - 1));
        if (isReversed) {
          characterIndex = (charsetLength - 1) - characterIndex;
        }
        text += charset[characterIndex];
      }
      text += '\\n';
    }
    
    navigator.clipboard.writeText(text).then(() => {
      const copyButton = document.getElementById('copy-button');
      const oldText = copyButton.textContent;
      copyButton.textContent = 'Copied!';
      copyButton.style.background = 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)';
      setTimeout(() => {
        copyButton.textContent = oldText;
        copyButton.style.background = '';
      }, 2000);
    });
  };

  function reportSize() {
    var element = document.body;
    window.parent.postMessage({ type: "embed-resize", width: element.scrollWidth, height: element.scrollHeight }, "*");
  }

  // Initial render
  updateFont(currentSize);
  renderAscii();
})();
</script>
`,
  });
}

router.post(
  "/image/ascii",
  asyncHandler(async (req: Request, res: Response) => {
    const { input, width, chars, contrast, reverse } = req.body;
    if (!input) {
      return res
        .status(400)
        .json({
          error:
            "'input' is required (URL, base64 data URI, or previous imageId)",
        });
    }

    try {
      const result = await convertToAscii({
        input,
        width: width ? parseInt(width) : undefined,
        chars,
        contrast: contrast ? parseFloat(contrast) : undefined,
        reverse: reverse === true,
        store: imageStore,
      });

      const asciiId = asciiStore.set({
        ascii: result.ascii,
        ansi: result.ansi,
        width: result.width,
        height: result.height,
        pixels: result.pixels,
      });

      const asciiEmbedUrl = buildLocalUrl("compute/image/ascii/embed", {
        id: asciiId,
      });

      res.json({
        success: true,
        ascii: result.ascii,
        ansi: result.ansi,
        asciiId,
        asciiEmbedUrl,
        display: buildDisplay("embed", asciiEmbedUrl, { height: 600, title: "ASCII Art" }),
        width: result.width,
        height: result.height,
      });
    } catch (error: unknown) {
      res
        .status(400)
        .json({ error: `ASCII conversion failed: ${errorMessage(error)}` });
    }
  }),
);

router.get("/image/ascii/embed", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as Record<string, string>;
  if (!id) return res.status(400).send("Missing 'id' parameter");
  const entry = await asciiStore.getWithFallback(id);
  if (!entry) {
    return res.status(404).send("ASCII drawing not found or expired");
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(buildAsciiEmbedHtml(entry));
}));

// ─── 3D Object Creation ─────────────────────────────────────

// Shared session resolution for the four 3D builders. Sessions used to be
// silently recreated when an ID was unknown or expired, which reported
// isAppend: true while all previously-built geometry was gone.
type ThreeDimensionalSessionResolution<T> =
  | { error: string }
  | { sessionKey: string; existing: T | null };

function resolveThreeDimensionalSession<T>(
  sessions: Map<string, T>,
  sessionId: unknown,
  buildKindHint: string,
): ThreeDimensionalSessionResolution<T> {
  if (sessionId === undefined || sessionId === null || sessionId === "") {
    return { sessionKey: crypto.randomUUID().slice(0, 12), existing: null };
  }
  if (typeof sessionId !== "string" || sessionId === "null" || sessionId === "undefined") {
    return {
      error:
        `Invalid sessionId (got: ${JSON.stringify(sessionId)}). Pass the exact sessionId ` +
        `returned by a previous call, or omit it to start a new ${buildKindHint}.`,
    };
  }
  const existing = sessions.get(sessionId);
  if (!existing) {
    return {
      error:
        `Session '${sessionId}' not found or expired (sessions expire after 30 minutes of ` +
        `inactivity). Omit sessionId to start a new ${buildKindHint} — the response returns ` +
        `a server-assigned sessionId for appending — and resend the full content, not just ` +
        `the additions.`,
    };
  }
  return { sessionKey: sessionId, existing };
}

/**
 * Coerce a geometry array parameter that a model sent as a string. Valid
 * JSON (with or without outer brackets) parses; anything else — Python list
 * comprehensions are a real production occurrence — gets a teaching error.
 */
function coerceGeometryArray(value: unknown, parameterName: string): { value: unknown } | { error: string } {
  if (typeof value !== "string") return { value };
  for (const candidate of [value, `[${value}]`]) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return { value: parsed };
      break;
    } catch {
      // try the bracket-wrapped variant, then fall through to the error
    }
  }
  return {
    error:
      `'${parameterName}' was sent as a string that is not a JSON array. Send a literal ` +
      `JSON array of numbers — code expressions or list comprehensions are not evaluated. ` +
      `Example: [[0, 0, 0], [1, 0, 0], [0, 1, 0]]`,
  };
}

// ── Create 3D Mesh (Triangle-level vertex + face data) ────────
interface MeshSession {
  vertices: MeshVertex[];
  faces: MeshFace[];
  normals?: MeshVertex[];
  colors?: string[];
  options: Record<string, unknown>;
  updatedAt: number;
}

const meshSessions = new Map<string, MeshSession>();
const MESH_SESSION_TTL_MS = 30 * 60_000; // 30 min

function cleanupMeshSessions() {
  const now = Date.now();
  for (const [id, session] of meshSessions) {
    if (now - session.updatedAt > MESH_SESSION_TTL_MS) {
      meshSessions.delete(id);
    }
  }
}

router.post("/3d/mesh", asyncHandler(async (req: Request, res: Response) => {
  const { options, sessionId } = req.body;
  let { vertices, faces, normals, colors } = req.body;

  // Models regularly send geometry arrays as strings; parse them instead of
  // failing with "is required" (the string production pattern behind a third
  // of all mesh errors).
  for (const [parameterName, rawValue] of [["vertices", vertices], ["faces", faces], ["normals", normals], ["colors", colors]] as const) {
    if (typeof rawValue !== "string") continue;
    const coerced = coerceGeometryArray(rawValue, parameterName);
    if ("error" in coerced) {
      return res.status(400).json({ error: coerced.error });
    }
    if (parameterName === "vertices") vertices = coerced.value;
    else if (parameterName === "faces") faces = coerced.value;
    else if (parameterName === "normals") normals = coerced.value;
    else colors = coerced.value;
  }

  const oversizeHint =
    " If you did include this parameter, the call's arguments may have exceeded the " +
    "tool-argument size limit and arrived empty — send the mesh in smaller batches: " +
    "create it with the first batch, then append with the returned sessionId.";
  if (!vertices || !Array.isArray(vertices) || vertices.length === 0) {
    return res.status(400).json({
      error: "'vertices' is required (non-empty array of [x, y, z] triples)." + oversizeHint,
    });
  }
  if (!faces || !Array.isArray(faces) || faces.length === 0) {
    return res.status(400).json({
      error:
        "'faces' is required (non-empty array of [v0, v1, v2] vertex-index triples that " +
        "triangulate the surface — this tool renders triangle meshes, not point clouds)." +
        oversizeHint,
    });
  }

  const sessionResolution = resolveThreeDimensionalSession(meshSessions, sessionId, "mesh");
  if ("error" in sessionResolution) {
    return res.status(400).json({ error: sessionResolution.error });
  }
  const { sessionKey, existing: existingSession } = sessionResolution;
  const isAppend = existingSession !== null;

  const { username: callerUsername } = extractCallerContext(req);

  let combinedVertices = vertices;
  let combinedFaces = faces;
  let combinedNormals = normals;
  let combinedColors = colors;
  let combinedOptions = options || {};
  const previousVertexCount = existingSession ? existingSession.vertices.length : 0;

  if (existingSession) {
    combinedOptions = { ...existingSession.options, ...options };
    combinedVertices = [...existingSession.vertices, ...vertices];

    // Face indices are ABSOLUTE across the accumulated mesh (as documented):
    // new-vertex indices start at previousVertexCount, and faces may also
    // reference vertices from earlier calls to stitch geometry together.
    combinedFaces = [...existingSession.faces, ...faces];

    if (existingSession.normals || normals) {
      const padNorm = () => [0, 1, 0] as MeshVertex;
      const previousNorms = existingSession.normals || Array.from({ length: previousVertexCount }, padNorm);
      const newNorms = normals || Array.from({ length: vertices.length }, padNorm);
      combinedNormals = [...previousNorms, ...newNorms];
    }

    if (existingSession.colors || colors) {
      const defaultColor = combinedOptions.meshColor || "#38bdf8";
      const previousColors = existingSession.colors || Array.from({ length: previousVertexCount }, () => defaultColor);
      const newColors = colors || Array.from({ length: vertices.length }, () => defaultColor);
      combinedColors = [...previousColors, ...newColors];
    }
  }

  const combinedInput = {
    vertices: combinedVertices,
    faces: combinedFaces,
    normals: combinedNormals,
    colors: combinedColors,
    options: combinedOptions,
  };

  const validationError = validateMeshInput(combinedInput);
  if (validationError) {
    const appendContext = isAppend
      ? ` (this call appends to session '${sessionKey}': the accumulated mesh has ` +
        `${combinedVertices.length} vertices, and face indices are absolute — this call's ` +
        `new vertices are indices ${previousVertexCount}-${combinedVertices.length - 1})`
      : "";
    return res.status(400).json({ error: validationError + appendContext });
  }

  meshSessions.set(sessionKey, {
    vertices: combinedVertices,
    faces: combinedFaces,
    normals: combinedNormals,
    colors: combinedColors,
    options: combinedOptions,
    updatedAt: Date.now(),
  });
  cleanupMeshSessions();

  const sceneId = crypto.randomUUID().slice(0, 12);
  await saveThreeDimensionalScene(
    sceneId,
    "mesh",
    {
      vertices: combinedVertices,
      faces: combinedFaces,
      normals: combinedNormals || null,
      colors: combinedColors || null,
    },
    combinedOptions,
    sessionKey,
    callerUsername,
  );

  const sceneEmbedUrl = buildLocalUrl("compute/3d/embed", { id: sceneId, type: "mesh" });

  const message = isAppend
    ? `Appended ${vertices.length} vertices (absolute indices ${previousVertexCount}-` +
      `${combinedVertices.length - 1}) and ${faces.length} faces to session '${sessionKey}'. ` +
      `The mesh now has ${combinedVertices.length} vertices and ${combinedFaces.length} faces. ` +
      `Face indices are absolute across the accumulated mesh, so appended faces may also ` +
      `reference earlier vertices.`
    : `Created mesh with ${vertices.length} vertices and ${faces.length} faces. To append ` +
      `more geometry, call again with sessionId '${sessionKey}' — face indices are absolute, ` +
      `so vertices added next start at index ${combinedVertices.length}. Sessions expire ` +
      `after 30 minutes of inactivity.`;

  res.json({
    message,
    sceneEmbedUrl,
    display: buildDisplay("embed", sceneEmbedUrl, { height: 480, title: "3D Mesh" }),
    sceneId,
    sceneType: "mesh",
    sessionId: sessionKey,
    vertexCount: vertices.length,
    faceCount: faces.length,
    totalVertices: combinedVertices.length,
    totalFaces: combinedFaces.length,
    isAppend,
    hasVertexColors: !!combinedColors && combinedColors.length > 0,
    hasCustomNormals: !!combinedNormals && combinedNormals.length > 0,
  });
}));
// Resolve {type: "asset", assetId} placeholders into real geometry by
// fetching the referenced build from the persistent scene store. Model and
// scene assets inline as a group; mesh assets inline as a raw-geometry
// object the scene renderer builds a BufferGeometry from.
async function resolveSceneAssetReferences(
  sceneObjects: Array<Record<string, unknown>>,
): Promise<{ objects: SceneObject[] } | { error: string }> {
  const resolvedObjects: SceneObject[] = [];
  for (let index = 0; index < sceneObjects.length; index++) {
    const sceneObject = sceneObjects[index];
    if (!sceneObject || typeof sceneObject !== "object" || sceneObject.type !== "asset") {
      resolvedObjects.push(sceneObject as unknown as SceneObject);
      continue;
    }
    const assetId = sceneObject.assetId;
    if (typeof assetId !== "string" || assetId.trim().length === 0) {
      return {
        error:
          `Object at index ${index} has type "asset" but no 'assetId'. Pass the sceneId ` +
          `returned by a previous create_3d_scene or create_3d_mesh call.`,
      };
    }
    const assetDocument = await getThreeDimensionalScene(assetId.trim());
    if (!assetDocument) {
      return {
        error:
          `No saved 3D build found with assetId '${assetId}'. Use the exact sceneId returned ` +
          `by a previous create_3d_scene or create_3d_mesh call (asset builds persist across ` +
          `sessions, so any past sceneId works).`,
      };
    }
    const placement = {
      name: (sceneObject.name as string | undefined) ?? `asset-${assetId}`,
      position: sceneObject.position as [number, number, number] | undefined,
      rotation: sceneObject.rotation as [number, number, number] | undefined,
      scale: sceneObject.scale as [number, number, number] | undefined,
      animation: sceneObject.animation as SceneObject["animation"],
    };
    if (assetDocument.sceneType === "mesh") {
      resolvedObjects.push({
        type: "mesh",
        vertices: assetDocument.sceneData.vertices as number[][],
        faces: assetDocument.sceneData.faces as number[][],
        colors: (assetDocument.sceneData.colors as string[] | null) ?? undefined,
        material: sceneObject.material as SceneObject["material"],
        ...placement,
      });
    } else if (assetDocument.sceneType === "model" || assetDocument.sceneType === "scene") {
      const assetObjects = (assetDocument.sceneData.objects ?? []) as Array<Record<string, unknown>>;
      for (const assetObject of assetObjects) {
        if (assetObject && typeof assetObject === "object" && assetObject.type === undefined && typeof assetObject.shape === "string") {
          assetObject.type = assetObject.shape;
        }
      }
      resolvedObjects.push({
        type: "group",
        children: assetObjects as unknown as SceneObject[],
        ...placement,
      });
    } else {
      return {
        error:
          `Asset '${assetId}' is a ${assetDocument.sceneType} build, which can't be placed in ` +
          `a scene yet. Placeable assets: mesh, model, and scene builds. For voxel-style ` +
          `content inside a scene, compose primitive shapes instead.`,
      };
    }
  }
  return { objects: resolvedObjects };
}

// ── Create 3D Scene (Declarative scene graph) ─────────────────
interface SceneSession {
  scene?: SceneConfig;
  objects: SceneObject[];
  options?: SceneOptions;
  updatedAt: number;
}

const sceneSessions = new Map<string, SceneSession>();
const SCENE_SESSION_TTL_MS = 30 * 60_000; // 30 min

function cleanupSceneSessions() {
  const currentTimestamp = Date.now();
  for (const [id, session] of sceneSessions) {
    if (currentTimestamp - session.updatedAt > SCENE_SESSION_TTL_MS) {
      sceneSessions.delete(id);
    }
  }
}

router.post("/3d/scene", asyncHandler(async (req: Request, res: Response) => {
  const { scene: sceneConfiguration, objects: sceneObjects, options: sceneOptions, sessionId } = req.body;

  if (!sceneObjects || !Array.isArray(sceneObjects) || sceneObjects.length === 0) {
    return res.status(400).json({
      error: "'objects' is required (non-empty array of scene objects)",
    });
  }

  // Scene objects use 'type' but the sibling create_3d_model tool uses
  // 'shape' — models mix them up constantly, so accept both (recursively,
  // since group children nest).
  const aliasShapeToType = (objectList: Array<Record<string, unknown>>) => {
    for (const sceneObject of objectList) {
      if (!sceneObject || typeof sceneObject !== "object") continue;
      if (sceneObject.type === undefined && typeof sceneObject.shape === "string") {
        sceneObject.type = sceneObject.shape;
      }
      if (Array.isArray(sceneObject.children)) {
        aliasShapeToType(sceneObject.children as Array<Record<string, unknown>>);
      }
    }
  };
  aliasShapeToType(sceneObjects);

  const assetResolution = await resolveSceneAssetReferences(sceneObjects);
  if ("error" in assetResolution) {
    return res.status(400).json({ error: assetResolution.error });
  }
  const resolvedSceneObjects = assetResolution.objects;

  const sessionResolution = resolveThreeDimensionalSession(sceneSessions, sessionId, "scene");
  if ("error" in sessionResolution) {
    return res.status(400).json({ error: sessionResolution.error });
  }
  const { sessionKey, existing } = sessionResolution;
  const isAppend = existing !== null;

  const { username: callerUsername } = extractCallerContext(req);

  let combinedSceneConfiguration = sceneConfiguration || {};
  let combinedSceneObjects = resolvedSceneObjects;
  let combinedSceneOptions = sceneOptions || {};

  if (existing) {
    const existingSession = existing;

    // Merge options
    combinedSceneOptions = { ...existingSession.options, ...sceneOptions };

    // Deep merge scene config
    combinedSceneConfiguration = {
      ...existingSession.scene,
      ...sceneConfiguration,
    };
    if (existingSession.scene?.ground || sceneConfiguration?.ground) {
      combinedSceneConfiguration.ground = {
        ...existingSession.scene?.ground,
        ...sceneConfiguration?.ground,
      };
    }
    if (existingSession.scene?.camera || sceneConfiguration?.camera) {
      combinedSceneConfiguration.camera = {
        ...existingSession.scene?.camera,
        ...sceneConfiguration?.camera,
      };
    }
    if (existingSession.scene?.fog || sceneConfiguration?.fog) {
      combinedSceneConfiguration.fog = {
        ...existingSession.scene?.fog,
        ...sceneConfiguration?.fog,
      };
    }

    // Append new objects
    combinedSceneObjects = [...existingSession.objects, ...resolvedSceneObjects];
  }

  const combinedSceneInput = {
    scene: combinedSceneConfiguration,
    objects: combinedSceneObjects,
    options: combinedSceneOptions,
  };

  // Apply reference texture from user-attached images to scene objects that lack explicit textures.
  // Recursively handles group children since scene objects support hierarchical nesting.
  const { referenceTextureUrl } = req.body;
  if (referenceTextureUrl && typeof referenceTextureUrl === "string") {
    const texturePlaceholderValues = ["reference", "placeholder"];
    const applyTextureToSceneObjects = (objectList: typeof sceneObjects) => {
      for (const sceneObject of objectList) {
        if (sceneObject.material?.textureUrl && typeof sceneObject.material.textureUrl === "string" && texturePlaceholderValues.includes(sceneObject.material.textureUrl)) {
          sceneObject.material.textureUrl = referenceTextureUrl;
        }
        if (sceneObject.children && Array.isArray(sceneObject.children)) {
          applyTextureToSceneObjects(sceneObject.children);
        }
      }
    };
    applyTextureToSceneObjects(combinedSceneObjects);
  }

  const validationError = validateSceneInput(combinedSceneInput);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  sceneSessions.set(sessionKey, {
    scene: combinedSceneConfiguration,
    objects: combinedSceneObjects,
    options: combinedSceneOptions,
    updatedAt: Date.now(),
  });
  cleanupSceneSessions();

  const sceneId = crypto.randomUUID().slice(0, 12);
  await saveThreeDimensionalScene(
    sceneId,
    "scene",
    { scene: combinedSceneConfiguration || {}, objects: combinedSceneObjects },
    combinedSceneOptions,
    sessionKey,
    callerUsername,
  );

  const sceneEmbedUrl = buildLocalUrl("compute/3d/embed", { id: sceneId, type: "scene" });

  res.json({
    message: isAppend
      ? `Appended ${resolvedSceneObjects.length} object(s) to session '${sessionKey}' — the scene now has ${combinedSceneObjects.length}. Call again with this sessionId to keep building; sessions expire after 30 minutes of inactivity.`
      : `Created scene with ${resolvedSceneObjects.length} object(s). To append more, call again with sessionId '${sessionKey}'; sessions expire after 30 minutes of inactivity.`,
    sceneEmbedUrl,
    display: buildDisplay("embed", sceneEmbedUrl, { height: 480, title: "3D Scene" }),
    sceneId,
    sceneType: "scene",
    sessionId: sessionKey,
    objectCount: resolvedSceneObjects.length,
    totalObjects: combinedSceneObjects.length,
    isAppend,
    environment: combinedSceneConfiguration?.environment || "studio",
  });
}));

// ── Create 3D Model (Primitive shape composition) ─────────────
interface ModelSession {
  objects: ModelObject[];
  options: Record<string, unknown>;
  updatedAt: number;
}

const modelSessions = new Map<string, ModelSession>();
const MODEL_SESSION_TTL_MS = 30 * 60_000; // 30 min

function cleanupModelSessions() {
  const currentTimestamp = Date.now();
  for (const [id, session] of modelSessions) {
    if (currentTimestamp - session.updatedAt > MODEL_SESSION_TTL_MS) {
      modelSessions.delete(id);
    }
  }
}

router.post("/3d/model", asyncHandler(async (req: Request, res: Response) => {
  const { objects: modelObjects, options: modelOptions, sessionId } = req.body;

  if (!modelObjects || !Array.isArray(modelObjects) || modelObjects.length === 0) {
    return res.status(400).json({
      error: "'objects' is required (non-empty array of model primitive objects)",
    });
  }

  // Model objects use 'shape' but the sibling create_3d_scene tool uses
  // 'type' — accept both.
  for (const modelObject of modelObjects) {
    if (modelObject && typeof modelObject === "object" && modelObject.shape === undefined && typeof modelObject.type === "string") {
      modelObject.shape = modelObject.type;
    }
  }

  const sessionResolution = resolveThreeDimensionalSession(modelSessions, sessionId, "model");
  if ("error" in sessionResolution) {
    return res.status(400).json({ error: sessionResolution.error });
  }
  const { sessionKey, existing: existingModelSession } = sessionResolution;
  const isAppend = existingModelSession !== null;

  const { username: callerUsername } = extractCallerContext(req);

  let combinedModelObjects = modelObjects;
  let combinedModelOptions = modelOptions || {};

  if (existingModelSession) {
    // Merge options
    combinedModelOptions = { ...existingModelSession.options, ...modelOptions };

    // Append objects
    combinedModelObjects = [...existingModelSession.objects, ...modelObjects];
  }

  const combinedModelInput = {
    objects: combinedModelObjects,
    options: combinedModelOptions,
  };

  // Apply reference texture from user-attached images to objects that lack explicit textures.
  // Injected by ToolOrchestratorService when the user attaches an image to a 3D model request.
  const { referenceTextureUrl } = req.body;
  if (referenceTextureUrl && typeof referenceTextureUrl === "string") {
    const texturePlaceholderValues = ["reference", "placeholder"];
    for (const modelObject of combinedModelObjects) {
      if (modelObject.material?.textureUrl && typeof modelObject.material.textureUrl === "string" && texturePlaceholderValues.includes(modelObject.material.textureUrl)) {
        modelObject.material.textureUrl = referenceTextureUrl;
      }
    }
  }

  const validationError = validateModelInput(combinedModelInput);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  modelSessions.set(sessionKey, {
    objects: combinedModelObjects,
    options: combinedModelOptions,
    updatedAt: Date.now(),
  });
  cleanupModelSessions();

  const sceneId = crypto.randomUUID().slice(0, 12);
  await saveThreeDimensionalScene(
    sceneId,
    "model",
    { objects: combinedModelObjects },
    combinedModelOptions,
    sessionKey,
    callerUsername,
  );

  const sceneEmbedUrl = buildLocalUrl("compute/3d/embed", { id: sceneId, type: "model" });

  res.json({
    message: isAppend
      ? `Appended ${modelObjects.length} object(s) to session '${sessionKey}' — the model now has ${combinedModelObjects.length}. Call again with this sessionId to keep building; sessions expire after 30 minutes of inactivity.`
      : `Created model with ${modelObjects.length} object(s). To append more, call again with sessionId '${sessionKey}'; sessions expire after 30 minutes of inactivity.`,
    sceneEmbedUrl,
    display: buildDisplay("embed", sceneEmbedUrl, { height: 480, title: "3D Model" }),
    sceneId,
    sceneType: "model",
    sessionId: sessionKey,
    objectCount: modelObjects.length,
    totalObjects: combinedModelObjects.length,
    isAppend,
  });
}));
// ── Create 3D Voxel (Instanced voxels + primitive shape rasterization) ──
interface VoxelSession {
  voxels: Voxel[];
  shapes: VoxelShape[];
  options: VoxelOptions;
  updatedAt: number;
}

const voxelSessions = new Map<string, VoxelSession>();
const VOXEL_SESSION_TTL_MS = 30 * 60_000; // 30 min

function cleanupVoxelSessions() {
  const currentTimestamp = Date.now();
  for (const [id, session] of voxelSessions) {
    if (currentTimestamp - session.updatedAt > VOXEL_SESSION_TTL_MS) {
      voxelSessions.delete(id);
    }
  }
}

router.post("/3d/voxel", asyncHandler(async (req: Request, res: Response) => {
  const { voxels, shapes, palette, slices, options, sessionId } = req.body;

  const hasSlices = slices !== undefined && slices !== null;
  if ((!voxels || voxels.length === 0) && (!shapes || shapes.length === 0) && !hasSlices) {
    return res.status(400).json({
      error:
        "Nothing to build — provide 'palette' + 'slices' (text-grid layers, one character " +
        "per voxel), 'shapes' (primitives rasterized into voxels), or both.",
    });
  }

  // Expand palette + slice grids into explicit voxels. This is the primary
  // authoring format: ~1 character per voxel instead of a JSON object each.
  let sliceVoxels: Voxel[] = [];
  if (hasSlices) {
    const expansion = expandVoxelSlices(palette, slices);
    if ("error" in expansion) {
      return res.status(400).json({ error: expansion.error });
    }
    sliceVoxels = expansion.voxels;
  }

  const sessionResolution = resolveThreeDimensionalSession(voxelSessions, sessionId, "voxel build");
  if ("error" in sessionResolution) {
    return res.status(400).json({ error: sessionResolution.error });
  }
  const { sessionKey, existing: existingVoxelSession } = sessionResolution;
  const isAppend = existingVoxelSession !== null;

  const { username: callerUsername } = extractCallerContext(req);

  const incomingVoxels = [...sliceVoxels, ...(voxels || [])];
  let combinedVoxels = incomingVoxels;
  let combinedShapes = shapes || [];
  let combinedOptions = options || {};

  if (existingVoxelSession) {
    combinedOptions = { ...existingVoxelSession.options, ...options };
    combinedVoxels = [...existingVoxelSession.voxels, ...incomingVoxels];
    combinedShapes = [...existingVoxelSession.shapes, ...(shapes || [])];
  }

  const combinedVoxelInput = {
    voxels: combinedVoxels,
    shapes: combinedShapes,
    options: combinedOptions,
  };

  const validationError = validateVoxelInput(combinedVoxelInput);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Resolve before persisting so an over-budget build errors instead of
  // being silently truncated at render time.
  const resolvedVoxelArray = resolveVoxels(combinedVoxelInput);
  if (resolvedVoxelArray.length > MAX_RENDERABLE_VOXELS) {
    return res.status(400).json({
      error:
        `This build resolves to ${resolvedVoxelArray.length.toLocaleString()} voxels, over the ` +
        `${MAX_RENDERABLE_VOXELS.toLocaleString()} maximum. Reduce shape sizes/radii, use ` +
        `hollow: true for large shapes, or split the build across sessions.`,
    });
  }

  voxelSessions.set(sessionKey, {
    voxels: combinedVoxels,
    shapes: combinedShapes,
    options: combinedOptions,
    updatedAt: Date.now(),
  });
  cleanupVoxelSessions();

  const sceneId = crypto.randomUUID().slice(0, 12);
  await saveThreeDimensionalScene(
    sceneId,
    "voxel",
    { voxels: combinedVoxels, shapes: combinedShapes },
    combinedOptions,
    sessionKey,
    callerUsername,
  );

  const sceneEmbedUrl = buildLocalUrl("compute/3d/embed", { id: sceneId, type: "voxel" });

  res.json({
    message: isAppend
      ? `Appended ${incomingVoxels.length} voxel(s) and ${(shapes || []).length} shape(s) to session '${sessionKey}' — the build now renders ${resolvedVoxelArray.length} voxels. Sessions expire after 30 minutes of inactivity.`
      : `Created voxel build rendering ${resolvedVoxelArray.length} voxels (${incomingVoxels.length} painted voxel(s), ${(shapes || []).length} shape(s)). To append more, call again with sessionId '${sessionKey}' — new slices with the same coordinates overwrite existing voxels. Sessions expire after 30 minutes of inactivity.`,
    sceneEmbedUrl,
    display: buildDisplay("embed", sceneEmbedUrl, { height: 480, title: "3D Voxels" }),
    sceneId,
    sceneType: "voxel",
    sessionId: sessionKey,
    addedVoxels: incomingVoxels.length,
    addedShapes: (shapes || []).length,
    totalVoxels: resolvedVoxelArray.length,
    isAppend,
  });
}));
// ── Serve 3D Embed HTML ───────────────────────────────────────
router.get("/3d/embed", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.query as Record<string, string>;
  if (!id) return res.status(400).send("Missing 'id' parameter");
  const entry = await getThreeDimensionalScene(id);
  if (!entry) {
    return res.status(404).send("3D scene not found or expired");
  }
  let html: string;
  switch (entry.sceneType) {
    case "mesh":
      html = buildMeshEmbedHtml({
        vertices: entry.sceneData.vertices as unknown as MeshVertex[],
        faces: entry.sceneData.faces as unknown as MeshFace[],
        normals: entry.sceneData.normals as unknown as MeshVertex[] | undefined,
        colors: entry.sceneData.colors as string[] | undefined,
        options: entry.options,
      });
      break;
    case "scene":
      html = buildSceneEmbedHtml({
        scene: entry.sceneData.scene as unknown as SceneConfig | undefined,
        objects: entry.sceneData.objects as unknown as SceneObject[],
        options: entry.options as unknown as SceneOptions,
      });
      break;
    case "model":
      html = buildModelEmbedHtml({
        objects: entry.sceneData.objects as unknown as ModelObject[],
        options: entry.options as unknown as ModelOptions,
      });
      break;
    case "voxel":
      html = buildVoxelEmbedHtml({
        voxels: entry.sceneData.voxels as unknown as Voxel[],
        shapes: entry.sceneData.shapes as unknown as VoxelShape[],
        options: entry.options as unknown as VoxelOptions,
      });
      break;
    default:
      return res.status(400).send(`Unknown scene type: ${entry.sceneType}`);
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}));

// ─── Health ─────────────────────────────────────────────────
export function getComputeHealth() {
  return {
    jsInterpreter: "on-demand (Node.js vm)",
    shellExecutor: "on-demand (allowlisted subprocess)",
    unitConverter: "on-demand (convert-units)",
    dateTime: "on-demand (date-fns)",
    jsonTransform: "on-demand (jsonpath-plus)",
    csvGenerator: "on-demand (internal)",
    qrCode: "on-demand (qrcode)",
    barcodeScan: "on-demand (zxing-wasm)",
    codeImage: "on-demand (shiki + playwright)",
    avatar: "on-demand (@dicebear/core)",
    asciiBanner: "on-demand (figlet)",
    latex: "on-demand (KaTeX CDN embed)",
    diagram: "on-demand (Mermaid CDN embed)",
    textDiff: "on-demand (diff)",
    hash: "on-demand (node:crypto)",
    regexTester: "on-demand (native RegExp)",
    encodeDecode: "on-demand (internal)",
    colorConverter: "on-demand (internal)",
    cronParser: "on-demand (internal)",
    turtleGraphics: "on-demand (LOGO canvas embed)",
    threeDimensionalScene: "on-demand (Three.js WebGL embed)",
    think: "on-demand (echo)",
    sleep: "on-demand (timer)",
    syntheticOutput: "on-demand (json-schema)",
    imageProcessor: "on-demand (sharp + imagemagick)",
    imageToAscii: "on-demand (sharp + canvas/html overlay)",
    csvAnalyzer: "on-demand (internal statistics)",
    jsonCompare: "on-demand (deep-diff)",
    jsonSchemaValidator: "on-demand (ajv)",
  };
}
// ─── CSV Analysis ──────────────────────────────────────────────────
router.post(
  "/csv/analyze",
  asyncHandler(async (req: Request, res: Response) => {
    const { data, columns: selectedColumns } = req.body;
    if (!data) {
      return res.status(400).json({
        error: "'data' is required (CSV string or array of objects)",
      });
    }

    let rows: Record<string, unknown>[];
    if (typeof data === "string") {
      // Parse CSV string
      const lines = data.trim().split("\n");
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV must have at least a header and one data row" });
      }
      const headerColumns = lines[0].split(",").map((headerCell: string) => headerCell.trim());
      rows = lines.slice(1).map((line: string) => {
        const cellValues = line.split(",").map((cell: string) => cell.trim());
        const rowObject: Record<string, unknown> = {};
        headerColumns.forEach((columnName: string, columnIndex: number) => {
          const rawValue = cellValues[columnIndex] ?? "";
          const numericValue = Number(rawValue);
          rowObject[columnName] = isNaN(numericValue) || rawValue === "" ? rawValue : numericValue;
        });
        return rowObject;
      });
    } else if (Array.isArray(data)) {
      rows = data;
    } else {
      return res.status(400).json({ error: "'data' must be a CSV string or array of objects" });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: "No data rows found" });
    }

    const allColumnNames = Object.keys(rows[0]);
    const targetColumns = selectedColumns && Array.isArray(selectedColumns)
      ? allColumnNames.filter((columnName: string) => selectedColumns.includes(columnName))
      : allColumnNames;

    const columnStatistics: Record<string, unknown> = {};
    for (const columnName of targetColumns) {
      const columnValues = rows.map((row: Record<string, unknown>) => row[columnName]);
      const numericValues = columnValues
        .filter((cellValue: unknown) => typeof cellValue === "number" && !isNaN(cellValue as number))
        .map((cellValue: unknown) => cellValue as number);
      const nullCount = columnValues.filter((cellValue: unknown) => cellValue === null || cellValue === undefined || cellValue === "").length;
      const uniqueValues = new Set(columnValues.map(String));

      if (numericValues.length > 0) {
        const sortedValues = [...numericValues].sort((firstValue, secondValue) => firstValue - secondValue);
        const sum = numericValues.reduce((accumulator, currentValue) => accumulator + currentValue, 0);
        const mean = sum / numericValues.length;
        const medianIndex = Math.floor(sortedValues.length / 2);
        const median = sortedValues.length % 2 === 0
          ? (sortedValues[medianIndex - 1] + sortedValues[medianIndex]) / 2
          : sortedValues[medianIndex];
        const variance = numericValues.reduce(
          (accumulator, currentValue) => accumulator + Math.pow(currentValue - mean, 2),
          0,
        ) / numericValues.length;
        const standardDeviation = Math.sqrt(variance);

        columnStatistics[columnName] = {
          type: "numeric",
          count: numericValues.length,
          nullCount,
          uniqueCount: uniqueValues.size,
          min: sortedValues[0],
          max: sortedValues[sortedValues.length - 1],
          mean: Math.round(mean * 10000) / 10000,
          median,
          standardDeviation: Math.round(standardDeviation * 10000) / 10000,
          sum: Math.round(sum * 10000) / 10000,
          percentile25: sortedValues[Math.floor(sortedValues.length * 0.25)],
          percentile75: sortedValues[Math.floor(sortedValues.length * 0.75)],
        };
      } else {
        // Categorical column
        const frequencyMap: Record<string, number> = {};
        columnValues.forEach((cellValue: unknown) => {
          const stringValue = String(cellValue);
          frequencyMap[stringValue] = (frequencyMap[stringValue] || 0) + 1;
        });
        const sortedFrequencies = Object.entries(frequencyMap)
          .sort(([, countA], [, countB]) => countB - countA)
          .slice(0, 20);

        columnStatistics[columnName] = {
          type: "categorical",
          count: columnValues.length,
          nullCount,
          uniqueCount: uniqueValues.size,
          topValues: Object.fromEntries(sortedFrequencies),
        };
      }
    }

    res.json({
      rowCount: rows.length,
      columnCount: allColumnNames.length,
      columns: allColumnNames,
      statistics: columnStatistics,
    });
  }),
);
// ─── JSON Compare (Deep Diff) ──────────────────────────────────────
function deepCompare(
  firstObject: unknown,
  secondObject: unknown,
  currentPath: string = "",
): Array<{
  path: string;
  type: "added" | "removed" | "changed" | "type_changed";
  oldValue?: unknown;
  newValue?: unknown;
}> {
  const differences: Array<{
    path: string;
    type: "added" | "removed" | "changed" | "type_changed";
    oldValue?: unknown;
    newValue?: unknown;
  }> = [];

  if (firstObject === secondObject) return differences;

  if (typeof firstObject !== typeof secondObject) {
    differences.push({
      path: currentPath || "(root)",
      type: "type_changed",
      oldValue: firstObject,
      newValue: secondObject,
    });
    return differences;
  }

  if (
    firstObject === null ||
    secondObject === null ||
    typeof firstObject !== "object" ||
    typeof secondObject !== "object"
  ) {
    if (firstObject !== secondObject) {
      differences.push({
        path: currentPath || "(root)",
        type: "changed",
        oldValue: firstObject,
        newValue: secondObject,
      });
    }
    return differences;
  }

  if (Array.isArray(firstObject) && Array.isArray(secondObject)) {
    const maximumLength = Math.max(firstObject.length, secondObject.length);
    for (let arrayIndex = 0; arrayIndex < maximumLength; arrayIndex++) {
      const elementPath = `${currentPath}[${arrayIndex}]`;
      if (arrayIndex >= firstObject.length) {
        differences.push({ path: elementPath, type: "added", newValue: secondObject[arrayIndex] });
      } else if (arrayIndex >= secondObject.length) {
        differences.push({ path: elementPath, type: "removed", oldValue: firstObject[arrayIndex] });
      } else {
        differences.push(...deepCompare(firstObject[arrayIndex], secondObject[arrayIndex], elementPath));
      }
    }
    return differences;
  }

  const firstObjectRecord = firstObject as Record<string, unknown>;
  const secondObjectRecord = secondObject as Record<string, unknown>;
  const allKeys = new Set([
    ...Object.keys(firstObjectRecord),
    ...Object.keys(secondObjectRecord),
  ]);

  for (const key of allKeys) {
    const propertyPath = currentPath ? `${currentPath}.${key}` : key;
    if (!(key in firstObjectRecord)) {
      differences.push({ path: propertyPath, type: "added", newValue: secondObjectRecord[key] });
    } else if (!(key in secondObjectRecord)) {
      differences.push({ path: propertyPath, type: "removed", oldValue: firstObjectRecord[key] });
    } else {
      differences.push(
        ...deepCompare(firstObjectRecord[key], secondObjectRecord[key], propertyPath),
      );
    }
  }

  return differences;
}

router.post(
  "/json/compare",
  asyncHandler(async (req: Request, res: Response) => {
    const firstJson = req.body['a'];
    const secondJson = req.body['b'];
    if (firstJson === undefined || secondJson === undefined) {
      return res.status(400).json({
        error: "'a' and 'b' are required (JSON objects to compare)",
      });
    }
    const differences = deepCompare(firstJson, secondJson);
    res.json({
      isIdentical: differences.length === 0,
      differenceCount: differences.length,
      differences,
    });
  }),
);
// ─── JSON Schema Validation (ajv) ──────────────────────────────────
router.post(
  "/json/validate",
  asyncHandler(async (req: Request, res: Response) => {
    const { data, schema } = req.body;
    if (data === undefined || !schema) {
      return res.status(400).json({
        error: "'data' and 'schema' (JSON Schema object) are required",
      });
    }
    const ajvModule = await import("ajv");
    const Ajv = ajvModule.default?.default ?? ajvModule.default;
    const ajvInstance = new Ajv({ allErrors: true, verbose: true });
    try {
      const validateFunction = ajvInstance.compile(schema);
      const isValid = validateFunction(data);
      res.json({
        isValid,
        errors: isValid
          ? []
          : (validateFunction.errors || []).map((validationError: { instancePath?: string; message?: string; keyword?: string; params?: unknown; schemaPath?: string }) => ({
              path: validationError.instancePath || "/",
              message: validationError.message || "Unknown error",
              keyword: validationError.keyword,
              params: validationError.params,
              schemaPath: validationError.schemaPath,
            })),
        errorCount: isValid ? 0 : (validateFunction.errors || []).length,
      });
    } catch (error: unknown) {
      res.status(400).json({
        error: `Schema compilation failed: ${getErrorMessage(error)}`,
      });
    }
  }),
);
export default router;

