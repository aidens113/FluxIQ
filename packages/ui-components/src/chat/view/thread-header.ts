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
//
// With a chat bar (a drawer whose host leaves `chatBar` on) the header is the
// bar: the chat's name in words (it also opens the list), the "Chats" button
// with how many wait, and "+ New chat" where the client can make one. The bar
// draws the name itself, so the button inside it says only "Chats".

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
  /** The chat bar's "+ New chat" is offered (the client's port can make a chat). */
  canCreate?: boolean;
  /** A press of the list is on its way, so New chat waits. */
  busy?: boolean;
};

/** What the chat bar does beyond the list's button. */
export type ThreadBar = { create(): void };

/** The mounted header. */
export type ThreadHeader = {
  readonly element: HTMLElement;
  /** The drawer's button, where focus goes back when the drawer closes; absent in a column. */
  readonly toggle: HTMLButtonElement | undefined;
  update(model: ThreadHeaderModel): void;
};

/** Creates the header; in a drawer, `toggle` hears the "Chats" button and `controls` is the list's id. */
export function createThreadHeader(layout: ChatThreadsLayout, toggle: () => void, controls: string, bar?: ThreadBar): ThreadHeader {
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
  if (bar !== undefined) return createBar(layout, button, title, badge, toggle, controls, bar);
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

function createBar(layout: ChatThreadsLayout, button: HTMLButtonElement, title: HTMLElement, badge: HTMLElement, toggle: () => void, controls: string, bar: ThreadBar): ThreadHeader {
  const name = createElement("span", { className: "chat-bar-title-text" });
  // The name opens the list too, for a pointer; the keyboard has the "Chats" button beside it.
  const nameButton = createElement("button", {
    className: "chat-bar-title",
    attrs: { type: "button", tabindex: "-1", "aria-expanded": "false", "aria-controls": controls, title: "Choose a chat" }
  }, [name]);
  nameButton.addEventListener("click", toggle);
  const create = createElement("button", { className: "chat-bar-new", hidden: true, attrs: { type: "button" } }, [lucideIcon("plus", 14), "New chat"]);
  create.addEventListener("click", () => bar.create());
  title.hidden = true;
  const element = createElement("header", { className: "chat-thread-header chat-bar", attrs: { "data-layout": layout } }, [nameButton, button, create]);
  return {
    element,
    toggle: button,
    update(model) {
      if (name.textContent !== model.title) name.textContent = model.title;
      const waiting = model.waiting > 0 ? `${model.waiting} waiting` : "";
      if (badge.textContent !== waiting) badge.textContent = waiting;
      if (badge.hidden === (waiting !== "")) badge.hidden = waiting === "";
      button.setAttribute("aria-expanded", String(model.open));
      nameButton.setAttribute("aria-expanded", String(model.open));
      const offered = model.canCreate === true;
      if (create.hidden === offered) create.hidden = !offered;
      create.disabled = model.busy === true;
    }
  };
}
