// Switching between the latest chat and an automation's chat: each target
// reads its own thread, sending goes to the thread on screen (an
// automation's first message opens that automation's thread, with its
// subject and name), and a read still on its way for the thread the person
// left never lands on the one they moved to.

import assert from "node:assert/strict";
import { test } from "vitest";
import { controllerOver } from "./controller-over.ts";
import { threadListRequest, threadSendRequest } from "../thread-requests.ts";
import { targetCore } from "./target-core.ts";
import { TEST_MESSAGES } from "../../tests/message-transport.ts";

const AUTOMATION = { kind: "automation", flowId: "flow-7", name: "Price tracker" } as const;

function twoThreads() {
  return targetCore([
    { conversationId: "conv-flow", subjectKind: "flow", subjectId: "flow-7", turns: [{ turnId: "f1", author: "automation", text: "Price tracker is ready." }] },
    { conversationId: "conv-latest", subjectKind: "project", subjectId: "project-1", turns: [{ turnId: "l1", author: "person", text: "Find cheap lamps" }] }
  ]);
}

async function connected(core: ReturnType<typeof targetCore>) {
  const controller = controllerOver((message) => core.request(message), () => undefined);
  controller.setConnected(true);
  await controller.refresh();
  return controller;
}

const texts = (controller: { state(): { turns: readonly { text: string }[] } }) => controller.state().turns.map((turn) => turn.text);

test("latest -> automation -> latest: each shows its own thread, found by its subject", async () => {
  const core = twoThreads();
  const controller = await connected(core);
  assert.deepEqual(texts(controller), ["Find cheap lamps"]);
  assert.equal(controller.state().conversationId, "conv-latest");

  controller.setTarget(AUTOMATION);
  assert.equal(controller.state().mode, "loading", "the old thread is gone at once");
  assert.deepEqual(controller.state().turns, []);
  await controller.refresh();
  assert.deepEqual(texts(controller), ["Price tracker is ready."]);
  const list = core.sent.filter((message) => message.kind === "list").at(-1);
  assert.deepEqual(list, { type: TEST_MESSAGES.panelConversationRead, kind: "list", status: "open", limit: 1, subjectKind: "flow", subjectId: "flow-7" });

  controller.setTarget({ kind: "latest" });
  await controller.refresh();
  assert.deepEqual(texts(controller), ["Find cheap lamps"]);
});

test("sending goes to the thread on screen, and an automation's message says the Flow is on screen", async () => {
  const core = twoThreads();
  const controller = await connected(core);
  controller.setTarget(AUTOMATION);
  await controller.refresh();
  assert.equal(await controller.send("Run it now"), true);
  const sent = core.sent.filter((message) => message.type === TEST_MESSAGES.panelConversationSend).at(-1);
  assert.equal(sent?.conversationId, "conv-flow");
  assert.deepEqual(sent?.onScreen, { flowId: "flow-7" });
  assert.deepEqual(core.thread("conv-flow")?.turns.map((turn) => turn.text), ["Price tracker is ready.", "Run it now"]);
  assert.deepEqual(core.thread("conv-latest")?.turns.map((turn) => turn.text), ["Find cheap lamps"], "the latest thread is untouched");

  // Before t191-thread, "Latest chat" was the most recently touched thread of
  // any kind, so here it showed the automation's thread the person had just left.
  controller.setTarget({ kind: "latest" });
  await controller.refresh();
  assert.deepEqual(texts(controller), ["Find cheap lamps"], "the latest chat is the project's own thread, not the automation just used");
  assert.equal(controller.state().conversationId, "conv-latest");
});

test("the latest chat never shows a run's or a build's thread, however recently it was touched", async () => {
  const core = targetCore([
    { conversationId: "conv-latest", subjectKind: "project", subjectId: "project-1", turns: [{ turnId: "l1", author: "person", text: "Find cheap lamps" }] },
    { conversationId: "conv-run", subjectKind: "run", subjectId: "run-3", turns: [{ turnId: "r1", author: "automation", text: "Checked the result." }] }
  ]);
  const controller = await connected(core);
  assert.deepEqual(texts(controller), ["Find cheap lamps"]);
  assert.equal(await controller.send("Now only the brass ones"), true);
  assert.deepEqual(core.thread("conv-latest")?.turns.map((turn) => turn.text), ["Find cheap lamps", "Now only the brass ones"]);
});

test("an automation with no thread yet is empty, and its first message opens one about it", async () => {
  const core = targetCore([{ conversationId: "conv-latest", subjectKind: "project", subjectId: "project-1", turns: [{ turnId: "l1", author: "person", text: "Hi" }] }]);
  const controller = await connected(core);
  controller.setTarget({ kind: "automation", flowId: "flow-9", name: "Job alerts" });
  await controller.refresh();
  assert.equal(controller.state().mode, "empty");
  assert.equal(await controller.send("What does this do?"), true);
  const sent = core.sent.find((message) => message.type === TEST_MESSAGES.panelConversationSend);
  assert.equal(sent?.conversationId, undefined);
  assert.deepEqual([sent?.subjectKind, sent?.subjectId, sent?.title], ["flow", "flow-9", "Job alerts"]);
  assert.equal(controller.state().conversationId, "conv-2");
  assert.deepEqual(texts(controller), ["What does this do?"]);
});

test("a read on its way for the thread the person left never lands on the one they moved to", async () => {
  const core = twoThreads();
  const controller = controllerOver((message) => core.request(message), () => undefined);
  core.hold = true;
  controller.setConnected(true);
  const first = controller.refresh();
  await Promise.resolve();
  controller.setTarget(AUTOMATION);
  core.hold = false;
  core.release();
  await first;
  await controller.refresh();
  assert.deepEqual(texts(controller), ["Price tracker is ready."]);
  assert.equal(controller.state().conversationId, "conv-flow");
});

test("the requests follow the target: the project's or the Flow's subject to find a thread, a subject only to open one, the Flow on screen for every message", () => {
  assert.deepEqual(threadListRequest({ kind: "latest" }), { status: "open", limit: 1, subjectKind: "project" });
  const latestSend = threadSendRequest({ kind: "latest" }, { conversationId: "c", projectId: "p" }, "hi");
  assert.deepEqual(latestSend, { text: "hi", conversationId: "c", projectId: "p" });
  const later = threadSendRequest(AUTOMATION, { conversationId: "c", projectId: "p" }, "hi");
  assert.equal(later.subjectKind, undefined, "an open thread needs no subject");
  assert.deepEqual(later.onScreen, { flowId: "flow-7" });
});

test("the same automation under a new name keeps the thread on screen", async () => {
  const core = twoThreads();
  const controller = await connected(core);
  controller.setTarget(AUTOMATION);
  await controller.refresh();
  const reads = core.sent.length;
  controller.setTarget({ ...AUTOMATION, name: "Price tracker (EU)" });
  assert.deepEqual(texts(controller), ["Price tracker is ready."]);
  assert.equal(core.sent.length, reads, "nothing is read again");
});

test("a question's thread is found by the subject Core asked in, and a message there says which Flow or run is on screen", () => {
  const run = { kind: "question", activityId: "run:r1", subjectKind: "run", subjectId: "r1", title: "The run's question" } as const;
  const build = { kind: "question", activityId: "build:b1", subjectKind: "flow", subjectId: "flow-7", title: "The build's question" } as const;
  assert.deepEqual(threadListRequest(run), { status: "open", limit: 1, subjectKind: "run", subjectId: "r1" });
  assert.equal(threadListRequest(build).subjectKind, "flow");
  assert.equal(threadListRequest(build).subjectId, "flow-7");
  const shown = threadSendRequest(run, { conversationId: "c", projectId: "p" }, "Done, carry on");
  assert.equal(shown.subjectKind, undefined, "an open thread needs no subject");
  assert.deepEqual(shown.onScreen, { runId: "r1" });
  assert.deepEqual(threadSendRequest(build, undefined, "hi").onScreen, { flowId: "flow-7" });
  assert.equal(threadSendRequest(build, undefined, "hi").subjectId, "flow-7");
});

test("a question from the same Flow's thread keeps what is on screen; one from another subject reads its own", async () => {
  const core = twoThreads();
  const controller = await connected(core);
  controller.setTarget({ kind: "question", activityId: "build:b1", subjectKind: "flow", subjectId: "flow-7", title: "The build's question" });
  await controller.refresh();
  assert.deepEqual(texts(controller), ["Price tracker is ready."]);
  const reads = core.sent.length;
  controller.setTarget({ kind: "question", activityId: "build:b2", subjectKind: "flow", subjectId: "flow-7", title: "The build's question" });
  assert.equal(core.sent.length, reads, "the same thread: nothing is read again");
  controller.setTarget({ kind: "question", activityId: "run:r1", subjectKind: "run", subjectId: "r1", title: "The run's question" });
  assert.deepEqual(texts(controller), [], "another thread: the last one's turns are gone at once");
});
