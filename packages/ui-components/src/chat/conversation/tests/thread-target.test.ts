// A chosen thread (`kind: "thread"`) end to end through the controller: read
// directly by its id, written to with its own project, with the history
// window, the count of earlier turns, a quiet chat and a latest chat with
// nowhere to look; and the requests that name where a message goes.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createConversationController } from "../controller.ts";
import { threadSendRequest } from "../thread-requests.ts";
import { readThreadTail, ALL_TURNS } from "../thread-tail.ts";
import { thread, threadsCore } from "../../tests/threads-core.ts";
import type { ChatTarget } from "../../target.ts";
import type { ConversationReach } from "../controller.ts";

const THREAD: ChatTarget = { kind: "thread", conversationId: "far", projectId: "project-9" };

/** A controller aimed at `target` before it connects, so nothing is read for the target it started with. */
function controllerOver(core: ReturnType<typeof threadsCore>, reach: ConversationReach = {}, target: ChatTarget = THREAD) {
  const controller = createConversationController(core.transport().conversation, () => undefined, undefined, reach);
  controller.setTarget(target);
  controller.setConnected(true);
  return controller;
}

test("a message to a chosen thread names the thread and its own project, with or without a thread read", () => {
  assert.deepEqual(threadSendRequest(THREAD, undefined, "Hello"), { text: "Hello", conversationId: "far", projectId: "project-9" });
  assert.deepEqual(threadSendRequest(THREAD, { conversationId: "far", projectId: "project-9" }, "Hello", "rec-1"), {
    text: "Hello",
    conversationId: "far",
    projectId: "project-9",
    onScreen: { recordingId: "rec-1" }
  });
});

test("a chosen thread is read by its id, never found by listing, and read again every time", async () => {
  const core = threadsCore([thread("far", { projectId: "project-9" }, 2)]);
  const controller = controllerOver(core);
  controller.setTarget(THREAD);
  await controller.refresh();
  assert.deepEqual(core.calls.list, []);
  assert.deepEqual(controller.state().turns.map((turn) => turn.text), ["far turn 1", "far turn 2"]);
  assert.equal(controller.state().conversationId, "far");
  assert.equal(controller.state().projectId, "project-9");
  assert.equal(controller.state().scopeState, "ready");
  const reads = core.calls.read.length;
  await controller.refresh();
  assert.ok(core.calls.read.length > reads, "no list gives a revision here, so the thread is read again");
  assert.ok(core.calls.read.every((query) => query.projectId === "project-9" && query.conversationId === "far"));
});

test("a thread that does not exist is a failed read, not an empty chat", async () => {
  const core = threadsCore([]);
  const controller = controllerOver(core);
  controller.setTarget(THREAD);
  await controller.refresh();
  assert.equal(controller.state().scopeState, "error");
  assert.equal(controller.state().mode, "loading");
});

test("sending into a chosen thread uses the thread's project", async () => {
  const core = threadsCore([thread("far", { projectId: "project-9" }, 1)]);
  const controller = controllerOver(core);
  controller.setTarget(THREAD);
  await controller.refresh();
  assert.equal(await controller.send("Hello"), true);
  assert.deepEqual(core.calls.send, [{ text: "Hello", conversationId: "far", projectId: "project-9" }]);
  assert.deepEqual(controller.state().turns.map((turn) => turn.text), ["far turn 1", "Hello"]);
});

test("the same thread is not a new target, and another thread is", async () => {
  const core = threadsCore([thread("far", { projectId: "project-9" }, 1), thread("near", { projectId: "project-9" }, 1)]);
  const controller = controllerOver(core);
  controller.setTarget(THREAD);
  await controller.refresh();
  controller.setTarget({ ...THREAD });
  assert.equal(controller.state().turns.length, 1, "the same thread keeps what is on screen");
  controller.setTarget({ kind: "thread", conversationId: "near", projectId: "project-9" });
  assert.deepEqual(controller.state().turns, [], "another thread forgets at once");
});

test("a window keeps the newest turns, counts the rest, and every turn can be asked for", async () => {
  const core = threadsCore([thread("far", { projectId: "project-9" }, 30)]);
  const controller = controllerOver(core, { window: 8 });
  controller.setTarget(THREAD);
  await controller.refresh();
  assert.equal(controller.state().turns.length, 8);
  assert.equal(controller.state().earlierTurns, true);
  assert.equal(controller.state().earlierCount, 22);
  core.threads[0]!.turns.push({ turnId: "far-t31", author: "person", text: "new" });
  await controller.refresh();
  assert.equal(controller.state().turns.length, 8);
  assert.equal(controller.state().earlierCount, 23, "a new turn pushes one more off the top");
  await controller.showEarlier();
  assert.equal(controller.state().turns.length, 31);
  assert.equal(controller.state().earlierTurns, false);
  assert.equal(controller.state().earlierCount, undefined);
  core.threads[0]!.turns.push({ turnId: "far-t32", author: "automation", text: "newer" });
  await controller.refresh();
  assert.equal(controller.state().turns.length, 32, "once asked for, every turn stays");
});

test("a short thread has no earlier turns, and asking for them reads nothing", async () => {
  const core = threadsCore([thread("far", { projectId: "project-9" }, 3)]);
  const controller = controllerOver(core, { window: 8 });
  controller.setTarget(THREAD);
  await controller.refresh();
  assert.equal(controller.state().earlierTurns, false);
  const reads = core.calls.read.length;
  await controller.showEarlier();
  assert.equal(core.calls.read.length, reads);
});

test("reading every turn takes bounded pages from the start and counts nothing off the top", async () => {
  const core = threadsCore([thread("far", { projectId: "project-9" }, 130)]);
  const read = core.transport().conversation.readThread;
  const all = await readThreadTail(read, { conversationId: "far", projectId: "project-9", anchorTurnId: undefined, window: ALL_TURNS });
  assert.equal(all.ok && all.value.turns.length, 130);
  assert.equal(all.ok && all.value.complete, true);
  assert.equal(all.ok && all.value.earlier, 0);
  const tail = await readThreadTail(read, { conversationId: "far", projectId: "project-9", anchorTurnId: undefined, window: 10 });
  assert.equal(tail.ok && tail.value.turns.length, 10);
  assert.equal(tail.ok && tail.value.earlier, 120);
  assert.equal(tail.ok && tail.value.anchorTurnId, "far-t120");
});

test("a read from an anchor with an unknown count stays unknown", async () => {
  const core = threadsCore([thread("far", { projectId: "project-9" }, 30)]);
  const read = core.transport().conversation.readThread;
  const tail = await readThreadTail(read, { conversationId: "far", projectId: "project-9", anchorTurnId: "far-t25", window: 3 });
  assert.equal(tail.ok && tail.value.earlier, undefined);
  const known = await readThreadTail(read, { conversationId: "far", projectId: "project-9", anchorTurnId: "far-t25", window: 3, earlier: 25 });
  assert.equal(known.ok && known.value.earlier, 27);
});

test("a quiet chat reads nothing until it is asked for again", async () => {
  const core = threadsCore([thread("far", { projectId: "project-9" }, 1)]);
  let quiet = true;
  const controller = controllerOver(core, { quiet: () => quiet });
  controller.setTarget(THREAD);
  await controller.refresh();
  assert.deepEqual(core.calls.read, []);
  quiet = false;
  await controller.refresh();
  assert.equal(controller.state().turns.length, 1);
});

test("a latest chat with no project waits for the thread list, and is empty once it holds no thread, without listing", async () => {
  const core = threadsCore([]);
  let known: "waiting" | "empty" | undefined = "waiting";
  const controller = controllerOver(core, { withoutProject: () => known }, { kind: "latest" });
  await controller.refresh();
  assert.equal(controller.state().mode, "loading");
  known = "empty";
  await controller.refresh();
  assert.equal(controller.state().mode, "empty");
  assert.deepEqual(core.calls.list, []);
  known = undefined;
  await controller.refresh();
  assert.equal(core.calls.list.length, 1, "with a way to look, the project's thread is listed as ever");
});

test("a latest chat with a project is listed as ever, whatever the host answers about having none", async () => {
  const core = threadsCore([thread("flow-thread", { subjectKind: "project", projectId: "project-1" }, 1)]);
  const controller = controllerOver(core, { withoutProject: () => "empty" }, { kind: "latest", projectId: "project-1" });
  await controller.refresh();
  assert.equal(controller.state().turns.length, 1);
  assert.ok(core.calls.list.length >= 1);
});
