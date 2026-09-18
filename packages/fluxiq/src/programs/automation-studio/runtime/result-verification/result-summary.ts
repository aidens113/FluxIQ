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
  const flowShape = flowNodes.slice(0, limits.maxSteps).map((node) => ({ nodeId: node.id, definitionId: node.definitionId }));
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
  try {
    return Buffer.byteLength(JSON.stringify(summary), "utf8") <= AUTOMATION_STUDIO_RESULT_SUMMARY_LIMITS.maxBytes;
  } catch {
    return false;
  }
}

function safeCount(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}
