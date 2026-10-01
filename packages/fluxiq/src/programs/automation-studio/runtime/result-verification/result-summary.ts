// The account of a run's result that one verification call is shown: every
// record set, every column, every stored row and every value whole, and every
// step of the Flow with the parameters it was authored with (2026-09-30, "the
// model sees the whole page"). There is no record-set, row, column, value,
// step or byte limit, and no sample: the rows the model is shown are the rows
// the run stored.
//
// **Rows come off a medium Core does not know, so they are screened, not
// trusted.** A caller that has no declared-keys list gets no rows at all --
// absent means nobody said, never "deny nothing", which is the rule the request
// evidence check states and this follows. With a declaration, a column whose id
// the domain denies carries no values, and a value shaped like a credential is
// replaced by a marker; either sets `withheld`, so the model is never shown a
// screened picture that reads as a whole one. Nothing widens what a domain
// already chose to hand over -- a stored row has already had its `exclude`
// fields removed by the record schema's allowlist copy before it ever reached
// the store.
//
// **The Flow's steps say what they run with**, through the repair context's own
// parameter screen (`parameter-screen.ts`), with the same rule about a missing
// declaration: the judgement is shown what the repair it triggers is shown.
//
// **Core also checks the rows against the set's own schema, and counts.** A
// field the Flow's record schema declares `required` must carry a value in
// every row. Record validation already refuses a row where it is absent or
// null, so what reaches the store and fails here is the value that validation
// cannot see is empty: a string with nothing in it. The check reads only what
// the Flow declared, and what leaves is two counts and the field ids.

import type { AutomationStudioRecordSchema, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../model/index.ts";
import { screenAutomationStudioLlmEvidence } from "../llm/index.ts";
import { automationStudioScreenedNodeParameters } from "../recovery/repair-context/index.ts";
import type {
  AutomationStudioResultFlowStepSummary,
  AutomationStudioResultRecordSetSummary,
  AutomationStudioRunResultSummary
} from "./contracts.ts";
import { automationStudioResultReadAccounts } from "./read-account/index.ts";

/** Stands in, in a row, for a value shaped like a credential or carrying a denied key. */
const WITHHELD_VALUE = "[withheld]";

/** One record set as the caller reads it out of the store. */
export type AutomationStudioResultRecordSetInput = {
  summary: AutomationStudioRunDatasetSummary;
  /** The stored schema (no `exclude` field), when the set's page could be read. */
  schema?: AutomationStudioRecordSchema;
  /** Every stored row of the set. Screened here, never cut. */
  rows?: readonly JsonObject[];
  /**
   * The rows Core checks for required values. Absent, `rows` is checked
   * instead.
   */
  checkedRows?: readonly JsonObject[];
};

export type AutomationStudioRunResultSummaryInput = {
  recordSets: readonly AutomationStudioResultRecordSetInput[];
  /** The Flow's authored nodes, in order: the shape of what it can do at all. */
  flowNodes?: readonly AutomationStudioFlowNode[];
  /**
   * The run's recorded attempts, for how each list read went
   * (`read-account/`). Absent, the summary carries no reads.
   */
  actionAttempts?: readonly AutomationStudioFlowRunActionAttemptRecord[] | undefined;
  /**
   * The bound domain's declared denied keys, exactly as declared. Absent means
   * no declaration was made, and no row is carried at all.
   */
  deniedEvidenceKeys?: readonly string[] | undefined;
};

/**
 * The screened summary of what a run produced, whole.
 *
 * `withheld` is true whenever anything was screened out or the store itself
 * reported the set truncated, so the model is never shown a partial picture
 * that reads as a whole one.
 */
export function summarizeAutomationStudioRunResult(input: AutomationStudioRunResultSummaryInput): AutomationStudioRunResultSummary {
  const totalRecordCount = input.recordSets.reduce((total, set) => total + safeCount(set.summary.recordCount), 0);
  const totalRefusedCount = input.recordSets.reduce((total, set) => total + safeCount(set.summary.invalidCount), 0);
  let withheld = false;
  const recordSets: AutomationStudioResultRecordSetSummary[] = [];
  for (const set of input.recordSets) {
    const summarized = summarizedRecordSet(set, input.deniedEvidenceKeys);
    if (summarized.withheld) withheld = true;
    recordSets.push(summarized.summary);
  }
  const flowNodes = input.flowNodes ?? [];
  const flowShape = flowNodes.map((node) => step(node, input.deniedEvidenceKeys));
  // How each list read went (`read-account/`): pages, why paging stopped, and
  // what each condition rejected, so a judge is not shown a step's name alone.
  const accounted = automationStudioResultReadAccounts({ actionAttempts: input.actionAttempts, flowNodes, deniedEvidenceKeys: input.deniedEvidenceKeys });
  if (accounted.withheld) withheld = true;
  return {
    schemaVersion: "automation-studio.run-result-summary.v1",
    totalRecordCount,
    totalRefusedCount,
    totalRowsMissingRequired: recordSets.reduce((total, set) => total + set.rowsMissingRequired, 0),
    recordSetCount: input.recordSets.length,
    recordSets,
    ...(accounted.reads.length ? { reads: accounted.reads } : {}),
    flowShape,
    withheld
  };
}

/**
 * One step, with the name the Flow gave it and, under a declaration, the
 * parameters it was authored with, screened by the repair context's screen.
 */
function step(node: AutomationStudioFlowNode, deniedEvidenceKeys: readonly string[] | undefined): AutomationStudioResultFlowStepSummary {
  const named: AutomationStudioResultFlowStepSummary = {
    nodeId: node.id,
    definitionId: node.definitionId,
    ...(node.label ? { label: node.label } : {})
  };
  if (deniedEvidenceKeys === undefined || !node.parameterValues || Object.keys(node.parameterValues).length === 0) return named;
  const screened = automationStudioScreenedNodeParameters(node.parameterValues, deniedEvidenceKeys);
  return { ...named, parameters: screened.values, ...(screened.withheld.length ? { parametersWithheld: screened.withheld } : {}) };
}

function summarizedRecordSet(
  set: AutomationStudioResultRecordSetInput,
  deniedEvidenceKeys: readonly string[] | undefined
): { summary: AutomationStudioResultRecordSetSummary; withheld: boolean } {
  const columns = (set.schema?.fields ?? []).map((field) => field.id);
  const rows = set.rows ?? [];
  const screened = deniedEvidenceKeys === undefined ? undefined : screenedRows(rows, columns, deniedEvidenceKeys);
  const summary: AutomationStudioResultRecordSetSummary = {
    datasetId: set.summary.datasetId,
    ...(set.summary.label ? { label: set.summary.label } : {}),
    recordCount: safeCount(set.summary.recordCount),
    refusedCount: safeCount(set.summary.invalidCount),
    truncated: set.summary.truncated === true,
    columns,
    columnsWithheld: false,
    ...requiredValueCheck(set),
    ...(screened && screened.rows.length ? { sampleRows: screened.rows } : {})
  };
  const unsent = deniedEvidenceKeys === undefined && rows.length > 0;
  return { summary, withheld: summary.truncated || unsent || (screened?.withheld ?? false) };
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
  if (!set.schema) return { rowsChecked: 0, rowsMissingRequired: 0, missingRequiredColumns: [] };
  const required = set.schema.fields
    .filter((field) => field.required === true && (field.handling === undefined || field.handling === "include"))
    .map((field) => field.id);
  const checked = set.checkedRows ?? set.rows ?? [];
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
    missingRequiredColumns: required.filter((id) => lacking.has(id))
  };
}

/**
 * Whether a stored row carries a value for a field: present, not null, and --
 * for a string -- not empty once its surrounding whitespace is set aside.
 */
function carriesValue(row: JsonObject, id: string): boolean {
  if (!Object.hasOwn(row, id)) return false;
  const value = row[id];
  if (value === null || value === undefined) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

/**
 * Every row, cut to the columns the schema names and to nothing else. A
 * column whose id the domain denies is left out of every row, because the key
 * itself is what the declaration refuses; a value that carries a credential
 * shape anywhere inside it, or a denied key inside a nested value, becomes the
 * marker. Every other value is carried whole, nested values included.
 */
function screenedRows(rows: readonly JsonObject[], columns: readonly string[], deniedEvidenceKeys: readonly string[]): { rows: JsonObject[]; withheld: boolean } {
  const deniedColumns = new Set(columns.filter((column) => screenAutomationStudioLlmEvidence({ [column]: null }, deniedEvidenceKeys).deniedKey));
  let withheld = false;
  const screened = rows.map((row) => {
    const carried: JsonObject = {};
    for (const column of columns) {
      if (!Object.hasOwn(row, column)) continue;
      if (deniedColumns.has(column)) {
        withheld = true;
        continue;
      }
      const value = row[column]!;
      const found = screenAutomationStudioLlmEvidence(value, deniedEvidenceKeys);
      if (found.deniedKey || found.secretShaped || (typeof value === "number" && !Number.isFinite(value))) {
        carried[column] = WITHHELD_VALUE;
        withheld = true;
        continue;
      }
      carried[column] = value;
    }
    return carried;
  });
  return { rows: screened, withheld };
}

function safeCount(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : 0;
}
