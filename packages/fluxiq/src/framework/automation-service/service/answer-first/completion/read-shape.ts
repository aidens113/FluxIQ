// The shape of what an attempt read (task speed S9): its columns and whether any row came back, and
// nothing of the rows. The one reading both sides use: the attempt that keeps a Flow writes it beside
// the Flow (`../attempt/remember.ts`), and a later replay's completion compares its own with it
// (`./check.ts`, `./replay-stands.ts`), so the two can only differ when the reads did.

import type { AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";
import type { AutomationStudioAnswerFirstReadShape } from "../task-memory/index.ts";

export function automationStudioAnswerFirstReadShapeOf(rows: Pick<AutomationStudioAnswerFirstRowsSummary, "columns" | "totalRows">): AutomationStudioAnswerFirstReadShape {
  return { columns: rows.columns.map((column) => column.id), empty: rows.totalRows === 0 };
}
