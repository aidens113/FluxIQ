import {
  processAutomationStudioRecordRows,
  type AutomationStudioRecordProcessing,
  type AutomationStudioRecordProcessingAccount,
  type AutomationStudioRecordProcessingMissingEvidence,
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
export function automationStudioRunDatasetAnswer(collected: readonly AutomationStudioRunDatasetCollectedRow[], schema: AutomationStudioRecordSchema, process: AutomationStudioRecordProcessing | undefined, now: number | undefined): { rows: AutomationStudioRunDatasetRowInsert[]; account: AutomationStudioRecordProcessingAccount } | { unavailable: true; reason: string; missingEvidence?: AutomationStudioRecordProcessingMissingEvidence[] } {
  const automatic = process?.declaration?.version === 1;
  if (automatic && (!Number.isSafeInteger(now) || (now as number) < 0)) return { unavailable: true, reason: "processing_reference_missing" };
  const input = {
    rows: collected.map((row) => ({ values: Object.assign(JSON.parse(row.row_json) as Record<string, unknown>, { [SOURCE_ROW]: row }), nodeId: row.node_id, batchKey: row.batch_key })),
    schema,
    ...(process === undefined ? {} : { process }),
    now: now ?? Date.now()
  };
  const result = automatic ? processAutomationStudioRecordRows({ ...input, mode: "automatic" }) : processAutomationStudioRecordRows(input);
  if ("state" in result && result.state === "missing-evidence") return { unavailable: true, reason: "processing_evidence_missing", missingEvidence: result.missingEvidence };
  // A known empty selection is completely materialized, independently of minRows/task success.
  if ("state" in result && result.state === "empty") return { rows: [], account: result.account };
  const rows = result.retainedRows.map((row, index): AutomationStudioRunDatasetRowInsert => {
    const source = (row as { [SOURCE_ROW]?: AutomationStudioRunDatasetCollectedRow })[SOURCE_ROW];
    if (source === undefined) throw new Error("Run dataset processing lost an answer row's source row.");
    return { ordinal: index + 1, attemptId: source.attempt_id, batchKey: source.batch_key, rowJson: JSON.stringify(row) };
  });
  return { rows, account: result.account };
}
