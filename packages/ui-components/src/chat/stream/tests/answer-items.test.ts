// An answer sits in the stream in time order: where its attempt ended, or after the last
// item when it has not; no answer for work still under way.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fakeTaskOutcomes } from "../../../testing/index.ts";
import type { CoreTurn } from "../../conversation/index.ts";
import { activityEvent, eventTime } from "../../tests/activity-fixture.ts";
import { buildChatStream, CHAT_STEP_MESSAGE_LIMIT } from "../stream-items.ts";

const turn = (turnId: string, author = "person"): CoreTurn => ({ turnId, author, text: turnId, ask: null });
const note = (sequence: number, title: string) => activityEvent(sequence, { detail: { kind: "note", title, text: `Noted ${title}.` } });

test("an ended attempt's answer sits at the time it ended, between what happened before and after", () => {
  const outcome = fakeTaskOutcomes().rowsChecked;
  outcome.attempt = { ...outcome.attempt, endedAtMs: eventTime(3) };
  const { items } = buildChatStream([{ turn: turn("t1"), at: eventTime(0) }, { turn: turn("t2"), at: eventTime(5) }], [note(1, "a"), note(4, "b")], CHAT_STEP_MESSAGE_LIMIT, [outcome]);
  assert.deepEqual(items.map((item) => item.key), ["turn:t1", "step:build-1#1", "answer:attempt-deals-1", "step:build-1#4", "turn:t2"]);
});

test("an attempt that has not ended (a wait) goes after the last item, and after any later one", () => {
  const outcome = fakeTaskOutcomes().stuckInALoop;
  const first = buildChatStream([{ turn: turn("t1"), at: eventTime(2) }], [note(1, "a")], CHAT_STEP_MESSAGE_LIMIT, [outcome]);
  assert.deepEqual(first.items.map((item) => item.key), ["step:build-1#1", "turn:t1", "answer:attempt-pages-1"]);
  const later = buildChatStream([{ turn: turn("t1"), at: eventTime(2) }], [note(1, "a"), note(9, "b")], CHAT_STEP_MESSAGE_LIMIT, [outcome]);
  assert.equal(later.items.at(-1)!.key, "answer:attempt-pages-1");
});

test("working is no item, and an ended attempt with no result is none either; several outcomes keep their order", () => {
  const outcomes = fakeTaskOutcomes();
  const noResult = fakeTaskOutcomes().rowsChecked;
  delete noResult.result;
  const second = outcomes.secondAttemptFromSaved;
  const { items } = buildChatStream([], [], CHAT_STEP_MESSAGE_LIMIT, [outcomes.rowsChecked, outcomes.working, noResult, second]);
  assert.deepEqual(items.map((item) => item.key), ["answer:attempt-deals-1", "answer:attempt-deals-2"]);
});

test("without outcomes the stream is what it was", () => {
  const { items } = buildChatStream([{ turn: turn("t1"), at: eventTime(0) }], [note(1, "a")]);
  assert.deepEqual(items.map((item) => item.kind), ["turn", "step"]);
});
