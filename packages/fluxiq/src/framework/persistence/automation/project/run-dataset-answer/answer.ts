import {
  processAutomationStudioRecordRows,
  type AutomationStudioRecordProcessing,
  type AutomationStudioRecordProcessingAccount,
  type AutomationStudioRecordSchema
} from "@fluxiq/contracts/automation";
import type { AutomationStudioRunDatasetCollectedRow, AutomationStudioRunDatasetRowInsert } from "./types.ts";

// Carries each collected row's source through processing: the pure function returns fresh
// objects made by shallow copy, which keeps an own symbol key, and JSON never writes one.
const SOURCE_ROW = Symbol("run dataset source row");

/**
 * The answer rows, each with its source row's attempt and batch, and the
 * account. The same evaluator selection supplies complete original allowed
 * fields and the private source symbol before presentation projects columns.
 */
export function automationStudioRunDatasetAnswer(collected: readonly AutomationStudioRunDatasetCollectedRow[], schema: AutomationStudioRecordSchema, process: AutomationStudioRecordProcessing | undefined, now: number): { rows: AutomationStudioRunDatasetRowInsert[]; account: AutomationStudioRecordProcessingAccount } {
  const result = processAutomationStudioRecordRows({
    rows: collected.map((row) => ({ values: Object.assign(JSON.parse(row.row_json) as Record<string, unknown>, { [SOURCE_ROW]: row }), nodeId: row.node_id, batchKey: row.batch_key })),
    schema,
    ...(process === undefined ? {} : { process }),
    now
  });
  const rows = result.retainedRows.map((row, index): AutomationStudioRunDatasetRowInsert => {
    const source = (row as { [SOURCE_ROW]?: AutomationStudioRunDatasetCollectedRow })[SOURCE_ROW];
    if (source === undefined) throw new Error("Run dataset processing lost an answer row's source row.");
    return { ordinal: index + 1, attemptId: source.attempt_id, batchKey: source.batch_key, rowJson: JSON.stringify(row) };
  });
  return { rows, account: result.account };
}
