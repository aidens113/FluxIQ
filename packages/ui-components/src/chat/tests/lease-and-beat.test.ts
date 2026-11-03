// The thread list and the change feed through the lease, and the beat the chat
// reads on.

import assert from "node:assert/strict";
import { test } from "vitest";
import { CONTEXT_CHANGED, leaseTransport } from "../lease-transport.ts";
import { readBeatMs } from "../read-beat.ts";
import { thread, threadsCore } from "./threads-core.ts";

test("the thread list is a request: answered while the lease holds, refused once it lapses", async () => {
  const core = threadsCore([thread("a")]);
  let valid = true;
  const leased = leaseTransport(core.transport(), () => valid);
  const live = await leased.conversation.listAllThreads!({ limit: 25 });
  assert.equal(live.ok, true);
  assert.deepEqual(core.calls.listAll, [{ limit: 25 }]);
  valid = false;
  assert.deepEqual(await leased.conversation.listAllThreads!({ limit: 25 }), { ok: false, sentence: CONTEXT_CHANGED });
  assert.equal(core.calls.listAll.length, 1);
});

test("a client without the thread list or the change feed leases without them", () => {
  const leased = leaseTransport(threadsCore([]).transport({ listAll: false }), () => true);
  assert.equal(leased.conversation.listAllThreads, undefined);
  assert.equal(leased.changes, undefined);
});

test("the change feed is passed through like pushed activity, so a lapsed lease can still be let go of", () => {
  const core = threadsCore([]);
  const leased = leaseTransport(core.transport({ changes: true }), () => false);
  const heard: unknown[] = [];
  const unsubscribe = leased.changes!.subscribe((change) => heard.push(change));
  assert.equal(core.listening(), 1);
  core.emit({ conversationId: "a" });
  assert.deepEqual(heard, [{ conversationId: "a" }]);
  unsubscribe();
  assert.equal(core.listening(), 0);
});

test("an answer keeps the turn it was about when it passes the lease", async () => {
  const core = threadsCore([]);
  const leased = leaseTransport(core.transport(), () => true);
  const answer = { askId: "a", kind: "grant", value: undefined, projectId: "p", authorizationPin: "1234", turn: { conversationId: "c", turnId: "t", attachment: { kind: "k", ref: "r" } } };
  await leased.conversation.answer(answer);
  assert.deepEqual(core.calls.answer, [answer]);
});

test("the poll reads every 4 s alone, 10 s beside a change feed, and 5 s in the background", () => {
  assert.equal(readBeatMs(false, false), 4000);
  assert.equal(readBeatMs(false, true), 10000);
  assert.equal(readBeatMs(true, false), 5000);
  assert.equal(readBeatMs(true, true), 5000);
});
