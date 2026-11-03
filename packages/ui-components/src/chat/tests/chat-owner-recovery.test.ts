import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatWidget } from "../chat-widget.ts";
import { targetCore } from "../conversation/tests/target-core.ts";
import { fake, withFakeDocument } from "../../testing/index.ts";
import { activityEvent, relayState } from "./activity-fixture.ts";
import type { ChatOpenControlFactory, ChatResult } from "../ports/index.ts";
import { hostStatus } from "./host-status.ts";
import { messageTransport, TEST_ACTIVITY_MESSAGES, TEST_MESSAGES as M, type TestListen, type TestRequest } from "./message-transport.ts";
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const status = (projectId = "project-1", coreApiUrl = "http://core-a.invalid") => hostStatus({ connected: true, projectId, ownerKey: JSON.stringify(["gateway.invalid", projectId, coreApiUrl]) });
for (const changed of ["project", "core"] as const) test(`confirmed ${changed} replacement immediately retires old target and turns`, async () => withFakeDocument(async () => {
  const core = targetCore([{ conversationId: "same-id", subjectKind: "flow", subjectId: "f", turns: [{ turnId: "t", author: "person", text: "Old owner message" }] }]);
  const chat = mountOver((message) => core.request(message));
  chat.render(status());
  chat.open({ kind: "automation", flowId: "f", name: "Old automation" });
  await settle();
  assert.equal(fake(chat.element).byClass("chat-msg")[0]?.textContent, "Old owner message");
  core.hold = true;
  chat.render(changed === "project" ? status("project-2") : status("project-1", "http://core-b.invalid"));
  assert.deepEqual(chat.target(), { kind: "latest" });
  assert.equal(fake(chat.element).byClass("chat-msg").length, 0);
  core.hold = false;
  core.release();
  await settle();
  chat.setActive(false);
}));
// What the fake background broadcasts to: each chat subscribes here, and an unsubscribe leaves.
const listeners = new Set<(message: unknown) => void>();
const listen: TestListen = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
async function runtime(body: (listeners: Set<(message: unknown) => void>) => Promise<void>) {
  listeners.clear();
  await withFakeDocument(() => body(listeners));
}
const opener: ChatOpenControlFactory = () => ({ element: document.createElement("a"), observe() {} });
const mountOver = (request: TestRequest, openControl: ChatOpenControlFactory = opener) => createChatWidget(messageTransport(request, { listen }), { openControl });

/** A stand-in for the host's Open FluxIQ button: it asks `request` to open FluxIQ unless the chat says it may not. */
function openingThrough(request: TestRequest): ChatOpenControlFactory {
  return (style) => {
    const button = document.createElement("button");
    button.addEventListener("click", () => {
      if (style.canOpen?.() !== false) {
        void request({ type: M.panelOpenFluxIQ });
      }
    });
    const element = document.createElement("span");
    element.className = "open-fluxiq";
    element.append(button);
    return { element, observe: () => undefined };
  };
}

test("retired turn Open FluxIQ controls cannot dispatch after owner or active replacement", async () => runtime(async () => {
  let core = thread("Only FluxIQ can answer", true), opens = 0;
  core.threads[0]!.turns[0]!.ask!.kind = "unsupported-kind";
  const request: TestRequest = (message) => message.type === M.panelOpenFluxIQ
    ? (opens++, Promise.resolve({ ok: true, value: {} })) : core.request(message);
  const chat = mountOver(request, openingThrough(request));
  try {
    chat.render(status());
    chat.setActive(true);
    await settle();
    const old = fake(chat.element).byClass("open-fluxiq")[0]!.children[0]!;
    core = thread("Current unsupported question", true);
    core.threads[0]!.turns[0]!.ask!.kind = "unsupported-kind";
    chat.render(status("project-2"));
    await settle();
    old.dispatch("click");
    await settle();
    assert.equal(opens, 0);
    const current = fake(chat.element).byClass("open-fluxiq")[0]!.children[0]!;
    current.dispatch("click");
    await settle();
    assert.equal(opens, 1);
    chat.setActive(false);
    chat.setActive(true);
    await settle();
    current.dispatch("click");
    await settle();
    assert.equal(opens, 1);
    fake(chat.element).byClass("open-fluxiq")[0]!.children[0]!.dispatch("click");
    await settle();
    assert.equal(opens, 2);
  } finally { chat.setActive(false); }
}));
const thread = (text: string, ask = false) => targetCore([{ conversationId: "same-id", subjectKind: "project", subjectId: "project-1", turns: [{ turnId: "same-turn", author: "automation", text, ...(ask ? { ask: { askId: "same-ask", kind: "confirm", status: "pending" } } : {}) }] }]);
test("historical first initialization reads once; later never-activated replacement waits for activation", async () => runtime(async () => {
  let core = thread("First owner");
  const calls: Array<Parameters<TestRequest>[0]> = [];
  const request: TestRequest = (message) => {
    calls.push(message);
    return core.request(message);
  };
  const chat = mountOver(request);
  try {
    chat.render(status());
    await settle();
    assert.equal(fake(chat.element).byClass("chat-msg")[0]!.textContent, "First owner");
    const before = calls.length;
    core = thread("Second owner");
    chat.render(status("project-2"));
    await settle();
    assert.equal(calls.length, before);
    assert.equal(fake(chat.element).byClass("chat-msg").length, 0);
    chat.setActive(true);
    await settle();
    assert.equal(fake(chat.element).byClass("chat-msg")[0]!.textContent, "Second owner");
  } finally { chat.setActive(false); }
}));
test("explicit inactive replacement masks history and retained examples until active", async () => runtime(async () => {
  let core = targetCore([]);
  const chat = mountOver((message) => core.request(message));
  try {
    chat.render(status());
    chat.setActive(true);
    chat.open({ kind: "automation", flowId: "f", name: "Example flow" });
    await settle();
    const root = fake(chat.element), oldExample = root.byClass("chat-example")[0]!;
    chat.setActive(false);
    const before = core.sent.length;
    chat.render(status("project-2"));
    oldExample.dispatch("click");
    await settle();
    assert.equal(core.sent.length, before);
    assert.equal(root.descendants().find((node) => node.id === "conversationInput")!.value, "");
    assert.deepEqual(chat.target(), { kind: "latest" });
    chat.setActive(true);
    await settle();
    assert.ok(core.sent.length > before);
  } finally { chat.setActive(false); }
}));
test("same-ID retained ask cannot answer a replacement owner while current ask remains usable", async () => runtime(async () => {
  let core = thread("Old question", true);
  const chat = mountOver((message) => core.request(message));
  try {
    chat.render(status());
    chat.setActive(true);
    await settle();
    const root = fake(chat.element);
    const oldAnswer = root.byClass("small-button")[0]!;
    core = thread("New question", true);
    chat.render(status("project-2"));
    await settle();
    oldAnswer.dispatch("click");
    await settle();
    assert.equal(core.sent.some((message) => message.type === M.panelConversationAnswer), false);
    root.byClass("small-button")[0]!.dispatch("click");
    await settle();
    assert.equal(core.sent.filter((message) => message.type === M.panelConversationAnswer).length, 1);
  } finally { chat.setActive(false); }
}));
test("old pending thread and activity completions/listeners cannot publish into new owner", async () => runtime(async (listeners) => {
  const coreA = thread("Old result"), coreB = thread("Current result");
  let core = coreA;
  let finishActivity!: (value: ChatResult<unknown>) => void;
  let holdActivity = true;
  const request: TestRequest = (message) => message.type === TEST_ACTIVITY_MESSAGES.read
    ? holdActivity ? new Promise((resolve) => { finishActivity = resolve; }) : Promise.resolve({ ok: true, value: { state: relayState([]) } })
    : core.request(message);
  coreA.hold = true;
  const chat = mountOver(request);
  try {
    chat.render(status());
    chat.setActive(true);
    const oldListener = [...listeners][0]!;
    core = coreB;
    holdActivity = false;
    chat.render(status("project-2"));
    await settle();
    assert.equal(fake(chat.element).byClass("chat-msg")[0]!.textContent, "Current result");
    oldListener({ type: TEST_ACTIVITY_MESSAGES.changed, state: relayState([activityEvent(1, { detail: { kind: "step", title: "Obsolete step", status: "started" } })]) });
    finishActivity({ ok: true, value: { state: relayState([activityEvent(1)]) } });
    coreA.hold = false;
    coreA.release();
    await settle();
    assert.equal(fake(chat.element).byClass("chat-msg")[0]!.textContent, "Current result");
    assert.equal(fake(chat.element).byClass("chat-step-title").length, 0);
    assert.equal(listeners.size, 1);
  } finally { chat.setActive(false); }
  assert.equal(listeners.size, 0);
}));
test("same-owner missing settings/reconnect and passive name keep target, draft and confirmed turns", async () => runtime(async () => {
  const core = targetCore([{ conversationId: "f", subjectKind: "flow", subjectId: "f", turns: [{ turnId: "t", author: "person", text: "Confirmed" }] }]);
  const chat = mountOver((message) => core.request(message));
  try {
    chat.render(status());
    chat.setActive(true);
    chat.open({ kind: "automation", flowId: "f", name: "Name" });
    await settle();
    const root = fake(chat.element), box = root.descendants().find((node) => node.id === "conversationInput")!;
    box.value = "New draft";
    box.dispatch("input");
    chat.render({ ...status(), connected: false });
    assert.equal(root.byClass("chat-msg")[0]!.textContent, "Confirmed");
    chat.render({ ...status(), recording: true });
    chat.updateAutomationName({ flowId: "f", name: "Renamed" });
    await settle();
    assert.equal(chat.target().kind, "automation");
    assert.equal(box.value, "New draft");
    assert.equal(root.byClass("chat-msg")[0]!.textContent, "Confirmed");
    assert.equal(root.byClass("composer-draft-review")[0]!.hidden, true);
  } finally { chat.setActive(false); }
}));
test("unsupported conversation capability stays mounted-lifetime sticky across owner replacement", async () => runtime(async () => {
  let conversationReads = 0;
  const request: TestRequest = (message) => {
    if (message.type === M.panelConversationRead) {
      conversationReads++;
      return Promise.resolve({ ok: false, unsupported: true, sentence: "Unsupported" });
    }
    return Promise.resolve({ ok: true, value: { state: relayState([]) } });
  };
  const chat = mountOver(request);
  try {
    chat.render(status());
    chat.setActive(true);
    await settle();
    const before = conversationReads;
    chat.render(status("project-2"));
    await settle();
    assert.equal(conversationReads, before);
    assert.equal(fake(chat.element).byClass("chat-fallback")[0]!.hidden, false);
  } finally { chat.setActive(false); }
}));
test("owner reset is coherent before a synchronous target listener activates current reads", async () => runtime(async () => {
  let core = thread("Old");
  const chat = mountOver((message) => core.request(message));
  try {
    chat.render(status());
    chat.open({ kind: "automation", flowId: "f", name: "Old flow" });
    await settle();
    let notified = 0;
    chat.onTargetChange((target) => {
      notified++;
      assert.deepEqual(target, { kind: "latest" });
      assert.equal(fake(chat.element).byClass("chat-msg").length, 0);
      chat.setActive(true);
    });
    core = thread("Current");
    chat.render(status("project-2"));
    await settle();
    assert.equal(notified, 1);
    assert.equal(fake(chat.element).byClass("chat-msg")[0]!.textContent, "Current");
  } finally { chat.setActive(false); }
}));
test("retained retired poll callbacks cannot dispatch under a replacement or reactivated owner", async () => runtime(async () => {
  const intervalBefore = Object.getOwnPropertyDescriptor(globalThis, "setInterval"), clearBefore = Object.getOwnPropertyDescriptor(globalThis, "clearInterval");
  const callbacks: Array<() => void> = [];
  Object.defineProperty(globalThis, "setInterval", { configurable: true, value: (fn: () => void) => {
    callbacks.push(fn);
    return callbacks.length;
  } });
  Object.defineProperty(globalThis, "clearInterval", { configurable: true, value: () => {} });
  const core = thread("Current");
  const chat = mountOver((message) => core.request(message));
  try {
    chat.render(status());
    chat.setActive(true);
    await settle();
    const old = callbacks[0]!;
    chat.render(status("project-2"));
    await settle();
    const before = core.sent.length;
    old();
    await settle();
    assert.equal(core.sent.length, before);
    const inactive = callbacks.at(-1)!;
    chat.setActive(false);
    chat.setActive(true);
    await settle();
    const resumed = core.sent.length;
    inactive();
    await settle();
    assert.equal(core.sent.length, resumed);
  } finally {
    chat.setActive(false);
    if (intervalBefore) Object.defineProperty(globalThis, "setInterval", intervalBefore);
    if (clearBefore) Object.defineProperty(globalThis, "clearInterval", clearBefore);
  }
}));
