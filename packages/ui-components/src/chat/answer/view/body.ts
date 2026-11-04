// The middle of an answer: the rows, the model's words (told as its own), what happened on
// the site, and the lines that say what was checked, what is missing, how it compares and
// where it came from.

import { createElement } from "../../../dom/index.ts";
import { answerButton } from "./button.ts";
import type { AnswerHandlers, AnswerState } from "./state.ts";
import type { AnswerModel } from "../model/index.ts";
import { rowsTable } from "./rows-table.ts";

/** The rows, with "Show all" and the note about how many are held. `canExport` draws the CSV and JSON buttons. */
function rowsBlock(model: AnswerModel, state: AnswerState, handlers: AnswerHandlers, canExport: boolean): HTMLElement[] {
  const { rows } = model;
  if (rows === undefined) return [];
  const buttons: HTMLElement[] = [];
  if (rows.expandWords !== undefined) buttons.push(answerButton(state.expanded ? "Show fewer" : rows.expandWords, "toggle-rows", handlers.toggleRows, { expanded: state.expanded }));
  if (canExport) {
    buttons.push(answerButton("CSV", "export-csv", () => handlers.exportRows("csv"), { name: "Download the rows as CSV", disabled: state.busy === "csv" }));
    buttons.push(answerButton("JSON", "export-json", () => handlers.exportRows("json"), { name: "Download the rows as JSON", disabled: state.busy === "json" }));
  }
  const blocks: HTMLElement[] = [rowsTable(rows, state.expanded)];
  if (rows.partialNotes !== undefined) blocks.push(createElement("p", { className: "answer-note", text: state.expanded ? rows.partialNotes.expanded : rows.partialNotes.collapsed }));
  if (buttons.length > 0) blocks.push(createElement("div", { className: "answer-buttons" }, buttons));
  return blocks;
}

/** What it did on the site: one line, or a list of acts. */
function siteBlock(model: AnswerModel): HTMLElement[] {
  if (model.siteTitle === undefined) return [];
  const list = model.siteLines.length === 0 ? [] : [createElement("ul", { className: "answer-site-list" }, model.siteLines.map((line) => createElement("li", { text: line })))];
  return [createElement("div", { className: "answer-site" }, [createElement("p", { className: "answer-line", text: model.siteTitle }), ...list])];
}

function textBlock(model: AnswerModel): HTMLElement[] {
  if (model.text === undefined) return [];
  return [createElement("div", { className: "answer-text" }, [createElement("p", { className: "answer-text-label", text: model.text.label }), createElement("p", { className: "answer-text-body", text: model.text.text })])];
}

function facts(model: AnswerModel): HTMLElement[] {
  const lines: Array<[string, string | undefined]> = [["missing", model.missing], ["checked", model.checked], ["compared", model.compared], ["from", model.from]];
  return lines.filter((line): line is [string, string] => line[1] !== undefined).map(([name, text]) => createElement("p", { className: "answer-line", text, attrs: { "data-line": name } }));
}

/** Everything between the head and the foot. */
export function answerBody(model: AnswerModel, state: AnswerState, handlers: AnswerHandlers, canExport: boolean): HTMLElement[] {
  return [...rowsBlock(model, state, handlers, canExport), ...textBlock(model), ...siteBlock(model), ...facts(model)];
}
