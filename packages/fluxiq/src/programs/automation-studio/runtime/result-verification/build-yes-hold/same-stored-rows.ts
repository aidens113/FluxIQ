// Whether two runs stored the same rows, by content (t660): what Core measures
// before it holds a playback's double no to its build's two yeses
// (`./held-double-no.ts`). Node and dataset ids are re-minted when a build's
// Flow is saved, so neither is compared: the stored schema's fields, in order,
// and each row's value in each field, in stored order.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioResultRecordSetInput } from "../result-summary.ts";

/**
 * Whether `left` and `right` hold the same record sets, in order: each read
 * whole (rows read, none dropped past a limit), with the same fields in the
 * same order and the same rows, value for value. False where either holds no
 * row at all: an empty answer says nothing about which rows two judges saw.
 */
export function automationStudioResultSameStoredRows(left: readonly AutomationStudioResultRecordSetInput[], right: readonly AutomationStudioResultRecordSetInput[]): boolean {
  if (!left.length || left.length !== right.length) return false;
  let rows = 0;
  for (let index = 0; index < left.length; index += 1) {
    const one = left[index]!;
    const other = right[index]!;
    if (!whole(one) || !whole(other)) return false;
    const fields = one.schema!.fields.map((field) => field.id);
    if (!sameList(fields, other.schema!.fields.map((field) => field.id))) return false;
    if (one.rows!.length !== other.rows!.length) return false;
    if (!one.rows!.every((row, at) => cells(row, fields) === cells(other.rows![at]!, fields))) return false;
    rows += one.rows!.length;
  }
  return rows > 0;
}

/** Whether a set's schema and every row of it were read, and none was dropped past the store's limit. */
function whole(set: AutomationStudioResultRecordSetInput): boolean {
  return set.schema !== undefined && set.rows !== undefined && set.summary.truncated !== true && set.rows.length === set.summary.recordCount;
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** A row's value in each field, in field order, as one comparable text. */
function cells(row: JsonObject, fields: readonly string[]): string {
  return JSON.stringify(fields.map((field) => canonical(row[field])));
}

/** A value with its object keys sorted, so two equal values compare equal. */
function canonical(value: JsonValue | undefined): JsonValue {
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}
