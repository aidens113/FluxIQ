// The conversation card's rules (UI audit, section 4, "3. Conversation card"):
// Core's thread shown and fed, never owned; the "Open FluxIQ" fallback on
// `unsupported` and on a refused token; errors that end with their cause, neither outliving it nor
// wiped the moment they appear; and a read that fails, retried quietly and
// shown only once it keeps failing, as a notice naming what failed.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ConversationController } from "../controller.ts";
import { controllerOver } from "./controller-over.ts";
import { READ_RETRY } from "../read/index.ts";
import { TURN_WINDOW } from "../thread-tail.ts";
import { fakeCore, REFUSED, UNREACHABLE, UNSUPPORTED } from "./fake-core.ts";
import { manualClock, type ManualClock } from "./manual-clock.ts";
import { TEST_MESSAGES, type TestMessage } from "../../tests/message-transport.ts";
import type { ChatResult } from "../../ports/index.ts";

async function connectedController(core: ReturnType<typeof fakeCore>, time: ManualClock = manualClock()) {
  const controller = controllerOver((message) => core.request(message), () => undefined, time.clock);
  controller.setConnected(true);
  await controller.refresh();
  return controller;
}

/**
 * What the panel was answered in the overlay probe's run (review #4's
 * screenshot): its stand-in FluxIQ answered every HTTP request `200 text/html`,
 * so `callCoreProgram` found no JSON envelope and the relay answered this,
 * observed by running the real relay against that server
 * (`{"ok":false,"code":"failed","httpStatus":200,"error":"FluxIQ answered 200."}`),
 * which `panelRequest` turns into the result below.
 */
const PROBE_ANSWER: ChatResult<unknown> = { ok: false, sentence: "Something went wrong.", detail: "FluxIQ answered 200.", code: "failed" };

/** Core's project-database race (`storage/project/database.ts`): a read whose lease raced the last release. Transient. */
const CLOSED_DATABASE: ChatResult<unknown> = { ok: false, sentence: "Something went wrong.", detail: "Automation Studio project database project-1 is closed.", code: "failed" };

/** A request that answers `failure` for every read while `failing()` holds, and Core's thread otherwise. */
function failingReads(core: ReturnType<typeof fakeCore>, failing: (message: TestMessage) => ChatResult<unknown> | undefined) {
  return <T>(message: TestMessage): Promise<ChatResult<T>> => {
    const failure = message.type === TEST_MESSAGES.panelConversationRead ? failing(message) : undefined;
    if (failure) {
      core.sent.push(message);
      return Promise.resolve(failure as ChatResult<T>);
    }
    return core.request<T>(message);
  };
}

/** Runs the quiet retries out, one by one, with the time between them. */
async function exhaustRetries(time: ManualClock): Promise<void> {
  for (const delay of READ_RETRY.delaysMs) await time.advance(delay);
}

test("the most recent open thread is read and its turns are what Core said", async () => {
  const core = fakeCore(3);
  const controller = await connectedController(core);
  const state = controller.state();
  assert.equal(state.mode, "thread");
  assert.deepEqual(state.turns.map((turn) => [turn.author, turn.text]), [["person", "message 1"], ["automation", "message 2"], ["person", "message 3"]]);
  assert.deepEqual(core.sent[0], { type: TEST_MESSAGES.panelConversationRead, kind: "list", status: "open", limit: 1, subjectKind: "project" });
});

test("no thread yet: the empty face, and the first message opens one", async () => {
  const core = fakeCore(0, false);
  const controller = await connectedController(core);
  assert.equal(controller.state().mode, "empty");
  assert.equal(await controller.send("Find laptops under $900"), true);
  const send = core.sent.find((message) => message.type === TEST_MESSAGES.panelConversationSend);
  assert.equal(send?.conversationId, undefined, "no thread id: the relay opens one first");
  assert.deepEqual(controller.state().turns.map((turn) => turn.text), ["Find laptops under $900", "Working on: Find laptops under $900"]);
});

test("a thread whose revision has not moved is not read again", async () => {
  const core = fakeCore(2);
  const controller = await connectedController(core);
  const reads = core.sent.length;
  await controller.refresh();
  assert.equal(core.sent.length, reads + 1, "only the list, no get");
  core.say("automation", "Found 24 products. Want a CSV?");
  await controller.refresh();
  assert.equal(controller.state().turns.at(-1)?.text, "Found 24 products. Want a CSV?");
});

test("only the last turns are kept, read forward from an anchor", async () => {
  const core = fakeCore(TURN_WINDOW + 7);
  const controller = await connectedController(core);
  const turns = controller.state().turns;
  assert.equal(turns.length, TURN_WINDOW);
  assert.equal(turns.at(-1)?.text, `message ${TURN_WINDOW + 7}`);
  core.say("automation", "one more");
  await controller.refresh();
  const lastGet = core.sent.filter((message) => message.kind === "get").at(-1);
  assert.equal(lastGet?.sinceTurnId, "turn-7", "re-read from the turn before the first one on screen");
  assert.equal(controller.state().turns.length, TURN_WINDOW);
  assert.equal(controller.state().turns.at(-1)?.text, "one more");
});

test("unsupported on read: the card falls back to Open FluxIQ and stops asking", async () => {
  const core = fakeCore(2);
  core.failNext.set(`${TEST_MESSAGES.panelConversationRead}:list`, UNSUPPORTED);
  const controller = await connectedController(core);
  assert.equal(controller.state().mode, "fallback");
  assert.equal(controller.state().fallbackReason, "unsupported");
  const asked = core.sent.length;
  await controller.refresh();
  assert.equal(await controller.send("hello"), false);
  assert.equal(core.sent.length, asked, "nothing more is sent to a background that does not know the messages");
});

test("unsupported on send also falls back", async () => {
  const core = fakeCore(1);
  const controller = await connectedController(core);
  core.failNext.set(TEST_MESSAGES.panelConversationSend, UNSUPPORTED);
  assert.equal(await controller.send("hello"), false);
  assert.equal(controller.state().mode, "fallback");
  assert.equal(controller.state().fallbackReason, "unsupported");
});

test("a failed send keeps its error until the next send, which clears it at once", async () => {
  const core = fakeCore(1);
  const controller = await connectedController(core);
  core.failNext.set(TEST_MESSAGES.panelConversationSend, UNREACHABLE);
  assert.equal(await controller.send("hello"), false, "the composer keeps the words");
  assert.equal(controller.state().sendError, "Couldn't send that. Try again.");
  await controller.refresh();
  assert.equal(controller.state().sendError, "Couldn't send that. Try again.", "a poll does not wipe it");
  const again = controller.send("hello");
  assert.equal(controller.state().sendError, undefined, "sending again clears the old error");
  assert.equal(controller.state().sending, true);
  assert.equal(await again, true);
  assert.equal(controller.state().sendError, undefined);
});

test("review #4: one failed read while connected shows nothing, keeps the thread, and is retried quietly", async () => {
  // Before t191-thread this showed "Couldn't load the conversation." at once, and every 4 s poll against the
  // probe's stand-in FluxIQ failed the same way, so it never went away.
  const core = fakeCore(2);
  const time = manualClock();
  const controller = await connectedController(core, time);
  core.failNext.set(`${TEST_MESSAGES.panelConversationRead}:list`, PROBE_ANSWER);
  await controller.refresh();
  assert.equal(controller.state().readError, undefined, "no load error for a single failure");
  assert.equal(controller.state().mode, "thread", "what was on screen stays");
  assert.deepEqual(time.pending(), [READ_RETRY.delaysMs[0]], "a quiet retry is waiting");
  const lists = core.sent.filter((message) => message.kind === "list").length;
  await time.advance(READ_RETRY.delaysMs[0]!);
  assert.equal(core.sent.filter((message) => message.kind === "list").length, lists + 1, "the retry read again");
  assert.equal(controller.state().readError, undefined);
  assert.deepEqual(time.pending(), [], "a good read ends the retries");
});

test("Core's transient project-database race on the thread read never reaches the person", async () => {
  const core = fakeCore(2);
  const time = manualClock();
  const controller = await connectedController(core, time);
  core.say("automation", "Building your automation...");
  core.failNext.set(`${TEST_MESSAGES.panelConversationRead}:get`, CLOSED_DATABASE);
  await controller.refresh();
  assert.equal(controller.state().readError, undefined);
  await time.advance(READ_RETRY.delaysMs[0]!);
  assert.equal(controller.state().turns.at(-1)?.text, "Building your automation...");
  assert.equal(controller.state().readError, undefined);
});

test("a read that keeps failing shows a notice naming the step and the cause, only after the quiet retries", async () => {
  const core = fakeCore(2);
  const time = manualClock();
  let broken = true;
  const controller = controllerOver(failingReads(core, (message) => (broken && message.kind === "list" ? PROBE_ANSWER : undefined)), () => undefined, time.clock);
  controller.setConnected(true);
  await controller.refresh();
  assert.equal(controller.state().mode, "loading", "never claims there is no conversation");
  const seen: Array<string | undefined> = [controller.state().readError];
  for (const delay of READ_RETRY.delaysMs) {
    await time.advance(delay);
    seen.push(controller.state().readError);
  }
  const notice = "This chat isn't updating: finding this chat in FluxIQ failed (FluxIQ answered 200).";
  assert.deepEqual(seen, [undefined, undefined, undefined, notice], "quiet for the first three failures, then the notice");
  assert.deepEqual(time.pending(), [], "no more quiet retries once the notice shows; the poll and Retry go on");
  assert.equal(controller.state().mode, "loading");

  const retried = controller.retry();
  assert.equal(controller.state().reading, true, "Retry shows it is reading");
  await retried;
  assert.equal(controller.state().readError, notice, "still failing: the notice stays");
  assert.equal(controller.state().reading, false);
  assert.deepEqual(time.pending(), [READ_RETRY.delaysMs[0]], "Retry starts the quiet retries over");

  broken = false;
  await controller.retry();
  assert.equal(controller.state().readError, undefined, "the next good read clears it");
  assert.equal(controller.state().mode, "thread");
  assert.deepEqual(time.pending(), []);
});

test("the notice names the thread read when that is the step that keeps failing", async () => {
  const core = fakeCore(2);
  const time = manualClock();
  const controller = controllerOver(failingReads(core, (message) => (message.kind === "get" ? CLOSED_DATABASE : undefined)), () => undefined, time.clock);
  controller.setConnected(true);
  await controller.refresh();
  await exhaustRetries(time);
  assert.equal(controller.state().readError, "This chat isn't updating: reading this chat's messages from FluxIQ failed (Automation Studio project database project-1 is closed).");
});

test("the notice follows the newest cause, and a dropped connection or a new target clears it and its retries", async () => {
  const core = fakeCore(2);
  const time = manualClock();
  let failure: ChatResult<unknown> = PROBE_ANSWER;
  const controller = controllerOver(failingReads(core, (message) => (message.kind === "list" ? failure : undefined)), () => undefined, time.clock);
  controller.setConnected(true);
  await controller.refresh();
  await exhaustRetries(time);
  failure = { ok: false, sentence: "Can't reach FluxIQ.", detail: "FluxIQ could not be reached.", code: "unreachable" };
  await controller.refresh();
  assert.equal(controller.state().readError, "This chat isn't updating: finding this chat in FluxIQ failed (FluxIQ can't be reached).");

  controller.setConnected(false);
  assert.equal(controller.state().readError, undefined);
  controller.setConnected(true);
  await controller.refresh();
  assert.equal(controller.state().readError, undefined, "a new connection starts quiet again");
  assert.deepEqual(time.pending(), [READ_RETRY.delaysMs[0]]);

  controller.setTarget({ kind: "automation", flowId: "flow-1", name: "Prices" });
  assert.equal(controller.state().readError, undefined);
});

test("disconnecting disables the composer and clears errors nobody can act on; reconnecting reads again", async () => {
  const core = fakeCore(1);
  const controller = await connectedController(core);
  core.failNext.set(TEST_MESSAGES.panelConversationSend, UNREACHABLE);
  await controller.send("hello");
  controller.setConnected(false);
  assert.equal(controller.state().mode, "offline");
  assert.equal(controller.state().sendError, undefined);
  assert.equal(await controller.send("hello"), false);
  const before = core.sent.length;
  controller.setConnected(true);
  await controller.refresh();
  assert.ok(core.sent.length > before);
  assert.equal(controller.state().mode, "thread");
});

test("answering a question sends answer-ask and re-reads; an answer error ends once the question is settled", async () => {
  const core = fakeCore(1);
  const ask = { askId: "ask-1", kind: "confirm", status: "pending", options: null, answer: null };
  core.say("automation", "Delete 3 old drafts?", ask);
  const controller = await connectedController(core);

  core.failNext.set(TEST_MESSAGES.panelConversationAnswer, UNREACHABLE);
  await controller.answer("ask-1", "grant");
  assert.equal(controller.state().answerErrors.get("ask-1"), "Couldn't send your answer. Try again.");

  await controller.answer("ask-1", "grant");
  const sent = core.sent.filter((message) => message.type === TEST_MESSAGES.panelConversationAnswer).at(-1);
  assert.deepEqual(sent, { type: TEST_MESSAGES.panelConversationAnswer, askId: "ask-1", kind: "grant", value: undefined, projectId: "project-1" });
  assert.equal(controller.state().turns.at(-1)?.ask?.status, "answered");
  assert.equal(controller.state().answerErrors.size, 0);
});

test("an unreadable answer from Core is a failed read, named once it lasts, never a blank card", async () => {
  const time = manualClock();
  const controller = controllerOver(async (message) => {
    if (message.kind === "list") return { ok: true, value: { ok: true, payload: { conversations: [{ conversationId: "c", projectId: "p", revision: 2 }] } } };
    return { ok: true, value: { ok: true, payload: { conversation: { turns: "nope" } } } };
  }, () => undefined, time.clock);
  controller.setConnected(true);
  await controller.refresh();
  assert.equal(controller.state().readError, undefined);
  assert.equal(controller.state().mode, "loading");
  await exhaustRetries(time);
  assert.equal(controller.state().readError, "This chat isn't updating: reading this chat's messages from FluxIQ failed (FluxIQ's answer isn't in a form this panel reads).");
  assert.equal(controller.state().mode, "loading");
});

test("a refused token falls back to Open FluxIQ instead of an error, and stops asking", async () => {
  const core = fakeCore(2);
  core.failNext.set(`${TEST_MESSAGES.panelConversationRead}:list`, REFUSED);
  const controller = await connectedController(core);
  assert.equal(controller.state().mode, "fallback");
  assert.equal(controller.state().fallbackReason, "refused");
  assert.equal(controller.state().readError, undefined, "no \"Couldn't load\" for a refusal that retrying cannot fix");
  const asked = core.sent.length;
  await controller.refresh();
  assert.equal(await controller.send("hello"), false);
  assert.equal(core.sent.length, asked);
});

test("a refused send falls back too, never showing \"Try again\"", async () => {
  const core = fakeCore(1);
  const controller = await connectedController(core);
  core.failNext.set(TEST_MESSAGES.panelConversationSend, REFUSED);
  assert.equal(await controller.send("hello"), false);
  assert.equal(controller.state().mode, "fallback");
  assert.equal(controller.state().sendError, undefined);
});

test("a refused fallback ends when the connection drops and comes back; unsupported does not", async () => {
  const core = fakeCore(2);
  core.failNext.set(`${TEST_MESSAGES.panelConversationRead}:list`, REFUSED);
  const controller = await connectedController(core);
  controller.setConnected(false);
  assert.equal(controller.state().mode, "offline");
  controller.setConnected(true);
  await controller.refresh();
  assert.equal(controller.state().mode, "thread", "paired again: the thread is read");

  const old = fakeCore(2);
  old.failNext.set(`${TEST_MESSAGES.panelConversationRead}:list`, UNSUPPORTED);
  const stuck = await connectedController(old);
  stuck.setConnected(false);
  stuck.setConnected(true);
  await stuck.refresh();
  assert.equal(stuck.state().fallbackReason, "unsupported");
});

test("other relay codes are retried beside the thread, not the fallback", async () => {
  const core = fakeCore(2);
  const time = manualClock();
  const controller = await connectedController(core, time);
  core.failNext.set(`${TEST_MESSAGES.panelConversationRead}:list`, { ok: false, sentence: "Can't reach FluxIQ.", detail: "fetch failed", code: "unreachable" });
  await controller.refresh();
  assert.equal(controller.state().mode, "thread");
  assert.equal(controller.state().fallbackReason, undefined);
  assert.equal(controller.state().readError, undefined);
  assert.deepEqual(time.pending(), [READ_RETRY.delaysMs[0]]);
});

// D10 of the t174 UI review of run-musp8nz1-dbd3905a (00002, moment 2): while
// "Sending your message" showed, the instruction sat in the composer and the
// thread had no bubble for it. The message is in the thread the moment it is
// sent, once; a send that fails keeps it there, saying why (t265 decision 1).
test("a message being sent is in the thread at once, once, and stays saying why if the send fails", async () => {
  const core = fakeCore(2);
  const states: Array<ReturnType<ConversationController["state"]>> = [];
  let controller!: ConversationController;
  controller = controllerOver((message) => core.request(message), () => states.push(controller.state()), manualClock().clock);
  controller.setConnected(true);
  await controller.refresh();
  states.length = 0;
  const sending = controller.send("  Put three hubs in the cart  ");
  const first = controller.state();
  assert.equal(first.sending, true);
  assert.deepEqual(first.turns.map((turn) => [turn.author, turn.text]).at(-1), ["person", "Put three hubs in the cart"], "the person's message is in the thread before FluxIQ has answered");
  assert.equal(await sending, true);
  for (const state of states) {
    const mine = state.turns.filter((turn) => turn.author === "person" && turn.text === "Put three hubs in the cart");
    assert.ok(mine.length <= 1, `never shown twice: ${JSON.stringify(state.turns.map((turn) => turn.turnId))}`);
    assert.equal(mine.length, 1, "and never missing while it is on its way");
  }
  assert.deepEqual(controller.state().turns.map((turn) => turn.text), ["message 1", "message 2", "Put three hubs in the cart", "Working on: Put three hubs in the cart"]);
  assert.ok(!controller.state().turns.some((turn) => turn.turnId.startsWith("local-send:")), "Core's own turn replaced it");

  core.failNext.set(TEST_MESSAGES.panelConversationSend, UNREACHABLE);
  const failing = controller.send("This one fails");
  assert.equal(controller.state().turns.at(-1)?.text, "This one fails");
  assert.equal(await failing, false);
  const failed = controller.state().turns.filter((turn) => turn.text === "This one fails");
  assert.deepEqual(failed.map((turn) => [turn.author, turn.sendError]), [["person", "Couldn't send that. Try again."]], "a message that did not go stays in the thread, once, saying why");
});
