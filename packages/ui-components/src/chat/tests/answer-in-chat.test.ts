// The answer turn and the work header, in the mounted chat: a thread whose attempt
// reached a result shows its answer turn from the results port; a working attempt's
// spend and budget reach the header above the composer; a client with no port shows
// no answer and no cost.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatWidget } from "../chat-widget.ts";
import { targetCore } from "../conversation/tests/target-core.ts";
import { createFakeChatResultsPort, fakeTaskOutcomes } from "../../testing/index.ts";
import { fake, withFakeDocument } from "../../testing/index.ts";
import type { ChatOpenControlFactory, ChatResult, ChatTaskOutcome } from "../ports/index.ts";
import { hostStatus } from "./host-status.ts";
import { messageTransport, TEST_ACTIVITY_MESSAGES, type TestMessage } from "./message-transport.ts";

const opener: ChatOpenControlFactory = () => ({ element: document.createElement("a"), observe: () => undefined });
const CONNECTED = hostStatus({ connected: true, projectId: "project-1" });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const THREAD = "conv-latest";

function core() {
  return targetCore([{ conversationId: THREAD, subjectKind: "project", subjectId: "project-1", turns: [{ turnId: "l1", author: "person", text: "Find cheap lamps" }] }]);
}

async function mounted(outcomes: readonly ChatTaskOutcome[], results: boolean, run: (root: ReturnType<typeof fake>) => void | Promise<void>, port = createFakeChatResultsPort({ threads: [{ conversationId: THREAD, outcomes }] }), state?: unknown): Promise<void> {
  await withFakeDocument(async () => {
    const backend = core();
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> =>
      state !== undefined && message.type === TEST_ACTIVITY_MESSAGES.read ? { ok: true, value: { ok: true, state } as T } : backend.request<T>(message);
    const chat = createChatWidget({ ...messageTransport(request), ...(results ? { results: port } : {}) }, { openControl: opener });
    try {
      chat.render(CONNECTED);
      chat.setActive(true);
      for (let turn = 0; turn < 4; turn += 1) await settle();
      await run(fake(chat.element));
    } finally {
      chat.setActive(false);
    }
  });
}

test("a result the results port holds is drawn as an answer turn in the thread, and no live line is", async () => {
  await mounted([fakeTaskOutcomes().rowsChecked], true, (root) => {
    assert.equal(root.byClass("answer-headline")[0]?.textContent, "Found 10 of 10");
    assert.equal(root.byClass("chat-live").length, 0, "the live status is the work header");
  });
});

test("a client with no results port shows no answer turn", async () => {
  await mounted([fakeTaskOutcomes().rowsChecked], false, (root) => {
    assert.equal(root.byClass("answer-headline").length, 0);
  });
});

test("a working attempt's spend and budget reach the header; a port that reports no spend gives no cost", async () => {
  const working: ChatTaskOutcome = {
    attempt: { ...fakeTaskOutcomes().rowsChecked.attempt, status: "working", attemptId: "attempt-live", spend: { calls: 3, inputTokens: 1, outputTokens: 1, usd: 0.34, ms: 1000 }, budget: { usd: 5 } }
  };
  delete (working.attempt as { endedAtMs?: number }).endedAtMs;
  const at = new Date().toISOString();
  const current = { activityId: "run:r1", sequence: 5, subject: { kind: "run", id: "r1", projectId: "project-1", flowId: "flow-7" }, phase: "exploring", label: "Looking", at };
  const display = { activityId: "run:r1", subjectKind: "run", phase: "exploring", headline: "Working", detail: null, step: null, working: true, outcome: null, sequence: 5 };
  const state = { current, display, recent: [current], overlay: "expanded", live: true };
  await mounted([working], true, (root) => {
    assert.equal(root.byClass("chat-work-header")[0]?.hidden, false);
    assert.equal(root.byClass("chat-work-cost")[0]?.textContent, "$0.34 of $5.00");
  }, undefined, state);
  await mounted([working], true, (root) => {
    assert.equal(root.byClass("chat-work-cost")[0]?.textContent ?? "", "", "no real spend, no cost");
  }, createFakeChatResultsPort({ threads: [{ conversationId: THREAD, outcomes: [working] }], reportsSpend: false }), state);
});
