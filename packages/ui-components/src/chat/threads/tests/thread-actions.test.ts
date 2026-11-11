// New chat, Rename and Delete without a DOM: what each asks Core, one press at
// a time, what a refusal or a thrown request leaves, a new chat Core answered
// with something unreadable, and an answer for an owner the chat no longer has.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createThreadCatalog } from "../../conversation/index.ts";
import type { ChatResult } from "../../ports/index.ts";
import type { ChatTarget } from "../../target.ts";
import { createThreadActions, type ThreadActionPorts } from "../thread-actions.ts";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function record(conversationId: string, projectId = "p1"): Record<string, unknown> {
  return { conversationId, projectId, revision: 1, status: "open", updatedAt: 1, pendingAskCount: 0, title: conversationId, subject: { kind: "flow" } };
}

async function mounted(ports: ThreadActionPorts, target: ChatTarget = { kind: "thread", conversationId: "a", projectId: "p1" }) {
  const opened: ChatTarget[] = [];
  let changes = 0;
  let reads = 0;
  const catalog = createThreadCatalog({
    list: async () => {
      reads += 1;
      return { ok: true, value: { conversations: [record("a"), record("b", "p2")] } };
    },
    projectId: () => undefined,
    changed: () => undefined
  });
  await catalog.read();
  const actions = createThreadActions({
    ports,
    catalog,
    projectId: () => undefined,
    target: () => target,
    open: (next) => opened.push(next),
    changed: () => (changes += 1)
  });
  return { actions, opened, catalog, changes: () => changes, reads: () => reads };
}

test("each press goes to Core with the thread's own project, and the list is read again after", async () => {
  const renamed: unknown[] = [];
  const deleted: unknown[] = [];
  const { actions, reads } = await mounted({
    renameThread: async (request) => {
      renamed.push(request);
      return { ok: true, value: {} };
    },
    deleteThread: async (request) => {
      deleted.push(request);
      return { ok: true, value: { deleted: true } };
    }
  });
  assert.deepEqual(actions.can, { create: false, rename: true, remove: true });
  assert.equal(await actions.create(), false, "no port, no press");
  assert.equal(await actions.rename("b", "  Named  "), true);
  assert.equal(await actions.rename("b", "   "), false, "a blank name is not sent");
  assert.equal(await actions.remove("b"), true);
  assert.deepEqual(renamed, [{ conversationId: "b", title: "Named", projectId: "p2" }]);
  assert.deepEqual(deleted, [{ conversationId: "b", projectId: "p2" }]);
  await settle();
  assert.equal(reads(), 3, "the first read, and one after each press");
});

test("one press at a time: a second press while one is on its way is not sent", async () => {
  let release: ((value: ChatResult<{ deleted?: boolean }>) => void) | undefined;
  let sent = 0;
  const { actions } = await mounted({
    deleteThread: () => {
      sent += 1;
      return new Promise((resolve) => (release = resolve));
    }
  });
  const first = actions.remove("b");
  assert.equal(actions.busy(), true);
  assert.equal(await actions.remove("a"), false);
  release!({ ok: true, value: { deleted: true } });
  assert.equal(await first, true);
  assert.equal(actions.busy(), false);
  assert.equal(sent, 1);
});

test("a refusal, a thrown request and a delete Core did not do each leave a sentence; the next press clears it", async () => {
  let answer: () => Promise<ChatResult<{ deleted?: boolean }>> = async () => ({ ok: false, sentence: "Stop the run first.", code: "conversation_run_active" });
  const { actions, opened, catalog } = await mounted({ deleteThread: () => answer() });
  assert.equal(await actions.remove("a"), false);
  assert.equal(actions.notice(), "Stop the run first.");
  assert.deepEqual(opened, []);
  assert.equal(catalog.threads().length, 2, "a refused delete keeps the thread");
  answer = () => Promise.reject(new Error("socket closed"));
  assert.equal(await actions.remove("a"), false);
  assert.equal(actions.notice(), "Couldn't reach FluxIQ. Try again.");
  answer = async () => ({ ok: true, value: { deleted: false } });
  assert.equal(await actions.remove("a"), false);
  assert.equal(actions.notice(), "That chat wasn't deleted. Try again.");
  answer = async () => ({ ok: true, value: { deleted: true } });
  assert.equal(await actions.remove("b"), true);
  assert.equal(actions.notice(), undefined);
});

test("New chat with no project asks about the panel and opens what Core made; an unreadable answer says so", async () => {
  let answer: unknown = record("fresh", "p9");
  const asked: unknown[] = [];
  const { actions, opened } = await mounted({
    newThread: async (request) => {
      asked.push(request);
      return { ok: true, value: { conversation: answer } };
    }
  });
  assert.equal(await actions.create(), true);
  assert.deepEqual(asked, [{ subjectKind: "panel" }]);
  assert.deepEqual(opened, [{ kind: "thread", conversationId: "fresh", projectId: "p9" }]);
  answer = { id: "fresh" };
  assert.equal(await actions.create(), false);
  assert.equal(actions.notice(), "The new chat was made, but it couldn't be opened. Pick it from the list.");
  assert.equal(opened.length, 1);
});

test("deleting the thread on screen opens the one before it when it was last, and the latest chat when it was alone", async () => {
  const ports: ThreadActionPorts = { deleteThread: async () => ({ ok: true, value: { deleted: true } }) };
  const last = await mounted(ports, { kind: "thread", conversationId: "b", projectId: "p2" });
  await last.actions.remove("b");
  assert.deepEqual(last.opened, [{ kind: "thread", conversationId: "a", projectId: "p1" }]);
  const alone = await mounted(ports, { kind: "thread", conversationId: "a", projectId: "p1" });
  alone.catalog.drop("b");
  await alone.actions.remove("a");
  assert.deepEqual(alone.opened, [{ kind: "latest" }]);
});

test("an answer for an owner the chat no longer has lands nowhere", async () => {
  let release: ((value: ChatResult<{ deleted?: boolean }>) => void) | undefined;
  const { actions, opened, catalog } = await mounted({ deleteThread: () => new Promise((resolve) => (release = resolve)) });
  const pressed = actions.remove("a");
  actions.reset();
  assert.equal(actions.busy(), false);
  release!({ ok: false, sentence: "Too late." });
  assert.equal(await pressed, false);
  assert.equal(actions.notice(), undefined);
  assert.deepEqual(opened, []);
  assert.equal(catalog.threads().length, 2);
});
