// What the result holds right now, as a refused model is shown it: the rows' count and order, read
// as the check reads them, and how many acts are on the record. A model can only fix a mismatch it
// can see, and until now it saw the columns at most (run-mw37vz9n-a77a02c2's judged no named an
// order the model had already read differently, and nothing showed it what the check was holding).
//
// Screened as the judge's copy is (`../../../../../runtime/result-verification/flow-less/judged-summary.ts`):
// a column that may not be sent is left out and a value that may not is marked. Every value is one
// the model's own read returned. A digest, not the record, so it is bounded and says when it is cut.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { screenAutomationStudioLlmEvidence } from "../../../../../runtime/llm/harness/index.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";

/** Enough to read an order, and a long list's whole count beside them. */
const MOST_ROWS = 30;
const MOST_CHARS = 200;
const WITHHELD = "[withheld]";

export function automationStudioAnswerFirstResultHolds(held: { rows: AutomationStudioAnswerFirstRowsSummary; acts: number }, deniedEvidenceKeys: readonly string[]): JsonObject {
  const { rows, acts } = held;
  if (rows.totalRows === 0 || rows.rows.length === 0) return { totalRows: 0, acts };
  const declared = rows.columns.length ? rows.columns.map((column) => column.id) : [...new Set(rows.rows.flatMap((row) => Object.keys(row)))];
  const columns = declared.filter((id) => {
    const found = screenAutomationStudioLlmEvidence({ [id]: "" }, deniedEvidenceKeys);
    return !found.deniedKey && !found.secretShaped;
  });
  const shown = rows.rows.slice(0, MOST_ROWS).map((row) => Object.fromEntries(columns.filter((id) => Object.hasOwn(row, id)).map((id) => [id, cell(row[id]!, deniedEvidenceKeys)])));
  return {
    totalRows: rows.totalRows,
    columns,
    rowsInOrder: shown,
    ...(rows.totalRows > shown.length ? { moreRowsNotShownHere: rows.totalRows - shown.length } : {}),
    ...(rows.truncated ? { truncated: true } : {}),
    acts
  };
}

function cell(value: JsonValue, denied: readonly string[]): JsonValue {
  const found = screenAutomationStudioLlmEvidence(value, denied);
  if (found.deniedKey || found.secretShaped) return WITHHELD;
  return typeof value === "string" && value.length > MOST_CHARS ? `${value.slice(0, MOST_CHARS)}...` : value;
}
