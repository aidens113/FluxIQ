// The mounted chat, end to end under a fake DOM, for a build as live runs 34
// and 35 showed it (`run-mup2i28c-6c7fc209`, `run-muq05kas-058193f0`): the
// person's instruction was nowhere on screen, and Core's own look before the
// first decision showed as two bare "Looking at the page" headings. Now what
// was asked is the person's message, once, and every step is a message with
// its reason and its action as a card.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatWidget } from "../chat-widget.ts";
import { targetCore } from "../conversation/tests/target-core.ts";
import { fake, withFakeDocument, type FakeElement } from "../../testing/index.ts";
import { hostStatus } from "./host-status.ts";
import { messageTransport, TEST_ACTIVITY_MESSAGES, type TestMessage } from "./message-transport.ts";
import type { ChatOpenControlFactory, ChatResult } from "../ports/index.ts";

const opener: ChatOpenControlFactory = () => ({ element: document.createElement("a"), observe: () => undefined });

const CONNECTED = hostStatus({ connected: true });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const ASKED = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of paper towels to my cart. Do not check out.";
const second = (value: number) => Date.UTC(2026, 9, 1, 12, 0, 0) + value * 1_000;

/** A build that looked at the page itself, decided once, acted, and is still working. */
function buildEvents(): unknown[] {
  const subject = { kind: "build", id: "b1", projectId: "project-1" };
  const event = (sequence: number, fields: Record<string, unknown>) => ({ activityId: "build:b1", sequence, subject, at: new Date(second(sequence)).toISOString(), ...fields });
  return [
    event(1, { phase: "building", label: "Building the Flow", detail: { kind: "step", title: "Build started", status: "started" } }),
    event(2, { phase: "building", label: "Building the Flow", request: ASKED }),
    event(3, { phase: "exploring", label: "Looking at the page", detail: { kind: "note", title: "Looking at the page", status: "started", ref: "core.run_node" } }),
    event(4, { phase: "exploring", label: "Looking at the page — didn't work", detail: { kind: "note", title: "Looking at the page", status: "failed", ref: "core.run_node", text: "Result: web.action.rejected.not_at_start_location · Node: web.output.dom-capture_snapshot" } }),
    event(5, { phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } }),
    event(6, { phase: "exploring", label: "Opening the store", detail: { kind: "thought", title: "Opening the store", text: "The build has to start on the store's home page.", status: "succeeded" } }),
    event(7, { phase: "exploring", label: "Opening the store", detail: { kind: "tool", title: "Opening the store", ref: "core.run_node", status: "started" } }),
    event(8, { phase: "exploring", label: "Opening the store — done", detail: { kind: "tool", title: "Opening the store", ref: "core.run_node", status: "succeeded", text: "Result: web.action.succeeded · Node: web.output.browser-navigate" } })
  ];
}

/** The chat on the latest thread holding `turns`, with the build's activity as the relay hands it over. */
async function mounted(turns: Array<{ turnId: string; author: string; text: string; createdAt: number }>, check: (root: FakeElement) => void): Promise<void> {
  await withFakeDocument(async () => {
    const core = targetCore([{ conversationId: "conv-latest", subjectKind: "project", subjectId: "project-1", turns }]);
    const history = buildEvents();
    const display = { activityId: "build:b1", subjectKind: "build", phase: "exploring", headline: "Building your Flow", detail: "Opening the store", step: null, working: true, outcome: null, sequence: 8 };
    const state = { current: history.at(-1), display, recent: history, history, overlay: "expanded", live: true };
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> =>
      message.type === TEST_ACTIVITY_MESSAGES.read ? { ok: true, value: { ok: true, state } as T } : core.request<T>(message);
    const chat = createChatWidget(messageTransport(request), { openControl: opener });
    try {
      chat.render(CONNECTED);
      chat.setActive(true);
      await settle();
      check(fake(chat.element));
    } finally {
      chat.setActive(false);
    }
  });
}

const bubbles = (root: FakeElement) => root.byClass("chat-msg").filter((message) => message.getAttribute("data-author") === "person").map((message) => message.textContent);

test("a build started outside the chat shows what was asked as the person's message, then each step with its reason and its card", async () => {
  await mounted([], (root) => {
    const stream = root.byClass("chat-stream")[0]!.children.filter((child) => !child.hidden && child.byClass("chat-live").length === 0 && !child.className.includes("chat-live"));
    assert.equal(stream[0]!.getAttribute("data-author"), "person", "the person's message comes first");
    assert.deepEqual(bubbles(root), [ASKED]);
    const steps = root.byClass("chat-step-msg");
    assert.equal(steps.length, 1, "one step: the decision, with its action as a card");
    assert.equal(steps[0]!.byClass("chat-step-title")[0]!.textContent, "Opening the store");
    assert.equal(steps[0]!.byClass("chat-step-text")[0]!.textContent, " — The build has to start on the store's home page.");
    assert.equal(steps[0]!.byClass("chat-card").length, 1);
    // Core's own look before the first decision is not a bare heading, once or twice.
    assert.equal(root.byClass("chat-step-title").filter((title) => title.textContent === "Looking at the page").length, 0);
  });
});

test("a request the person typed into the chat is shown once, as they typed it", async () => {
  await mounted([{ turnId: "p1", author: "person", text: ASKED, createdAt: second(0) }], (root) => {
    assert.deepEqual(bubbles(root), [ASKED]);
  });
});
