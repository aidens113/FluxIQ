// The task's name as a heading, or, while it is being renamed, a box to type the new one:
// Enter or Save keeps it, Escape or Cancel leaves it as it was.

import { createElement } from "../../../dom/index.ts";
import { taskButton } from "./button.ts";
import type { RenameState } from "./state.ts";

export type TitleHost = { setDraft(text: string): void; save(): void; cancel(): void };

/** The heading, or the rename box for `renaming`. */
export function titleView(title: string, renaming: RenameState | undefined, host: TitleHost): HTMLElement {
  if (renaming === undefined) return createElement("h2", { className: "task-title", text: title, attrs: { tabindex: "-1", "data-key": "title" } });
  const input = createElement("input", { id: "task-rename-input", className: "tasks-input", attrs: { type: "text", "data-key": "rename-input", maxlength: "200", autocomplete: "off" } });
  input.value = renaming.draft;
  if (renaming.busy) input.disabled = true;
  input.addEventListener("input", () => host.setDraft(input.value));
  input.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === "Enter") {
      event.preventDefault?.();
      host.save();
    } else if (key === "Escape") {
      event.stopPropagation?.();
      host.cancel();
    }
  });
  const form = createElement("div", { className: "task-rename", attrs: { role: "group", "aria-label": "Rename this task" } }, [
    createElement("label", { className: "task-rename-label", text: "Task name", attrs: { for: "task-rename-input" } }),
    input,
    createElement("div", { className: "tasks-buttons" }, [
      taskButton("Save", "rename-save", host.save, { tone: "primary", disabled: renaming.busy }),
      taskButton("Cancel", "rename-cancel", host.cancel, { disabled: renaming.busy })
    ])
  ]);
  if (renaming.error !== undefined) form.append(createElement("p", { className: "tasks-error", text: renaming.error, attrs: { role: "alert" } }));
  return form;
}
