// The thread list: read with a checking reader, ordered with the question that
// holds work up first, counted, and named in words a person uses, never an id.

import assert from "node:assert/strict";
import { test } from "vitest";
import { conversationDisplayTitle } from "../title.ts";
import { conversationSubjectFallbackLabel, conversationSubjectLabel } from "../labels.ts";
import { threadOptions } from "../options.ts";
import { sortThreadsForList } from "../order.ts";
import { parseThreadList } from "../parse.ts";
import type { ChatThreadSummary } from "../summary.ts";
import { unansweredThreadCount } from "../unanswered.ts";

function summary(conversationId: string, fields: Partial<ChatThreadSummary> = {}): ChatThreadSummary {
  return { conversationId, projectId: "p1", revision: 1, status: "open", updatedAt: 1000, pendingAskCount: 0, title: null, subject: { kind: "flow" }, ...fields };
}

function record(conversationId: string, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { conversationId, projectId: "p1", revision: 3, status: "open", updatedAt: 5, pendingAskCount: 0, title: "Nightly run", subject: { kind: "run" }, ...fields };
}

test("a record the reader cannot read is skipped; a list it cannot read is a failed read", () => {
  const read = parseThreadList([record("a"), record("b", { status: "gone" }), record("c", { subject: { kind: "robot" } }), null, "text", record("d", { updatedAt: "yesterday" }), record("e", { projectId: "" }), record("f", { pendingAskCount: -1 })]);
  assert.deepEqual(read?.map((thread) => thread.conversationId), ["a"]);
  assert.deepEqual(read?.[0], { conversationId: "a", projectId: "p1", revision: 3, status: "open", updatedAt: 5, pendingAskCount: 0, title: "Nightly run", subject: { kind: "run" } });
  assert.equal(parseThreadList(undefined), undefined);
  assert.equal(parseThreadList({ conversations: [] }), undefined);
  assert.deepEqual(parseThreadList([]), []);
});

test("a thread without a title reads as null, and every subject kind Core has is read", () => {
  const read = parseThreadList(["project", "flow", "build", "run"].map((kind, index) => record(`t${index}`, { title: undefined, subject: { kind } })));
  assert.deepEqual(read?.map((thread) => [thread.title, thread.subject.kind]), [[null, "project"], [null, "flow"], [null, "build"], [null, "run"]]);
});

test("the list is ordered waiting first, then open before resolved, then newest (waiting included)", () => {
  const sorted = sortThreadsForList([
    summary("old-open", { updatedAt: 1 }),
    summary("resolved-new", { status: "resolved", updatedAt: 99 }),
    summary("new-open", { updatedAt: 50 }),
    summary("waiting-old", { pendingAskCount: 1, updatedAt: 0 }),
    summary("waiting-resolved", { pendingAskCount: 2, status: "resolved", updatedAt: 70 })
  ]);
  assert.deepEqual(sorted.map((thread) => thread.conversationId), ["waiting-old", "waiting-resolved", "new-open", "old-open", "resolved-new"]);
});

test("sorting leaves the list it was given alone", () => {
  const given = [summary("a", { updatedAt: 1 }), summary("b", { updatedAt: 2 })];
  sortThreadsForList(given);
  assert.deepEqual(given.map((thread) => thread.conversationId), ["a", "b"]);
});

test("unanswered counts threads holding a question, not questions", () => {
  assert.equal(unansweredThreadCount([]), 0);
  assert.equal(unansweredThreadCount([summary("a", { pendingAskCount: 3 }), summary("b"), summary("c", { pendingAskCount: 1 })]), 2);
});

test("a thread is called by Core's title, else a noun for its subject, and an id is no name", () => {
  assert.equal(conversationSubjectLabel(summary("a", { title: "  Nightly listings run " })), "Nightly listings run");
  assert.equal(conversationSubjectLabel(summary("a", { title: "820f86f0-ba20-4cde-9a41-0123456789ab" })), "This Flow");
  assert.equal(conversationSubjectLabel(summary("a", { title: "0123456789abcdef0123" })), "This Flow");
  assert.equal(conversationSubjectLabel(summary("a", { title: "   " })), "This Flow");
  const nouns = (["project", "flow", "build", "run"] as const).map((kind) => conversationSubjectFallbackLabel(summary("a", { subject: { kind } })));
  assert.deepEqual(nouns, ["This project", "This Flow", "This Flow build", "This run"]);
});

test("the heading is Core's title, else the project's name with the noun, else all projects", () => {
  assert.equal(conversationDisplayTitle(null), "All projects");
  assert.equal(conversationDisplayTitle(null, "Company website"), "Company website");
  assert.equal(conversationDisplayTitle(null, "   "), "All projects");
  assert.equal(conversationDisplayTitle(summary("a", { title: "Nightly run" }), "Company website"), "Nightly run");
  assert.equal(conversationDisplayTitle(summary("a", { subject: { kind: "project" } }), "Company website"), "Company website");
  assert.equal(conversationDisplayTitle(summary("a", { subject: { kind: "run" } }), "Company website"), "This run · Company website");
  assert.equal(conversationDisplayTitle(summary("a", { subject: { kind: "run" } })), "This run");
});

test("the picker says which thread waits, and gives a date only where two labels repeat, never an id", () => {
  const options = threadOptions([
    summary("id-1", { title: "Nightly run", pendingAskCount: 1 }),
    summary("id-2", { title: "Price check" }),
    summary("id-3", { title: "Price check", updatedAt: 2000 }),
    summary("id-4", { title: "820f86f0-ba20-4cde-9a41-0123456789ab", subject: { kind: "run" } })
  ], (updatedAt) => `at ${updatedAt}`);
  assert.deepEqual(options, [
    { conversationId: "id-1", label: "Nightly run (waiting on you)" },
    { conversationId: "id-2", label: "Price check · at 1000" },
    { conversationId: "id-3", label: "Price check · at 2000" },
    { conversationId: "id-4", label: "This run" }
  ]);
  assert.ok(options.every((option) => !option.label.includes("id-") && !option.label.includes("820f86f0")));
});

test("a repeated label that is also waiting carries both", () => {
  const options = threadOptions([summary("a", { pendingAskCount: 1 }), summary("b")], () => "Nov 3");
  assert.deepEqual(options.map((option) => option.label), ["This Flow · Nov 3 (waiting on you)", "This Flow · Nov 3"]);
});

test("the default date is readable words, not an id or a raw number", () => {
  const [first, second] = threadOptions([summary("a", { updatedAt: Date.UTC(2026, 10, 3, 12, 0) }), summary("b")]);
  assert.match(first!.label, /^This Flow · .*\d/);
  assert.ok(!first!.label.includes("1793"));
  assert.notEqual(first!.label, second!.label);
});
