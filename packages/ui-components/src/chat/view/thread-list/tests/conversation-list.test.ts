// The conversation list under a fake DOM: search, the words when nothing shows,
// moving through it by keyboard, the controls a port carries, rename and delete
// in place, Core's refusal, and older chats.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument, type FakeElement } from "../../../../testing/index.ts";
import { threadRows, type ChatThreadSummary, type ThreadRow } from "../../../conversation/thread-list/index.ts";
import { createConversationList, type ConversationListHooks, type ConversationListModel } from "../conversation-list.ts";

const NOW = new Date(2026, 10, 10, 15, 0).getTime();
const HOUR = 3_600_000;

function summary(conversationId: string, title: string, updatedAt: number, pendingAskCount = 0): ChatThreadSummary {
  return { conversationId, projectId: "p1", revision: 1, status: "open", updatedAt, pendingAskCount, title, subject: { kind: "flow" } };
}

const ROWS: ThreadRow[] = threadRows([
  summary("inv", "Invoice check", NOW - 2 * HOUR, 1),
  summary("price", "Price tracker", NOW - 26 * HOUR),
  summary("jobs", "Job listings", new Date(2026, 9, 3, 12).getTime())
], "price", NOW);

const CAN_ALL = { create: true, rename: true, remove: true };

function model(fields: Partial<ConversationListModel> = {}): ConversationListModel {
  return { rows: ROWS, loaded: true, hasMore: false, can: CAN_ALL, busy: false, notice: undefined, ...fields };
}

type Heard = { opened: string[]; created: number; renamed: Array<[string, string]>; removed: string[]; more: number; closed: number };

function mount(): { root: FakeElement; heard: Heard; update(next: ConversationListModel): void } {
  const heard: Heard = { opened: [], created: 0, renamed: [], removed: [], more: 0, closed: 0 };
  const hooks: ConversationListHooks = {
    open: (id) => heard.opened.push(id),
    create: () => (heard.created += 1),
    rename: (id, title) => heard.renamed.push([id, title]),
    remove: (id) => heard.removed.push(id),
    more: () => (heard.more += 1),
    close: () => (heard.closed += 1)
  };
  const list = createConversationList("list-1", "drawer", hooks);
  return { root: fake(list.element), heard, update: (next) => list.update(next) };
}

function names(root: FakeElement): string[] {
  return root.byClass("chat-thread-name").map((name) => name.textContent);
}

function row(root: FakeElement, id: string): FakeElement {
  return root.byClass("chat-thread-row").find((candidate) => candidate.getAttribute("data-conversation-id") === id)!;
}

function key(name: string): { key: string; preventDefault(): void } {
  return { key: name, preventDefault: () => undefined };
}

function search(root: FakeElement, words: string): void {
  const box = root.byClass("chat-thread-search")[0]!;
  box.value = words;
  box.dispatch("input");
}

test("each row has the chat's name, its time in words, the full day on hover, and the marks", async () => {
  await withFakeDocument(() => {
    const { root, heard, update } = mount();
    update(model());
    assert.equal(root.getAttribute("aria-label"), "Chats");
    assert.equal(root.getAttribute("data-layout"), "drawer");
    assert.equal(root.byClass("chat-thread-rows")[0]!.getAttribute("aria-label"), "Chats");
    assert.deepEqual(names(root), ["Invoice check", "Price tracker", "Job listings"]);
    assert.deepEqual(root.byClass("chat-thread-when").map((when) => when.textContent), ["2 h ago", "yesterday", "Oct 3"]);
    assert.equal(row(root, "jobs").byClass("chat-thread-open")[0]!.title, "October 3, 2026");
    assert.equal(row(root, "inv").byClass("chat-thread-waiting")[0]!.hidden, false);
    assert.equal(row(root, "price").byClass("chat-thread-waiting")[0]!.hidden, true);
    assert.equal(row(root, "price").byClass("chat-thread-open")[0]!.getAttribute("aria-current"), "true");
    assert.equal(row(root, "inv").byClass("chat-thread-open")[0]!.getAttribute("aria-current"), null);
    row(root, "jobs").byClass("chat-thread-open")[0]!.dispatch("click");
    assert.deepEqual(heard.opened, ["jobs"]);
  });
});

test("search keeps the chats whose name or time has every word, says when none match, and Escape clears it", async () => {
  await withFakeDocument(() => {
    const { root, heard, update } = mount();
    update(model());
    search(root, "PRICE");
    assert.deepEqual(names(root), ["Price tracker"]);
    search(root, "yesterday");
    assert.deepEqual(names(root), ["Price tracker"], "a time as the row says it");
    search(root, "oct 3");
    assert.deepEqual(names(root), ["Job listings"], "a day as a person writes it");
    search(root, "listings october");
    assert.deepEqual(names(root), ["Job listings"], "every word must match");
    search(root, "invoice october");
    assert.deepEqual(names(root), []);
    const none = root.byClass("chat-thread-none")[0]!;
    assert.equal(none.hidden, false);
    assert.equal(none.textContent, "No chats match “invoice october”.");
    update(model());
    assert.deepEqual(names(root), [], "a read of the list keeps the search");
    root.byClass("chat-thread-search")[0]!.dispatch("keydown", key("Escape"));
    assert.equal(root.byClass("chat-thread-search")[0]!.value, "");
    assert.deepEqual(names(root), ["Invoice check", "Price tracker", "Job listings"]);
    assert.equal(none.hidden, true);
    assert.equal(heard.closed, 0, "Escape in a search with words clears it and closes nothing");
    root.dispatch("keydown", key("Escape"));
    assert.equal(heard.closed, 1);
  });
});

test("before the first read the list says it is loading, and an empty list says so", async () => {
  await withFakeDocument(() => {
    const { root, update } = mount();
    update(model({ rows: [], loaded: false }));
    assert.equal(root.byClass("chat-thread-none")[0]!.textContent, "Loading chats…");
    update(model({ rows: [] }));
    assert.equal(root.byClass("chat-thread-none")[0]!.textContent, "No chats yet.");
  });
});

test("rows are kept per chat and only moved, so focus and an edit survive a read", async () => {
  await withFakeDocument(() => {
    const { root, update } = mount();
    update(model());
    const price = row(root, "price");
    update(model({ rows: [ROWS[1]!, ROWS[0]!, ROWS[2]!] }));
    assert.equal(row(root, "price"), price);
    assert.deepEqual(names(root), ["Price tracker", "Invoice check", "Job listings"]);
    update(model({ rows: [ROWS[0]!] }));
    assert.deepEqual(names(root), ["Invoice check"], "a chat no longer listed leaves");
  });
});

test("ArrowDown and ArrowUp move between rows, Home and End jump, and ArrowDown from search enters the list", async () => {
  await withFakeDocument(() => {
    const { root, update } = mount();
    update(model());
    const focused: string[] = [];
    const box = root.byClass("chat-thread-search")[0]!;
    box.focus = () => focused.push("search");
    for (const candidate of root.byClass("chat-thread-row")) {
      candidate.byClass("chat-thread-open")[0]!.focus = () => focused.push(candidate.getAttribute("data-conversation-id")!);
    }
    const open = (id: string) => row(root, id).byClass("chat-thread-open")[0]!;
    box.dispatch("keydown", key("ArrowDown"));
    open("inv").dispatch("keydown", key("ArrowDown"));
    open("price").dispatch("keydown", key("ArrowDown"));
    open("jobs").dispatch("keydown", key("ArrowDown"));
    open("jobs").dispatch("keydown", key("Home"));
    open("inv").dispatch("keydown", key("End"));
    open("jobs").dispatch("keydown", key("ArrowUp"));
    open("inv").dispatch("keydown", key("ArrowUp"));
    open("inv").dispatch("keydown", key("x"));
    assert.deepEqual(focused, ["inv", "price", "jobs", "jobs", "inv", "jobs", "price", "search"]);
    search(root, "price");
    focused.length = 0;
    open("price").dispatch("keydown", key("ArrowDown"));
    assert.deepEqual(focused, ["price"], "only the rows the search shows");
  });
});

test("New chat, Rename and Delete show only when the port carries them, and wait while a press is on its way", async () => {
  await withFakeDocument(() => {
    const { root, heard, update } = mount();
    update(model({ can: { create: false, rename: false, remove: false } }));
    assert.equal(root.byClass("chat-thread-new")[0]!.hidden, true);
    assert.ok(root.byClass("chat-thread-actions").every((actions) => actions.hidden));
    update(model({ can: { create: false, rename: true, remove: false } }));
    assert.ok(root.byClass("chat-thread-rename").every((button) => !button.hidden));
    assert.ok(root.byClass("chat-thread-delete").every((button) => button.hidden));
    update(model({ busy: true }));
    const create = root.byClass("chat-thread-new")[0]!;
    assert.equal(create.hidden, false);
    assert.equal(create.disabled, true);
    assert.equal(row(root, "inv").byClass("chat-thread-delete")[0]!.disabled, true);
    create.dispatch("click");
    assert.equal(heard.created, 0);
    update(model());
    create.dispatch("click");
    assert.equal(heard.created, 1);
  });
});

test("Rename edits in place: Enter saves a changed name, Escape and leaving the box cancel, a blank or unchanged name sends nothing", async () => {
  await withFakeDocument(() => {
    const { root, heard, update } = mount();
    update(model());
    const it = row(root, "price");
    const input = it.byClass("chat-thread-rename-input")[0]!;
    const rename = () => it.byClass("chat-thread-rename")[0]!.dispatch("click");
    assert.equal(it.byClass("chat-thread-rename")[0]!.getAttribute("aria-label"), "Rename Price tracker");
    rename();
    assert.equal(input.hidden, false);
    assert.equal(input.getAttribute("aria-label"), "New name for Price tracker");
    assert.equal(it.byClass("chat-thread-actions")[0]!.hidden, true);
    input.value = "Prices";
    update(model());
    assert.equal(input.value, "Prices", "a read of the list leaves the edit alone");
    assert.equal(input.hidden, false);
    input.dispatch("blur");
    assert.equal(input.hidden, true);
    rename();
    input.value = "   ";
    input.dispatch("keydown", key("Enter"));
    rename();
    input.dispatch("keydown", key("Enter"));
    rename();
    input.value = "Prices";
    input.dispatch("keydown", key("Escape"));
    assert.deepEqual(heard.renamed, []);
    rename();
    input.value = " Prices ";
    input.dispatch("keydown", key("Enter"));
    assert.deepEqual(heard.renamed, [["price", "Prices"]]);
    assert.equal(input.hidden, true);
    assert.equal(it.byClass("chat-thread-open")[0]!.hidden, false);
  });
});

test("Delete asks in place and deletes only on its own Delete; Escape is Cancel", async () => {
  await withFakeDocument(() => {
    const { root, heard, update } = mount();
    update(model());
    const it = row(root, "jobs");
    const confirm = it.byClass("chat-thread-confirm")[0]!;
    it.byClass("chat-thread-delete")[0]!.dispatch("click");
    assert.equal(confirm.hidden, false);
    assert.equal(confirm.getAttribute("role"), "group");
    assert.equal(confirm.getAttribute("aria-label"), "Delete Job listings?");
    assert.equal(it.getAttribute("data-mode"), "confirm");
    confirm.dispatch("keydown", key("Escape"));
    assert.equal(confirm.hidden, true);
    assert.equal(heard.closed, 0);
    it.byClass("chat-thread-delete")[0]!.dispatch("click");
    it.byClass("chat-thread-confirm-delete")[0]!.dispatch("click");
    assert.deepEqual(heard.removed, ["jobs"]);
    assert.equal(confirm.hidden, true);
  });
});

test("Core's refusal shows as an alert, and older chats are a press away while Core may hold more", async () => {
  await withFakeDocument(() => {
    const { root, heard, update } = mount();
    update(model({ notice: "This chat's work is still running." }));
    const notice = root.byClass("chat-thread-notice")[0]!;
    assert.equal(notice.hidden, false);
    assert.equal(notice.getAttribute("role"), "alert");
    assert.equal(notice.textContent, "This chat's work is still running.");
    const more = root.byClass("chat-thread-more")[0]!;
    assert.equal(more.hidden, true);
    update(model({ hasMore: true }));
    assert.equal(notice.hidden, true);
    assert.equal(more.hidden, false);
    more.dispatch("click");
    assert.equal(heard.more, 1);
  });
});
