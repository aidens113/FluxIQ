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

import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import { screenAutomationStudioLlmEvidence } from "../llm/index.ts";
import { AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS } from "../loop-limits/index.ts";
import type { AutomationStudioResultRecordSetSummary, AutomationStudioRunResultSummary } from "./contracts.ts";

/** Stands in, in a sampled row, for a value too deep or too long to carry. */
const WITHHELD_VALUE = "[withheld]";

/** One record set as the caller reads it out of the store, before it is bounded. */
export type AutomationStudioResultRecordSetInput = {
  summary: AutomationStudioRunDatasetSummary;
  /** The stored schema (no `exclude` field), when the set's page could be read. */
  schema?: AutomationStudioRecordSchema;
  /** The first rows of the set, as stored. Bounded and screened here. */
  rows?: readonly JsonObject[];
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
  const flowShape = flowNodes.slice(0, limits.maxSteps).map((node) => ({ nodeId: node.id, definitionId: node.definitionId }));
  if (flowNodes.length > flowShape.length) withheld = true;
  const summary: AutomationStudioRunResultSummary = {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount,
    totalRefusedCount,
    recordSetCount: input.recordSets.length,
    recordSets,
    flowShape,
    withheld
  };
  return withinByteBudget(summary) ? summary : { ...summary, recordSets: recordSets.map(withoutSample), withheld: true };
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
    ...(screened ? { sampleRows: sample } : {})
  };
  const rowsAvailable = set.rows?.length ?? 0;
  return { summary, withheld: columnsWithheld || summary.truncated || (screened ? rowsAvailable > sample.length : rowsAvailable > 0) };
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
  try {
    return Buffer.byteLength(JSON.stringify(summary), "utf8") <= AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxBytes;
  } catch {
    return false;
  }
}

function safeCount(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}
