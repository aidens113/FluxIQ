// The conversation list: every chat the person can see, to find one and open
// it. From the top:
//
//   New chat     when the client's port carries it
//   search       keeps the chats whose name or time has every word typed
//                ("invoice", "yesterday", "nov 3")
//   notice       Core's sentence for a press it refused, read out when it shows
//   rows         one per chat (`conversation-row.ts`), the one waiting on the
//                person first; ArrowUp and ArrowDown move between them, Home
//                and End jump, and ArrowDown from the search box enters them
//   "Show older chats"   while Core may hold more than the list has read
//
// Escape in the list asks the host to close it (the drawer); in the search box
// it first clears the search. Built once and updated in place: rows are kept
// per chat and only moved, so focus survives every read.

import { createElement } from "../../../dom/index.ts";
import { lucideIcon } from "../../../icons/index.ts";
import { filterThreadRows, type ThreadRow } from "../../conversation/thread-list/index.ts";
import type { ChatThreadsLayout } from "../../ports/index.ts";
import { placeChildren } from "../place-children.ts";
import { createConversationRow, type ConversationRow, type RowKeyEvent } from "./conversation-row.ts";

/** What the list shows. */
export type ConversationListModel = {
  /** Every chat, in list order. */
  rows: readonly ThreadRow[];
  /** False until the first read came back. */
  loaded: boolean;
  /** Core may hold older chats than the list has read. */
  hasMore: boolean;
  /** Which presses the client's port carries. */
  can: { readonly create: boolean; readonly rename: boolean; readonly remove: boolean };
  /** A press is on its way. */
  busy: boolean;
  /** Core's sentence for the last press it refused. */
  notice: string | undefined;
};

/** What the list tells the host. */
export type ConversationListHooks = {
  open(conversationId: string): void;
  create(): void;
  rename(conversationId: string, title: string): void;
  remove(conversationId: string): void;
  more(): void;
  /** Escape in the list. */
  close(): void;
};

/** The mounted list. */
export type ConversationList = {
  readonly element: HTMLElement;
  update(model: ConversationListModel): void;
  /** Puts focus in the search box. */
  focus(): void;
};

/** Creates the list; `id` names it for the control that opens it. */
export function createConversationList(id: string, layout: ChatThreadsLayout, hooks: ConversationListHooks): ConversationList {
  const create = createElement("button", { className: "chat-thread-new", hidden: true, attrs: { type: "button" } }, [lucideIcon("plus", 14), "New chat"]);
  const search = createElement("input", {
    className: "chat-thread-search",
    attrs: { type: "search", placeholder: "Search chats", "aria-label": "Search chats", autocomplete: "off" }
  });
  const notice = createElement("p", { className: "chat-thread-notice", hidden: true, attrs: { role: "alert" } });
  const list = createElement("ul", { className: "chat-thread-rows", attrs: { role: "list", "aria-label": "Chats" } });
  const none = createElement("p", { className: "chat-thread-none", hidden: true });
  const more = createElement("button", { className: "chat-thread-more", text: "Show older chats", hidden: true, attrs: { type: "button" } });
  const element = createElement("nav", { id, className: "chat-thread-nav", attrs: { "aria-label": "Chats", "data-layout": layout } }, [
    createElement("div", { className: "chat-thread-tools" }, [create, search]),
    notice,
    list,
    none,
    more
  ]);
  const rows = new Map<string, ConversationRow>();
  let model: ConversationListModel = { rows: [], loaded: false, hasMore: false, can: { create: false, rename: false, remove: false }, busy: false, notice: undefined };
  let visible: ThreadRow[] = [];

  function rowFor(conversationId: string): ConversationRow {
    const known = rows.get(conversationId);
    if (known !== undefined) return known;
    const made = createConversationRow(conversationId, { open: hooks.open, rename: hooks.rename, remove: hooks.remove, key: moveFrom });
    rows.set(conversationId, made);
    return made;
  }

  function focusRow(index: number): void {
    const row = visible[index];
    if (row !== undefined) rows.get(row.conversationId)?.openButton.focus();
  }

  function moveFrom(conversationId: string, event: RowKeyEvent): void {
    const index = visible.findIndex((row) => row.conversationId === conversationId);
    const last = visible.length - 1;
    const next = event.key === "ArrowDown" ? Math.min(index + 1, last)
      : event.key === "ArrowUp" ? index - 1
        : event.key === "Home" ? 0
          : event.key === "End" ? last
            : undefined;
    if (next === undefined) return;
    event.preventDefault();
    if (next < 0) search.focus();
    else focusRow(next);
  }

  function noneWords(query: string): string {
    if (!model.loaded) return "Loading chats…";
    if (model.rows.length === 0) return "No chats yet.";
    return `No chats match “${query}”.`;
  }

  function draw(): void {
    const query = search.value.trim();
    visible = filterThreadRows(model.rows, query);
    const controls = { rename: model.can.rename, remove: model.can.remove, busy: model.busy };
    const listed = new Set(model.rows.map((row) => row.conversationId));
    for (const conversationId of [...rows.keys()]) if (!listed.has(conversationId)) rows.delete(conversationId);
    placeChildren(list, visible.map((row) => {
      const view = rowFor(row.conversationId);
      view.update(row, controls);
      return view.element;
    }));
    const empty = visible.length === 0;
    if (none.hidden === empty) none.hidden = !empty;
    const words = noneWords(query);
    if (none.textContent !== words) none.textContent = words;
    create.hidden = !model.can.create;
    create.disabled = model.busy;
    const sentence = model.notice ?? "";
    if (notice.textContent !== sentence) notice.textContent = sentence;
    notice.hidden = sentence === "";
    more.hidden = !model.hasMore || !model.loaded;
  }

  create.addEventListener("click", () => {
    if (!model.busy) hooks.create();
  });
  more.addEventListener("click", () => hooks.more());
  search.addEventListener("input", draw);
  search.addEventListener("keydown", (event: RowKeyEvent) => {
    if (event.key === "ArrowDown" && visible.length > 0) {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "Escape" && search.value !== "") {
      event.preventDefault();
      event.stopPropagation?.();
      search.value = "";
      draw();
    }
  });
  element.addEventListener("keydown", (event: RowKeyEvent) => {
    if (event.key === "Escape") hooks.close();
  });

  return {
    element,
    update(next) {
      model = next;
      draw();
    },
    focus: () => search.focus()
  };
}
