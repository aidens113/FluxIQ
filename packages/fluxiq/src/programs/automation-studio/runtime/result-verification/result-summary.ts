// The bounded account of a run's result that one verification call is shown.
//
// Everything here is a reduction. A run can store a hundred thousand rows; a
// verification is one call and must cost about what a diagnosis costs, so what
// leaves is a count, the column names, and a handful of rows. The counts are
// Core's own and are exact; the rows are a sample and are labelled as one.
//
// **Rows come off a medium Core does not know, so they are screened, not
// trusted.** A sampled value is cut to a fixed length, a nested value is
// replaced by a marker rather than walked, and the whole sample is then put
// through the same evidence screen every other slot of a request passes: the
// bound domain's declared keys, and Core's credential shapes. A sample that
// fails the screen is dropped whole and the summary says so. Nothing widens
// what a domain already chose to hand over -- a stored row has already had its
// `exclude` fields removed by the record schema's allowlist copy before it ever
// reached the store.
//
// A caller that has no declared-keys list gets no rows at all. Absent means
// nobody said, never "deny nothing", which is the rule the request evidence
// check states and this follows.
//
// **The Flow's steps now say what they run with, and that closed a parity gap
// rather than widening a disclosure.** The shape was a list of node ids and
// definition ids, and the judgement is asked whether the Flow had a step that
// could narrow what the request asked to narrow -- a question two definition ids
// cannot answer. The *repair* that follows a refutation has been shown each
// step's authored parameters since t139, through `parameter-screen.ts`; the
// judgement whose refutation triggers that repair was shown less than the repair
// it triggers. So the same projection, the same screens and the same dotted
// paths are reused here, with the same rule about a missing declaration. What is
// new is only who is shown it.
//
// The parameters are spent out of what the rest of the summary left, because the
// whole thing has a 4,000-byte budget and the data sample is what the judgement
// is about. A step left bare for want of room says so in
// `flowParametersWithheld`, so "runs on its defaults" and "there was no room to
// say" do not read alike.
//
// **Core also checks the rows against the set's own schema, and counts.** A
// field the Flow's record schema declares `required` must carry a value in
// every row. Record validation already refuses a row where it is absent or
// null, so what reaches the store and fails here is the value that validation
// cannot see is empty: a string with nothing in it, which a medium hands back
// when the thing a field was read from exists and holds no text. The check
// reads only what the Flow declared -- never a list of fields someone expected
// -- and what leaves is two counts and the field ids, never a value. It reads
// up to `maxRowsCheckedPerSet` rows whether or not any row is sampled, because
// it is Core's own arithmetic and nothing it reads is sent.

import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import { screenAutomationStudioLlmEvidence } from "../llm/index.ts";
import { AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS } from "../loop-limits/index.ts";
// Re-exported from the module that applies every one of these bounds, so a
// reader of the summary has them in hand and the directory barrel keeps
// publishing them. `contracts.ts` says why they are not re-exported there.
export { AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS };
import { automationStudioScreenedNodeParameters } from "../recovery/repair-context/index.ts";
import type {
  AutomationStudioResultFlowStepSummary,
  AutomationStudioResultRecordSetSummary,
  AutomationStudioRunResultSummary
} from "./contracts.ts";

/** Stands in, in a sampled row, for a value too deep or too long to carry. */
const WITHHELD_VALUE = "[withheld]";

/** How long a step's own name may be. The same bound the repair context's step chain holds a label to. */
const MAX_STEP_LABEL_LENGTH = 80;

/** One record set as the caller reads it out of the store, before it is bounded. */
export type AutomationStudioResultRecordSetInput = {
  summary: AutomationStudioRunDatasetSummary;
  /** The stored schema (no `exclude` field), when the set's page could be read. */
  schema?: AutomationStudioRecordSchema;
  /** The first rows of the set, as stored. Bounded and screened here. */
  rows?: readonly JsonObject[];
  /**
   * The rows Core checks for required values, and only checks: never sampled,
   * never sent. At most `maxRowsCheckedPerSet` are read. Absent, `rows` is
   * checked instead.
   */
  checkedRows?: readonly JsonObject[];
};

export type AutomationStudioRunResultSummaryInput = {
  recordSets: readonly AutomationStudioResultRecordSetInput[];
  /** The Flow's authored nodes, in order: the shape of what it can do at all. */
  flowNodes?: readonly AutomationStudioFlowNode[];
  /**
   * The bound domain's declared denied keys, exactly as declared. Absent means
   * no declaration was made, and no row is sampled at all.
   */
  deniedEvidenceKeys?: readonly string[] | undefined;
};

/**
 * The bounded, screened summary of what a run produced.
 *
 * `withheld` is true whenever anything was cut, so the model is never shown a
 * partial picture that reads as a whole one -- a sample of four rows out of two
 * hundred and forty is a very different fact from four rows out of four.
 */
export function summarizeAutomationStudioRunResult(input: AutomationStudioRunResultSummaryInput): AutomationStudioRunResultSummary {
  const limits = AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS;
  const totalRecordCount = input.recordSets.reduce((total, set) => total + safeCount(set.summary.recordCount), 0);
  const totalRefusedCount = input.recordSets.reduce((total, set) => total + safeCount(set.summary.invalidCount), 0);
  const listedSets = input.recordSets.slice(0, limits.maxRecordSets);
  let sampleBudget = limits.maxSampleRows;
  let withheld = input.recordSets.length > listedSets.length;
  const recordSets: AutomationStudioResultRecordSetSummary[] = [];
  for (const set of listedSets) {
    const bounded = boundedRecordSet(set, sampleBudget, input.deniedEvidenceKeys);
    sampleBudget -= bounded.summary.sampleRows?.length ?? 0;
    if (bounded.withheld) withheld = true;
    recordSets.push(bounded.summary);
  }
  const flowNodes = input.flowNodes ?? [];
  const flowShape = flowNodes.slice(0, limits.maxSteps).map(namedStep);
  if (flowNodes.length > flowShape.length) withheld = true;
  const summary: AutomationStudioRunResultSummary = {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount,
    totalRefusedCount,
    totalRowsMissingRequired: recordSets.reduce((total, set) => total + set.rowsMissingRequired, 0),
    recordSetCount: input.recordSets.length,
    recordSets,
    flowShape,
    withheld
  };
  const bounded = withinByteBudget(summary) ? summary : { ...summary, recordSets: recordSets.map(withoutSample), withheld: true };
  // Spent last, out of whatever the rest of the summary left. The sample is the
  // data the judgement is about and keeps its priority; the parameters say what
  // the Flow did to produce it and take the remainder, step by step, until the
  // budget runs out. That is the order `context-packet.ts` packs explored
  // evidence in, for the same reason: a slot that can only have what is left has
  // to be filled after the slots that cannot.
  return withParameters(bounded, flowNodes, input.deniedEvidenceKeys);
}

/** One step, with the name the Flow gave it. Parameters are added later, if there is room. */
function namedStep(node: AutomationStudioFlowNode): AutomationStudioResultFlowStepSummary {
  return {
    nodeId: node.id,
    definitionId: node.definitionId,
    ...(node.label ? { label: node.label.slice(0, MAX_STEP_LABEL_LENGTH) } : {})
  };
}

/**
 * The summary with each step's authored parameters attached, as far as the byte
 * budget reaches.
 *
 * A caller with no declared-keys list gets none at all, which is the rule the
 * row sample follows and the one `parameter-screen.ts` requires of its callers:
 * absent means nobody said what this medium's raw payload is called, never "deny
 * nothing". A step whose parameters would not fit is left bare and
 * `flowParametersWithheld` says so, because a step running on its defaults and a
 * step nobody had room to describe must not read alike.
 */
function withParameters(
  summary: AutomationStudioRunResultSummary,
  flowNodes: readonly AutomationStudioFlowNode[],
  deniedEvidenceKeys: readonly string[] | undefined
): AutomationStudioRunResultSummary {
  if (deniedEvidenceKeys === undefined || summary.flowShape.length === 0) return summary;
  const authored = new Map(flowNodes.map((node) => [node.id, node.parameterValues]));
  let spent = serializedBytes(summary);
  let unfitted = false;
  const flowShape = summary.flowShape.map((step) => {
    const parameterValues = authored.get(step.nodeId);
    if (!parameterValues || Object.keys(parameterValues).length === 0) return step;
    const screened = automationStudioScreenedNodeParameters(parameterValues, deniedEvidenceKeys);
    const withParameter: AutomationStudioResultFlowStepSummary = {
      ...step,
      parameters: screened.values,
      ...(screened.withheld.length ? { parametersWithheld: screened.withheld } : {})
    };
    const cost = serializedBytes(withParameter) - serializedBytes(step);
    if (spent + cost > AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxBytes) {
      unfitted = true;
      return step;
    }
    spent += cost;
    return withParameter;
  });
  if (!flowShape.some((step) => step.parameters)) return unfitted ? { ...summary, flowParametersWithheld: true, withheld: true } : summary;
  return { ...summary, flowShape, ...(unfitted ? { flowParametersWithheld: true, withheld: true } : {}) };
}

function boundedRecordSet(
  set: AutomationStudioResultRecordSetInput,
  sampleBudget: number,
  deniedEvidenceKeys: readonly string[] | undefined
): { summary: AutomationStudioResultRecordSetSummary; withheld: boolean } {
  const limits = AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS;
  const fields = set.schema?.fields ?? [];
  const columns = fields.slice(0, limits.maxColumns).map((field) => field.id);
  const columnsWithheld = fields.length > columns.length;
  const allowance = Math.max(0, Math.min(limits.maxSampleRowsPerSet, sampleBudget));
  const offered = set.rows?.slice(0, allowance) ?? [];
  const sample = deniedEvidenceKeys === undefined ? [] : offered.map((row) => boundedRow(row, columns));
  const screened = sample.length > 0 && sendableSample(sample, deniedEvidenceKeys ?? []);
  const summary: AutomationStudioResultRecordSetSummary = {
    datasetId: set.summary.datasetId,
    ...(set.summary.label ? { label: set.summary.label } : {}),
    recordCount: safeCount(set.summary.recordCount),
    refusedCount: safeCount(set.summary.invalidCount),
    truncated: set.summary.truncated === true,
    columns,
    columnsWithheld,
    ...requiredValueCheck(set),
    ...(screened ? { sampleRows: sample } : {})
  };
  const rowsAvailable = set.rows?.length ?? 0;
  return { summary, withheld: columnsWithheld || summary.truncated || (screened ? rowsAvailable > sample.length : rowsAvailable > 0) };
}

/**
 * How many checked rows lack a value for a field the set's own schema declares
 * required, and which fields.
 *
 * Only `required: true` counts: a field the schema leaves optional may be
 * absent from any row, and a field nobody declared is not Core's to demand. A
 * set whose schema could not be read is not checked at all, and says so by
 * checking no rows, rather than passing rows it never compared.
 */
function requiredValueCheck(set: AutomationStudioResultRecordSetInput): Pick<AutomationStudioResultRecordSetSummary, "rowsChecked" | "rowsMissingRequired" | "missingRequiredColumns"> {
  const limits = AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS;
  if (!set.schema) return { rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [] };
  const required = set.schema.fields
    .filter((field) => field.required === true && (field.handling === undefined || field.handling === "include"))
    .map((field) => field.id);
  const checked = (set.checkedRows ?? set.rows ?? []).slice(0, limits.maxRowsCheckedPerSet);
  const lacking = new Set<string>();
  let rowsMissingRequired = 0;
  for (const row of checked) {
    const missing = required.filter((id) => !carriesValue(row, id));
    if (missing.length === 0) continue;
    rowsMissingRequired += 1;
    for (const id of missing) lacking.add(id);
  }
  return {
    rowsChecked: checked.length,
    rowsMissingRequired,
    missingRequiredColumns: required.filter((id) => lacking.has(id)).slice(0, limits.maxColumns)
  };
}

/**
 * Whether a stored row carries a value for a field: present, not null, and --
 * for a string -- not empty once its surrounding whitespace is set aside. A
 * number, a boolean and a structure are values whatever they hold; nothing
 * here judges whether a value is plausible, only whether there is one.
 */
function carriesValue(row: JsonObject, id: string): boolean {
  if (!Object.hasOwn(row, id)) return false;
  const value = row[id];
  if (value === null || value === undefined) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

/**
 * One row, cut to the columns the schema names and to a fixed value length.
 *
 * A nested value is not walked: it becomes the withheld marker. Depth is where
 * an unbounded payload hides, and a verification has no use for it -- whether
 * a result answers a request is decided from the values a person would read in
 * a column, not from a structure underneath one.
 */
function boundedRow(row: JsonObject, columns: readonly string[]): JsonObject {
  const bounded: JsonObject = {};
  for (const column of columns) {
    if (!Object.hasOwn(row, column)) continue;
    bounded[column] = boundedValue(row[column]);
  }
  return bounded;
}

function boundedValue(value: JsonValue | undefined): JsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : WITHHELD_VALUE;
  if (typeof value === "string") {
    return value.length <= AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxValueLength
      ? value
      : `${value.slice(0, AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxValueLength)}…`;
  }
  return WITHHELD_VALUE;
}

/** The same screen every evidence-bearing slot of a request passes before it is sent. */
function sendableSample(sample: readonly JsonObject[], deniedEvidenceKeys: readonly string[]): boolean {
  const found = screenAutomationStudioLlmEvidence(sample, deniedEvidenceKeys);
  return !found.deniedKey && !found.secretShaped;
}

function withoutSample(summary: AutomationStudioResultRecordSetSummary): AutomationStudioResultRecordSetSummary {
  const { sampleRows: _sampleRows, ...rest } = summary;
  return rest;
}

function withinByteBudget(summary: AutomationStudioRunResultSummary): boolean {
  return serializedBytes(summary) <= AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxBytes;
}

/** What a value costs on the wire, or the whole budget when it cannot be serialized at all. */
function serializedBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function safeCount(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}
