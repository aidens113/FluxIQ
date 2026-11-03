// The chat stream's rules: thread turns and step messages on one timeline by
// time, turns first on equal times, history turns before everything, a bound
// on step messages that never drops a turn, and no folds: every step message
// is its own item.

import assert from "node:assert/strict";
import { test } from "vitest";
import type { CoreTurn } from "../../conversation/index.ts";
import { activityEvent, eventTime } from "../../tests/activity-fixture.ts";
import { buildChatStream, CHAT_STEP_MESSAGE_LIMIT, type ChatStreamItem } from "../stream-items.ts";

function turn(turnId: string, author = "person"): CoreTurn {
  return { turnId, author, text: turnId, ask: null };
}

const note = (sequence: number, title: string, at?: number) =>
  activityEvent(sequence, { detail: { kind: "note", title, text: `Noted ${title}.` }, ...(at === undefined ? {} : { at: new Date(at).toISOString() }) });

function keys(items: ChatStreamItem[]): string[] {
  return items.map((item) => item.key);
}

test("turns and step messages interleave by time; history turns come first", () => {
  const events = [
    activityEvent(1, { detail: { kind: "thought", title: "Reading the page", text: "The prices are in the list.", status: "succeeded" } }),
    note(3, "Found it")
  ];
  const { items } = buildChatStream([
    { turn: turn("t0"), at: Number.NEGATIVE_INFINITY },
    { turn: turn("t1", "automation"), at: eventTime(2) },
    { turn: turn("t2"), at: eventTime(4) }
  ], events);
  assert.deepEqual(keys(items), ["turn:t0", "step:build-1#1", "turn:t1", "step:build-1#3", "turn:t2"]);
});

test("on equal times a turn goes first, then everything keeps its own order", () => {
  const events = [note(1, "a", eventTime(5)), note(2, "b", eventTime(5))];
  const { items } = buildChatStream([{ turn: turn("x"), at: eventTime(5) }, { turn: turn("y"), at: eventTime(5) }], events);
  assert.deepEqual(keys(items), ["turn:x", "turn:y", "step:build-1#1", "step:build-1#2"]);
});

test("every step is its own item, however many there are between two turns", () => {
  const events = Array.from({ length: 40 }, (_, index) => note(index + 1, `n${index + 1}`));
  const { items } = buildChatStream([{ turn: turn("ask"), at: eventTime(0) }, { turn: turn("answer", "automation"), at: eventTime(41) }], events);
  assert.equal(items.length, 42);
  assert.equal(items.filter((item) => item.kind === "step").length, 40);
  assert.equal(items[41]!.key, "turn:answer", "the answer comes after the work that led to it");
});

test("at most the limit of step messages are kept, the newest; turns are never dropped", () => {
  const events = Array.from({ length: CHAT_STEP_MESSAGE_LIMIT + 5 }, (_, index) => note(index + 1, `n${index + 1}`));
  const steps = buildChatStream([], events).items.filter((item) => item.kind === "step");
  assert.equal(steps.length, CHAT_STEP_MESSAGE_LIMIT);
  assert.equal(steps[0]!.key, "step:build-1#6");
  const small = buildChatStream([{ turn: turn("t"), at: 0 }], events, 1);
  assert.deepEqual(keys(small.items), ["turn:t", `step:build-1#${CHAT_STEP_MESSAGE_LIMIT + 5}`]);
});

test("an empty relay state is an empty stream", () => {
  assert.deepEqual(buildChatStream([], []).items, []);
});

// Live runs 34 and 35: the build's instruction never showed as the person's
// message. A build says it on its activity (`request`); the chat shows it as a
// turn of the person's, once, unless the thread already holds those words.
const ASKED = ["Switch my store to Millbrook.", "Do not check out."].join("\n\n");

test("what a build was asked is the person's message, once, where the build said it", () => {
  const events = [
    activityEvent(1, { detail: { kind: "step", title: "Build started", status: "started" } }),
    activityEvent(2, { request: ASKED }),
    activityEvent(3, { detail: { kind: "thought", title: "Opening the store", text: "The store chooser is in the header.", status: "succeeded" } }),
    activityEvent(4, { request: ASKED })
  ];
  const { items } = buildChatStream([{ turn: turn("t0", "automation"), at: eventTime(0) }], events);
  assert.deepEqual(keys(items), ["turn:t0", "turn:request:build-1", "step:build-1#3"]);
  const asked = items[1]!;
  assert.equal(asked.kind, "turn");
  if (asked.kind === "turn") {
    assert.equal(asked.turn.author, "person");
    assert.equal(asked.turn.text, ASKED);
    assert.equal(asked.at, eventTime(2));
  }
});

test("a request the person typed into the thread is not shown twice", () => {
  const typed: CoreTurn = { turnId: "p1", author: "person", text: "Switch my store to Millbrook.  Do not check out.", ask: null };
  const events = [activityEvent(1, { request: ["Switch my store to Millbrook.", "Do not check out."].join("\n") })];
  assert.deepEqual(keys(buildChatStream([{ turn: typed, at: eventTime(0) }], events).items), ["turn:p1"]);
  // FluxIQ saying the same words is not the person saying them.
  const echoed: CoreTurn = { ...typed, author: "automation" };
  assert.deepEqual(keys(buildChatStream([{ turn: echoed, at: eventTime(0) }], events).items), ["turn:p1", "turn:request:build-1"]);
});
