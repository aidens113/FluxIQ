// Reads an untrusted record output `process` against the output's schema.
//
// Exact fields. Issues are stable codes prefixed `record_output.process_`, each
// listed once. Every field id named -- `dedupe.by`, a condition's `field`, a
// sort key's `field`, `columns` -- must be a field of the schema
// (`process_unknown_field`) that is stored, not `handling: "exclude"`
// (`process_excluded_field`). With `columns`, every `where` field must be among
// them (`process_where_column_dropped`): the answer is processed again on a
// re-run, and a condition over a column it no longer has would read every row
// as missing that value.

import { isPlainRecord } from "../is-plain-record.ts";
import type { AutomationStudioRecordSchema } from "../schema.ts";
import { parseAutomationStudioRecordCondition } from "./parse-condition.ts";
import { AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS, AUTOMATION_STUDIO_RECORD_SORT_ORDERS, AUTOMATION_STUDIO_RECORD_SORT_TYPES } from "./processing-vocabulary.ts";
import type { AutomationStudioRecordCondition, AutomationStudioRecordProcessing, AutomationStudioRecordSortKey } from "./types.ts";

export type AutomationStudioRecordProcessingParseResult =
  | { ok: true; processing: AutomationStudioRecordProcessing }
  | { ok: false; issues: string[] };

const PROCESS_KEYS: ReadonlySet<string> = new Set(["dedupe", "where", "sort", "limit", "columns", "minRows"]);
const SORT_KEY_KEYS: ReadonlySet<string> = new Set(["field", "order", "as"]);
const SORT_ORDERS: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_SORT_ORDERS);
const SORT_TYPES: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_SORT_TYPES);

/** Parses `value` into fresh objects, checking every field id it names against `schema`. */
export function parseAutomationStudioRecordProcessing(value: unknown, schema: AutomationStudioRecordSchema): AutomationStudioRecordProcessingParseResult {
  const issues = new Set<string>();
  if (!isPlainRecord(value)) return { ok: false, issues: ["record_output.process_not_object"] };
  if (!Object.keys(value).every((key) => PROCESS_KEYS.has(key))) issues.add("record_output.process_unknown_key");
  const processing: AutomationStudioRecordProcessing = {};
  const named: string[] = [];

  if (value.dedupe === false) processing.dedupe = false;
  else if (value.dedupe !== undefined) {
    const by = isPlainRecord(value.dedupe) && Object.keys(value.dedupe).every((key) => key === "by") ? uniqueIds(value.dedupe.by) : null;
    if (by === null) issues.add("record_output.process_invalid_dedupe");
    else {
      processing.dedupe = { by };
      named.push(...by);
    }
  }

  if (value.where !== undefined) {
    if (!Array.isArray(value.where)) issues.add("record_output.process_invalid_where");
    else {
      const where = value.where.map(parseAutomationStudioRecordCondition);
      if (where.some((condition) => condition === null)) issues.add("record_output.process_invalid_condition");
      else {
        processing.where = where as AutomationStudioRecordCondition[];
        named.push(...processing.where.map((condition) => condition.field));
      }
    }
  }

  if (value.sort !== undefined) {
    const sort = Array.isArray(value.sort) ? value.sort.map(parseSortKey) : null;
    if (sort === null || sort.some((key) => key === null)) issues.add("record_output.process_invalid_sort");
    else {
      if (sort.length > AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.maxSortKeys) issues.add("record_output.process_too_many_sort_keys");
      processing.sort = sort as AutomationStudioRecordSortKey[];
      named.push(...processing.sort.map((key) => key.field));
    }
  }

  if (value.limit !== undefined) {
    if (!isIntegerWithin(value.limit, 1, AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.limitCeiling)) issues.add("record_output.process_invalid_limit");
    else processing.limit = value.limit;
  }

  if (value.columns !== undefined) {
    const columns = uniqueIds(value.columns);
    if (columns === null) issues.add("record_output.process_invalid_columns");
    else {
      processing.columns = columns;
      named.push(...columns);
    }
  }

  if (value.minRows !== undefined) {
    if (!isIntegerWithin(value.minRows, 0, Number.MAX_SAFE_INTEGER)) issues.add("record_output.process_invalid_min_rows");
    else processing.minRows = value.minRows;
  }

  const fields = new Map(schema.fields.map((field) => [field.id, field]));
  for (const id of named) {
    const field = fields.get(id);
    if (field === undefined) issues.add("record_output.process_unknown_field");
    else if (field.handling === "exclude") issues.add("record_output.process_excluded_field");
  }
  if (processing.columns !== undefined && processing.where !== undefined) {
    const kept = new Set(processing.columns);
    if (processing.where.some((condition) => fields.has(condition.field) && !kept.has(condition.field))) issues.add("record_output.process_where_column_dropped");
  }

  return issues.size > 0 ? { ok: false, issues: [...issues] } : { ok: true, processing };
}

function parseSortKey(value: unknown): AutomationStudioRecordSortKey | null {
  if (!isPlainRecord(value) || !Object.keys(value).every((key) => SORT_KEY_KEYS.has(key))) return null;
  if (typeof value.field !== "string" || !SORT_ORDERS.has(value.order)) return null;
  const key: AutomationStudioRecordSortKey = { field: value.field, order: value.order as AutomationStudioRecordSortKey["order"] };
  if (value.as !== undefined) {
    if (!SORT_TYPES.has(value.as)) return null;
    key.as = value.as as NonNullable<AutomationStudioRecordSortKey["as"]>;
  }
  return key;
}

/** A non-empty list of distinct strings, copied, or `null`. */
function uniqueIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === "string")) return null;
  return new Set(value).size === value.length ? [...(value as string[])] : null;
}

function isIntegerWithin(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
