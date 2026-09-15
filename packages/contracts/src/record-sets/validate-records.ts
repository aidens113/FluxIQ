import type { JsonObject, JsonValue } from "../core.ts";
import { isPlainRecord } from "./is-plain-record.ts";
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS } from "./output.ts";
import type { AutomationStudioRecordField, AutomationStudioRecordSchema } from "./schema.ts";

export type AutomationStudioRecordValidationOptions = {
  /** Rows kept, 1 to `maxRecordsCeiling`; `maxRecordsDefault` when absent. */
  maxRecords?: number | undefined;
};

export type AutomationStudioRecordValidationResult = {
  /** Valid rows, each a fresh object holding only `include` fields, in schema order. */
  rows: JsonObject[];
  /** Rows refused: not an object, a required field missing, a value of the wrong type, or over `rowMaxBytes`. */
  invalidCount: number;
  /** True when the input held more than `maxRecords` rows; rows past it are neither validated nor counted. */
  truncated: boolean;
  /** Stable codes prefixed `records.`, each listed once. Never a row value. */
  issues: string[];
};

const ROW_ENCODER = new TextEncoder();

type CellResult = { ok: true; value: JsonValue | undefined } | { ok: false; issue: string };

/**
 * Validates untrusted rows against a record schema by allowlist copy.
 *
 * Each kept row is built field by field from the schema, so `exclude` fields,
 * `encrypt` fields (until K11), and unknown keys never reach it. A missing,
 * `undefined`, or `null` value is absent: fatal for a required field, omitted
 * otherwise. `string` accepts a string, or a finite number or boolean turned
 * into a string; `number` only a finite number; `boolean` only a boolean;
 * `url` a string that parses as an `http:` or `https:` URL; `datetime` a
 * string `Date.parse` accepts; `json` any JSON value up to `jsonCellMaxDepth`.
 */
export function validateAutomationStudioRecords(
  rows: unknown,
  schema: AutomationStudioRecordSchema,
  options: AutomationStudioRecordValidationOptions = {}
): AutomationStudioRecordValidationResult {
  const maxRecords = options.maxRecords ?? AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsDefault;
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling) {
    return { rows: [], invalidCount: 0, truncated: false, issues: ["records.invalid_max_records"] };
  }
  if (!Array.isArray(rows)) return { rows: [], invalidCount: 0, truncated: false, issues: ["records.not_array"] };
  const truncated = rows.length > maxRecords;
  const considered = truncated ? maxRecords : rows.length;
  const fields = schema.fields.filter((field) => field.handling === undefined || field.handling === "include");
  const kept: JsonObject[] = [];
  const issues = new Set<string>();
  let invalidCount = 0;
  for (let index = 0; index < considered; index += 1) {
    let copied: JsonObject | string;
    try {
      copied = copyRow(rows[index], fields);
    } catch {
      copied = "records.invalid_row";
    }
    if (typeof copied === "string") {
      invalidCount += 1;
      issues.add(copied);
    } else {
      kept.push(copied);
    }
  }
  return { rows: kept, invalidCount, truncated, issues: [...issues] };
}

/** The copied row, or the issue code that makes the row invalid. */
function copyRow(row: unknown, fields: readonly AutomationStudioRecordField[]): JsonObject | string {
  if (!isPlainRecord(row)) return "records.row_not_object";
  const entries: Array<[string, JsonValue]> = [];
  for (const field of fields) {
    const raw = Object.hasOwn(row, field.id) ? row[field.id] : undefined;
    if (raw === undefined || raw === null) {
      if (field.required === true) return "records.required_missing";
      continue;
    }
    const cell = copyCell(raw, field);
    if (!cell.ok) return cell.issue;
    if (cell.value !== undefined) entries.push([field.id, cell.value]);
  }
  // Object.fromEntries defines own properties, so a field id can never reach a prototype.
  const copied: JsonObject = Object.fromEntries(entries);
  if (ROW_ENCODER.encode(JSON.stringify(copied)).byteLength > AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.rowMaxBytes) return "records.row_too_large";
  return copied;
}

function copyCell(value: unknown, field: AutomationStudioRecordField): CellResult {
  switch (field.valueType) {
    case "string":
      if (typeof value === "string") return { ok: true, value };
      if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean") return { ok: true, value: String(value) };
      return { ok: false, issue: "records.invalid_value" };
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? { ok: true, value } : { ok: false, issue: "records.invalid_value" };
    case "boolean":
      return typeof value === "boolean" ? { ok: true, value } : { ok: false, issue: "records.invalid_value" };
    case "url":
      return typeof value === "string" && isHttpUrl(value) ? { ok: true, value } : { ok: false, issue: "records.invalid_value" };
    case "datetime":
      return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? { ok: true, value } : { ok: false, issue: "records.invalid_value" };
    case "json": {
      const copied = copyJson(value, 0);
      return copied === undefined ? { ok: false, issue: "records.invalid_value" } : { ok: true, value: copied };
    }
    default:
      return { ok: false, issue: "records.invalid_value" };
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** A fresh copy of a JSON value, or undefined when the value is not JSON or nests past `jsonCellMaxDepth`. */
function copyJson(value: unknown, depth: number): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (depth >= AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.jsonCellMaxDepth) return undefined;
  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const item = Object.hasOwn(value, index) ? copyJson(value[index], depth + 1) : undefined;
      if (item === undefined) return undefined;
      items.push(item);
    }
    return items;
  }
  if (!isPlainRecord(value)) return undefined;
  const entries: Array<[string, JsonValue]> = [];
  for (const key of Object.keys(value)) {
    const item = copyJson(value[key], depth + 1);
    if (item === undefined) return undefined;
    entries.push([key, item]);
  }
  return Object.fromEntries(entries);
}
