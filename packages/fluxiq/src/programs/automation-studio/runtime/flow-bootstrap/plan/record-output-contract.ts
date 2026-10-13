// The record-set contract behind a `record-output` parameter, as a model
// building a Flow is shown it, and a record output read as the node that saves
// it will read it.
//
// Core parses a record output with `parseAutomationStudioRecordOutput`, and a
// generated plan's is refused with that parser's codes (`./validation.ts`).
// Live Flow creations were refused three times in a row for record-output keys
// the parser does not take: the catalog had shown the model the parameter's
// name and one sentence about datasets, and nothing of the shape. So a catalog
// entry, whole or condensed, and the feedback on a refused plan carry the
// contract, stated here once from the record-set constants. The top-level keys
// are written out because the parser keeps its list private; a test holds the
// two together.
//
// What a node does with the value before it parses it is not the same for
// every node, and validation has to do the same or it accepts plans that fail
// when they run:
//
// - a domain output that returns records declares their path in
//   `metadata.recordsPath` and fills it in when a record output leaves it out;
//   a missing or null record output saves nothing, or a dataset the domain
//   derives itself;
// - Core's policy action reads a missing or null one as saving nothing
//   (`nodes/policy/action.ts`);
// - Core's node that writes records reads its rows from its input, replaces
//   any path it was given, and refuses a missing or null record output, since
//   it has nothing else to do (`nodes/data/write-records.ts`). A created Flow's
//   save node once passed validation that read null as "save nothing" and
//   failed when it ran (`run-mu4yk4u1-60a1c3a4`).
//
// A test runs Core's two nodes against the verdict here, value by value.

import {
  AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS,
  AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES,
  AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS,
  AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS,
  AUTOMATION_STUDIO_RECORD_SORT_ORDERS,
  AUTOMATION_STUDIO_RECORD_SORT_TYPES
} from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS,
  AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS,
  AUTOMATION_STUDIO_RECORD_VALUE_TYPES,
  AUTOMATION_STUDIO_RECORD_WRITE_MODES,
  parseAutomationStudioRecordOutput,
  type AutomationStudioNodeDefinition
} from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapIssueDetail } from "./contracts.ts";

export type AutomationStudioFlowBootstrapRecordOutputContract = {
  /** Every top-level key a record output may have. */
  keys: string[];
  /** The keys this node's record output must have. */
  requiredKeys: string[];
  /** The contract in full, for a whole catalog entry and for feedback. */
  text: string;
  /** The contract in brief, for a condensed catalog entry. */
  condensedText: string;
  /** A minimal record output this node accepts. */
  example: JsonObject;
};

const KEYS = ["datasetId", "label", "recordsPath", "schema", "writeMode", "maxRecords", "process"] as const;
const ALWAYS_REQUIRED = ["datasetId", "schema", "writeMode"] as const;

/**
 * Core's own nodes that write the records they are given, by the path each
 * saves them under. Only `builtin.data.write-records` does; it keeps the path
 * private, so it is written out here.
 */
const RECORD_WRITERS: ReadonlyMap<string, string> = new Map([["builtin.data.write-records", "records"]]);

/** The records path this node supplies itself, or `undefined` when its author must write one. */
export function automationStudioFlowBootstrapSuppliedRecordsPath(definition: AutomationStudioNodeDefinition): string | undefined {
  return writtenRecordsPath(definition) ?? automationStudioFlowBootstrapDeclaredRecordsPath(definition);
}

/**
 * Where this node's *own* result keeps its rows, as its definition declares it,
 * or `undefined` when it declares none.
 *
 * Narrower than the supplied path above, and the difference matters to a reader
 * asking whether a node library can produce a set of records at all: Core's node
 * that writes records supplies a path and still has no rows of its own -- it
 * writes the ones it is handed -- so only a declared path says "rows come out of
 * this node".
 */
export function automationStudioFlowBootstrapDeclaredRecordsPath(definition: AutomationStudioNodeDefinition): string | undefined {
  const declared = definition.metadata?.recordsPath;
  return typeof declared === "string" ? declared : undefined;
}

/**
 * The record-set parser's issue codes for this value on this node, read as the
 * node reads it when it runs; empty when the node would accept it. A missing
 * value is read as absent, which every node here treats as it treats null.
 */
export function automationStudioFlowBootstrapRecordOutputIssues(definition: AutomationStudioNodeDefinition, value: JsonValue | undefined): string[] {
  const written = writtenRecordsPath(definition);
  if (written === undefined && (value === undefined || value === null)) return [];
  const parsed = parseAutomationStudioRecordOutput(written !== undefined ? asWritten(value, written) : asDispatched(definition, value!));
  return parsed.ok ? [] : parsed.issues;
}

/**
 * Core's sentence for a processing refusal that is about a field, naming the
 * field and the ids the schema stores, read from the value being checked; or
 * `undefined` for any other code (t489, F4). Lane D round 13
 * (`run-mv66sc3c-c47e74b8`, 0026 and 0036) was refused
 * `record_output.process_unknown_field` with the code and the whole contract,
 * and nothing said that `status` was the unknown field or that `name` and
 * `mutualFriends` were stored. The parser returns codes only and stays so; the
 * names here are field ids the model itself wrote in the record output, never
 * a value a condition compares or anything from a page.
 *
 * The remedy follows how the field is used (t510, F2). Breadth wave 1
 * (`run-mv6qrbgx-06151cdb`, 0022-0026) sorted on a field it had marked
 * `handling: "exclude"` to keep it out of the answer, was told "Name a stored
 * field id instead", and moved the sort from one excluded field to another
 * until the build ended: no stored field could order the rows. A sort or
 * dedupe key must be stored, and a stored field leaves the answer through
 * `process.columns`, so that is what such a refusal now says. "Name a stored
 * field id instead" stays for a field `columns` alone names.
 */
export function automationStudioFlowBootstrapRecordOutputIssueMessage(code: string, value: JsonValue | undefined): string | undefined {
  return fieldRefusal(code, value)?.message;
}

/**
 * The field a processing refusal is about and the names that can stand there
 * (t510, F2), in the shape a domain's refusal carries (t489): the first field
 * the refusal names, and the ids the schema stores -- or, for a where field
 * that columns leaves out, the columns kept. `undefined` for any other code.
 * Identifiers the model wrote in this record output, never a page value.
 */
export function automationStudioFlowBootstrapRecordOutputIssueDetail(code: string, value: JsonValue | undefined): AutomationStudioFlowBootstrapIssueDetail | undefined {
  return fieldRefusal(code, value)?.detail;
}

type FieldRefusal = { message: string; detail: AutomationStudioFlowBootstrapIssueDetail };

const HIDE_WITH_COLUMNS = "and list the answer's columns in process.columns, which leaves every other stored field out of the answer.";

function fieldRefusal(code: string, value: JsonValue | undefined): FieldRefusal | undefined {
  if (!PROCESS_FIELD_CODES.has(code) || !isPlainObject(value) || !isPlainObject(value.process)) return undefined;
  const fields = isPlainObject(value.schema) && Array.isArray(value.schema.fields) ? value.schema.fields.filter(isPlainObject) : [];
  const known = new Set(fields.map((field) => field.id).filter((id): id is string => typeof id === "string"));
  const stored = fields.filter((field) => field.handling !== "exclude").map((field) => field.id).filter((id): id is string => typeof id === "string");
  const process = value.process;
  const keys = new Set(keyFields(process));
  const storedSaid = stored.length ? `The schema stores ${quoted(stored)}.` : "The schema stores no field.";
  const refusal = (named: readonly string[], message: string, valid: readonly string[]): FieldRefusal | undefined =>
    named.length ? { message, detail: { field: named[0]!, valid: [...valid] } } : undefined;
  if (code === "record_output.process_unknown_field") {
    const unknown = processFields(process).filter((id) => !known.has(id));
    const remedy = unknown.some((id) => keys.has(id))
      ? `A sort or dedupe key must be stored: to order by, or drop repeats by, a field the answer should not show, add it to schema.fields ${HIDE_WITH_COLUMNS}`
      : "Name a stored field id instead, or add the field to schema.fields.";
    return refusal(unknown, `process names ${quoted(unknown)}, which schema.fields does not have. ${storedSaid} ${remedy}`, stored);
  }
  if (code === "record_output.process_excluded_field") {
    const excluded = new Set(fields.filter((field) => field.handling === "exclude").map((field) => field.id));
    const named = processFields(process).filter((id) => excluded.has(id));
    const remedy = named.some((id) => keys.has(id))
      ? `A sort or dedupe key must be stored: to order by, or drop repeats by, a field the answer should not show, keep it stored -- remove handling "exclude" from it -- ${HIDE_WITH_COLUMNS}`
      : conditionFields(process.where).some((id) => excluded.has(id))
        ? "A where field must be stored: remove handling \"exclude\" from it."
        : "Name a stored field id instead.";
    return refusal(named, `process names ${quoted(named)}, which schema.fields marks handling "exclude", so it is never stored. ${storedSaid} ${remedy}`, stored);
  }
  const columns = idsOf(process.columns);
  const dropped = unique(conditionFields(process.where).filter((id) => known.has(id) && !columns.includes(id)));
  return refusal(dropped, `process.where reads ${quoted(dropped)}, which process.columns leaves out; columns keeps ${quoted(columns)}. Add the field to columns, or take the condition out.`, columns);
}

/** The processing codes about a field, which `automationStudioFlowBootstrapRecordOutputIssueMessage` names. */
const PROCESS_FIELD_CODES: ReadonlySet<string> = new Set(["record_output.process_unknown_field", "record_output.process_excluded_field", "record_output.process_where_column_dropped"]);

/** Every field id a record output's processing names, as the parser reads them: dedupe.by, where, sort and columns, each once. */
function processFields(process: JsonObject): string[] {
  return unique([...(isPlainObject(process.dedupe) ? idsOf(process.dedupe.by) : []), ...conditionFields(process.where), ...sortFields(process), ...idsOf(process.columns)]);
}

/** The fields processing orders or drops repeats by: each must be stored, and may be one columns leaves out. */
function keyFields(process: JsonObject): string[] {
  return [...(isPlainObject(process.dedupe) ? idsOf(process.dedupe.by) : []), ...sortFields(process)];
}

function sortFields(process: JsonObject): string[] {
  return Array.isArray(process.sort) ? process.sort.filter(isPlainObject).map((key) => key.field).filter((id): id is string => typeof id === "string") : [];
}

function conditionFields(where: JsonValue | undefined): string[] {
  return Array.isArray(where) ? where.filter(isPlainObject).map((condition) => condition.field).filter((id): id is string => typeof id === "string") : [];
}

const idsOf = (value: JsonValue | undefined): string[] => Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
const unique = (ids: readonly string[]): string[] => [...new Set(ids)];
const quoted = (ids: readonly string[]): string => ids.map((id) => JSON.stringify(id)).join(", ");

/** The contract this node's record output is held to, in the words a model is shown. */
export function automationStudioFlowBootstrapRecordOutputContract(definition: AutomationStudioNodeDefinition): AutomationStudioFlowBootstrapRecordOutputContract {
  const supplied = automationStudioFlowBootstrapSuppliedRecordsPath(definition) !== undefined;
  const nullable = writtenRecordsPath(definition) === undefined;
  const valueTypes = AUTOMATION_STUDIO_RECORD_VALUE_TYPES.join("|");
  // Encryption is refused until record keys exist, so it is not offered.
  const handlings = AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS.filter((handling) => handling !== "encrypt").join("|");
  const writeModes = AUTOMATION_STUDIO_RECORD_WRITE_MODES.join("|");
  const processing = processingText();
  const text = [
    `${nullable ? "null, or an object" : "Required: an object"} with only these keys: datasetId, schema, writeMode, and optional label, maxRecords, recordsPath, process.`,
    "datasetId: 1-200 of A-Za-z0-9._:-.",
    `schema: {schemaVersion:"0.1", fields:[{id, label, valueType, required?, handling?}]}; ids A-Za-z0-9_-, labels unique; valueType ${valueTypes}; handling ${handlings}, where exclude: never stored, for a value that must not be kept, and not the way a field leaves the answer.`,
    `writeMode: ${writeModes}. maxRecords: 1-${AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling}.`,
    supplied ? "recordsPath: leave out, this node supplies it." : "recordsPath: required, dot path to the rows in the result.",
    processing
  ].join(" ");
  const condensedText = `${nullable ? "null, or only" : "Required, only"}: datasetId, schema {schemaVersion:"0.1",fields:[{id,label,valueType}]}, writeMode ${writeModes}; optional label, maxRecords, process${supplied ? ", recordsPath (supplied)." : "; recordsPath required."} ${processing}`;
  return {
    keys: [...KEYS],
    requiredKeys: supplied ? [...ALWAYS_REQUIRED] : [...ALWAYS_REQUIRED, "recordsPath"],
    text,
    condensedText,
    example: {
      datasetId: "items",
      schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }] },
      writeMode: "append",
      ...(supplied ? {} : { recordsPath: "result.records" })
    }
  };
}

// The processing parser owns its option vocabulary and bounds. This help is
// delivered whole in the catalog and in a refused parameter's accepted shape.
function processingText(): string {
  const bounds = AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS.join("|");
  const texts = AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS.join("|");
  return [
    "process is optional, with only dedupe, where, sort, limit, columns, minRows; every member is optional.",
    "dedupe: false | {by:[fieldId,...]}; by is a nonempty list of distinct stored field ids. Absent dedupe uses the whole row (selected columns when columns is set); false keeps duplicates.",
    `where: [{field:fieldId, is?:${AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES.join("|")}, ${bounds}?:number, equals?:string|number|nonempty list, ${texts}?:string|nonempty string list, not?:boolean}].`,
    "Every comparison in a condition must hold; a value list means any; not inverts the condition. No comparison means presence; absent cannot accompany a comparison. Numbers must be finite, text nonblank, matches a valid regex.",
    `sort: [{field:fieldId, order:${AUTOMATION_STUDIO_RECORD_SORT_ORDERS.join("|")}, as?:${AUTOMATION_STUDIO_RECORD_SORT_TYPES.join("|")}}]; at most ${AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.maxSortKeys} keys; absent as means auto.`,
    `limit: integer 1-${AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.limitCeiling}. columns: nonempty list of distinct stored field ids, in answer order.`,
    `minRows: nonnegative integer, default ${AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS.minRowsDefault}; a shortfall is reported, never a failure.`,
    "Every field id must be stored in schema, not excluded. columns picks the answer's columns, so a sort or dedupe key may be a stored field columns leaves out; every where field must remain in columns when columns is set.",
    "Processing shapes the collected answer at run end in order where, dedupe, sort, limit, columns; it never changes which rows a repeat visits."
  ].join(" ");
}

// As `nodes/data/write-records.ts` reads it: its own path over any other, and
// anything that is not an object, a missing value included, as it is or null.
function asWritten(value: JsonValue | undefined, path: string): JsonValue {
  return isPlainObject(value) ? { ...value, recordsPath: path } : value ?? null;
}

// As an output's dispatch reads it: the declared path where none was written.
function asDispatched(definition: AutomationStudioNodeDefinition, value: JsonValue): JsonValue {
  const declared = automationStudioFlowBootstrapDeclaredRecordsPath(definition);
  return declared !== undefined && isPlainObject(value) && !Object.hasOwn(value, "recordsPath") ? { ...value, recordsPath: declared } : value;
}

function writtenRecordsPath(definition: AutomationStudioNodeDefinition): string | undefined {
  return definition.source.kind === "builtin" ? RECORD_WRITERS.get(definition.id) : undefined;
}


const isPlainObject = (value: JsonValue | undefined): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);
