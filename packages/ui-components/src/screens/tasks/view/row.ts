// One task in the list: its words, its state (a tick only for a confirmed result), when it
// last ran and the saved line. The whole row is one button that opens the task.

import { createElement } from "../../../dom/index.ts";
import type { TaskRow } from "../model/index.ts";

/** The row's button; `open` is called with the task's id. */
export function rowView(row: TaskRow, open: (taskId: string) => void): HTMLElement {
  const state = createElement("span", { className: "task-row-state", attrs: { "data-tone": row.state.tone } });
  if (row.state.mark === "tick") state.append(createElement("span", { className: "task-row-mark", text: "✓", attrs: { "aria-hidden": "true" } }));
  state.append(createElement("span", { text: row.state.words }));
  const text = createElement("span", { className: "task-row-text" }, [createElement("span", { className: "task-row-title", text: row.title }), state]);
  if (row.line !== "") text.append(createElement("span", { className: "task-row-line", text: row.line }));
  if (row.saved !== undefined) text.append(createElement("span", { className: "task-row-saved", text: row.saved }));
  const button = createElement("button", { className: "task-row", attrs: { type: "button", "data-key": `row:${row.taskId}`, "data-state": row.state.key } }, [
    text,
    createElement("span", { className: "task-row-go", text: "›", attrs: { "aria-hidden": "true" } })
  ]);
  button.addEventListener("click", () => open(row.taskId));
  return createElement("li", { className: "task-item" }, [button]);
}
