// The strip under a finished answer: an attempt unit files its work after it answers, so Core's
// closing row comes some seconds after the answer turn. While the attempt's record says it ended
// and its rows say it is still filing, the work header is gone; it stays for any other work.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createChatWidget } from "../chat-widget.ts";
import { targetCore } from "../conversation/tests/target-core.ts";
import { createFakeChatResultsPort, fakeTaskOutcomes, fake, withFakeDocument } from "../../testing/index.ts";
import type { ChatOpenControlFactory, ChatResult, ChatTaskOutcome } from "../ports/index.ts";
import { hostStatus } from "./host-status.ts";
import { messageTransport, TEST_ACTIVITY_MESSAGES, type TestMessage } from "./message-transport.ts";

const opener: ChatOpenControlFactory = () => ({ element: document.createElement("a"), observe: () => undefined });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const THREAD = "conv-latest";
const T0 = Date.parse("2026-11-05T08:27:00.000Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();

/** The rows of an attempt unit that has answered but not closed: the opening row, the last step, no final row. */
function attemptState(headline: string) {
  const row = (sequence: number, at: number, phase: string, label: string) => ({ activityId: "build:b1", sequence, subject: { kind: "build", id: "b1", projectId: "project-1", flowId: "flow-7" }, phase, label, at: iso(at) });
  const opened = row(1, 0, "building", "Working on your task");
  const checked = row(2, 38_000, "running", "Checked");
  const display = { activityId: "build:b1", subjectKind: "build", phase: "running", headline, detail: "Checked", step: { index: 11, count: 11 }, working: true, outcome: null, sequence: 2 };
  return { current: checked, display, recent: [opened, checked], history: [opened, checked], overlay: "expanded", live: true };
}

function answered(startedAtMs: number): ChatTaskOutcome {
  const base = fakeTaskOutcomes().rowsChecked;
  return { ...base, attempt: { ...base.attempt, status: "achieved", startedAtMs, endedAtMs: startedAtMs + 38_000 } as ChatTaskOutcome["attempt"] };
}

async function strip(outcome: ChatTaskOutcome, state: unknown): Promise<boolean> {
  let hidden = false;
  await withFakeDocument(async () => {
    const backend = targetCore([{ conversationId: THREAD, subjectKind: "project", subjectId: "project-1", turns: [{ turnId: "l1", author: "person", text: "Save the cheapest tables" }] }]);
    const request = async <T>(message: TestMessage): Promise<ChatResult<T>> => (message.type === TEST_ACTIVITY_MESSAGES.read ? { ok: true, value: { ok: true, state } as T } : backend.request<T>(message));
    const port = createFakeChatResultsPort({ threads: [{ conversationId: THREAD, outcomes: [outcome] }] });
    const chat = createChatWidget({ ...messageTransport(request), results: port }, { openControl: opener });
    try {
      chat.render(hostStatus({ connected: true, projectId: "project-1" }));
      chat.setActive(true);
      for (let turn = 0; turn < 4; turn += 1) await settle();
      hidden = fake(chat.element).byClass("chat-work-header")[0]?.hidden === true;
    } finally {
      chat.setActive(false);
    }
  });
  return hidden;
}

test("an attempt whose answer is in the thread shows no Working strip while its unit files its work", async () => {
  assert.equal(await strip(answered(T0 + 500), attemptState("Working on your task")), true);
});

test("an earlier attempt's ending does not close a new attempt's unit", async () => {
  assert.equal(await strip(answered(T0 - 120_000), attemptState("Working on your task")), false);
});

test("any other work keeps its strip, whatever the thread's last attempt did", async () => {
  assert.equal(await strip(answered(T0 + 500), attemptState("Building your Flow")), false);
});
