// Filling in a record output the model only half wrote.
//
// A record output is the one parameter whose shape is Core's own, and in the
// first full creation campaign it refused more builds than any reasoning
// mistake did: `record_output.unknown_key` for a key the parser does not take,
// `record_output.invalid_dataset_id` for a name with a space in it,
// `record_schema.not_object` for a list of column names where a schema
// belongs, and `record_output.missing_records_path` for a path the node
// supplies itself.
//
// None of those is the model failing to say what it means. Each is Core
// refusing a spelling of the same intent, so each is derived here instead: the
// dataset id from the name the model wrote, the schema from the columns it
// asked for, the write mode from its default, and the records path from the
// node that already declares one. What remains -- the fields' ids and labels,
// and the dataset's name -- is what the model actually meant.
//
// Nothing here widens what a created Flow may hold. The value this returns
// still goes through `parseAutomationStudioRecordOutput` in validation, and a
// key that is neither the contract's nor a spelling of one is dropped with a
// warning rather than carried into the Flow.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_RECORD_VALUE_TYPES,
  AUTOMATION_STUDIO_RECORD_WRITE_MODES,
  type AutomationStudioNodeDefinition
} from "../../../nodes/index.ts";
import { automationStudioFlowBootstrapSuppliedRecordsPath, type AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import { authoringDatasetId, authoringFieldId, authoringKey } from "./keys.ts";
import { authoringError, authoringWarning } from "./issue.ts";
import { isJsonObject } from "./values.ts";

const KEY_SYNONYMS: ReadonlyMap<string, string> = new Map([
  ["datasetid", "datasetId"], ["dataset", "datasetId"], ["datasetname", "datasetId"], ["table", "datasetId"], ["id", "datasetId"],
  ["label", "label"], ["title", "label"], ["name", "label"],
  ["recordspath", "recordsPath"], ["path", "recordsPath"], ["records", "recordsPath"], ["rowspath", "recordsPath"],
  ["schema", "schema"], ["fields", "schema"], ["columns", "schema"],
  ["writemode", "writeMode"], ["mode", "writeMode"], ["write", "writeMode"],
  ["maxrecords", "maxRecords"], ["max", "maxRecords"], ["limit", "maxRecords"], ["maxrows", "maxRecords"]
]);

const WRITE_MODE_SYNONYMS: ReadonlyMap<string, string> = new Map([
  ["append", "append"], ["add", "append"], ["insert", "append"],
  ["replace", "replace"], ["overwrite", "replace"], ["reset", "replace"]
]);

const VALUE_TYPE_SYNONYMS: ReadonlyMap<string, string> = new Map([
  ["text", "string"], ["str", "string"],
  ["int", "number"], ["integer", "number"], ["float", "number"], ["decimal", "number"], ["price", "number"],
  ["bool", "boolean"],
  ["link", "url"], ["href", "url"],
  ["date", "datetime"], ["time", "datetime"], ["timestamp", "datetime"],
  ["object", "json"], ["array", "json"], ["list", "json"]
]);

/** A record output written any of the ways a model writes one, read as the contract's. */
export function normaliseAuthoringRecordOutput(input: {
  value: JsonValue | undefined;
  definition: AutomationStudioNodeDefinition;
  /** Column names read from elsewhere on the node, when the model wrote no schema. */
  columns: readonly string[];
  /** What the dataset is called when the model named it nothing usable. */
  fallbackName: string;
  path: string;
}): { value: JsonValue | undefined; issues: AutomationStudioFlowBootstrapIssue[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  if (input.value === undefined || input.value === null) return { value: input.value, issues };
  const written = asObject(input.value);
  if (!written) return { value: input.value, issues };
  const output: JsonObject = {};
  for (const [key, value] of Object.entries(written)) {
    const canonical = KEY_SYNONYMS.get(authoringKey(key));
    if (!canonical) {
      issues.push(authoringWarning("record_output.dropped_key", "A record-output key that is not part of the record-set contract was left out.", `${input.path}.${key}`));
      continue;
    }
    if (output[canonical] === undefined) output[canonical] = value;
  }
  const label = typeof output.label === "string" ? output.label : undefined;
  const datasetId = typeof output.datasetId === "string" ? authoringDatasetId(output.datasetId) : undefined;
  output.datasetId = datasetId ?? authoringDatasetId(label ?? "") ?? authoringDatasetId(input.fallbackName) ?? "records";
  const schema = normaliseSchema(output.schema, input.columns);
  if (!schema) {
    issues.push(authoringError("record_schema.not_derivable", "A record output named a dataset but no columns to save in it.", input.path));
    return { value: output, issues };
  }
  output.schema = schema;
  output.writeMode = WRITE_MODE_SYNONYMS.get(authoringKey(String(output.writeMode ?? ""))) ?? AUTOMATION_STUDIO_RECORD_WRITE_MODES[0];
  const supplied = automationStudioFlowBootstrapSuppliedRecordsPath(input.definition);
  if (supplied !== undefined) delete output.recordsPath;
  else if (typeof output.recordsPath !== "string") delete output.recordsPath;
  if (output.maxRecords !== undefined && typeof output.maxRecords !== "number") {
    const count = Number(String(output.maxRecords).trim());
    if (Number.isFinite(count)) output.maxRecords = count;
    else delete output.maxRecords;
  }
  if (label === undefined) delete output.label;
  return { value: output, issues };
}

/** A schema written as a schema, a field list, a column map or a comma-separated line. */
function normaliseSchema(written: JsonValue | undefined, columns: readonly string[]): JsonObject | undefined {
  const fields = fieldList(written) ?? fieldList(columns as JsonValue);
  if (!fields?.length) return undefined;
  const labels = new Set<string>();
  const normalised = fields.map((field, index) => {
    const id = authoringFieldId(field.id) ?? `field_${index + 1}`;
    let label = (field.label ?? titleise(id)).slice(0, 200) || id;
    while (labels.has(label.toLowerCase())) label = `${label} ${labels.size + 1}`;
    labels.add(label.toLowerCase());
    const valueType = valueTypeOf(field.valueType);
    return {
      id, label, valueType,
      ...(field.required === true ? { required: true } : {}),
      ...(typeof field.handling === "string" && field.handling !== "encrypt" ? { handling: field.handling } : {})
    } satisfies JsonObject;
  });
  return { schemaVersion: "0.1", fields: normalised };
}

type WrittenField = { id: string; label?: string; valueType?: string; required?: boolean; handling?: string };

function fieldList(written: JsonValue | undefined): WrittenField[] | undefined {
  if (written === undefined || written === null) return undefined;
  if (typeof written === "string") {
    const names = written.split(/\s*,\s*/u).map((name) => name.trim()).filter(Boolean);
    return names.length ? names.map((name) => ({ id: name })) : undefined;
  }
  if (Array.isArray(written)) {
    const fields = written.map((item) => writtenField(item)).filter((field): field is WrittenField => field !== undefined);
    return fields.length ? fields : undefined;
  }
  if (!isJsonObject(written)) return undefined;
  const inner = written.fields ?? written.columns;
  if (inner !== undefined) return fieldList(inner);
  const entries = Object.entries(written).filter(([key]) => authoringKey(key) !== "schemaversion");
  const fields = entries.map(([key, value]) => typeof value === "string"
    ? { id: key, valueType: value }
    : { ...(writtenField(value) ?? {}), id: key });
  return fields.length ? fields : undefined;
}

function writtenField(item: JsonValue): WrittenField | undefined {
  if (typeof item === "string") return item.trim() ? { id: item.trim() } : undefined;
  if (!isJsonObject(item)) return undefined;
  const read = (...keys: string[]): JsonValue | undefined => {
    for (const [key, value] of Object.entries(item)) if (keys.includes(authoringKey(key))) return value;
    return undefined;
  };
  const id = read("id", "key", "name", "field", "column");
  const label = read("label", "title", "header");
  const valueType = read("valuetype", "type", "kind");
  const required = read("required");
  const handling = read("handling");
  const identifier = typeof id === "string" && id.trim() ? id.trim() : typeof label === "string" ? label.trim() : "";
  if (!identifier) return undefined;
  return {
    id: identifier,
    ...(typeof label === "string" && label.trim() ? { label: label.trim() } : {}),
    ...(typeof valueType === "string" ? { valueType } : {}),
    ...(required === true ? { required: true } : {}),
    ...(typeof handling === "string" ? { handling } : {})
  };
}

function valueTypeOf(written: string | undefined): string {
  const key = authoringKey(written ?? "");
  const mapped = VALUE_TYPE_SYNONYMS.get(key) ?? key;
  return (AUTOMATION_STUDIO_RECORD_VALUE_TYPES as readonly string[]).includes(mapped) ? mapped : "string";
}

function titleise(id: string): string {
  return id.replace(/[_-]+/gu, " ").replace(/\s+/gu, " ").trim().replace(/^./u, (first) => first.toUpperCase());
}

function asObject(value: JsonValue): JsonObject | undefined {
  if (isJsonObject(value)) return value;
  if (typeof value === "string") return value.trim() ? { datasetId: value.trim() } : {};
  if (Array.isArray(value)) return { schema: value };
  return undefined;
}

