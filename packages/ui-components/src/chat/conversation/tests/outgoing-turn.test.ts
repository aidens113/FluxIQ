// U5 of the run-musp39u8-9ac026ab UI review (moment 2, and picture 00002 of
// run-murwcmx2): after the person sent the instruction, the whole message still
// sat in the composer with only "Sending your message" shown and no bubble in
// the stream, for as long as FluxIQ took to answer the send. A chat moves the
// message into the stream as the person's turn and empties the composer the
// moment it is sent; a send that then fails says so on that turn.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { createComposer } from "../composer.ts";
import type { ConversationState } from "../controller.ts";
import { controllerOver } from "./controller-over.ts";
import { fakeCore, UNREACHABLE } from "./fake-core.ts";
import { manualClock } from "./manual-clock.ts";
import { TEST_MESSAGES, type TestMessage } from "../../tests/message-transport.ts";
import type { ChatResult } from "../../ports/index.ts";

/** A Core whose answer to a send waits until `release` is called. */
function slowSendCore(turnCount: number, exists = true) {
  const core = fakeCore(turnCount, exists);
  let release!: (failure?: ChatResult<unknown>) => void;
  const request = <T>(message: TestMessage): Promise<ChatResult<T>> => {
    if (message.type !== TEST_MESSAGES.panelConversationSend) return core.request<T>(message);
    return new Promise((resolve) => {
      release = (failure) => {
        if (failure) {
          core.sent.push(message);
          resolve(failure as ChatResult<T>);
        } else void core.request<T>(message).then(resolve);
      };
    });
  };
  return { core, request, release: (failure?: ChatResult<unknown>) => release(failure) };
}

test("U5: the message is the person's turn in the stream the moment it is sent, before FluxIQ answers", async () => {
  const slow = slowSendCore(2);
  const controller = controllerOver(slow.request, () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  const sent = controller.send("Find wireless earbuds under $60");
  const now = controller.state();
  assert.equal(now.sending, true);
  assert.equal(now.mode, "thread");
  const last = now.turns.at(-1)!;
  assert.deepEqual([last.author, last.text, last.sendError], ["person", "Find wireless earbuds under $60", undefined], "the person's turn, already in the stream");
  slow.release();
  assert.equal(await sent, true);
  assert.deepEqual(controller.state().turns.map((turn) => turn.text), ["message 1", "message 2", "Find wireless earbuds under $60", "Working on: Find wireless earbuds under $60"], "Core's own turn replaces it, once, with no duplicate");
});

test("U5: a first message shows as the person's turn while the thread is still being opened", async () => {
  const slow = slowSendCore(0, false);
  const controller = controllerOver(slow.request, () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  assert.equal(controller.state().mode, "empty");
  const sent = controller.send("Find laptops under $900");
  assert.equal(controller.state().mode, "thread", "not the welcome screen");
  assert.deepEqual(controller.state().turns.map((turn) => [turn.author, turn.text]), [["person", "Find laptops under $900"]]);
  slow.release();
  await sent;
  assert.deepEqual(controller.state().turns.map((turn) => turn.text), ["Find laptops under $900", "Working on: Find laptops under $900"]);
});

test("U5: a send that fails says so on the person's turn, and the next send replaces that turn", async () => {
  const slow = slowSendCore(1);
  const controller = controllerOver(slow.request, () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  const sent = controller.send("hello");
  slow.release(UNREACHABLE);
  assert.equal(await sent, false);
  const failed = controller.state().turns.at(-1)!;
  assert.deepEqual([failed.author, failed.text, failed.sendError], ["person", "hello", "Couldn't send that. Try again."]);
  await controller.refresh();
  assert.equal(controller.state().turns.at(-1)!.sendError, "Couldn't send that. Try again.", "a poll does not wipe it");
  const again = controller.send("hello");
  assert.deepEqual(controller.state().turns.map((turn) => [turn.text, turn.sendError]), [["message 1", undefined], ["hello", undefined]], "one turn, on its way again");
  slow.release();
  assert.equal(await again, true);
  assert.equal(controller.state().turns.filter((turn) => turn.text === "hello").length, 1);
});

// t613: FluxIQ took the message but did not answer the send in time (a model
// provider that stalled). The turn says what happened, not "Sending your
// message" for as long as the send waited, and once a read holds Core's own
// record of the message it replaces the panel's turn.
const TIMED_OUT_SENTENCE = "FluxIQ did not answer your message within 40 seconds. It may still be working on it, so wait for its answer here before sending it again.";
const TIMED_OUT: ChatResult<unknown> = { ok: false, code: "timed_out", sentence: TIMED_OUT_SENTENCE };

test("t613: a send FluxIQ did not answer in time says so on the turn, and Core's record replaces it once read", async () => {
  const core = fakeCore(1);
  let storedButSilent = true;
  const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => {
    if (message.type !== TEST_MESSAGES.panelConversationSend) return core.request<T>(message);
    // Core stores the message, then its answer does not reach the panel in time.
    await core.request<T>(message);
    const kept = core.turns.splice(core.turns.length - 2, 2);
    if (!storedButSilent) core.turns.push(...kept);
    return TIMED_OUT as ChatResult<T>;
  };
  const controller = controllerOver(request, () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();

  assert.equal(await controller.send("Find a desk lamp"), false);
  const state = controller.state();
  assert.equal(state.sending, false, "no longer \"Sending your message\"");
  assert.deepEqual([state.turns.at(-1)!.text, state.turns.at(-1)!.sendError], ["Find a desk lamp", TIMED_OUT_SENTENCE], "the turn says what happened, in the background's words");

  storedButSilent = false;
  assert.equal(await controller.send("Find a desk lamp"), false);
  assert.deepEqual(controller.state().turns.map((turn) => [turn.text, turn.sendError]), [["message 1", undefined], ["Find a desk lamp", undefined], ["Working on: Find a desk lamp", undefined]], "Core's record of the message and its answer replace the panel's turn");
  assert.equal(controller.state().sendError, undefined);
});

const ready: ConversationState = { mode: "thread", turns: [], reading: false, sending: false, answering: new Set(), answerErrors: new Map() };

test("U5: the composer is empty the moment the message is sent, and gets the words back if the send fails", async () => {
  await withFakeDocument(async () => {
    const finishes: Array<(sent: boolean) => void> = [];
    const composer = createComposer(() => new Promise((resolve) => finishes.push(resolve)));
    composer.render(ready);
    const root = fake(composer.element);
    const box = root.descendants().find((node) => node.id === "conversationInput")!;
    const send = root.descendants().find((node) => node.id === "conversationSendButton")!;
    composer.fill("Find wireless earbuds");
    send.dispatch("click");
    assert.equal(box.value, "", "emptied at once, not when FluxIQ answers");
    finishes[0]!(false);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(box.value, "Find wireless earbuds", "a failed send gives the words back to send again");
    composer.fill("Second try");
    send.dispatch("click");
    assert.equal(box.value, "");
    finishes[1]!(true);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(box.value, "", "a sent message stays out of the box");
  });
});

// t265 decision 1, hardening from A9 (t174): once Core took the message, the
// first good read begun after it replaces the panel's turn even when Core's own
// turn is not recognised, so the local turn never lingers beside Core's record.
test("a delivered message's local turn goes with the first good read after it, even when Core's turn is not recognised", async () => {
  const core = fakeCore(2);
  let failAfterSend = false;
  const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => {
    const result = await core.request<T>(message);
    if (message.type === TEST_MESSAGES.panelConversationSend) {
      // Core keeps the message under no new person turn (say, folded into an existing one).
      core.turns.splice(core.turns.findIndex((turn) => turn.author === "person" && turn.text === "Find a desk lamp"), 1);
      if (failAfterSend) core.failNext.set(`${TEST_MESSAGES.panelConversationRead}:list`, UNREACHABLE);
    }
    return result;
  };
  const controller = controllerOver(request, () => undefined, manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  assert.equal(await controller.send("Find a desk lamp"), true);
  assert.deepEqual(controller.state().turns.map((turn) => turn.text), ["message 1", "message 2", "Working on: Find a desk lamp"], "Core's thread as read, with no local turn left");

  failAfterSend = true;
  assert.equal(await controller.send("Find a desk lamp"), true);
  assert.equal(controller.state().turns.at(-1)!.turnId.startsWith("local-send:"), true, "the read after the send failed: the message still shows");
  assert.equal(controller.state().turns.at(-1)!.sendError, undefined, "it went, so no send error");
  await controller.refresh();
  assert.equal(controller.state().turns.some((turn) => turn.turnId.startsWith("local-send:")), false, "the next good read replaces it");
});

// t262's scoped chat: a send refused because the project's chat is not ready makes no local turn.
test("a send refused for an unready project chat leaves no turn behind", async () => {
  const core = fakeCore(1);
  // Every read of the project's chats fails, so its chat is never ready.
  const request = <T>(message: TestMessage): Promise<ChatResult<T>> => {
    if (message.type === TEST_MESSAGES.panelConversationRead && message.kind === "list") core.failNext.set(`${TEST_MESSAGES.panelConversationRead}:list`, UNREACHABLE);
    return core.request<T>(message);
  };
  const controller = controllerOver(request, () => undefined, manualClock().clock);
  controller.setTarget({ kind: "project", projectId: "project-1" });
  controller.setConnected(true);
  await controller.refresh();
  assert.equal(controller.state().scopeState, "error");
  assert.equal(await controller.send("Find a desk lamp"), false);
  assert.deepEqual(controller.state().turns, []);
  assert.notEqual(controller.state().mode, "thread");
  assert.equal(core.sent.some((message) => message.type === TEST_MESSAGES.panelConversationSend), false);
});
