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

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS,
  AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS,
  AUTOMATION_STUDIO_RECORD_VALUE_TYPES,
  AUTOMATION_STUDIO_RECORD_WRITE_MODES,
  parseAutomationStudioRecordOutput,
  type AutomationStudioNodeDefinition
} from "../../../nodes/index.ts";

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

const KEYS = ["datasetId", "label", "recordsPath", "schema", "writeMode", "maxRecords"] as const;
const ALWAYS_REQUIRED = ["datasetId", "schema", "writeMode"] as const;

/**
 * Core's own nodes that write the records they are given, by the path each
 * saves them under. Only `builtin.data.write-records` does; it keeps the path
 * private, so it is written out here.
 */
const RECORD_WRITERS: ReadonlyMap<string, string> = new Map([["builtin.data.write-records", "records"]]);

/** The records path this node supplies itself, or `undefined` when its author must write one. */
export function automationStudioFlowBootstrapSuppliedRecordsPath(definition: AutomationStudioNodeDefinition): string | undefined {
  return writtenRecordsPath(definition) ?? declaredRecordsPath(definition);
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

/** The contract this node's record output is held to, in the words a model is shown. */
export function automationStudioFlowBootstrapRecordOutputContract(definition: AutomationStudioNodeDefinition): AutomationStudioFlowBootstrapRecordOutputContract {
  const supplied = automationStudioFlowBootstrapSuppliedRecordsPath(definition) !== undefined;
  const nullable = writtenRecordsPath(definition) === undefined;
  const valueTypes = AUTOMATION_STUDIO_RECORD_VALUE_TYPES.join("|");
  // Encryption is refused until record keys exist, so it is not offered.
  const handlings = AUTOMATION_STUDIO_RECORD_FIELD_HANDLINGS.filter((handling) => handling !== "encrypt").join("|");
  const writeModes = AUTOMATION_STUDIO_RECORD_WRITE_MODES.join("|");
  const text = [
    `${nullable ? "null, or an object" : "Required: an object"} with only these keys: datasetId, schema, writeMode, and optional label, maxRecords, recordsPath.`,
    "datasetId: 1-200 of A-Za-z0-9._:-.",
    `schema: {schemaVersion:"0.1", fields:[{id, label, valueType, required?, handling?}]}; ids A-Za-z0-9_-, labels unique; valueType ${valueTypes}; handling ${handlings}.`,
    `writeMode: ${writeModes}. maxRecords: 1-${AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling}.`,
    supplied ? "recordsPath: leave out, this node supplies it." : "recordsPath: required, dot path to the rows in the result."
  ].join(" ");
  const condensedText = `${nullable ? "null, or only" : "Required, only"}: datasetId, schema {schemaVersion:"0.1",fields:[{id,label,valueType}]}, writeMode ${writeModes}; optional label, maxRecords${supplied ? ", recordsPath (supplied)." : "; recordsPath required."}`;
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

// As `nodes/data/write-records.ts` reads it: its own path over any other, and
// anything that is not an object, a missing value included, as it is or null.
function asWritten(value: JsonValue | undefined, path: string): JsonValue {
  return isPlainObject(value) ? { ...value, recordsPath: path } : value ?? null;
}

// As an output's dispatch reads it: the declared path where none was written.
function asDispatched(definition: AutomationStudioNodeDefinition, value: JsonValue): JsonValue {
  const declared = declaredRecordsPath(definition);
  return declared !== undefined && isPlainObject(value) && !Object.hasOwn(value, "recordsPath") ? { ...value, recordsPath: declared } : value;
}

function writtenRecordsPath(definition: AutomationStudioNodeDefinition): string | undefined {
  return definition.source.kind === "builtin" ? RECORD_WRITERS.get(definition.id) : undefined;
}

function declaredRecordsPath(definition: AutomationStudioNodeDefinition): string | undefined {
  const declared = definition.metadata?.recordsPath;
  return typeof declared === "string" ? declared : undefined;
}

const isPlainObject = (value: JsonValue | undefined): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);
