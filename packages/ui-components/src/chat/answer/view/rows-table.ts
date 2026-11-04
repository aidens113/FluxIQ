// The rows of an answer as a table a keyboard can scroll: columns as headers, the first
// few rows until "Show all", and a note when it holds fewer rows than were found.

import { createElement } from "../../../dom/index.ts";
import type { AnswerRows } from "../model/index.ts";

/** The table for `rows`; `expanded` shows every previewed row, otherwise the first few. */
export function rowsTable(rows: AnswerRows, expanded: boolean): HTMLElement {
  const header = createElement("tr", {}, rows.columns.map((label) => createElement("th", { text: label, attrs: { scope: "col" } })));
  const shown = expanded ? rows.rows : rows.rows.slice(0, rows.collapsedCount);
  const body = shown.map((cells) => createElement("tr", { className: "answer-row" }, cells.map((cell) => createElement("td", { text: cell }))));
  const table = createElement("table", { className: "answer-table", attrs: { "aria-label": "Rows found" } }, [createElement("thead", {}, [header]), createElement("tbody", {}, body)]);
  return createElement("div", { className: "answer-table-scroll", attrs: { role: "region", "aria-label": "Rows found, scrolls sideways", tabindex: "0" } }, [table]);
}
