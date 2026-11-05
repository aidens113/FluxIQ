// A stored dataset's reference and its first rows, fitted to what a result may carry.
//
// **Rows reach a result only through a stored dataset** (D9): without a `runId` and a
// `datasetId` the contract takes, there is no rows field at all, because a model never
// writes a row. The preview is a view of what is stored, so fitting it never touches
// the rows themselves: `previewRows` may be fewer than `totalRows`, and a row that
// does not fit ends the preview there, since it is "the first rows".
//
// A column id the contract's field pattern refuses is dropped from the preview and
// noted, by count: the id itself came off a page.

import {
  AUTOMATION_STUDIO_RECORD_SCHEMA_LIMITS as SCHEMA_LIMITS,
  AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS as LIMITS,
  type AutomationStudioTaskResultColumn,
  type AutomationStudioTaskResultRows
} from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import { screenAutomationStudioLlmEvidence } from "../../llm/index.ts";
import { automationStudioAnswerFirstResultProbe } from "./probe.ts";

const WITHHELD_VALUE = "[withheld]";
const RESERVED: ReadonlySet<string> = new Set(SCHEMA_LIMITS.reservedFieldIds);

export function automationStudioAnswerFirstPreview(rows: AutomationStudioTaskResultRows): { rows?: AutomationStudioTaskResultRows; notes: string[] } {
  const given = Array.isArray(rows.columns) ? rows.columns : [];
  const columns = fittedColumns(given);
  const notes: string[] = [];
  const dropped = given.length - columns.length;
  if (dropped > 0) notes.push(`The preview leaves out ${dropped} ${dropped === 1 ? "column" : "columns"} it could not name; the stored rows keep them.`);
  const preview = fittedPreview(rows, columns);
  if (preview.withheld) notes.push("Some values in the preview are withheld because they looked like credentials; the stored rows keep them.");
  // Only a count: a note that the list got smaller, kept where it is still true of the rows the result holds.
  const earlier = rows.fewerThanEarlier?.earlierRows;
  const smaller = Number.isSafeInteger(earlier) && earlier! > rows.totalRows ? { fewerThanEarlier: { earlierRows: earlier! } } : {};
  const fitted: AutomationStudioTaskResultRows = { runId: rows.runId, datasetId: rows.datasetId, totalRows: rows.totalRows, truncated: rows.truncated, columns, previewRows: preview.rows, ...smaller };
  if (!automationStudioAnswerFirstResultProbe({ rows: fitted }).ok) return { notes: ["The rows read could not be attached, because no stored dataset could be named for them."] };
  return { rows: fitted, notes };
}

function fittedColumns(given: readonly AutomationStudioTaskResultColumn[]): AutomationStudioTaskResultColumn[] {
  const seen = new Set<string>();
  const columns: AutomationStudioTaskResultColumn[] = [];
  for (const column of given) {
    const { id, label } = column ?? {};
    if (typeof id !== "string" || !SCHEMA_LIMITS.fieldIdPattern.test(id) || RESERVED.has(id) || seen.has(id) || columns.length >= SCHEMA_LIMITS.maxFields) continue;
    seen.add(id);
    const named = typeof label === "string" && label.trim().length > 0;
    columns.push({ id, label: named ? label.slice(0, SCHEMA_LIMITS.labelMaxLength) : id });
  }
  return columns;
}

/** The first rows that fit, each by the kept columns only. A row the contract would refuse, or one past the byte bound, ends it. */
function fittedPreview(rows: AutomationStudioTaskResultRows, columns: readonly AutomationStudioTaskResultColumn[]): { rows: JsonObject[]; withheld: boolean } {
  const fitted: JsonObject[] = [];
  // A row with no column to show it by is no preview of it.
  if (columns.length === 0) return { rows: fitted, withheld: false };
  const most =Math.min(LIMITS.previewMaxRows, Number.isSafeInteger(rows.totalRows) && rows.totalRows >= 0 ? rows.totalRows : 0);
  const encoder = new TextEncoder();
  const ids = columns.map((column) => ({ id: column.id, label: column.id }));
  let withheld = false;
  for (const row of Array.isArray(rows.previewRows) ? rows.previewRows.slice(0, most) : []) {
    if (typeof row !== "object" || row === null) break;
    const carried: JsonObject = {};
    for (const { id } of columns) {
      if (!Object.hasOwn(row, id)) continue;
      const value: JsonValue = row[id]!;
      if (screenAutomationStudioLlmEvidence(value, []).secretShaped) {
        carried[id] = WITHHELD_VALUE;
        withheld = true;
      } else carried[id] = value;
    }
    if (encoder.encode(JSON.stringify([...fitted, carried])).length > LIMITS.previewMaxBytes) break;
    if (!automationStudioAnswerFirstResultProbe({ rows: { runId: "probe", datasetId: "probe", totalRows: 1, truncated: false, columns: ids, previewRows: [carried] } }).ok) break;
    fitted.push(carried);
  }
  return { rows: fitted, withheld };
}
