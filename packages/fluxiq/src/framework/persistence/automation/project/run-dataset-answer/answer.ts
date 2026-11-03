import {
  processAutomationStudioRecordRows,
  type AutomationStudioRecordProcessing,
  type AutomationStudioRecordProcessingAccount,
  type AutomationStudioRecordSchema
} from "@fluxiq/contracts/automation";
import { automationStudioRecordSchemaOfColumns } from "./schema-of-columns.ts";
import type { AutomationStudioRunDatasetCollectedRow, AutomationStudioRunDatasetRowInsert } from "./types.ts";

// Carries each collected row's source through processing: the pure function returns fresh
// objects made by shallow copy, which keeps an own symbol key, and JSON never writes one.
const SOURCE_ROW = Symbol("run dataset source row");

/**
 * The answer rows, each with its source row's attempt and batch, and the
 * account. With `columns` declared the pure function would build each row from
 * those keys alone and lose its source, so it is asked for whole rows under the
 * same default key (the stored fields narrowed to the columns, which is its key
 * when `columns` is set) and the rows are narrowed here, as it would narrow them.
 */
export function automationStudioRunDatasetAnswer(collected: readonly AutomationStudioRunDatasetCollectedRow[], schema: AutomationStudioRecordSchema, process: AutomationStudioRecordProcessing | undefined, now: number): { rows: AutomationStudioRunDatasetRowInsert[]; account: AutomationStudioRecordProcessingAccount } {
  const columns = process?.columns;
  const whole: AutomationStudioRecordProcessing | undefined = process === undefined ? undefined : { ...process };
  if (whole) delete whole.columns;
  const result = processAutomationStudioRecordRows({
    rows: collected.map((row) => ({ values: Object.assign(JSON.parse(row.row_json) as Record<string, unknown>, { [SOURCE_ROW]: row }), nodeId: row.node_id, batchKey: row.batch_key })),
    schema: columns === undefined ? schema : automationStudioRecordSchemaOfColumns(schema, columns),
    ...(whole === undefined ? {} : { process: whole }),
    now
  });
  const rows = result.rows.map((row, index): AutomationStudioRunDatasetRowInsert => {
    const source = (row as { [SOURCE_ROW]?: AutomationStudioRunDatasetCollectedRow })[SOURCE_ROW];
    if (source === undefined) throw new Error("Run dataset processing lost an answer row's source row.");
    return { ordinal: index + 1, attemptId: source.attempt_id, batchKey: source.batch_key, rowJson: JSON.stringify(columns === undefined ? row : rowOfColumns(row, columns)) };
  });
  return { rows, account: result.account };
}

function rowOfColumns(values: Readonly<Record<string, unknown>>, columns: readonly string[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const column of columns) {
    if (Object.prototype.hasOwnProperty.call(values, column)) row[column] = values[column];
  }
  return row;
}
