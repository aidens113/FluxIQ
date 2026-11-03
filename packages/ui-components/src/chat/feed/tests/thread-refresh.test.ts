// When activity makes the chat read the thread: a new event that names a
// conversation or ends the work, never the first state, and "new" by identity
// so a Core restart's lower sequences still count.

import assert from "node:assert/strict";
import { test } from "vitest";
import { activityEvent, relayState } from "../../tests/activity-fixture.ts";
import { threadRefreshWanted } from "../thread-refresh.ts";

test("the first state never asks for a read", () => {
  const first = threadRefreshWanted(undefined, relayState([activityEvent(1, { conversationId: "c-1" })]));
  assert.equal(first.refresh, false);
  assert.equal(first.seen.size, 1);
});

test("a new event with a conversation, or a final one, asks; a plain one does not", () => {
  const start = threadRefreshWanted(undefined, relayState([activityEvent(1)]));
  const plain = threadRefreshWanted(start.seen, relayState([activityEvent(1), activityEvent(2)]));
  assert.equal(plain.refresh, false);
  const talking = threadRefreshWanted(plain.seen, relayState([activityEvent(1), activityEvent(2), activityEvent(3, { conversationId: "c-1" })]));
  assert.equal(talking.refresh, true);
  const final = threadRefreshWanted(talking.seen, relayState([activityEvent(4, { phase: "done", final: true })]));
  assert.equal(final.refresh, true);
});

test("an event already seen does not ask again", () => {
  const state = relayState([activityEvent(1, { conversationId: "c-1" })]);
  const first = threadRefreshWanted(undefined, state);
  assert.equal(threadRefreshWanted(first.seen, state).refresh, false);
  assert.equal(threadRefreshWanted(first.seen, { ...state, overlay: "hidden" }).refresh, false);
});

test("after a Core restart a lower sequence is still new", () => {
  const before = threadRefreshWanted(undefined, relayState([activityEvent(50)]));
  const after = threadRefreshWanted(before.seen, relayState([activityEvent(50), activityEvent(1, { activityId: "build-2", conversationId: "c-2" })]));
  assert.equal(after.refresh, true);
});
