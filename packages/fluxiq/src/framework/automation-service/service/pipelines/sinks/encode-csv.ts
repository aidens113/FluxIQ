import { canonicalJson } from "@fluxiq/contracts/fluxnode";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

function cell(value: JsonValue | undefined): string {
  const text = value === undefined || value === null ? "" : typeof value === "string" ? value : typeof value === "object" ? canonicalJson(value) : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Records as CSV (RFC 4180, CRLF lines). The columns are every key in the order first
 * seen; null and a missing key are empty, and a list or an object is written as JSON.
 */
export function encodeCsv(records: readonly JsonObject[]): string {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  const lines = [columns.map((column) => cell(column)).join(",")];
  for (const record of records) lines.push(columns.map((column) => cell(record[column])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}
