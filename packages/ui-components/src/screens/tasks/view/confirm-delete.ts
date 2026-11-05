// The question before a task is deleted, in the tab itself: what goes, what stays, and a
// button for each answer. Delete is the dangerous one; Keep it is where focus starts.

import { createElement } from "../../../dom/index.ts";
import { deleteWords } from "../model/index.ts";
import { taskButton } from "./button.ts";
import type { DeleteState } from "./state.ts";

export type ConfirmDeleteHost = { confirm(): void; cancel(): void };

/** The confirmation for `title`. */
export function confirmDeleteView(title: string, state: DeleteState, host: ConfirmDeleteHost): HTMLElement {
  const words = deleteWords(title);
  const box = createElement("div", { className: "tasks-confirm", attrs: { role: "group", "aria-label": "Confirm delete" } }, [
    createElement("p", { className: "tasks-confirm-question", text: words.question }),
    createElement("p", { className: "tasks-line", text: words.goes }),
    createElement("p", { className: "tasks-line", text: words.stays }),
    createElement("div", { className: "tasks-buttons" }, [
      taskButton("Keep it", "delete-cancel", host.cancel, { disabled: state.busy }),
      taskButton(state.busy ? "Deleting..." : "Delete task", "delete-confirm", host.confirm, { tone: "danger", disabled: state.busy })
    ])
  ]);
  if (state.error !== undefined) box.append(createElement("p", { className: "tasks-error", text: state.error, attrs: { role: "alert" } }));
  return box;
}
