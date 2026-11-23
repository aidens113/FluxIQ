// What `core.set_result_processing` does with one call (t970): the declaration
// held next, and the answer the model is shown.
//
// **It decides nothing a reader could not check.** The declaration is read
// against the schema of the rows the result holds (the contract's own parser,
// `parseAutomationStudioRecordProcessing`) and applied to them with the one
// function the store runs at a run's end (`processAutomationStudioRecordRows`),
// so the rows the answer shows are the rows the person and the judge will be
// given. The answer says what the processing did -- how many rows were read,
// left out, folded as repeats, cut, kept -- and names, per condition, the rows
// it alone left out, each by its label, and every row kept (user rule: no caps).
// A declaration the schema refuses is answered with the contract's issue codes
// and is not held: the result keeps the processing it had.
//
// **Before any row is read** there is no schema to read it against, so it is
// held as written and the answer says so; the contract reads it when the Flow
// is assembled (`../../../flow-authoring/bootstrap/authoring/result-processing/plan.ts`)
// and wherever it is stored.
//
// **The answer is not the page's.** Nothing here touches the target, so the
// call's effect is never applied (`effectApplied: false`), as a look's.

import { parseAutomationStudioRecordProcessing, processAutomationStudioRecordRows, type AutomationStudioRecordProcessing, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY,
  automationStudioFlowDraftWithResultProcessing,
  type AutomationStudioFlowDraftResultProcessing
} from "../../../flow-authoring/draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../evidence-loop/index.ts";

/** The rows a result holds as read, before any processing, with their schema. */
export type AutomationStudioLlmResultRows = { datasetId: string; schema: AutomationStudioRecordSchema; rows: readonly JsonObject[] };

/**
 * The declaration held after the call and its answer. `rowsOf` gives the rows
 * the named list (`undefined`: the result) holds as read, or nothing when no
 * read has stored a row in it yet. `now` anchors relative dates.
 */
export function automationStudioLlmSetResultProcessing(input: {
  value: JsonObject;
  held: AutomationStudioFlowDraftResultProcessing | undefined;
  rowsOf: (dataset: string | undefined) => AutomationStudioLlmResultRows | undefined;
  now?: number | undefined;
}): { held: AutomationStudioFlowDraftResultProcessing | undefined; answer: AutomationStudioLlmEvidenceToolExecutionResult } {
  const dataset = typeof input.value.dataset === "string" && input.value.dataset.trim() ? input.value.dataset.trim() : undefined;
  const key = dataset ?? AUTOMATION_STUDIO_FLOW_DRAFT_RESULT_KEY;
  if (input.value.clear === true) {
    return { held: automationStudioFlowDraftWithResultProcessing(input.held, key, null), answer: answered({ cleared: true, dataset: key, said: "The result is the rows as read, with only exact repeats left out." }) };
  }
  if (!isObject(input.value.process)) {
    return { held: input.held, answer: refused("result_processing.missing", ["result_processing.missing"], "Give process, the whole declaration, or clear: true.") };
  }
  if (Object.hasOwn(input.value.process, "declaration")) return { held: input.held, answer: refused("result_processing.invalid", ["record_output.process_declaration_framework_owned"], "Processing provenance is framework-owned. Give only the requested criteria; the framework binds and stamps actual captured fields.") };
  const read = input.rowsOf(dataset);
  if (read === undefined) {
    return {
      held: automationStudioFlowDraftWithResultProcessing(input.held, key, input.value.process as unknown as AutomationStudioRecordProcessing),
      answer: answered({ held: true, dataset: key, said: "No read has stored a row in this list yet: the processing is held as written, and is applied to its rows once they are read." })
    };
  }
  const parsed = parseAutomationStudioRecordProcessing(input.value.process, read.schema);
  if (!parsed.ok) {
    const columns = read.schema.fields.filter((field) => field.handling !== "exclude").map((field) => field.id);
    return { held: input.held, answer: refused("result_processing.invalid", parsed.issues, `The processing was not set, and the result keeps the processing it had. The columns this list holds are: ${columns.join(", ")}.`) };
  }
  const made = processAutomationStudioRecordRows({
    rows: read.rows.map((values) => ({ values, nodeId: read.datasetId, batchKey: read.datasetId })),
    schema: read.schema,
    process: parsed.processing,
    now: input.now ?? Date.now()
  });
  const account = made.account;
  return {
    held: automationStudioFlowDraftWithResultProcessing(input.held, key, parsed.processing),
    answer: answered({
      dataset: key,
      set: parsed.processing as unknown as JsonValue,
      read: account.collected,
      leftOut: account.filteredOut,
      repeats: account.duplicates,
      cut: account.cut,
      kept: account.kept,
      ...(account.conditions?.length ? { conditions: account.conditions.map((condition) => ({ condition: condition.condition, leftOut: condition.rejected, leftOutOnlyByThis: condition.leftOutOnlyByThis.map((row) => row.label) })) } : {}),
      ...(account.filters?.length ? { filters: account.filters.map((filter) => ({ condition: filter.condition, leftOut: filter.rejected, leftOutOnlyByThis: filter.leftOutOnlyByThis.map((row) => row.label) })) } : {}),
      ...(account.belowMinRows !== undefined ? { fewerThanExpected: account.belowMinRows } : {}),
      rows: made.rows as JsonObject[]
    })
  };
}

function answered(evidence: JsonObject): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: true, ...evidence }, effectApplied: false, resultCode: "result_processing.set" };
}

function refused(code: string, issues: readonly string[], said: string): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code, issues: [...issues], said }, effectApplied: false, resultCode: code };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
