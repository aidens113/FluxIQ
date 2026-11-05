// A dataset's answer, worked out before the store's processing has run.
//
// A judge reads while the attempt's session is open, and the store processes a dataset only once it
// has ended, so without this a run's declared sort, filter, limit or columns would reach the person
// and not the judge. It is the same function the store runs (`processAutomationStudioRecordRows`, by
// way of `persistence/automation/project/run-dataset-answer/answer.ts`), so both see the same rows in
// the same order. Relative dates are the one difference: the store measures them from the run's start,
// and this from now, a matter of minutes.
import { processAutomationStudioRecordRows, type AutomationStudioRecordProcessing, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";

/** The rows and columns `process` makes of `rows`, in its order. */
export function automationStudioAnswerFirstProcessedRows(rows: readonly JsonObject[], schema: AutomationStudioRecordSchema, process: AutomationStudioRecordProcessing): { rows: JsonObject[]; columns: { id: string; label: string }[] } {
  const answer = processAutomationStudioRecordRows({ rows: rows.map((values) => ({ values, nodeId: "", batchKey: "" })), schema, process, now: Date.now() });
  const shown = process.columns === undefined ? schema.fields : process.columns.flatMap((id) => schema.fields.filter((field) => field.id === id));
  return { rows: answer.rows as JsonObject[], columns: shown.map(({ id, label }) => ({ id, label })) };
}
