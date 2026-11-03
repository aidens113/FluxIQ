// Which thread the chat opens by itself, and the catalog that reads the list.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatResult, ChatThreadCatalogQuery } from "../../../ports/index.ts";
import type { ChatTarget } from "../../../target.ts";
import { createThreadCatalog } from "../catalog.ts";
import { threadToSelect } from "../choose.ts";
import type { ChatThreadSummary } from "../summary.ts";

function summary(conversationId: string, fields: Partial<ChatThreadSummary> = {}): ChatThreadSummary {
  return { conversationId, projectId: "p1", revision: 1, status: "open", updatedAt: 1000, pendingAskCount: 0, title: null, subject: { kind: "flow" }, ...fields };
}

const LIST = [summary("first"), summary("second")];

test("a latest chat gives way to the restored thread when listed, else the first of the list", () => {
  const latest: ChatTarget = { kind: "latest" };
  assert.equal(threadToSelect(latest, LIST, "second")?.conversationId, "second");
  assert.equal(threadToSelect(latest, LIST, "gone")?.conversationId, "first");
  assert.equal(threadToSelect(latest, LIST, undefined)?.conversationId, "first");
  assert.equal(threadToSelect({ kind: "latest", projectId: "p1" }, LIST, undefined)?.conversationId, "first");
  assert.equal(threadToSelect(latest, [], "second"), undefined, "no thread: stays latest");
});

test("a thread, an automation or a question is never taken from the person", () => {
  assert.equal(threadToSelect({ kind: "thread", conversationId: "second", projectId: "p1" }, LIST, undefined), undefined);
  assert.equal(threadToSelect({ kind: "automation", flowId: "f", name: "Price tracker" }, LIST, undefined), undefined);
  assert.equal(threadToSelect({ kind: "question", activityId: "a", subjectKind: "run", subjectId: "r", title: "The run's question" }, LIST, undefined), undefined);
  assert.equal(threadToSelect({ kind: "project", projectId: "p1" }, LIST, undefined), undefined);
});

function record(conversationId: string, pending = 0): Record<string, unknown> {
  return { conversationId, projectId: "p1", revision: 1, status: "open", updatedAt: 1, pendingAskCount: pending, title: null, subject: { kind: "flow" } };
}

type Answer = () => ChatResult<{ conversations?: unknown }>;

function catalogOver(answers: Answer[], projectId?: string) {
  const queries: ChatThreadCatalogQuery[] = [];
  let changed = 0;
  const catalog = createThreadCatalog({
    list: async (query) => {
      queries.push(query);
      const answer = answers.shift() ?? answers[answers.length - 1];
      return answer!();
    },
    projectId: () => projectId,
    changed: () => (changed += 1)
  });
  return { catalog, queries, changed: () => changed };
}

const ok = (...records: unknown[]): Answer => () => ({ ok: true, value: { conversations: records } });

test("the catalog reads every thread, or the open project's, 25 at a time, and holds them in list order", async () => {
  const spanning = catalogOver([ok(record("old"), record("waiting", 2))]);
  assert.equal(spanning.catalog.loaded(), false);
  await spanning.catalog.read();
  assert.deepEqual(spanning.queries, [{ limit: 25 }]);
  assert.deepEqual(spanning.catalog.threads().map((thread) => thread.conversationId), ["waiting", "old"]);
  assert.equal(spanning.catalog.loaded(), true);
  const scoped = catalogOver([ok()], "project-9");
  await scoped.catalog.read();
  assert.deepEqual(scoped.queries, [{ projectId: "project-9", limit: 25 }]);
});

test("the catalog speaks only when the list changed or was first read", async () => {
  const run = catalogOver([ok(record("a")), ok(record("a")), ok(record("a"), record("b"))]);
  await run.catalog.read();
  assert.equal(run.changed(), 1);
  await run.catalog.read();
  assert.equal(run.changed(), 1, "the same list says nothing");
  await run.catalog.read();
  assert.equal(run.changed(), 2);
});

test("a failed or unreadable read keeps the list held, and the next read carries on", async () => {
  const run = catalogOver([ok(record("a")), () => ({ ok: false, sentence: "down" }), () => ({ ok: true, value: { conversations: "text" } }), ok(record("a"), record("b"))]);
  await run.catalog.read();
  await run.catalog.read();
  await run.catalog.read();
  assert.deepEqual(run.catalog.threads().map((thread) => thread.conversationId), ["a"]);
  await run.catalog.read();
  assert.deepEqual(run.catalog.threads().length, 2);
});

test("a first read that fails still says it was read, so no thread can be told from not read yet", async () => {
  const run = catalogOver([() => ({ ok: false, sentence: "down" })]);
  await run.catalog.read();
  assert.equal(run.catalog.loaded(), true);
  assert.deepEqual(run.catalog.threads(), []);
  assert.equal(run.changed(), 1);
});

test("a read asked for during a read waits for it and then reads once more", async () => {
  const run = catalogOver([ok(record("a")), ok(record("a"), record("b"))]);
  const first = run.catalog.read();
  const second = run.catalog.read();
  await Promise.all([first, second]);
  assert.equal(run.queries.length, 2);
  assert.equal(run.catalog.threads().length, 2);
});

test("forgetting drops the list and a read on its way", async () => {
  let release: (() => void) | undefined;
  const queries: number[] = [];
  const catalog = createThreadCatalog({
    list: async () => {
      queries.push(1);
      await new Promise<void>((resolve) => (release = resolve));
      return { ok: true, value: { conversations: [record("late")] } };
    },
    projectId: () => undefined,
    changed: () => undefined
  });
  const reading = catalog.read();
  catalog.forget();
  release?.();
  await reading;
  assert.deepEqual(catalog.threads(), []);
  assert.equal(catalog.loaded(), false);
  const again = catalog.read();
  await Promise.resolve();
  release?.();
  await again;
  assert.deepEqual(catalog.threads().map((thread) => thread.conversationId), ["late"]);
  assert.equal(queries.length, 2);
});

test("a list call that throws is a failed read", async () => {
  const catalog = createThreadCatalog({ list: () => Promise.reject(new Error("boom")), projectId: () => undefined, changed: () => undefined });
  await catalog.read();
  assert.equal(catalog.loaded(), true);
  assert.deepEqual(catalog.threads(), []);
});
