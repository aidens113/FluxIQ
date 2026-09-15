import type { JsonObject, JsonValue } from "../core.ts";
import type { AutomationStudioRecordField, AutomationStudioRecordSchema } from "./schema.ts";

/** Leading characters a spreadsheet may read as the start of a formula. */
const FORMULA_PREFIXES: ReadonlySet<string> = new Set(["=", "+", "-", "@", "\t", "\r"]);
const NEEDS_QUOTING = /[",\r\n]/u;
const LINE_END = "\r\n";

/**
 * The CSV header line for a schema's stored columns (every field that is not
 * `exclude`), using field labels, ending in CRLF.
 */
export function encodeAutomationStudioRecordsCsvHeader(schema: AutomationStudioRecordSchema): string {
  return storedColumns(schema).map((field) => quote(escapeFormula(field.label))).join(",") + LINE_END;
}

/**
 * CSV lines for rows, one per row, each ending in CRLF (RFC 4180). Only the
 * schema's stored columns are written, in schema order; a row key the schema
 * does not declare is never written, and a missing or `null` value is an empty
 * cell. A cell that is not a number or boolean in its own column is prefixed
 * with `'` when it starts with `=`, `+`, `-`, `@`, tab, or carriage return.
 */
export function encodeAutomationStudioRecordsCsvRows(schema: AutomationStudioRecordSchema, rows: readonly JsonObject[]): string {
  const columns = storedColumns(schema);
  let text = "";
  for (const row of rows) {
    text += columns.map((field) => quote(cellText(field, Object.hasOwn(row, field.id) ? row[field.id] : undefined))).join(",") + LINE_END;
  }
  return text;
}

function storedColumns(schema: AutomationStudioRecordSchema): AutomationStudioRecordField[] {
  return schema.fields.filter((field) => field.handling !== "exclude");
}

function cellText(field: AutomationStudioRecordField, value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  // Numbers and booleans in their own column render from the value, never from page text, so they cannot carry a formula.
  if ((field.valueType === "number" && typeof value === "number") || (field.valueType === "boolean" && typeof value === "boolean")) return String(value);
  // A `json` cell is JSON text. Any other string is written as it is. Datetime is escaped too: Date.parse accepts strings such as "@SUM(1) 2020".
  const text = field.valueType !== "json" && typeof value === "string" ? value : JSON.stringify(value);
  return escapeFormula(text);
}

function escapeFormula(text: string): string {
  return text.length > 0 && FORMULA_PREFIXES.has(text.charAt(0)) ? `'${text}` : text;
}

function quote(text: string): string {
  return NEEDS_QUOTING.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}
