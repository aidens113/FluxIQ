// The line above the stream when the chat holds the conversation list.
//
//   drawer   a "Chats" button naming the chat on screen, with how many chats
//            wait on the person; it opens and closes the list in the
//            thread's place (`aria-expanded`, `aria-controls`)
//   column   the list stands beside the thread, so the line is only the
//            chat's name
//
// A host with a title bar of its own hears the name instead (`onTitle`): the
// button then says only "Chats", and a column's line is not drawn. No Refresh
// control: the chat reads on its own. Built once and updated in place.

import { createElement } from "../../dom/index.ts";
import { lucideIcon } from "../../icons/index.ts";
import type { ChatThreadsLayout } from "../ports/index.ts";

/** What the header shows. */
export type ThreadHeaderModel = {
  /** The chat's name, never an id. */
  title: string;
  /** Whether the header says the name itself. */
  showTitle: boolean;
  /** Whether the drawer is open. */
  open: boolean;
  /** How many chats hold a question waiting on the person. */
  waiting: number;
};

/** The mounted header. */
export type ThreadHeader = {
  readonly element: HTMLElement;
  /** The drawer's button, where focus goes back when the drawer closes; absent in a column. */
  readonly toggle: HTMLButtonElement | undefined;
  update(model: ThreadHeaderModel): void;
};

/** Creates the header; in a drawer, `toggle` hears the "Chats" button and `controls` is the list's id. */
export function createThreadHeader(layout: ChatThreadsLayout, toggle: () => void, controls: string): ThreadHeader {
  const title = createElement("span", { className: "chat-thread-title" });
  if (layout === "column") {
    const element = createElement("header", { className: "chat-thread-header", attrs: { "data-layout": layout } }, [title]);
    return {
      element,
      toggle: undefined,
      update(model) {
        if (title.textContent !== model.title) title.textContent = model.title;
        if (element.hidden === model.showTitle) element.hidden = !model.showTitle;
      }
    };
  }
  const badge = createElement("span", { className: "chat-thread-badge", hidden: true });
  const button = createElement("button", {
    className: "chat-thread-toggle",
    attrs: { type: "button", "aria-expanded": "false", "aria-controls": controls }
  }, [
    lucideIcon("messages-square", 16),
    createElement("span", { className: "chat-thread-toggle-label", text: "Chats" }),
    title,
    badge,
    lucideIcon("chevron-down", 14)
  ]);
  button.addEventListener("click", toggle);
  const element = createElement("header", { className: "chat-thread-header", attrs: { "data-layout": layout } }, [button]);
  return {
    element,
    toggle: button,
    update(model) {
      if (title.textContent !== model.title) title.textContent = model.title;
      if (title.hidden === model.showTitle) title.hidden = !model.showTitle;
      const waiting = model.waiting > 0 ? `${model.waiting} waiting` : "";
      if (badge.textContent !== waiting) badge.textContent = waiting;
      if (badge.hidden === (waiting !== "")) badge.hidden = waiting === "";
      button.setAttribute("aria-expanded", String(model.open));
    }
  };
}
