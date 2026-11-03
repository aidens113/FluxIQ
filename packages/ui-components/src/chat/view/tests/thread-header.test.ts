// The thread header, the earlier-turns control and the welcome in the empty chat.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { createEarlierTurns } from "../earlier-turns.ts";
import { emptyStateModel } from "../empty-state-model.ts";
import { createEmptyState } from "../empty-state.ts";
import { createThreadHeader } from "../thread-header.ts";

const OPTIONS = [{ conversationId: "a", label: "Alpha (waiting on you)" }, { conversationId: "b", label: "Bravo" }];

test("with several threads the header is a picker labelled Thread, and a pick is heard", async () => {
  await withFakeDocument(() => {
    const picked: string[] = [];
    const header = createThreadHeader((id) => picked.push(id));
    const root = fake(header.element);
    header.update({ options: OPTIONS, selectedId: "b", title: "Bravo", showTitle: true });
    assert.equal(root.hidden, false);
    assert.equal(root.byClass("chat-thread-picker")[0]!.hidden, false);
    assert.equal(root.byClass("chat-thread-title")[0]!.hidden, true, "the picker names the thread; the title is not said twice");
    assert.equal(root.byClass("chat-sr-only")[0]!.textContent, "Thread");
    const select = root.byClass("chat-thread-select")[0]!;
    assert.deepEqual(select.querySelectorAll("option").map((option) => [option.value, option.textContent]), [["a", "Alpha (waiting on you)"], ["b", "Bravo"]]);
    assert.equal(select.value, "b");
    select.value = "a";
    select.dispatch("change");
    assert.deepEqual(picked, ["a"]);
  });
});

test("with one thread or none the header is the chat's name in words, or nothing when a host takes the name", async () => {
  await withFakeDocument(() => {
    const header = createThreadHeader(() => undefined);
    const root = fake(header.element);
    header.update({ options: OPTIONS.slice(0, 1), selectedId: "a", title: "Company website", showTitle: true });
    assert.equal(root.hidden, false);
    assert.equal(root.byClass("chat-thread-picker")[0]!.hidden, true);
    assert.equal(root.byClass("chat-thread-title")[0]!.hidden, false);
    assert.equal(root.byClass("chat-thread-title")[0]!.textContent, "Company website");
    header.update({ options: [], selectedId: undefined, title: "All projects", showTitle: true });
    assert.equal(root.byClass("chat-thread-title")[0]!.textContent, "All projects");
    header.update({ options: [], selectedId: undefined, title: "All projects", showTitle: false });
    assert.equal(root.hidden, true);
    header.update({ options: OPTIONS, selectedId: "a", title: "Alpha", showTitle: false });
    assert.equal(root.hidden, false, "a picker is still drawn");
  });
});

test("the picker's options are rebuilt only when they change, so an open picker keeps its place", async () => {
  await withFakeDocument(() => {
    const header = createThreadHeader(() => undefined);
    const select = fake(header.element).byClass("chat-thread-select")[0]!;
    header.update({ options: OPTIONS, selectedId: "a", title: "x", showTitle: false });
    const first = select.querySelectorAll("option")[0];
    header.update({ options: OPTIONS, selectedId: "b", title: "x", showTitle: false });
    assert.equal(select.querySelectorAll("option")[0], first);
    assert.equal(select.value, "b");
  });
});

test("the earlier-turns control says how many when it knows, and hides when there are none", async () => {
  await withFakeDocument(() => {
    let pressed = 0;
    const control = createEarlierTurns(() => (pressed += 1));
    const root = fake(control.element);
    const button = root.byClass("chat-earlier-button")[0]!;
    assert.equal(root.hidden, true);
    control.update(true, 12);
    assert.equal(root.hidden, false);
    assert.equal(button.textContent, "Show 12 earlier turns");
    control.update(true, 1);
    assert.equal(button.textContent, "Show 1 earlier turn");
    control.update(true, undefined);
    assert.equal(button.textContent, "Show earlier turns");
    button.dispatch("click");
    assert.equal(pressed, 1);
    control.update(false, undefined);
    assert.equal(root.hidden, true);
  });
});

const WELCOME = { title: "This is where FluxIQ talks to you", line: "You can write here too.", items: [{ icon: "key-round", title: "Permission", body: "It asks first." }] };

test("a welcome replaces the onboarding of an empty latest chat and of an empty chosen thread, and nothing else", () => {
  const offers = { extract: true, welcome: WELCOME };
  for (const target of [{ kind: "latest" }, { kind: "thread", conversationId: "c", projectId: "p" }] as const) {
    const model = emptyStateModel("empty", target, "unknown", offers)!;
    assert.deepEqual([model.title, model.line, model.items], [WELCOME.title, WELCOME.line, WELCOME.items]);
    assert.deepEqual([model.starts, model.keyLine, model.examples], [[], null, []], "no starts, no examples about a page, and a key line only when a read says one is missing");
  }
  assert.equal(emptyStateModel("empty", { kind: "automation", flowId: "f", name: "Price tracker" }, "unknown", offers)!.title, "Ask about Price tracker");
  assert.equal(emptyStateModel("thread", { kind: "latest" }, "unknown", offers), null);
  assert.equal(emptyStateModel("empty", { kind: "latest" })!.items.length, 0, "without a welcome nothing changes");
});

test("a welcome still says when FluxIQ has no model key, in the latest chat only", () => {
  const offers = { extract: true, welcome: WELCOME };
  assert.notEqual(emptyStateModel("empty", { kind: "latest" }, "missing", offers)!.keyLine, null);
  assert.equal(emptyStateModel("empty", { kind: "latest" }, "ready", offers)!.keyLine, null);
  assert.equal(emptyStateModel("empty", { kind: "thread", conversationId: "c", projectId: "p" }, "missing", offers)!.keyLine, null);
});

test("the welcome's lines are drawn with their icons, and replaced only when they change", async () => {
  await withFakeDocument(() => {
    const state = createEmptyState(() => undefined);
    const root = fake(state.element);
    const model = emptyStateModel("empty", { kind: "latest" }, "unknown", { extract: false, welcome: WELCOME })!;
    state.update(model, false);
    const item = root.byClass("chat-welcome-item")[0]!;
    assert.equal(item.descendants()[0]!.getAttribute("data-icon"), "key-round");
    assert.deepEqual(item.byClass("chat-welcome-copy")[0]!.querySelectorAll("strong").map((line) => line.textContent), ["Permission"]);
    state.update(model, false);
    assert.equal(root.byClass("chat-welcome-item")[0], item);
  });
});
