import { describe, expect, it } from "vitest";
import {
  CONVERSATION_ACTIVITY_HELD,
  conversationActivityPollOutcome,
  conversationActivityStepText,
  interleaveConversationActivity,
  mergeConversationActivity,
  parseConversationActivitySnapshot
} from "..";
import { parseConversationTurns } from "../../thread";

function wire(sequence: number, overrides: Record<string, unknown> = {}) {
  return {
    activityId: "run.7",
    sequence,
    subject: { kind: "run", id: "run.7", projectId: "project.one", flowId: "flow.one" },
    phase: "running",
    label: `Running step ${sequence} of 5`,
    step: { index: sequence, count: 5, nodeId: `node.${sequence}` },
    detail: { kind: "step", title: `Step ${sequence}`, status: "started", ref: `node.${sequence}` },
    at: new Date(1_790_000_000_000 + sequence * 1_000).toISOString(),
    ...overrides
  };
}

function snapshot(events: unknown[], current: unknown = events.at(-1) ?? null) {
  return parseConversationActivitySnapshot({ current, recent: events });
}

describe("reading Core's activity snapshot", () => {
  it("reads the hub's shape, keeping every field Core sent and stamping the time once", () => {
    const read = snapshot([wire(1, { conversationId: "conversation.1", final: true, extra: "ignored" })]);
    expect(read.recent).toHaveLength(1);
    expect(read.current).toEqual({
      activityId: "run.7",
      sequence: 1,
      subject: { kind: "run", id: "run.7", projectId: "project.one", flowId: "flow.one" },
      phase: "running",
      label: "Running step 1 of 5",
      step: { index: 1, count: 5, nodeId: "node.1" },
      detail: { kind: "step", title: "Step 1", status: "started", ref: "node.1" },
      conversationId: "conversation.1",
      final: true,
      at: new Date(1_790_000_001_000).toISOString(),
      atMs: 1_790_000_001_000
    });
  });

  it("drops an event Core did not build, and keeps the rest", () => {
    const bad = [
      wire(2, { phase: "pondering" }),
      wire(3, { label: "x".repeat(161) }),
      wire(4, { label: "bell\u0007" }),
      wire(5, { detail: { kind: "gossip", title: "?" } }),
      wire(6, { detail: { kind: "tool", title: "t", status: "maybe" } }),
      wire(7, { step: { index: 0, count: 5 } }),
      wire(8, { at: "yesterday" }),
      wire(9, { subject: { kind: "task", id: "x", projectId: "p" } }),
      wire(10, { final: "yes" }),
      "not an event"
    ];
    const read = snapshot([wire(1), ...bad], null);
    expect(read.recent.map((event) => event.sequence)).toEqual([1]);
    expect(read.current).toBeNull();
  });

  it("allows line breaks in a detail's text, which is the one multi-line field", () => {
    const read = snapshot([wire(1, { detail: { kind: "thought", title: "Plan", text: "First.\nThen." } })]);
    expect(read.current?.detail?.text).toBe("First.\nThen.");
  });

  it("answers an empty snapshot for anything that is not one", () => {
    expect(parseConversationActivitySnapshot(null)).toEqual({ current: null, recent: [] });
    expect(parseConversationActivitySnapshot({ current: null, recent: "no" })).toEqual({ current: null, recent: [] });
  });
});

describe("the step phrase", () => {
  it("says step N of M, with a 1-based N", () => {
    expect(conversationActivityStepText({ index: 1, count: 5 })).toBe("Step 1 of 5");
    expect(conversationActivityStepText({ index: 5, count: 5 })).toBe("Step 5 of 5");
  });

  it("says just step N when N runs past M or M is not a count", () => {
    expect(conversationActivityStepText({ index: 6, count: 5 })).toBe("Step 6");
    expect(conversationActivityStepText({ index: 2, count: 0 })).toBe("Step 2");
    expect(conversationActivityStepText({ index: 2, count: -1 })).toBe("Step 2");
    expect(conversationActivityStepText({ index: 2, count: 2.5 })).toBe("Step 2");
  });
});

describe("how fast to read again", () => {
  it("is fast while Core's latest event is not its last, and ordinary once it is or before anything", () => {
    expect(conversationActivityPollOutcome(snapshot([wire(1)]))).toBe("pending");
    expect(conversationActivityPollOutcome(snapshot([wire(1, { final: true, phase: "done" })]))).toBe("idle");
    expect(conversationActivityPollOutcome({ current: null, recent: [] })).toBe("idle");
  });
});

describe("holding events across reads", () => {
  it("keeps each event once by sequence, oldest first", () => {
    const first = mergeConversationActivity([], snapshot([wire(1), wire(2)]));
    const second = mergeConversationActivity(first, snapshot([wire(2), wire(3)]));
    expect(second.map((event) => event.sequence)).toEqual([1, 2, 3]);
  });

  it("is bounded, dropping the oldest", () => {
    const many = Array.from({ length: CONVERSATION_ACTIVITY_HELD + 10 }, (_, index) => wire(index + 1));
    const held = mergeConversationActivity([], snapshot(many));
    expect(held).toHaveLength(CONVERSATION_ACTIVITY_HELD);
    expect(held[0]?.sequence).toBe(11);
  });
});

describe("where a row sits among the turns", () => {
  const turns = parseConversationTurns([
    { turnId: "turn.1", conversationId: "conversation.1", author: "person", createdAt: 1_790_000_000_500, text: "Go." },
    { turnId: "turn.2", conversationId: "conversation.1", author: "automation", createdAt: 1_790_000_002_500, text: "Done." }
  ]);

  it("orders rows and turns by time, and leaves a pure status change to the header", () => {
    const activity = snapshot([wire(1), wire(2, { detail: undefined }), wire(3)]).recent;
    const entries = interleaveConversationActivity({ turns, activity, conversationId: "conversation.1" });
    expect(entries.map((entry) => entry.key)).toEqual(["turn:turn.1", "activity:1", "turn:turn.2", "activity:3"]);
  });

  it("leaves out an event that belongs to another conversation", () => {
    const activity = snapshot([wire(1, { conversationId: "conversation.other" }), wire(3, { conversationId: "conversation.1" })]).recent;
    const entries = interleaveConversationActivity({ turns, activity, conversationId: "conversation.1" });
    expect(entries.filter((entry) => entry.kind === "activity").map((entry) => entry.key)).toEqual(["activity:3"]);
  });

  it("hides rows older than the first shown turn when earlier turns are hidden", () => {
    const activity = snapshot([wire(1), wire(3)]).recent;
    const entries = interleaveConversationActivity({ turns: turns.slice(1), activity, earlierHidden: true });
    expect(entries.map((entry) => entry.key)).toEqual(["turn:turn.2", "activity:3"]);
  });

  it("shows rows on their own when the thread has said nothing yet", () => {
    const activity = snapshot([wire(1)]).recent;
    expect(interleaveConversationActivity({ turns: [], activity }).map((entry) => entry.key)).toEqual(["activity:1"]);
  });
});
