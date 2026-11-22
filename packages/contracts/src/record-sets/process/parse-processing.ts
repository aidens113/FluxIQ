// Reads an untrusted record output `process` against the output's schema.
//
// Exact fields. Issues are stable codes prefixed `record_output.process_`, each
// listed once. Every field id named -- `dedupe.by`, a condition's `field`, a
// sort key's `field`, `columns` -- must be a field of the schema
// (`process_unknown_field`) that is stored, not `handling: "exclude"`
// (`process_excluded_field`), or a column `derive` makes; `columns` names
// stored fields only (`process_derived_column_shown`).
//
// **A filter may test a column `columns` leaves out (t970).** Until t970 a
// `where` field had to be among `columns` (`process_where_column_dropped`), so
// a mark read only to filter by -- a sponsored badge, a promoted label -- had to
// be shown in the answer, and the judge then found columns nobody asked for
// (t194). The store processes the collected rows, which hold every stored
// field, never its own answer, so the filter reads the mark and the answer
// leaves it out; processing the collected rows again gives the same answer.
//
// **And may derive, group and compare (t970).** `derive` names columns computed
// from one stored column (`derive.ts`); `anyOf` holds groups of conditions any
// one of which keeps a row (`any-of.ts`); `compare` sets two columns of a row
// against each other (`field-comparison.ts`).

import { isPlainRecord } from "../is-plain-record.ts";
import { AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS, type AutomationStudioRecordSchema } from "../schema.ts";
import { automationStudioRecordConditionPattern } from "./condition/index.ts";
import { parseAutomationStudioRecordProcessingDeclaration } from "./declaration/index.ts";
import { automationStudioRecordFieldComparisonFields } from "./field-comparison.ts";
import { parseAutomationStudioRecordCondition } from "./parse-condition.ts";
import {
  AUTOMATION_STUDIO_RECORD_CONDITION_TYPES,
  AUTOMATION_STUDIO_RECORD_DERIVED_READS,
  AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS,
  AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS,
  AUTOMATION_STUDIO_RECORD_SORT_ORDERS,
  AUTOMATION_STUDIO_RECORD_SORT_TYPES
} from "./processing-vocabulary.ts";
import type {
  AutomationStudioRecordCondition,
  AutomationStudioRecordDerivedField,
  AutomationStudioRecordFieldComparison,
  AutomationStudioRecordProcessing,
  AutomationStudioRecordSortKey
} from "./types.ts";

export type AutomationStudioRecordProcessingParseResult =
  | { ok: true; processing: AutomationStudioRecordProcessing }
  | { ok: false; issues: string[] };

const PROCESS_KEYS: ReadonlySet<string> = new Set(["derive", "dedupe", "where", "anyOf", "compare", "sort", "limit", "columns", "minRows", "declaration"]);
const SORT_KEY_KEYS: ReadonlySet<string> = new Set(["field", "order", "as"]);
const DERIVE_KEYS: ReadonlySet<string> = new Set(["id", "from", "pattern", "as"]);
const DERIVED_READS: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_DERIVED_READS);
const COMPARE_KEYS: ReadonlySet<string> = new Set(["field", ...AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS, "as", "not"]);
const COMPARE_TYPES: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_CONDITION_TYPES);
const SORT_ORDERS: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_SORT_ORDERS);
const SORT_TYPES: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_SORT_TYPES);

/** Parses `value` into fresh objects, checking every field id it names against `schema`. */
export function parseAutomationStudioRecordProcessing(value: unknown, schema: AutomationStudioRecordSchema): AutomationStudioRecordProcessingParseResult {
  const issues = new Set<string>();
  if (!isPlainRecord(value)) return { ok: false, issues: ["record_output.process_not_object"] };
  if (!Object.keys(value).every((key) => PROCESS_KEYS.has(key))) issues.add("record_output.process_unknown_key");
  const processing: AutomationStudioRecordProcessing = {};
  /** Ids that must be stored fields. */
  const named: string[] = [];
  /** Ids that must be stored fields or derived columns. */
  const readable: string[] = [];
  const fields = new Map(schema.fields.map((field) => [field.id, field]));
  const checkStored = (id: string): void => {
    const field = fields.get(id);
    if (field === undefined) issues.add("record_output.process_unknown_field");
    else if (field.handling === "exclude") issues.add("record_output.process_excluded_field");
  };

  // Derived columns first: what every later key may name besides the stored fields (header).
  const derivedIds = new Set<string>();
  if (value.derive !== undefined) {
    const derive = Array.isArray(value.derive) && value.derive.length > 0 ? value.derive.map(parseDerivedField) : null;
    if (derive === null || derive.some((field) => field === null)) issues.add("record_output.process_invalid_derive");
    else {
      for (const field of derive as AutomationStudioRecordDerivedField[]) {
        if (fields.has(field.id) || derivedIds.has(field.id)) issues.add("record_output.process_invalid_derive");
        derivedIds.add(field.id);
        // A derived column reads a stored field, never another derived one.
        named.push(field.from);
      }
      processing.derive = derive as AutomationStudioRecordDerivedField[];
    }
  }

  if (value.dedupe === false) processing.dedupe = false;
  else if (value.dedupe !== undefined) {
    const by = isPlainRecord(value.dedupe) && Object.keys(value.dedupe).every((key) => key === "by") ? uniqueIds(value.dedupe.by) : null;
    if (by === null) issues.add("record_output.process_invalid_dedupe");
    else {
      processing.dedupe = { by };
      readable.push(...by);
    }
  }

  if (value.where !== undefined) {
    if (!Array.isArray(value.where)) issues.add("record_output.process_invalid_where");
    else {
      const where = value.where.map(parseAutomationStudioRecordCondition);
      if (where.some((condition) => condition === null)) issues.add("record_output.process_invalid_condition");
      else {
        processing.where = where as AutomationStudioRecordCondition[];
        readable.push(...processing.where.map((condition) => condition.field));
      }
    }
  }

  if (value.anyOf !== undefined) {
    const groups = Array.isArray(value.anyOf) && value.anyOf.length > 0 ? value.anyOf.map(parseGroup) : null;
    if (groups === null || groups.some((group) => group === null)) issues.add("record_output.process_invalid_any_of");
    else {
      processing.anyOf = groups as AutomationStudioRecordCondition[][];
      readable.push(...processing.anyOf.flatMap((group) => group.map((condition) => condition.field)));
    }
  }

  if (value.compare !== undefined) {
    const compare = Array.isArray(value.compare) && value.compare.length > 0 ? value.compare.map(parseComparison) : null;
    if (compare === null || compare.some((comparison) => comparison === null)) issues.add("record_output.process_invalid_compare");
    else {
      processing.compare = compare as AutomationStudioRecordFieldComparison[];
      readable.push(...processing.compare.flatMap(automationStudioRecordFieldComparisonFields));
    }
  }

  if (value.sort !== undefined) {
    const sort = Array.isArray(value.sort) ? value.sort.map(parseSortKey) : null;
    if (sort === null || sort.some((key) => key === null)) issues.add("record_output.process_invalid_sort");
    else {
      if (sort.length > AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.maxSortKeys) issues.add("record_output.process_too_many_sort_keys");
      processing.sort = sort as AutomationStudioRecordSortKey[];
      readable.push(...processing.sort.map((key) => key.field));
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
      named.push(...columns.filter((id) => !derivedIds.has(id)));
    }
  }

  if (value.minRows !== undefined) {
    if (!isIntegerWithin(value.minRows, 0, Number.MAX_SAFE_INTEGER)) issues.add("record_output.process_invalid_min_rows");
    else processing.minRows = value.minRows;
  }

  if (Object.hasOwn(value, "declaration")) {
    const declaration = parseAutomationStudioRecordProcessingDeclaration(value.declaration, schema);
    if (declaration === null) issues.add("record_output.process_invalid_declaration");
    else processing.declaration = declaration;
  }

  for (const id of named) checkStored(id);
  for (const id of readable) if (!derivedIds.has(id)) checkStored(id);
  if (processing.columns?.some((id) => derivedIds.has(id))) issues.add("record_output.process_derived_column_shown");

  return issues.size > 0 ? { ok: false, issues: [...issues] } : { ok: true, processing };
}

/** One derived column as the contract keeps it: `as: "text"`, the default, is dropped. */
function parseDerivedField(value: unknown): AutomationStudioRecordDerivedField | null {
  if (!isPlainRecord(value) || !Object.keys(value).every((key) => DERIVE_KEYS.has(key))) return null;
  const { id, from, pattern, as } = value;
  if (typeof id !== "string" || !AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.fieldIdPattern.test(id)) return null;
  if ((AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.reservedFieldIds as readonly string[]).includes(id)) return null;
  if (typeof from !== "string") return null;
  const field: AutomationStudioRecordDerivedField = { id, from };
  if (pattern !== undefined) {
    if (typeof pattern !== "string" || automationStudioRecordConditionPattern(pattern) === undefined) return null;
    field.pattern = pattern;
  }
  if (as !== undefined) {
    if (!DERIVED_READS.has(as)) return null;
    if (as !== "text") field.as = as as NonNullable<AutomationStudioRecordDerivedField["as"]>;
  }
  return field;
}

/** A non-empty list of conditions, each one the conditions' parser takes, or `null`. */
function parseGroup(value: unknown): AutomationStudioRecordCondition[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const group = value.map(parseAutomationStudioRecordCondition);
  return group.some((condition) => condition === null) ? null : (group as AutomationStudioRecordCondition[]);
}

/** One comparison as the contract keeps it: at least one comparison, never of a column with itself; `as: "number"` and `not: false` are dropped. */
function parseComparison(value: unknown): AutomationStudioRecordFieldComparison | null {
  if (!isPlainRecord(value) || !Object.keys(value).every((key) => COMPARE_KEYS.has(key))) return null;
  if (typeof value.field !== "string") return null;
  const comparison: AutomationStudioRecordFieldComparison = { field: value.field };
  let compares = false;
  for (const key of AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS) {
    const other = value[key];
    if (other === undefined) continue;
    if (typeof other !== "string" || other === value.field) return null;
    comparison[key] = other;
    compares = true;
  }
  if (!compares) return null;
  if (value.as !== undefined) {
    if (!COMPARE_TYPES.has(value.as)) return null;
    if (value.as === "date") comparison.as = "date";
  }
  if (value.not !== undefined) {
    if (typeof value.not !== "boolean") return null;
    if (value.not) comparison.not = true;
  }
  return comparison;
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
