// The rows of an answer: columns, the previewed rows as text, and how it says it holds
// fewer than were found. Nothing is guessed: a count comes from `totalRows`, and what
// is held from `previewRows`.

import type { ChatTaskResultRows } from "../../ports/index.ts";
import { cellWords } from "./cell-words.ts";
import { rowsWord } from "./result-headline.ts";
import { fewerWords } from "../words/index.ts";
import type { AnswerRows } from "./answer-types.ts";

/** How many rows show before "Show all". */
export const ANSWER_COLLAPSED_ROWS = 5;

/** `rows` as the table and its notes. */
export function rowsModel(rows: ChatTaskResultRows): AnswerRows {
  const held = rows.previewRows.length;
  const incomplete = rows.truncated || held < rows.totalRows;
  const collapsed = Math.min(held, ANSWER_COLLAPSED_ROWS);
  const model: AnswerRows = {
    columns: rows.columns.map((column) => column.label),
    rows: rows.previewRows.map((row) => rows.columns.map((column) => cellWords(row[column.id]))),
    collapsedCount: collapsed,
    total: rows.totalRows,
    runId: rows.runId,
    datasetId: rows.datasetId
  };
  if (held > collapsed) model.expandWords = incomplete ? `Show ${held} rows` : `Show all ${held}`;
  if (incomplete) {
    const found = rows.truncated && rows.totalRows <= held ? "more than this" : rowsWord(rows.totalRows);
    const note = (shown: number): string => `Showing ${shown} of ${found} here. CSV and JSON have every row.`;
    model.partialNotes = { collapsed: note(collapsed), expanded: note(held) };
  }
  const smaller = fewerWords(rows.fewerThanEarlier, rows.totalRows);
  if (smaller !== undefined) model.smallerNote = smaller;
  return model;
}
