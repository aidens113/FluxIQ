// The reader: what a thread holds, never a guess from a failed read.

import assert from "node:assert/strict";
import { test } from "vitest";
import { createFakeChatResultsPort, fakeTaskOutcomes } from "../../../testing/index.ts";
import type { ChatResultsPort } from "../../ports/index.ts";
import { createAnswerReader } from "../index.ts";

const QUERY = { projectId: "project-1", conversationId: "thread-1" };

test("it reads the thread's outcomes, and a re-read tells the chat only when they changed", async () => {
  const outcomes = fakeTaskOutcomes();
  const results = createFakeChatResultsPort({ threads: [{ conversationId: "thread-1", outcomes: [outcomes.rowsChecked] }] });
  let changes = 0;
  const reader = createAnswerReader(results, () => QUERY, () => { changes += 1; });
  assert.deepEqual(reader.outcomes(), []);
  await reader.read();
  assert.equal(reader.outcomes().length, 1);
  assert.equal(reader.outcomes()[0]!.attempt.attemptId, "attempt-deals-1");
  assert.deepEqual(results.calls[0], { method: "readThread", query: QUERY });
  assert.equal(changes, 1);
  await reader.read();
  assert.equal(changes, 1, "equal outcomes, nothing to draw");
});

test("a failed read after a good one keeps what was read; a failed first read is no turn", async () => {
  const results = createFakeChatResultsPort({ threads: [{ conversationId: "thread-1", outcomes: [fakeTaskOutcomes().rowsChecked] }] });
  const reader = createAnswerReader(results, () => QUERY);
  results.failNext("readThread", { ok: false, sentence: "That answer could not be read." });
  await reader.read();
  assert.deepEqual(reader.outcomes(), []);
  await reader.read();
  results.failNext("readThread", { ok: false, sentence: "That answer could not be read." });
  await reader.read();
  assert.equal(reader.outcomes().length, 1);
});

test("unsupported means none, absent port means none, and no thread means none", async () => {
  const results = createFakeChatResultsPort({ threads: [{ conversationId: "thread-1", outcomes: [fakeTaskOutcomes().rowsChecked] }] });
  const reader = createAnswerReader(results, () => QUERY);
  await reader.read();
  results.failNext("readThread", { ok: false, sentence: "Not carried here.", unsupported: true });
  await reader.read();
  assert.deepEqual(reader.outcomes(), []);
  const none = createAnswerReader(undefined, () => QUERY);
  await none.read();
  assert.deepEqual(none.outcomes(), []);
  const nowhere = createAnswerReader(results, () => undefined);
  await nowhere.read();
  assert.deepEqual(nowhere.outcomes(), []);
});

test("a thrown read is no turn and never throws on", async () => {
  const results = { readThread: async () => { throw new Error("gone"); } } as unknown as ChatResultsPort;
  const reader = createAnswerReader(results, () => QUERY);
  await reader.read();
  assert.deepEqual(reader.outcomes(), []);
});

test("another thread starts empty, and a late reply for the old thread is dropped", async () => {
  const results = createFakeChatResultsPort({ threads: [{ conversationId: "thread-1", outcomes: [fakeTaskOutcomes().rowsChecked] }, { conversationId: "thread-2", outcomes: [] }] });
  let query = QUERY;
  const reader = createAnswerReader(results, () => query);
  await reader.read();
  assert.equal(reader.outcomes().length, 1);
  query = { projectId: "project-1", conversationId: "thread-2" };
  await reader.read();
  assert.deepEqual(reader.outcomes(), []);
  const late = createAnswerReader(results, () => query);
  const pending = late.read();
  query = QUERY;
  await pending;
  assert.deepEqual(late.outcomes(), [], "the reply was for the thread it moved on from");
});
