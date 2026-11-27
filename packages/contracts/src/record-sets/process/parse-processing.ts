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
// from one stored column (`derive.ts`); `anyOf` holds alternative groups, a row
// passing when every condition of any one group holds (`any-of.ts`, t1074);
// `compare` sets two columns of a row
// against each other (`field-comparison.ts`).
//
// **Each refused part says why (t1070).** Run `run-mwyg0x66-4d561a42` called
// `core.set_result_processing` fourteen times and was answered
// `record_output.process_invalid_condition` and nothing else: no word on which
// condition, which operator, or that a `matches` beginning `(?i)` is not
// JavaScript. A refusal now carries `refusals` beside its codes: each invalid
// part (`where[2]`, `anyOf[1][0]`, `derive[0]`, `compare[0]`, `sort[1]`, ...),
// the field id and operator it names, and why -- a pattern's JavaScript parser
// reason, a field the schema does not have with the fields it stores, a value
// of the wrong type -- in words that quote ids, keys and Core's rules, never a
// value compared or a pattern. Every part is read, so one refusal names every
// broken part, and a field one part names is checked even where another part
// of the same list is refused; a column a refused derive entry would make is
// still known as derived, so it is never reported as an unknown field.

import { isPlainRecord } from "../is-plain-record.ts";
import { AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS, type AutomationStudioRecordSchema } from "../schema.ts";
import { readAutomationStudioRecordConditionPattern } from "./condition/index.ts";
import { parseAutomationStudioRecordProcessingDeclaration } from "./declaration/index.ts";
import { automationStudioRecordFieldComparisonFields } from "./field-comparison.ts";
import { readAutomationStudioRecordCondition } from "./parse-condition.ts";
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
  AutomationStudioRecordProcessingRefusal,
  AutomationStudioRecordSortKey
} from "./types.ts";

export type AutomationStudioRecordProcessingParseResult =
  | { ok: true; processing: AutomationStudioRecordProcessing }
  | { ok: false; issues: string[]; refusals: AutomationStudioRecordProcessingRefusal[] };

/** The keys a model writes; `declaration` is the framework's own stamp. */
const AUTHORED_KEYS = ["derive", "dedupe", "where", "anyOf", "compare", "sort", "limit", "columns", "minRows"] as const;
const PROCESS_KEYS: ReadonlySet<string> = new Set([...AUTHORED_KEYS, "declaration"]);
const SORT_KEY_KEYS = ["field", "order", "as"] as const;
const DERIVE_KEYS = ["id", "from", "pattern", "as"] as const;
const DERIVED_READS: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_DERIVED_READS);
const COMPARE_KEYS = ["field", ...AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS, "as", "not"] as const;
const COMPARE_TYPES: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_CONDITION_TYPES);
const SORT_ORDERS: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_SORT_ORDERS);
const SORT_TYPES: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_SORT_TYPES);
/** A field id or key a sentence may name: identifier characters only. */
const NAMEABLE = /^[A-Za-z0-9_.$@-]{1,64}$/u;
const NO_FIELD = "names no field: field is the id of a column the rows hold, as text.";

/** One rule an entry broke: the operator or key it is about, where one, and why. */
type Reason = { operator?: string; reason: string };
/** An entry read: its canonical form, or the field it names and every rule it broke. */
type Entry<T> = { ok: true; value: T } | { ok: false; field?: string; reasons: Reason[] };
/** A field id a part names, with the part. */
type Named = { id: string; part: string };
type RefuseEntry = (code: string, part: string, entry: { field?: string; reasons: Reason[] }) => void;

/** Parses `value` into fresh objects, checking every field id it names against `schema`. */
export function parseAutomationStudioRecordProcessing(value: unknown, schema: AutomationStudioRecordSchema): AutomationStudioRecordProcessingParseResult {
  const issues = new Set<string>();
  const refusals: AutomationStudioRecordProcessingRefusal[] = [];
  const refuse = (code: string, part: string, reason: string, field?: string, operator?: string): void => {
    issues.add(code);
    refusals.push(refusalOf(code, part, reason, field, operator));
  };
  const refuseEntry: RefuseEntry = (code, part, entry) => {
    for (const reason of entry.reasons) refuse(code, part, reason.reason, entry.field, reason.operator);
  };
  if (!isPlainRecord(value)) {
    refuse("record_output.process_not_object", "process", `not an object; process is {${AUTHORED_KEYS.join(", ")}}, each optional.`);
    return { ok: false, issues: [...issues], refusals };
  }
  const unknownKeys = Object.keys(value).filter((key) => !PROCESS_KEYS.has(key));
  if (unknownKeys.length) refuse("record_output.process_unknown_key", "process", `takes no key ${named(unknownKeys)}; process takes ${AUTHORED_KEYS.join(", ")}.`);
  const processing: AutomationStudioRecordProcessing = {};
  /** Ids that must be stored fields. */
  const stored: Named[] = [];
  /** Ids that must be stored fields or derived columns. */
  const readable: Named[] = [];
  const fields = new Map(schema.fields.map((field) => [field.id, field]));

  // Derived columns first: what every later key may name besides the stored fields (header).
  const derivedIds = new Set<string>();
  if (value.derive !== undefined) {
    if (!Array.isArray(value.derive) || value.derive.length === 0) refuse("record_output.process_invalid_derive", "derive", "must be a nonempty list of {id, from, pattern?, as?}.");
    else {
      const made: AutomationStudioRecordDerivedField[] = [];
      let refused = false;
      value.derive.forEach((raw: unknown, index) => {
        const part = `derive[${index}]`;
        const id = isPlainRecord(raw) && typeof raw.id === "string" ? raw.id : undefined;
        if (id !== undefined && fields.has(id)) {
          refuse("record_output.process_invalid_derive", part, "makes a column with the id of a stored field; give it a new id.", undefined, `id ${quotedId(id)}`);
          refused = true;
        } else if (id !== undefined && derivedIds.has(id)) {
          refuse("record_output.process_invalid_derive", part, "makes a column an earlier derive entry already makes; give it a new id.", undefined, `id ${quotedId(id)}`);
          refused = true;
        }
        if (id !== undefined) derivedIds.add(id);
        const entry = readDerivedField(raw);
        if (!entry.ok) {
          refuseEntry("record_output.process_invalid_derive", part, entry);
          refused = true;
          return;
        }
        // A derived column reads a stored field, never another derived one.
        stored.push({ id: entry.value.from, part });
        made.push(entry.value);
      });
      if (!refused) processing.derive = made;
    }
  }

  if (value.dedupe === false) processing.dedupe = false;
  else if (value.dedupe !== undefined) {
    const by = isPlainRecord(value.dedupe) && Object.keys(value.dedupe).every((key) => key === "by") ? uniqueIds(value.dedupe.by) : null;
    if (by === null) refuse("record_output.process_invalid_dedupe", "dedupe", "must be false, or {by: [fieldId, ...]} with a nonempty list of distinct field ids.");
    else {
      processing.dedupe = { by };
      readable.push(...by.map((id) => ({ id, part: "dedupe" })));
    }
  }

  if (value.where !== undefined) {
    if (!Array.isArray(value.where)) refuse("record_output.process_invalid_where", "where", "must be a list of conditions.");
    else {
      const where = conditions(value.where, "where", "record_output.process_invalid_condition", refuseEntry, readable);
      if (where !== null) processing.where = where;
    }
  }

  if (value.anyOf !== undefined) {
    if (!Array.isArray(value.anyOf) || value.anyOf.length === 0) refuse("record_output.process_invalid_any_of", "anyOf", "must be a nonempty list of groups, each a nonempty list of conditions.");
    else {
      const groups = value.anyOf.map((group: unknown, index): AutomationStudioRecordCondition[] | null => {
        const part = `anyOf[${index}]`;
        if (!Array.isArray(group) || group.length === 0) {
          refuse("record_output.process_invalid_any_of", part, "must be a nonempty list of conditions, any one of which keeps a row.");
          return null;
        }
        return conditions(group, part, "record_output.process_invalid_any_of", refuseEntry, readable);
      });
      if (groups.every((group) => group !== null)) processing.anyOf = groups as AutomationStudioRecordCondition[][];
    }
  }

  if (value.compare !== undefined) {
    if (!Array.isArray(value.compare) || value.compare.length === 0) {
      refuse("record_output.process_invalid_compare", "compare", `must be a nonempty list of {field, ${AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS.join("|")}: otherFieldId, as?, not?}.`);
    } else {
      const compare = value.compare.map(readComparison);
      const kept: AutomationStudioRecordFieldComparison[] = [];
      compare.forEach((entry, index) => {
        if (!entry.ok) {
          refuseEntry("record_output.process_invalid_compare", `compare[${index}]`, entry);
          return;
        }
        readable.push(...automationStudioRecordFieldComparisonFields(entry.value).map((id) => ({ id, part: `compare[${index}]` })));
        kept.push(entry.value);
      });
      if (kept.length === compare.length) processing.compare = kept;
    }
  }

  if (value.sort !== undefined) {
    if (!Array.isArray(value.sort)) refuse("record_output.process_invalid_sort", "sort", "must be a list of {field, order, as?}.");
    else {
      const sort = value.sort.map(readSortKey);
      const kept: AutomationStudioRecordSortKey[] = [];
      sort.forEach((entry, index) => {
        if (!entry.ok) {
          refuseEntry("record_output.process_invalid_sort", `sort[${index}]`, entry);
          return;
        }
        readable.push({ id: entry.value.field, part: `sort[${index}]` });
        kept.push(entry.value);
      });
      if (kept.length === sort.length) {
        if (kept.length > AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.maxSortKeys) {
          refuse("record_output.process_too_many_sort_keys", "sort", `has ${kept.length} keys; a sort has at most ${AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.maxSortKeys}.`);
        }
        processing.sort = kept;
      }
    }
  }

  if (value.limit !== undefined) {
    if (!isIntegerWithin(value.limit, 1, AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.limitCeiling)) {
      refuse("record_output.process_invalid_limit", "limit", `must be a whole number from 1 to ${AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.limitCeiling}.`);
    } else processing.limit = value.limit;
  }

  if (value.columns !== undefined) {
    const columns = uniqueIds(value.columns);
    if (columns === null) refuse("record_output.process_invalid_columns", "columns", "must be a nonempty list of distinct stored field ids, in answer order.");
    else {
      processing.columns = columns;
      stored.push(...columns.filter((id) => !derivedIds.has(id)).map((id) => ({ id, part: "columns" })));
    }
  }

  if (value.minRows !== undefined) {
    if (!isIntegerWithin(value.minRows, 0, Number.MAX_SAFE_INTEGER)) refuse("record_output.process_invalid_min_rows", "minRows", "must be a whole number, 0 or more.");
    else processing.minRows = value.minRows;
  }

  if (Object.hasOwn(value, "declaration")) {
    const declaration = parseAutomationStudioRecordProcessingDeclaration(value.declaration, schema);
    if (declaration === null) refuse("record_output.process_invalid_declaration", "process", "carries a declaration the framework did not write; leave declaration out, the framework stamps it.");
    else processing.declaration = declaration;
  }

  // Each field id that is not a stored field, once, with every part naming it.
  const unstored = new Map<string, { code: string; parts: string[] }>();
  const checkStored = ({ id, part }: Named): void => {
    const field = fields.get(id);
    const code = field === undefined ? "record_output.process_unknown_field" : field.handling === "exclude" ? "record_output.process_excluded_field" : undefined;
    if (code === undefined) return;
    const known = unstored.get(id);
    if (known === undefined) unstored.set(id, { code, parts: [part] });
    else if (!known.parts.includes(part)) known.parts.push(part);
  };
  stored.forEach(checkStored);
  readable.filter(({ id }) => !derivedIds.has(id)).forEach(checkStored);
  if (unstored.size) {
    const storedIds = schema.fields.filter((field) => field.handling !== "exclude").map((field) => field.id);
    const storedSaid = `${storedIds.length ? `the schema stores ${storedIds.map(quotedId).join(", ")}` : "the schema stores no field"}${derivedIds.size ? `, and derive makes ${[...derivedIds].map(quotedId).join(", ")}` : ""}.`;
    for (const [id, { code, parts }] of unstored) {
      const why = code === "record_output.process_unknown_field"
        ? `not a field of the schema; ${storedSaid}`
        : `marked handling exclude, so it is never stored and cannot be read; ${storedSaid}`;
      refuse(code, parts.join(", "), why, id);
    }
  }
  const shownDerived = processing.columns?.filter((id) => derivedIds.has(id)) ?? [];
  if (shownDerived.length) {
    refuse("record_output.process_derived_column_shown", "columns", `lists ${shownDerived.map(quotedId).join(", ")}, which derive makes; columns lists stored fields only, and a derived column may be filtered, compared, sorted and deduplicated by.`);
  }

  return issues.size > 0 ? { ok: false, issues: [...issues], refusals } : { ok: true, processing };
}

/** A list of conditions read, each field a valid one names pushed as readable; `null` when any is refused. */
function conditions(list: readonly unknown[], part: string, code: string, refuseEntry: RefuseEntry, readable: Named[]): AutomationStudioRecordCondition[] | null {
  const kept: AutomationStudioRecordCondition[] = [];
  list.forEach((raw, index) => {
    const entry = readAutomationStudioRecordCondition(raw);
    if (!entry.ok) {
      refuseEntry(code, `${part}[${index}]`, entry);
      return;
    }
    readable.push({ id: entry.condition.field, part: `${part}[${index}]` });
    kept.push(entry.condition);
  });
  return kept.length === list.length ? kept : null;
}

/** One derived column as the contract keeps it: `as: "text"`, the default, is dropped. */
function readDerivedField(value: unknown): Entry<AutomationStudioRecordDerivedField> {
  if (!isPlainRecord(value)) return { ok: false, reasons: [{ reason: `not an object; a derive entry is {${DERIVE_KEYS.join(", ")}}.` }] };
  const reasons: Reason[] = [];
  const unknown = Object.keys(value).filter((key) => !(DERIVE_KEYS as readonly string[]).includes(key));
  if (unknown.length) reasons.push({ reason: `takes no key ${named(unknown)}; a derive entry takes ${DERIVE_KEYS.join(", ")}.` });
  const { id, from, pattern, as } = value;
  if (typeof id !== "string" || !AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.fieldIdPattern.test(id)) reasons.push({ operator: "id", reason: "must be a new column id of 1 to 100 letters, digits, _ or -." });
  else if ((AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS.reservedFieldIds as readonly string[]).includes(id)) reasons.push({ operator: "id", reason: "is a reserved word; give the column another id." });
  if (typeof from !== "string") reasons.push({ operator: "from", reason: "must name the stored field the column is read from, as text." });
  if (pattern !== undefined) {
    if (typeof pattern !== "string") reasons.push({ operator: "pattern", reason: "must be a JavaScript regular expression, as text." });
    else {
      const read = readAutomationStudioRecordConditionPattern(pattern);
      if (!read.ok) reasons.push({ operator: "pattern", reason: read.reason });
    }
  }
  if (as !== undefined && !DERIVED_READS.has(as)) reasons.push({ operator: "as", reason: `must be ${AUTOMATION_STUDIO_RECORD_DERIVED_READS.join(", ")}.` });
  const field = typeof from === "string" ? from : undefined;
  if (reasons.length) return field === undefined ? { ok: false, reasons } : { ok: false, field, reasons };
  const derived: AutomationStudioRecordDerivedField = { id: id as string, from: from as string };
  if (pattern !== undefined) derived.pattern = pattern as string;
  if (as !== undefined && as !== "text") derived.as = as as NonNullable<AutomationStudioRecordDerivedField["as"]>;
  return { ok: true, value: derived };
}

/** One comparison as the contract keeps it: at least one comparison, never of a column with itself; `as: "number"` and `not: false` are dropped. */
function readComparison(value: unknown): Entry<AutomationStudioRecordFieldComparison> {
  if (!isPlainRecord(value)) return { ok: false, reasons: [{ reason: `not an object; a comparison is {field, ${AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS.join("|")}: otherFieldId, as?, not?}.` }] };
  const reasons: Reason[] = [];
  const unknown = Object.keys(value).filter((key) => !(COMPARE_KEYS as readonly string[]).includes(key));
  if (unknown.length) reasons.push({ reason: `takes no key ${named(unknown)}; a comparison takes ${COMPARE_KEYS.join(", ")}.` });
  const field = typeof value.field === "string" ? value.field : undefined;
  if (field === undefined) reasons.push({ reason: NO_FIELD });
  const comparison: AutomationStudioRecordFieldComparison = { field: field ?? "" };
  let compares = false;
  let refusedSide = false;
  for (const key of AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS) {
    const other = value[key];
    if (other === undefined) continue;
    if (typeof other !== "string") {
      reasons.push({ operator: key, reason: "must name the other column's field id, as text; a comparison sets two columns of a row against each other, and a fixed value is compared in where." });
      refusedSide = true;
    } else if (other === field) {
      reasons.push({ operator: key, reason: "names the same field as field; a comparison sets two different columns against each other." });
      refusedSide = true;
    } else {
      comparison[key] = other;
      compares = true;
    }
  }
  if (!compares && !refusedSide) reasons.push({ reason: `compares nothing; give one of ${AUTOMATION_STUDIO_RECORD_FIELD_COMPARISONS.join(", ")} naming another field id.` });
  if (value.as !== undefined) {
    if (!COMPARE_TYPES.has(value.as)) reasons.push({ operator: "as", reason: `must be ${AUTOMATION_STUDIO_RECORD_CONDITION_TYPES.join(" or ")}.` });
    else if (value.as === "date") comparison.as = "date";
  }
  if (value.not !== undefined) {
    if (typeof value.not !== "boolean") reasons.push({ operator: "not", reason: "must be true or false." });
    else if (value.not) comparison.not = true;
  }
  if (reasons.length) return field === undefined ? { ok: false, reasons } : { ok: false, field, reasons };
  return { ok: true, value: comparison };
}

function readSortKey(value: unknown): Entry<AutomationStudioRecordSortKey> {
  if (!isPlainRecord(value)) return { ok: false, reasons: [{ reason: `not an object; a sort key is {${SORT_KEY_KEYS.join(", ")}}.` }] };
  const reasons: Reason[] = [];
  const unknown = Object.keys(value).filter((key) => !(SORT_KEY_KEYS as readonly string[]).includes(key));
  if (unknown.length) reasons.push({ reason: `takes no key ${named(unknown)}; a sort key takes ${SORT_KEY_KEYS.join(", ")}.` });
  const field = typeof value.field === "string" ? value.field : undefined;
  if (field === undefined) reasons.push({ reason: NO_FIELD });
  if (!SORT_ORDERS.has(value.order)) reasons.push({ operator: "order", reason: `must be ${AUTOMATION_STUDIO_RECORD_SORT_ORDERS.join(" or ")}.` });
  if (value.as !== undefined && !SORT_TYPES.has(value.as)) reasons.push({ operator: "as", reason: `must be ${AUTOMATION_STUDIO_RECORD_SORT_TYPES.join(", ")}.` });
  if (reasons.length || field === undefined) return field === undefined ? { ok: false, reasons } : { ok: false, field, reasons };
  const key: AutomationStudioRecordSortKey = { field, order: value.order as AutomationStudioRecordSortKey["order"] };
  if (value.as !== undefined) key.as = value.as as NonNullable<AutomationStudioRecordSortKey["as"]>;
  return { ok: true, value: key };
}

/** The refusal of one part: its sentence names the part, the field and operator where it names them, and why (header). */
function refusalOf(code: string, part: string, reason: string, field?: string, operator?: string): AutomationStudioRecordProcessingRefusal {
  const about = [field === undefined ? undefined : `field ${quotedId(field)}`, operator].filter((entry): entry is string => entry !== undefined);
  const said = `${part}${about.length ? ` (${about.join(", ")})` : ""}: ${reason}`;
  return { code, part, ...(field === undefined ? {} : { field }), ...(operator === undefined ? {} : { operator }), said };
}

/** A field id quoted, or said to be no identifier: a sentence never quotes anything else the model wrote. */
function quotedId(id: string): string {
  return NAMEABLE.test(id) ? JSON.stringify(id) : "an id that is not an identifier";
}

/** Keys a sentence may name, each quoted; one that is not an identifier is counted, never quoted. */
function named(keys: readonly string[]): string {
  const shown = keys.filter((key) => NAMEABLE.test(key)).map((key) => JSON.stringify(key));
  const unnamed = keys.length - shown.length;
  return [...shown, ...(unnamed ? [`${unnamed} key${unnamed === 1 ? "" : "s"} that ${unnamed === 1 ? "is" : "are"} not an identifier`] : [])].join(", ");
}

/** A non-empty list of distinct strings, copied, or `null`. */
function uniqueIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === "string")) return null;
  return new Set(value).size === value.length ? [...(value as string[])] : null;
}

function isIntegerWithin(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
