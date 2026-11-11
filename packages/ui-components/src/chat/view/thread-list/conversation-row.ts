// One row of the conversation list (`conversation-list.ts`): the chat's name,
// when it last moved and, when a question in it waits, "Waiting on you". The
// name and time are one button that opens the chat; the chat on screen is
// marked (`aria-current`). Beside them, Rename and Delete, each only when the
// client's port carries it:
//
//   - Rename edits the name in place: Enter saves, Escape or leaving the box
//     cancels and nothing is sent.
//   - Delete asks in place, "Delete this chat?" with Delete and Cancel, never
//     through a browser dialog. Escape is Cancel.
//
// Built once per thread and updated in place, so focus and an edit in progress
// survive every read of the list. Escape inside an edit or a question stops
// there, so it never also closes the drawer.

import { createElement } from "../../../dom/index.ts";
import type { ThreadRow } from "../../conversation/thread-list/index.ts";

/** What the row may offer, and whether a press is on its way. */
export type ConversationRowControls = { rename: boolean; remove: boolean; busy: boolean };

/** What the row tells the list. */
export type ConversationRowHooks = {
  open(conversationId: string): void;
  rename(conversationId: string, title: string): void;
  remove(conversationId: string): void;
  /** A key pressed on the row's open button, for moving through the list. */
  key(conversationId: string, event: RowKeyEvent): void;
};

/** The few fields of a key event the row reads. */
export type RowKeyEvent = { key: string; preventDefault(): void; stopPropagation?(): void };

/** The mounted row. */
export type ConversationRow = {
  readonly element: HTMLLIElement;
  /** The button that opens the chat, where the list's arrow keys move focus. */
  readonly openButton: HTMLButtonElement;
  update(row: ThreadRow, controls: ConversationRowControls): void;
};

type Mode = "view" | "edit" | "confirm";

/** Creates the row for the thread `conversationId`. */
export function createConversationRow(conversationId: string, hooks: ConversationRowHooks): ConversationRow {
  const name = createElement("span", { className: "chat-thread-name" });
  const when = createElement("span", { className: "chat-thread-when" });
  const waiting = createElement("span", { className: "chat-thread-waiting", text: "Waiting on you", hidden: true });
  const openButton = createElement("button", { className: "chat-thread-open", attrs: { type: "button" } }, [
    name,
    createElement("span", { className: "chat-thread-meta" }, [when, waiting])
  ]);
  const input = createElement("input", { className: "chat-thread-rename-input", hidden: true, attrs: { type: "text" } });
  const renameButton = createElement("button", { className: "chat-thread-rename", text: "Rename", attrs: { type: "button" } });
  const deleteButton = createElement("button", { className: "chat-thread-delete", text: "Delete", attrs: { type: "button" } });
  const actions = createElement("span", { className: "chat-thread-actions" }, [renameButton, deleteButton]);
  const confirmDelete = createElement("button", { className: "chat-thread-confirm-delete", text: "Delete", attrs: { type: "button" } });
  const confirmCancel = createElement("button", { className: "chat-thread-confirm-cancel", text: "Cancel", attrs: { type: "button" } });
  const confirm = createElement("div", { className: "chat-thread-confirm", hidden: true, attrs: { role: "group" } }, [
    createElement("span", { className: "chat-thread-confirm-text", text: "Delete this chat?" }),
    confirmDelete,
    confirmCancel
  ]);
  const element = createElement("li", { className: "chat-thread-row", attrs: { "data-conversation-id": conversationId } }, [openButton, input, actions, confirm]);
  let mode: Mode = "view";
  let shown: ThreadRow | undefined;
  let allowed: ConversationRowControls = { rename: false, remove: false, busy: false };

  function setMode(next: Mode): void {
    mode = next;
    openButton.hidden = next === "edit";
    input.hidden = next !== "edit";
    actions.hidden = next !== "view" || !(allowed.rename || allowed.remove);
    confirm.hidden = next !== "confirm";
    element.setAttribute("data-mode", next);
  }

  function leave(next: Mode, focus: HTMLElement): void {
    if (mode === next) return;
    setMode(next);
    focus.focus();
  }

  openButton.addEventListener("click", () => hooks.open(conversationId));
  openButton.addEventListener("keydown", (event: RowKeyEvent) => hooks.key(conversationId, event));
  renameButton.addEventListener("click", () => {
    if (allowed.busy || !allowed.rename) return;
    input.value = shown?.label ?? "";
    leave("edit", input);
    input.select?.();
  });
  input.addEventListener("keydown", (event: RowKeyEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const title = input.value.trim();
      leave("view", openButton);
      if (title !== "" && title !== shown?.label) hooks.rename(conversationId, title);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation?.();
      leave("view", renameButton);
    }
  });
  input.addEventListener("blur", () => {
    if (mode === "edit") setMode("view");
  });
  deleteButton.addEventListener("click", () => {
    if (allowed.busy || !allowed.remove) return;
    leave("confirm", confirmCancel);
  });
  confirmCancel.addEventListener("click", () => leave("view", deleteButton));
  confirmDelete.addEventListener("click", () => {
    if (allowed.busy) return;
    leave("view", openButton);
    hooks.remove(conversationId);
  });
  confirm.addEventListener("keydown", (event: RowKeyEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation?.();
    leave("view", deleteButton);
  });
  setMode("view");

  return {
    element,
    openButton,
    update(row, controls) {
      shown = row;
      allowed = controls;
      if (name.textContent !== row.label) name.textContent = row.label;
      if (when.textContent !== row.when) when.textContent = row.when;
      if (waiting.hidden === row.waiting) waiting.hidden = !row.waiting;
      if (openButton.title !== row.date) openButton.title = row.date;
      if (row.selected) openButton.setAttribute("aria-current", "true");
      else openButton.removeAttribute("aria-current");
      element.setAttribute("data-selected", String(row.selected));
      element.setAttribute("data-waiting", String(row.waiting));
      renameButton.hidden = !controls.rename;
      deleteButton.hidden = !controls.remove;
      renameButton.disabled = controls.busy;
      deleteButton.disabled = controls.busy;
      confirmDelete.disabled = controls.busy;
      renameButton.setAttribute("aria-label", `Rename ${row.label}`);
      deleteButton.setAttribute("aria-label", `Delete ${row.label}`);
      input.setAttribute("aria-label", `New name for ${row.label}`);
      confirm.setAttribute("aria-label", `Delete ${row.label}?`);
      // A control the port no longer carries ends what it started.
      if ((mode === "edit" && !controls.rename) || (mode === "confirm" && !controls.remove)) setMode("view");
      else setMode(mode);
    }
  };
}
