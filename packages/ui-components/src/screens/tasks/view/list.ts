// The list of tasks: grouped rows, an empty line that says why, and a quiet notice with Try
// again when a read failed. A failed read adds the notice and takes nothing off the screen.

import { createElement } from "../../../dom/index.ts";
import { groupTasks, taskRow } from "../model/index.ts";
import { taskButton } from "./button.ts";
import { rowView } from "./row.ts";
import type { ListState } from "./state.ts";

export type ListHost = {
  open(taskId: string): void;
  retry(): void;
  more(): void;
  nowMs: number;
  reportsSpend: boolean;
};

function emptyWords(state: ListState): string {
  const text = state.text.trim();
  if (text !== "") return `No tasks match “${text}”.`;
  return "No tasks yet. Ask for something in the chat and it will show up here.";
}

/** The children of the list area for `state`. */
export function listView(state: ListState, host: ListHost): HTMLElement[] {
  const children: HTMLElement[] = [];
  if (state.note !== undefined) children.push(createElement("p", { className: "tasks-line tasks-note", text: state.note, attrs: { role: "status", tabindex: "-1", "data-key": "list-note" } }));
  if (state.error !== undefined) {
    children.push(createElement("div", { className: "tasks-notice", attrs: { role: "status" } }, [
      createElement("p", { className: "tasks-notice-text", text: state.error }),
      taskButton("Try again", "list-retry", host.retry)
    ]));
  }
  if (state.tasks.length === 0) {
    if (state.status === "loading") children.push(createElement("p", { className: "tasks-line", text: "Loading your tasks..." }));
    else if (state.status === "ready" && state.error === undefined) children.push(createElement("p", { className: "tasks-line tasks-empty", text: emptyWords(state), attrs: { tabindex: "-1" } }));
    return children;
  }
  const rows = state.tasks.map((task) => taskRow(task, { nowMs: host.nowMs, reportsSpend: host.reportsSpend }));
  for (const group of groupTasks(rows, host.nowMs)) {
    const heading = createElement("h3", { className: "tasks-group-heading", text: group.heading });
    const list = createElement("ul", { className: "tasks-list", attrs: { "aria-label": group.heading } }, group.rows.map((row) => rowView(row, host.open)));
    children.push(createElement("section", { className: "tasks-group" }, [heading, list]));
  }
  if (state.nextCursor !== null) children.push(taskButton(state.loadingMore ? "Loading..." : "Show more tasks", "list-more", host.more, { disabled: state.loadingMore }));
  return children;
}
