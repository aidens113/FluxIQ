import assert from "node:assert/strict";
import { test } from "vitest";
import { controllerOver } from "./controller-over.ts";
import { fakeCore, UNREACHABLE, UNSUPPORTED } from "./fake-core.ts";
import { manualClock } from "./manual-clock.ts";
import { TEST_MESSAGES } from "../../tests/message-transport.ts";
import type { ChatResult } from "../../ports/index.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

for (const synchronous of [true, false]) {
  test(`a ${synchronous ? "throwing" : "rejecting"} send releases its lock and preserves retry`, async () => {
    const core = fakeCore(1);
    let fail = true;
    const controller = controllerOver(<T>(message: Parameters<typeof core.request>[0]) => {
      if (message.type === TEST_MESSAGES.panelConversationSend && fail) {
        if (synchronous) throw new Error("synthetic private exception");
        return Promise.reject(new Error("synthetic private exception"));
      }
      return core.request<T>(message);
    }, () => undefined, manualClock().clock);
    controller.setConnected(true);
    await controller.refresh();
    assert.equal(await controller.send("Keep this draft"), false);
    assert.equal(controller.state().sending, false);
    assert.equal(controller.state().sendError, "Couldn't send that. Try again.");
    fail = false;
    assert.equal(await controller.send("Keep this draft"), true);
  });
}

test("a rejected read settles and allows a later successful read", async () => {
  const core = fakeCore(1);
  let fail = false;
  const controller = controllerOver(<T>(message: Parameters<typeof core.request>[0]) => fail
    ? Promise.reject(new Error("synthetic private exception")) : core.request<T>(message), () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  fail = true;
  await controller.refresh();
  assert.equal(controller.state().reading, false);
  assert.equal(controller.state().turns.length, 1);
  fail = false;
  core.say("automation", "Recovered");
  await controller.retry();
  assert.equal(controller.state().turns.at(-1)?.text, "Recovered");
});

test("a read completing after disconnect does not replace confirmed turns", async () => {
  const core = fakeCore(1);
  const held = deferred<ChatResult<unknown>>();
  let hold = false;
  const controller = controllerOver(<T>(message: Parameters<typeof core.request>[0]) => hold
    ? held.promise as Promise<ChatResult<T>> : core.request<T>(message), () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  hold = true;
  const reading = controller.refresh();
  controller.setConnected(false);
  held.resolve({ ok: true, value: { payload: { conversations: [] } } });
  await reading;
  assert.equal(controller.state().mode, "offline");
  assert.equal(controller.state().turns.length, 1);
});

test("a retained old ask cannot dispatch after its thread changes", async () => {
  const core = fakeCore(1);
  core.say("automation", "Confirm", { askId: "ask-old", kind: "confirm", status: "pending" });
  const controller = controllerOver((message) => core.request(message), () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  controller.setConnected(false);
  controller.setTarget({ kind: "automation", flowId: "new-flow", name: "New flow" });
  // Reconnection's read remains pending; no current confirmed ask is available.
  const held = deferred<ChatResult<unknown>>();
  let answers = 0;
  core.request = <T>(message: Parameters<typeof core.request>[0]) => {
    if (message.type === TEST_MESSAGES.panelConversationAnswer) answers += 1;
    return held.promise as Promise<ChatResult<T>>;
  };
  controller.setConnected(true);
  const answering = controller.answer("ask-old", "grant");
  held.resolve({ ok: true, value: { payload: { conversations: [] } } });
  await answering;
  assert.equal(answers, 0);
  assert.equal(controller.state().answering.size, 0);
  await controller.refresh();
});

test("a previous thread's answer failure cannot publish on the new thread", async () => {
  const core = fakeCore(1);
  core.say("automation", "Confirm", { askId: "ask-old", kind: "confirm", status: "pending" });
  const held = deferred<ChatResult<unknown>>();
  const controller = controllerOver(<T>(message: Parameters<typeof core.request>[0]) => message.type === TEST_MESSAGES.panelConversationAnswer
    ? held.promise as Promise<ChatResult<T>> : core.request<T>(message), () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  const answering = controller.answer("ask-old", "grant");
  controller.setTarget({ kind: "automation", flowId: "new-flow", name: "New flow" });
  await controller.refresh();
  held.resolve(UNREACHABLE);
  await answering;
  assert.equal(controller.state().answerErrors.size, 0);
  assert.equal(controller.state().answering.size, 0);
});

test("a rejected answer releases its own lock and can be retried", async () => {
  const core = fakeCore(1);
  core.say("automation", "Confirm", { askId: "ask-current", kind: "confirm", status: "pending" });
  let fail = true;
  const controller = controllerOver(<T>(message: Parameters<typeof core.request>[0]) => fail && message.type === TEST_MESSAGES.panelConversationAnswer
    ? Promise.reject(new Error("synthetic private exception")) : core.request<T>(message), () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  await controller.answer("ask-current", "grant");
  assert.equal(controller.state().answering.size, 0);
  assert.equal(controller.state().answerErrors.get("ask-current"), "Couldn't send your answer. Try again.");
  fail = false;
  await controller.answer("ask-current", "grant");
  assert.equal(controller.state().answerErrors.size, 0);
});

test("an old same-ID answer completion cannot release the newer operation", async () => {
  const core = fakeCore(1);
  core.say("automation", "Confirm", { askId: "same-ask", kind: "confirm", status: "pending" });
  const old = deferred<ChatResult<unknown>>();
  const current = deferred<ChatResult<unknown>>();
  let calls = 0;
  const controller = controllerOver(<T>(message: Parameters<typeof core.request>[0]) => {
    if (message.type === TEST_MESSAGES.panelConversationAnswer) return (++calls === 1 ? old.promise : current.promise) as Promise<ChatResult<T>>;
    return core.request<T>(message);
  }, () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  const first = controller.answer("same-ask", "grant");
  controller.setTarget({ kind: "automation", flowId: "new-flow", name: "New flow" });
  await controller.refresh();
  const second = controller.answer("same-ask", "grant");
  assert.equal(calls, 2);
  old.resolve(UNREACHABLE);
  await first;
  assert.equal(controller.state().answering.has("same-ask"), true);
  assert.equal(controller.state().answerErrors.size, 0);
  await controller.answer("same-ask", "grant");
  assert.equal(calls, 2, "new operation still prevents duplicate dispatch");
  current.resolve(UNREACHABLE);
  await second;
  assert.equal(controller.state().answering.size, 0);
  assert.equal(controller.state().answerErrors.size, 1);
});

test("an old send refusal cannot turn a newly opened thread into fallback", async () => {
  const core = fakeCore(1);
  const held = deferred<ChatResult<unknown>>();
  const controller = controllerOver(<T>(message: Parameters<typeof core.request>[0]) => message.type === TEST_MESSAGES.panelConversationSend
    ? held.promise as Promise<ChatResult<T>> : core.request<T>(message), () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  const sending = controller.send("Message for the first thread");
  controller.setTarget({ kind: "automation", flowId: "new-flow", name: "New flow" });
  await controller.refresh();
  held.resolve(UNSUPPORTED);
  assert.equal(await sending, false);
  assert.equal(controller.state().mode, "thread");
  assert.equal(controller.state().fallbackReason, undefined);
});
