// The thread header, the earlier-turns control and the welcome in the empty chat.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { createEarlierTurns } from "../earlier-turns.ts";
import { emptyStateModel } from "../empty-state-model.ts";
import { createEmptyState } from "../empty-state.ts";
import { createThreadHeader } from "../thread-header.ts";

test("in a drawer the header is a Chats button naming the chat, with how many wait, that opens the list", async () => {
  await withFakeDocument(() => {
    let toggled = 0;
    const header = createThreadHeader("drawer", () => (toggled += 1), "list-1");
    const root = fake(header.element);
    header.update({ title: "Bravo", showTitle: true, open: false, waiting: 2 });
    const button = root.byClass("chat-thread-toggle")[0]!;
    assert.equal(fake(header.toggle), button);
    assert.equal(root.hidden, false);
    assert.equal(button.getAttribute("aria-controls"), "list-1");
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.equal(root.byClass("chat-thread-toggle-label")[0]!.textContent, "Chats");
    assert.equal(root.byClass("chat-thread-title")[0]!.textContent, "Bravo");
    assert.equal(root.byClass("chat-thread-badge")[0]!.textContent, "2 waiting");
    button.dispatch("click");
    assert.equal(toggled, 1);
    header.update({ title: "Bravo", showTitle: false, open: true, waiting: 0 });
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.equal(root.byClass("chat-thread-title")[0]!.hidden, true, "a host that takes the name hears it instead");
    assert.equal(root.byClass("chat-thread-badge")[0]!.hidden, true, "nothing waits");
    assert.equal(root.hidden, false, "the button stays: it is the way to the list");
  });
});

test("in a column the header is the chat's name in words, or nothing when a host takes the name", async () => {
  await withFakeDocument(() => {
    const header = createThreadHeader("column", () => undefined, "list-2");
    const root = fake(header.element);
    assert.equal(header.toggle, undefined);
    header.update({ title: "Company website", showTitle: true, open: true, waiting: 1 });
    assert.equal(root.hidden, false);
    assert.equal(root.textContent, "Company website");
    assert.equal(root.querySelectorAll("button").length, 0, "no Refresh control and no toggle");
    header.update({ title: "All projects", showTitle: false, open: true, waiting: 1 });
    assert.equal(root.hidden, true);
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
