// The conversation list's rows and search, the time in words, and the
// catalog's older pages and deleted threads.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createThreadCatalog } from "../catalog.ts";
import { filterThreadRows } from "../filter.ts";
import { threadRows } from "../rows.ts";
import type { ChatThreadSummary } from "../summary.ts";
import { threadWhen } from "../when.ts";

const NOW = new Date(2026, 10, 10, 15, 30).getTime();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function summary(conversationId: string, fields: Partial<ChatThreadSummary> = {}): ChatThreadSummary {
  return { conversationId, projectId: "p1", revision: 1, status: "open", updatedAt: NOW, pendingAskCount: 0, title: null, subject: { kind: "flow" }, ...fields };
}

function record(conversationId: string, updatedAt: number): Record<string, unknown> {
  return { conversationId, projectId: "p1", revision: 1, status: "open", updatedAt, pendingAskCount: 0, title: conversationId, subject: { kind: "flow" } };
}

test("a thread's time reads in words, by the local calendar, and its full day is kept", () => {
  const words = (at: number) => threadWhen(at, NOW).when;
  assert.equal(words(NOW - 20_000), "just now");
  assert.equal(words(NOW + 5 * MINUTE), "just now", "a clock ahead of this one is not the future");
  assert.equal(words(NOW - 5 * MINUTE), "5 min ago");
  assert.equal(words(NOW - 3 * HOUR - 10 * MINUTE), "3 h ago");
  assert.equal(words(new Date(2026, 10, 9, 23, 0).getTime()), "yesterday");
  assert.equal(words(new Date(2026, 10, 6, 9, 0).getTime()), "4 days ago");
  assert.equal(words(new Date(2026, 9, 3, 9, 0).getTime()), "Oct 3");
  assert.equal(words(new Date(2025, 11, 30, 9, 0).getTime()), "Dec 30, 2025");
  assert.equal(threadWhen(new Date(2026, 9, 3, 9, 0).getTime(), NOW).date, "October 3, 2026");
});

test("rows carry the name, never an id, the time, the waiting mark and the thread on screen", () => {
  const rows = threadRows([
    summary("820f86f0-ba20-4cde-9a41-0123456789ab", { title: null, pendingAskCount: 2 }),
    summary("b", { title: "Weekly prices", updatedAt: NOW - 2 * HOUR })
  ], "b", NOW);
  assert.deepEqual(rows.map((row) => [row.label, row.when, row.waiting, row.selected]), [["This Flow", "just now", true, false], ["Weekly prices", "2 h ago", false, true]]);
  assert.equal(rows[1]!.search, "weekly prices 2 h ago november 10, 2026");
});

test("search keeps rows holding every word, in any case, and an empty search keeps them all", () => {
  const rows = threadRows([summary("a", { title: "Invoice check" }), summary("b", { title: "Price tracker", updatedAt: NOW - 26 * HOUR })], undefined, NOW);
  const kept = (query: string) => filterThreadRows(rows, query).map((row) => row.conversationId);
  assert.deepEqual(kept(""), ["a", "b"]);
  assert.deepEqual(kept("   "), ["a", "b"]);
  assert.deepEqual(kept("INVOICE"), ["a"]);
  assert.deepEqual(kept("tracker yesterday"), ["b"]);
  assert.deepEqual(kept("november 9"), ["b"]);
  assert.deepEqual(kept("invoice yesterday"), []);
});

test("the catalog asks for 25, says when Core may hold more, and asks for 25 more on every read after", async () => {
  const asked: number[] = [];
  let listed = 25;
  const catalog = createThreadCatalog({
    list: async (query) => {
      asked.push(query.limit);
      return { ok: true, value: { conversations: Array.from({ length: Math.min(listed, query.limit) }, (_, index) => record(`t${index}`, index)) } };
    },
    projectId: () => undefined,
    changed: () => undefined
  });
  await catalog.read();
  assert.equal(catalog.hasMore(), true, "a full page may not be all");
  await catalog.more();
  await catalog.read();
  assert.deepEqual(asked, [25, 50, 50]);
  listed = 30;
  await catalog.read();
  assert.equal(catalog.hasMore(), false);
  assert.equal(catalog.threads().length, 30);
  catalog.forget();
  await catalog.read();
  assert.equal(asked.at(-1), 25, "another owner starts from one page");
});

test("a dropped thread leaves the list at once, and the change is heard", async () => {
  let heard = 0;
  const catalog = createThreadCatalog({
    list: async () => ({ ok: true, value: { conversations: [record("a", 2), record("b", 1)] } }),
    projectId: () => "p1",
    changed: () => (heard += 1)
  });
  await catalog.read();
  assert.equal(heard, 1);
  catalog.drop("a");
  assert.deepEqual(catalog.threads().map((thread) => thread.conversationId), ["b"]);
  assert.equal(heard, 2);
  catalog.drop("gone");
  assert.equal(heard, 2, "dropping what is not listed changes nothing");
});
