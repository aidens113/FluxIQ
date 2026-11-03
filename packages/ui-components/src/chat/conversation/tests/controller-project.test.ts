import assert from "node:assert/strict";
import { test } from "vitest";
import { createConversationController } from "../controller.ts";
import { sameThread } from "../../same-thread.ts";
import type { ChatTarget } from "../../target.ts";
import { manualClock } from "./manual-clock.ts";
import type { ChatConversationPort, ChatResult } from "../../ports/index.ts";

const target = (projectId: string): ChatTarget => ({ kind: "project", projectId });
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** One call the controller made to the conversation port, with the project it was made for. */
type Call = { method: "listThreads" | "readThread" | "send" | "answer"; projectId: string; conversationId?: string | undefined };

const DENIED: ChatResult<never> = { ok: false, sentence: "Synthetic project denied", code: "forbidden" };

/**
 * A fake Core behind the conversation port. The host's own project is "old",
 * the one a request names no project for; a request for "new" is the person
 * scoping the chat to another project.
 */
function fixture() {
  const calls: Call[] = [];
  let denied = false;
  let mismatched = false;
  let mismatchTail = false;
  let missingTail = false;
  let opened = false;
  let release: (() => void) | undefined;
  let holdOld = false;
  const oldTurns = [{ turnId: "old-1", author: "person", text: "old retained task", ask: null }];
  const newTurns = [{ turnId: "new-ask", author: "automation", text: "synthetic question", ask: { askId: "ask-new", kind: "confirm", status: "pending", options: null, answer: null } }];
  const record = (projectId: string) => ({ projectId: mismatched ? "old" : projectId, conversationId: `${projectId}-thread`, revision: 1 });
  const conversation: ChatConversationPort = {
    async listThreads(query) {
      const projectId = query.projectId ?? "old";
      calls.push({ method: "listThreads", projectId });
      if (denied && projectId === "new") {
        return DENIED;
      }
      if (holdOld && projectId === "old") {
        await new Promise<void>(resolve => {
          release = resolve;
        });
      }
      return { ok: true, value: { conversations: projectId === "old" || opened || mismatched ? [record(projectId)] : [] } };
    },
    async readThread(query) {
      calls.push({ method: "readThread", projectId: query.projectId, conversationId: query.conversationId });
      if (denied && query.projectId === "new") {
        return DENIED;
      }
      if (missingTail) {
        return { ok: true, value: { conversation: null } };
      }
      const listed = record(query.projectId);
      const thread = { conversation: { ...listed, projectId: mismatchTail ? "old" : listed.projectId }, turns: query.projectId === "old" ? oldTurns : newTurns, hasMore: false };
      return { ok: true, value: { conversation: thread } };
    },
    async send(message) {
      const projectId = message.projectId ?? "old";
      calls.push({ method: "send", projectId, conversationId: message.conversationId });
      if (denied && projectId === "new") {
        return DENIED;
      }
      opened = true;
      return { ok: true, value: { conversation: record(projectId) } };
    },
    async answer(answer) {
      const projectId = answer.projectId ?? "old";
      calls.push({ method: "answer", projectId });
      if (denied && projectId === "new") {
        return DENIED;
      }
      return { ok: true, value: {} };
    }
  };
  const controller = createConversationController(conversation, () => undefined, manualClock().clock);
  return {
    controller,
    calls,
    oldTurns,
    missingTail: () => {
      missingTail = true;
      opened = true;
    },
    existingNew: () => {
      opened = true;
    },
    deny: () => {
      denied = true;
    },
    mismatch: () => {
      mismatched = true;
    },
    mismatchTail: () => {
      mismatchTail = true;
      opened = true;
    },
    holdOld: () => {
      holdOld = true;
    },
    release: () => release?.()
  };
}

test("different project targets are different threads while legacy latest remains the same", () => {
  assert.equal(sameThread(target("old"), target("new")), false);
  assert.equal(sameThread(target("new"), target("new")), true);
  assert.equal(sameThread(target("new"), { kind: "latest" }), false);
  assert.equal(sameThread({ kind: "latest" }, { kind: "latest" }), true);
});

test("authorized empty new-project read clears old thread and first Send opens only new scope", async () => {
  const f = fixture();
  f.controller.setConnected(true);
  await f.controller.refresh();
  assert.equal(f.controller.state().conversationId, "old-thread");
  f.controller.setTarget(target("new"));
  await f.controller.refresh();
  assert.equal(f.controller.state().scopeState, "ready");
  assert.equal(f.controller.state().projectId, "new");
  assert.equal(f.controller.state().conversationId, undefined);
  assert.deepEqual(f.controller.state().turns, []);
  assert.equal(await f.controller.send("new independent task"), true);
  const writes = f.calls.filter(c => c.method === "send");
  assert.deepEqual(writes.map(c => c.projectId), ["new"]);
  assert.equal(writes[0]!.conversationId, undefined, "a first message opens its thread");
  assert.deepEqual(f.oldTurns, [{ turnId: "old-1", author: "person", text: "old retained task", ask: null }]);
});

test("late old-project list cannot publish new-project readiness or restore old thread", async () => {
  const f = fixture();
  f.holdOld();
  f.controller.setConnected(true);
  await settle();
  f.controller.setTarget(target("new"));
  assert.equal(f.controller.state().scopeState, "loading");
  assert.equal(await f.controller.send("must wait"), false);
  f.release();
  await f.controller.refresh();
  assert.equal(f.controller.state().scopeState, "ready");
  assert.equal(f.controller.state().projectId, "new");
  assert.equal(f.controller.state().conversationId, undefined);
});

test("denied or mismatched scoped list blocks Send instead of using old conversation", async () => {
  for (const change of ["deny", "mismatch"] as const) {
    const f = fixture();
    f.controller.setTarget(target("new"));
    f[change]();
    f.controller.setConnected(true);
    await f.controller.refresh();
    assert.equal(f.controller.state().scopeState, "error");
    assert.equal(await f.controller.send("must not send"), false);
    assert.equal(f.calls.some(c => c.method === "send"), false);
  }
});

test("mismatched get-conversation project cannot become ready after a valid list", async () => {
  const f = fixture();
  f.mismatchTail();
  f.controller.setTarget(target("new"));
  f.controller.setConnected(true);
  await f.controller.refresh();
  assert.equal(f.controller.state().scopeState, "error");
  assert.equal(await f.controller.send("must not send"), false);
});

test("scoped existing thread read and permission answer retain actual selected project", async () => {
  const f = fixture();
  f.existingNew();
  f.controller.setTarget(target("new"));
  f.controller.setConnected(true);
  await f.controller.refresh();
  assert.equal(f.controller.state().scopeState, "ready");
  assert.equal(f.controller.state().conversationId, "new-thread");
  await f.controller.answer("ask-new", "grant");
  assert.equal(f.calls.find(c => c.method === "answer")?.projectId, "new");
  assert.ok(f.calls.every(c => c.projectId === "new"));
});

test("listed thread vanishing during get is not an authorized empty-list readiness", async () => {
  const f = fixture();
  f.missingTail();
  f.controller.setTarget(target("new"));
  f.controller.setConnected(true);
  await f.controller.refresh();
  assert.equal(f.controller.state().scopeState, "error");
  assert.equal(await f.controller.send("must not send"), false);
});
