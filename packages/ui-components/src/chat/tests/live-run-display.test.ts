// The mounted chat, end to end under a fake DOM, for four display defects the
// chat-driven Lab runs of 2026-10-01 showed:
//
// - U-B1: the welcome screen in the middle of a build, in every chat-driven run
//   (`run-muq3ubys-4b4dbf5b`, `run-muq5vb5w-b50aaab7`, `run-muq6mlom-2ae53681`):
//   the moment a first message's send returned and before its thread was read;
// - U-B2: a chat-started build's stop said twice, by its failed marker and by
//   the chat's answer;
// - U-A1: a press the run failed on read "Done" just above "Run failed"
//   (`run-muq6lqnw-fdfa7aac`);
// - U-A2: a merge step's card read "Action · the page", then "Join paths": a
//   step a person never sees, now not shown at all (t174-w90).

import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatWidget } from "../chat-widget.ts";
import { targetCore, type TargetCore } from "../conversation/tests/target-core.ts";
import { fake, withFakeDocument, type FakeElement } from "../../testing/index.ts";
import { hostStatus } from "./host-status.ts";
import { messageTransport, TEST_MESSAGES, TEST_ACTIVITY_MESSAGES, type TestMessage } from "./message-transport.ts";
import type { ChatOpenControlFactory, ChatResult } from "../ports/index.ts";

const opener: ChatOpenControlFactory = () => ({ element: document.createElement("a"), observe: () => undefined });

const CONNECTED = hostStatus({ connected: true });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const second = (value: number) => Date.UTC(2026, 9, 1, 22, 30, 0) + value * 1_000;
const ASKED = "Find every pair of wireless earbuds under $50, with columns name, price and url.";
const ENDING = "The build stopped at its spending limit of $0.25 before the Flow was finished.";

/** The chat on the latest thread of `core`, with `history` as the relay's activity and `display` as its paced line. */
async function mounted(core: TargetCore, history: unknown[], check: (root: FakeElement) => void | Promise<void>, hold?: { reads: boolean; waiting: Array<() => void> }): Promise<void> {
  await withFakeDocument(async () => {
    const state = { current: history.at(-1) ?? null, display: null, recent: history, history, overlay: "expanded", live: true };
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => {
      if (message.type === TEST_ACTIVITY_MESSAGES.read) return { ok: true, value: { ok: true, state } as T };
      if (hold?.reads && message.type === TEST_MESSAGES.panelConversationRead) await new Promise<void>((resolve) => hold.waiting.push(resolve));
      return core.request<T>(message);
    };
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    try {
      chat.render(CONNECTED);
      chat.setActive(true);
      await settle();
      await check(fake(chat.element));
    } finally {
      chat.setActive(false);
    }
  });
}

const welcome = (root: FakeElement) => root.byClass("chat-empty")[0]!;
const cards = (root: FakeElement) => root.byClass("chat-card").map((card) => ({
  name: card.byClass("chat-card-name")[0]!.textContent,
  target: card.byClass("chat-card-target")[0]!.textContent,
  outcome: card.byClass("chat-card-outcome")[0]!.textContent
}));

test("U-B1: a first message's chat shows what was sent, never the welcome screen, while its thread is read", async () => {
  const core = targetCore([]);
  const hold = { reads: false, waiting: [] as Array<() => void> };
  await mounted(core, [], async (root) => {
    assert.equal(welcome(root).hidden, false, "an empty chat, before anything is sent, welcomes the person");
    hold.reads = true;
    const box = root.descendants().find((element) => element.id === "conversationInput")!;
    box.value = ASKED;
    box.dispatch("input");
    box.dispatch("keydown", { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13, preventDefault: () => undefined });
    for (let turn = 0; turn < 4; turn += 1) await settle();
    // FluxIQ has the message and has answered the send; the read that shows it is still on its way.
    assert.equal(core.sent.filter((message) => message.type === TEST_MESSAGES.panelConversationSend).length, 1);
    assert.ok(hold.waiting.length > 0, "the read after the send is held");
    assert.equal(welcome(root).hidden, true, "never the welcome screen while the message it sent is being read");
    assert.equal(root.byClass("chat-live-headline")[0]!.textContent, "Sending your message");
    hold.reads = false;
    for (const go of hold.waiting.splice(0)) go();
    for (let turn = 0; turn < 4; turn += 1) await settle();
    assert.deepEqual(root.byClass("chat-msg").map((message) => message.textContent), [ASKED]);
    assert.equal(welcome(root).hidden, true);
  }, hold);
});

/** A build that failed, as Core's activity says it; `conversationId` when the chat started it. */
function failedBuild(conversationId: string | undefined): unknown[] {
  const subject = { kind: "build", id: "b1", projectId: "project-1" };
  const event = (sequence: number, fields: Record<string, unknown>) => ({ activityId: "build:b1", sequence, subject, at: new Date(second(sequence)).toISOString(), ...(conversationId === undefined ? {} : { conversationId }), ...fields });
  return [
    event(1, { phase: "building", label: "Building the Flow", detail: { kind: "step", title: "Build started", status: "started" } }),
    event(2, { phase: "exploring", label: "Opening the store", detail: { kind: "thought", title: "Opening the store", text: "The build starts on the store's home page.", status: "succeeded" } }),
    event(3, { phase: "failed", label: "Build stopped: a budget ran out", detail: { kind: "step", title: "Build stopped: a budget ran out", status: "failed", text: ENDING }, final: true })
  ];
}

test("U-B2: a chat-started build's stop is said once, by the chat's answer, and a build started elsewhere still says it", async () => {
  // Core's answer opens with the build's own ending, said once (`conversations/commands/progress.ts`).
  const answer = `${ENDING} What is left: the Flow "Find the kettles", empty, with what you asked saved on it, so it can be built again.`;
  const thread = () => targetCore([{ conversationId: "conv-latest", subjectKind: "project", subjectId: "project-1", turns: [
    { turnId: "t1", author: "person", text: ASKED, createdAt: second(0) },
    { turnId: "t2", author: "automation", text: "Doing \"Create an automation here\".", createdAt: second(0) },
    { turnId: "t3", author: "automation", text: answer, createdAt: second(4) }
  ] }]);
  const saying = (root: FakeElement) => root.descendants().filter((element) => element.children.length === 0 && element.textContent.includes(ENDING)).length;
  await mounted(thread(), failedBuild("conv-latest"), (root) => {
    assert.equal(saying(root), 1, "the ending is said once, by the answer in the thread");
    assert.equal(root.byClass("chat-step-title").some((title) => title.textContent.startsWith("Build stopped")), false);
  });
  await mounted(targetCore([]), failedBuild(undefined), (root) => {
    assert.equal(root.byClass("chat-step-title").some((title) => title.textContent.startsWith("Build stopped")), true, "with no answer in a thread, the marker says how the build ended");
  });
});

/**
 * A run of three steps: a press that worked, a merge, and a press that failed
 * and could not be recovered. `announcedMerge` is a Core from before t174-w88,
 * which announced the merge as a step and opened the recovery with a bare
 * "Recovery started" row; without it, the rows are today's: the merge is not
 * announced, and the row that opens the recovery settles the failed step with
 * its failure's code (`activity/step-recovering.ts` in Core).
 */
function failedRun(announcedMerge = false): unknown[] {
  const subject = { kind: "run", id: "r1", projectId: "project-1" };
  const event = (sequence: number, fields: Record<string, unknown>) => ({ activityId: "run:r1", sequence, subject, at: new Date(second(sequence)).toISOString(), ...fields });
  const step = (sequence: number, index: number, node: string, definition: string, label?: string) => event(sequence, {
    phase: "running",
    label: `Running step ${index} of 4`,
    step: { index, count: 4, nodeId: node, ...(label === undefined ? {} : { label }) },
    detail: { kind: "step", title: label ?? `Step ${index} of 4`, status: "started", ref: node, text: `Node: ${definition}` }
  });
  return [
    event(1, { phase: "running", label: "Run started", detail: { kind: "note", title: "Run started", status: "started", ref: "r1" } }),
    step(2, 1, "n1", "web.output.dom-click", "Reject all"),
    ...(announcedMerge ? [step(3, 2, "n2", "builtin.control.merge")] : []),
    step(4, 3, "n3", "web.output.dom-click", "Set as my store"),
    announcedMerge
      ? event(5, { phase: "repairing", label: "Recovering from a failed step: Set as my store", detail: { kind: "step", title: "Recovery started", status: "started", ref: "n3" } })
      : event(5, { phase: "repairing", label: "Recovering from a failed step: Set as my store", detail: { kind: "step", title: "Set as my store", status: "failed", ref: "n3", text: "Result: web.action.rate_limited · Node: web.output.dom-click" } }),
    event(6, { phase: "repairing", label: "The quick fixes didn't help", detail: { kind: "thought", title: "The quick fixes didn't help", text: "Trying again didn't fix the step.", status: "succeeded", ref: "n3" } }),
    event(7, { phase: "failed", label: "Run failed", detail: { kind: "step", title: "Run failed", status: "failed" }, final: true })
  ];
}

test("U-A1: the step a run failed on reads as failed, with why, and the steps it moved past as done", async () => {
  for (const announcedMerge of [false, true]) {
    await mounted(targetCore([]), failedRun(announcedMerge), (root) => {
      const shown = cards(root);
      const press = shown.find((card) => card.target.includes("Set as my store"))!;
      assert.match(press.outcome, /^Didn't work/u, "the failed press never says Done");
      assert.equal(shown.find((card) => card.target.includes("Reject all"))!.outcome, "Done");
      // D8 (t174-w90): the slow-down a rate-limited press met is said on the card (t378; before, "the page was busy"), from the code on the row that settles it.
      if (!announcedMerge) assert.match(press.outcome, /the site asked FluxIQ to slow down/u);
      if (!announcedMerge) assert.equal(root.byClass("chat-step-title").some((title) => title.textContent.includes("Recovery started") || title.textContent === "Set as my store"), false, "the row that settles the press is no message");
    });
  }
});

test("U-A2: a merge step shows no card, whether or not Core announced it, and no step reads as a bare Action", async () => {
  for (const announcedMerge of [false, true]) {
    await mounted(targetCore([]), failedRun(announcedMerge), (root) => {
      assert.equal(cards(root).some((card) => card.name === "Join paths"), false, `no card for joining the paths, among ${JSON.stringify(cards(root))}`);
      assert.equal(cards(root).some((card) => card.name === "Action"), false, "no step reads as a bare Action");
      assert.equal(cards(root).length, 2, "the two presses, and nothing for the merge");
    });
  }
});

// Round 5's reviewer reported no way to write after a failed build. The
// composer stays: present, enabled, and sending, after a failed or a partial
// ending, in the chat that started the build and in one that did not.
test("after a failed or partial build ending the composer is on screen and takes the next message", async () => {
  const partialAnswer = "I collected 3 of the 5 rows you asked for before the build stopped. Tell me how to carry on.";
  const ended = (text: string) => targetCore([{ conversationId: "conv-latest", subjectKind: "project", subjectId: "project-1", turns: [
    { turnId: "t1", author: "person", text: ASKED, createdAt: second(0) },
    { turnId: "t3", author: "automation", text, createdAt: second(4) }
  ] }]);
  const partialBuild = () => failedBuild("conv-latest").map((event, index, all) => index === all.length - 1
    ? { ...(event as Record<string, unknown>), phase: "done", label: "Build finished in part", detail: { kind: "step", title: "Build finished in part", status: "succeeded", text: partialAnswer } }
    : event);
  for (const [core, history] of [
    [ended(ENDING), failedBuild("conv-latest")],
    [targetCore([]), failedBuild(undefined)],
    [ended(partialAnswer), partialBuild()]
  ] as const) {
    await mounted(core, [...history], async (root) => {
      const dock = root.byClass("chat-dock")[0]!;
      const box = root.descendants().find((element) => element.id === "conversationInput")!;
      const send = root.descendants().find((element) => element.id === "conversationSendButton")!;
      assert.equal(dock.hidden, false, "the dock with the composer is shown");
      assert.equal(root.byClass("chat-fallback")[0]!.hidden, true);
      assert.equal(box.disabled, false, "the box takes typing");
      assert.equal(root.byClass("chat-stop-control")[0]!.hidden, true, "nothing to stop once the build ended");
      box.value = "Try again with the next page too";
      box.dispatch("input");
      assert.equal(send.disabled, false, "and the message can be sent");
      send.dispatch("click");
      for (let turn = 0; turn < 3; turn += 1) await settle();
      assert.equal(core.sent.filter((message) => message.type === TEST_MESSAGES.panelConversationSend).length, 1, "it went");
    });
  }
});
