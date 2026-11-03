// An answer says which turn asked, carries the person's PIN to the transport
// and nowhere else, and resolves to how it came out; a `problem` on an answer or
// a send that went becomes `state.notice` until the next send, answer or target.

import assert from "node:assert/strict";
import { test } from "vitest";
import { asksCore, coreAsk, coreTurn } from "../../tests/asks-core.ts";
import { createConversationController, type ConversationController } from "../controller.ts";

const PIN = "482913";

async function connected(turns: Array<Record<string, unknown>>) {
  const core = asksCore(turns);
  const controller: ConversationController = createConversationController(core.transport().conversation, () => undefined);
  controller.setConnected(true);
  await controller.refresh();
  return { core, controller };
}

test("an answer carries the asking turn and the PIN, resolves ok, and the PIN is held nowhere", async () => {
  const { core, controller } = await connected([
    coreTurn("t1", { ask: coreAsk("ask-1"), attachment: { kind: "panel-capability", ref: "cap-9" } })
  ]);
  const outcome = await controller.answer("ask-1", "grant", undefined, { authorizationPin: PIN });
  assert.deepEqual(outcome, { ok: true });
  assert.equal(core.answers.length, 1);
  assert.equal(core.answers[0]!.authorizationPin, PIN);
  assert.deepEqual(core.answers[0]!.turn, { conversationId: "conv-1", turnId: "t1", attachment: { kind: "panel-capability", ref: "cap-9" } });
  assert.equal(JSON.stringify(controller.state(), (_key, value) => (value instanceof Set ? [...value] : value instanceof Map ? [...value] : value)).includes(PIN), false);
});

test("an answer with no PIN sends none, and a turn without an attachment says none", async () => {
  const { core, controller } = await connected([coreTurn("t1", { ask: coreAsk("ask-1", "confirm") })]);
  await controller.answer("ask-1", "deny");
  assert.equal("authorizationPin" in core.answers[0]!, false);
  assert.deepEqual(core.answers[0]!.turn, { conversationId: "conv-1", turnId: "t1" });
});

test("a refused PIN resolves with the sentence, keeps the ask open, and the card does not say it twice", async () => {
  const { core, controller } = await connected([coreTurn("t1", { ask: coreAsk("ask-1") })]);
  core.answerResult = () => ({ ok: false, sentence: "That PIN is not right.", code: "invalid_pin" });
  const outcome = await controller.answer("ask-1", "grant", undefined, { authorizationPin: PIN });
  assert.deepEqual(outcome, { ok: false, error: "That PIN is not right." });
  const state = controller.state();
  assert.equal(state.answerErrors.size, 0, "the host's dialog says it");
  assert.equal(state.turns[0]!.ask?.status, "pending");
  assert.equal(state.answering.size, 0);
  assert.equal(JSON.stringify([...state.answerErrors]).includes(PIN), false);
  // The same answer without a PIN still says its failure beside the buttons.
  await controller.answer("ask-1", "deny");
  assert.equal(controller.state().answerErrors.get("ask-1"), "Couldn't send your answer. Try again.", "the chat's own sentence, as before");
});

test("an answer for a question that is not waiting sends nothing and says so", async () => {
  const { core, controller } = await connected([coreTurn("t1", { ask: coreAsk("ask-1", "permission", { status: "answered" }) })]);
  const outcome = await controller.answer("ask-1", "grant");
  assert.equal(outcome.ok, false);
  assert.equal(core.answers.length, 0);
});

test("a problem on an answer that went becomes the notice, and the next answer clears it", async () => {
  const { core, controller } = await connected([
    coreTurn("t1", { ask: coreAsk("ask-1") }),
    coreTurn("t2", { ask: coreAsk("ask-2") })
  ]);
  core.answerResult = (answer) => ({ ok: true, value: answer.askId === "ask-1" ? { problem: "It was allowed, but the run could not start." } : {} });
  await controller.answer("ask-1", "grant");
  assert.equal(controller.state().notice, "It was allowed, but the run could not start.");
  await controller.answer("ask-2", "deny");
  assert.equal(controller.state().notice, undefined);
});

test("a problem on a send that went becomes the notice; the next send and a new target clear it", async () => {
  const { core, controller } = await connected([coreTurn("t1")]);
  core.sendResult = { ok: true, value: { problem: "FluxIQ stored that but could not read it yet." } };
  assert.equal(await controller.send("hello"), true);
  assert.equal(controller.state().notice, "FluxIQ stored that but could not read it yet.");
  core.sendResult = { ok: true, value: {} };
  await controller.send("again");
  assert.equal(controller.state().notice, undefined);
  core.sendResult = { ok: true, value: { problem: "Again a problem." } };
  await controller.send("third");
  assert.equal(controller.state().notice, "Again a problem.");
  controller.setTarget({ kind: "automation", flowId: "flow-1", name: "Tracker" });
  assert.equal(controller.state().notice, undefined);
});

test("a send or an answer without a problem leaves no notice", async () => {
  const { core, controller } = await connected([coreTurn("t1", { ask: coreAsk("ask-1") })]);
  core.answerResult = () => ({ ok: true, value: { problem: "  " } });
  await controller.answer("ask-1", "grant");
  assert.equal(controller.state().notice, undefined);
});
