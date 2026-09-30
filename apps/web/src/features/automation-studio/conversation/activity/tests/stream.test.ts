// Where FluxIQ's step messages sit among the thread's turns.

import { describe, expect, it } from "vitest";
import { conversationStream, type ConversationActivity } from "..";
import type { ConversationTurn } from "../../thread";

const base = 1_790_000_000_000;

function thought(sequence: number, overrides: Partial<ConversationActivity> = {}): ConversationActivity {
  const atMs = base + sequence * 1_000;
  return {
    activityId: "build.1",
    sequence,
    subject: { kind: "build", id: "build.1", projectId: "project.one" },
    phase: "exploring",
    label: `Clicking button ${sequence}`,
    detail: { kind: "thought", title: `Clicking button ${sequence}`, text: `Reason ${sequence}.`, status: "succeeded" },
    at: new Date(atMs).toISOString(),
    atMs,
    ...overrides
  };
}

const turn = (turnId: string, createdAt: number, author: "person" | "automation"): ConversationTurn =>
  ({ turnId, conversationId: "c.1", author, createdAt, text: turnId }) as ConversationTurn;

describe("the message stream", () => {
  it("places each step message by time among the turns, one entry per message, no fold", () => {
    const stream = conversationStream({
      turns: [turn("ask", base, "person"), turn("answer", base + 5_500, "automation")],
      activity: [thought(1), thought(2), thought(3), thought(9)]
    });
    expect(stream.map((entry) => entry.key)).toEqual([
      "turn:ask",
      "step:build.1#1",
      "step:build.1#2",
      "step:build.1#3",
      "turn:answer",
      "step:build.1#9"
    ]);
  });

  it("leaves out an event that belongs to another conversation", () => {
    const stream = conversationStream({
      turns: [],
      activity: [thought(1, { conversationId: "c.other" }), thought(2, { conversationId: "c.1" })],
      conversationId: "c.1"
    });
    expect(stream.map((entry) => entry.key)).toEqual(["step:build.1#2"]);
  });

  it("hides messages older than the first shown turn when earlier turns are hidden", () => {
    const stream = conversationStream({ turns: [turn("later", base + 2_500, "person")], activity: [thought(1), thought(3)], earlierHidden: true });
    expect(stream.map((entry) => entry.key)).toEqual(["turn:later", "step:build.1#3"]);
  });

  it("shows messages on their own when the thread has said nothing yet", () => {
    expect(conversationStream({ turns: [], activity: [thought(1)] }).map((entry) => entry.key)).toEqual(["step:build.1#1"]);
  });
});
