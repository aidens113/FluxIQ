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
function attemptState(headline: string, earlier: "none" | "unit before" | "first row aged out" = "none") {
  const row = (sequence: number, at: number, phase: string, label: string, activityId = "build:b1") => ({ activityId, sequence, subject: { kind: "build", id: activityId.slice(6), projectId: "project-1", flowId: "flow-7" }, phase, label, at: iso(at) });
  const opened = row(1, 0, "building", "Working on your task");
  const checked = row(2, 38_000, "running", "Checked");
  // The unit before it, which a restart cut off: its own opening and closing rows, long before this unit's.
  const before = earlier === "unit before" ? [row(1, -90_000, "building", "Working on your task", "build:b0"), { ...row(2, -60_000, "done", "Finished", "build:b0"), final: true }] : [];
  const kept = earlier === "first row aged out" ? [checked] : [opened, checked];
  const display = { activityId: "build:b1", subjectKind: "build", phase: "running", headline, detail: "Checked", step: { index: 11, count: 11 }, working: true, outcome: null, sequence: 2 };
  return { current: checked, display, recent: [...before, ...kept], history: [...before, ...kept], overlay: "expanded", live: true };
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

// The restart run (t869): Core went down between two attempts and the chat carried the attempt on in a
// new unit, so the attempt's own start is older than its unit's first row; its ending is not.
test("an attempt carried on after a restart began before its unit and still closes it", async () => {
  assert.equal(await strip(answered(T0 - 30_000), attemptState("Working on your task", "unit before")), true);
});

test("a unit whose first row has aged out of the rows kept is closed by the attempt that ended in it", async () => {
  assert.equal(await strip(answered(T0 + 1_000), attemptState("Working on your task", "first row aged out")), true);
});

test("the attempt before a restart, ended in the unit before, does not close the unit after it", async () => {
  assert.equal(await strip(answered(T0 - 100_000), attemptState("Working on your task", "unit before")), false);
});
