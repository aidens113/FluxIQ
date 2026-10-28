// The cells of the rows a read left out, as the judge is shown them beside
// their labels (t771).
//
// **Why.** Rerun round 6 social `run-mvrj7qg8-c20c132e`: a read of a feed kept
// the posts of groups the person belongs to and left out the rest, each named
// by its label alone. The label of a friend's own post was the friend's name,
// so "Maya Lindqvist" looked like any row with a group; the judges invented a
// group for it from its text, called it missing, and Core had no cell to hold
// that claim to. The read sends every declared column of each row it left out
// (`service/summaries/extraction-summary.ts`, `aloneRows` and `togetherRows`);
// the account had cut each to its label and tested value. These are those rows'
// cells, one record per row, aligned with the labels the account says them by.
//
// **Screened as stored rows are** (`../result-summary.ts`, `screenedRows`): a
// column whose id the domain denies, or that is shaped like a credential, is
// left out of every row; a value shaped like a credential or a locator is said
// as withheld; an index column is no column. An empty cell stays, empty: the
// read found nothing there, which is what tells a row without a value from one
// with it. Every row, every column (user rule: no caps).

import type { JsonValue } from "../../../../../core/index.ts";
import { automationStudioLocatorShapedText, screenAutomationStudioLlmEvidence } from "../../llm/index.ts";

/** What a value that may not be said reads as: the stored rows' own marker. */
const WITHHELD_VALUE = "(withheld)";
/** A column named by digits alone: a place, never a column of the row. */
const INDEX_KEY = /^\d+$/u;

/**
 * Each row's cells, screened (header), in the rows' order; `undefined` where
 * the rows are not a list of `count` rows, each an object, so the cells could
 * not be aligned with the labels said for them.
 */
export function automationStudioResultReadLeftOutCells(rows: JsonValue | undefined, count: number, deniedKeys: readonly string[]): Array<Record<string, string>> | undefined {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length !== count) return undefined;
  const cells: Array<Record<string, string>> = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) return undefined;
    const said: Record<string, string> = {};
    for (const [column, value] of Object.entries(row)) {
      if (typeof value !== "string" || INDEX_KEY.test(column)) continue;
      const key = screenAutomationStudioLlmEvidence({ [column]: "" }, deniedKeys);
      if (key.deniedKey || key.secretShaped) continue;
      const text = value.trim();
      said[column] = text && (screenAutomationStudioLlmEvidence(text, []).secretShaped || automationStudioLocatorShapedText(text)) ? WITHHELD_VALUE : text;
    }
    cells.push(said);
  }
  return cells;
}
