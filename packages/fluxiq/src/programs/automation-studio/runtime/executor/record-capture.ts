// Capturing the rows a record output declares, at the one point every dispatch
// path reaches.
//
// `builtin.policy.action` parses its `recordOutput` before it dispatches and
// carries the parsed value in the effect payload; an importer or trusted-local
// node may put one there as well. The dispatcher -- the IO runtime, the
// framework runtime, or one a host supplies -- answers with the domain's
// payload as `outputs.result`. Capture runs on that answer before the executor
// merges it into the node's outputs, so what leaves here is the only form of
// the rows the run holds. Rows are validated by allowlist copy, which drops
// `exclude` and unknown fields, then written to `outputs.records` and put back
// at `recordsPath` inside `outputs.result` as the same array. Excluded values
// therefore reach neither the values map, a later node's inputs, nor the saved
// trace.
import {
  parseAutomationStudioRecordOutput,
  parseAutomationStudioRecordsPath,
  storedAutomationStudioRecordSchema,
  validateAutomationStudioRecords,
  type AutomationStudioFailureRecord,
  type AutomationStudioRecordOutput,
  type AutomationStudioRecordValidationResult
} from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationNodeExecutionResult } from "../../nodes/index.ts";
import type { AutomationStudioRecordBatch } from "./contracts.ts";
import { AUTOMATION_STUDIO_WITHHELD_VALUE } from "./trace-withholding.ts";

export type AutomationStudioRecordCaptureRequest = {
  effect: { type: string; payload?: JsonValue };
  /** The dispatcher's answer for `effect`, before it is merged into the node's outputs. */
  dispatched: AutomationNodeExecutionResult;
  nodeId: string;
  attemptId: string;
  /** Attempt ids of the Call Flow attempts enclosing the capturing run, outermost first; empty or absent for a root run. */
  callFlowAttemptPath?: readonly string[];
};

export type AutomationStudioRecordCapture = {
  /** The answer to merge. `dispatched` itself, by identity, when the effect declares no record output. */
  result: AutomationNodeExecutionResult;
  /** The captured rows, present only when the dispatch succeeded and the rows were found. */
  batch?: AutomationStudioRecordBatch;
};

const ENCRYPT_UNAVAILABLE_ISSUE = "record_schema.encrypt_unavailable";

export function captureAutomationStudioRecordBatch(request: AutomationStudioRecordCaptureRequest): AutomationStudioRecordCapture {
  const { effect, dispatched } = request;
  const declared = declaredRecordOutput(effect);
  if (declared === undefined) return { result: dispatched };
  // A failed dispatch saves no records, and a payload it returned may still
  // hold the fields the schema excludes.
  if (dispatched.status === "failed") return { result: withheldPayload(dispatched) };
  // Parsed again rather than trusted: the effect may come from a node other
  // than the policy action, which parsed it before dispatch.
  const parsed = parseAutomationStudioRecordOutput(declared);
  if (!parsed.ok) return { result: invalidRecordOutput(dispatched, parsed.issues) };
  const segments = parseAutomationStudioRecordsPath(parsed.output.recordsPath);
  const outputs = dispatched.outputs ?? {};
  const found = segments ? valueAtPath(outputs.result, segments) : undefined;
  if (!segments || !Array.isArray(found)) return { result: recordsMissing(dispatched, parsed.output.recordsPath) };
  const validated = validateAutomationStudioRecords(found, parsed.output.schema, { maxRecords: parsed.output.maxRecords });
  const rows = validated.rows;
  const result: AutomationNodeExecutionResult = {
    ...dispatched,
    outputs: { ...outputs, result: replacedAtPath(outputs.result, segments, rows), records: rows }
  };
  return { result, batch: recordBatch(request, parsed.output, validated) };
}

// Present and not null declares a record output, the rule the policy action and
// the framework runtime's saved attempt use. Anything else, `false` included,
// must parse.
function declaredRecordOutput(effect: AutomationStudioRecordCaptureRequest["effect"]): JsonValue | undefined {
  if (effect.type !== "policy.output.dispatch") return undefined;
  const payload = effect.payload;
  if (!isJsonRecord(payload)) return undefined;
  const declared = Object.hasOwn(payload, "recordOutput") ? payload.recordOutput : undefined;
  return declared === null ? undefined : declared;
}

export type AutomationStudioWrittenRecordsRequest = {
  /** A `records.write` effect as a node emitted it, `{ recordOutput, records }`. No dispatcher answers it. */
  effect: { type: string; payload?: JsonValue };
  nodeId: string;
  attemptId: string;
  /** Attempt ids of the Call Flow attempts enclosing the capturing run, outermost first; empty or absent for a root run. */
  callFlowAttemptPath?: readonly string[];
};

export type AutomationStudioWrittenRecords = {
  /** The answer to merge into the node's result: `records` when the rows were captured, a failure otherwise. */
  result: AutomationNodeExecutionResult;
  /** The effect the attempt keeps: its `records` are the validated array, or withheld when nothing was captured. */
  effect: { type: string; payload?: JsonValue };
  /** The captured rows, present only when the record output parsed and the rows were a list. */
  batch?: AutomationStudioRecordBatch;
};

/** Where a `records.write` effect carries its rows, so the only records path its record output is read with. */
const WRITTEN_RECORDS_PATH = "records";

// A `records.write` effect carries its rows itself, so they are captured from
// the effect rather than from a dispatcher's answer, with the same validation
// and the same batch key. Any authored `recordsPath` is ignored. The effect stays
// in the attempt, and so in the saved trace: its rows are replaced with the
// validated array, which the saved trace turns into a marker, or withheld when
// nothing was captured, since unvalidated rows may hold excluded fields.
export function captureAutomationStudioWrittenRecords(request: AutomationStudioWrittenRecordsRequest): AutomationStudioWrittenRecords {
  const { effect } = request;
  const payload = isJsonRecord(effect.payload) ? effect.payload : undefined;
  const declared = payload && Object.hasOwn(payload, "recordOutput") ? payload.recordOutput : null;
  const parsed = parseAutomationStudioRecordOutput(isJsonRecord(declared) ? { ...declared, recordsPath: WRITTEN_RECORDS_PATH } : declared);
  if (!parsed.ok) return { result: invalidWrittenRecords(parsed.issues), effect: withheldWrittenRecords(effect) };
  const found = payload && Object.hasOwn(payload, "records") ? payload.records : undefined;
  if (!payload || !Array.isArray(found)) return { result: writtenRecordsMissing(), effect: withheldWrittenRecords(effect) };
  const validated = validateAutomationStudioRecords(found, parsed.output.schema, { maxRecords: parsed.output.maxRecords });
  return {
    result: { status: "success", route: "success", outputs: { records: validated.rows } },
    effect: { ...effect, payload: { ...payload, records: validated.rows } },
    batch: recordBatch(request, parsed.output, validated)
  };
}

function recordBatch(request: Pick<AutomationStudioRecordCaptureRequest, "nodeId" | "attemptId" | "callFlowAttemptPath">, output: AutomationStudioRecordOutput, validated: AutomationStudioRecordValidationResult): AutomationStudioRecordBatch {
  const batch: AutomationStudioRecordBatch = {
    nodeId: request.nodeId,
    attemptId: request.attemptId,
    batchKey: recordBatchKey(request.callFlowAttemptPath ?? [], request.attemptId),
    datasetId: output.datasetId,
    writeMode: output.writeMode,
    // The stored schema, so the dataset is never told an excluded field's id.
    schema: storedAutomationStudioRecordSchema(output.schema),
    rows: validated.rows,
    invalidCount: validated.invalidCount,
    truncated: validated.truncated
  };
  if (output.label !== undefined) batch.label = output.label;
  return batch;
}

const BATCH_KEY_SEPARATOR = "/";

// An attempt id is numbered within its own graph run, so a Call Flow child's
// ids repeat its parent's and every other invocation's. The enclosing Call Flow
// attempts tell them apart, and they are the same each time the run is run, so
// the key is too. Node ids carry no character restriction, so each id is escaped
// rather than trusted: `%` first, then `/`. The escape is reversible, so two
// different paths never produce one key, and `/` appears only between ids.
function recordBatchKey(callFlowAttemptPath: readonly string[], attemptId: string): string {
  return [...callFlowAttemptPath, attemptId].map(escapedKeySegment).join(BATCH_KEY_SEPARATOR);
}

function escapedKeySegment(segment: string): string {
  return segment.replace(/%/gu, "%25").replace(/\//gu, "%2F");
}

/** Segments walk own properties of plain objects only; an array or a missing key on the way means nothing is there. */
function valueAtPath(root: JsonValue | undefined, segments: readonly string[]): JsonValue | undefined {
  let current = root;
  for (const segment of segments) {
    if (!isJsonRecord(current) || !Object.hasOwn(current, segment)) return undefined;
    current = current[segment];
  }
  return current;
}

/** A copy of `root` along `segments` only, so the dispatcher's own answer is never changed. */
function replacedAtPath(root: JsonValue | undefined, segments: readonly string[], replacement: JsonObject[]): JsonValue {
  const [segment, ...rest] = segments;
  if (segment === undefined || !isJsonRecord(root)) return replacement;
  const copy: JsonObject = { ...root };
  copy[segment] = rest.length ? replacedAtPath(root[segment], rest, replacement) : replacement;
  return copy;
}

function withheldPayload(result: AutomationNodeExecutionResult): AutomationNodeExecutionResult {
  const outputs = result.outputs;
  if (!outputs || outputs.result === undefined) return result;
  return { ...result, outputs: { ...outputs, result: AUTOMATION_STUDIO_WITHHELD_VALUE } };
}

function invalidRecordOutput(dispatched: AutomationNodeExecutionResult, issues: string[]): AutomationNodeExecutionResult {
  const code = issues.includes(ENCRYPT_UNAVAILABLE_ISSUE) ? "record_output.encrypt_unavailable" : "record_output.invalid";
  const withheld = withheldPayload(dispatched);
  return failedCapture(
    { ...withheld, outputs: { ...(withheld.outputs ?? {}), error: { code, issues } } },
    "The output ran, but Save extracted records is not a valid record output, so no records were saved.",
    { category: "graph_validation_or_unknown_node", code, retryable: false, stage: "dispatch" }
  );
}

function recordsMissing(dispatched: AutomationNodeExecutionResult, recordsPath: string): AutomationNodeExecutionResult {
  return failedCapture(
    withheldPayload(dispatched),
    `The output returned no list of records at ${recordsPath}, so no records were saved.`,
    { category: "output_not_observed", code: "record_output.records_missing", retryable: true }
  );
}

function invalidWrittenRecords(issues: string[]): AutomationNodeExecutionResult {
  const encryptUnavailable = issues.includes(ENCRYPT_UNAVAILABLE_ISSUE);
  const code = encryptUnavailable ? "record_output.encrypt_unavailable" : "record_output.invalid";
  return failedCapture(
    { outputs: { error: { code, issues } } },
    encryptUnavailable
      ? "The records to write ask to encrypt a field, which is not available yet, so no records were saved."
      : "The records to write have no valid record output, so no records were saved.",
    { category: "graph_validation_or_unknown_node", code, retryable: false }
  );
}

function writtenRecordsMissing(): AutomationNodeExecutionResult {
  return failedCapture(
    {},
    "No list of records was given to write, so no records were saved.",
    { category: "graph_validation_or_unknown_node", code: "record_output.records_missing", retryable: false }
  );
}

function withheldWrittenRecords(effect: AutomationStudioWrittenRecordsRequest["effect"]): AutomationStudioWrittenRecordsRequest["effect"] {
  const { payload } = effect;
  if (payload === undefined) return effect;
  if (!isJsonRecord(payload)) return { ...effect, payload: AUTOMATION_STUDIO_WITHHELD_VALUE };
  if (!Object.hasOwn(payload, "records")) return effect;
  return { ...effect, payload: { ...payload, records: AUTOMATION_STUDIO_WITHHELD_VALUE } };
}

function failedCapture(result: AutomationNodeExecutionResult, message: string, failure: AutomationStudioFailureRecord): AutomationNodeExecutionResult {
  return { ...result, status: "failed", route: "failed", message, failure };
}

function isJsonRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
