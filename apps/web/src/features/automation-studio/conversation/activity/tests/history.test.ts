// Holding each unit of work whole across reads of Core's 60-event snapshot.

import { describe, expect, it } from "vitest";
import { CONVERSATION_ACTIVITY_HISTORY_LIMITS, holdConversationActivity, type ConversationActivity, type ConversationActivitySnapshot } from "..";

type Overrides = { [K in keyof ConversationActivity]?: ConversationActivity[K] | undefined };

function event(sequence: number, overrides: Overrides = {}): ConversationActivity {
  const atMs = 1_790_000_000_000 + sequence * 1_000;
  const built = {
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
  const { detail, ...rest } = built;
  return (detail === undefined ? rest : { ...rest, detail }) as ConversationActivity;
}

/** Core's hub: the last 60 events, and the latest as `current`. */
function hub(events: ConversationActivity[]): ConversationActivitySnapshot {
  const recent = events.slice(-60);
  return { current: recent.at(-1) ?? null, recent };
}

describe("holding a unit of work across reads", () => {
  it("keeps a long build whole after Core's snapshot has moved past its first steps", () => {
    const all = Array.from({ length: 150 }, (_, index) => event(index + 1));
    let held: ConversationActivity[] = [];
    for (let seen = 10; seen <= all.length; seen += 10) held = holdConversationActivity(held, hub(all.slice(0, seen)));
    expect(held).toHaveLength(150);
    expect(held[0]?.sequence).toBe(1);
    expect(held.at(-1)?.sequence).toBe(150);
  });

  it("holds each event once, by unit and sequence, oldest first", () => {
    const first = holdConversationActivity([], hub([event(1), event(2)]));
    const second = holdConversationActivity(first, hub([event(2), event(3)]));
    expect(second.map((entry) => entry.sequence)).toEqual([1, 2, 3]);
  });

  it("leaves out what can never be a message: a decision still being made, and a bare status change", () => {
    const deciding = event(1, { phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } });
    const status = event(2, { detail: undefined });
    const settled = event(3, { phase: "done", label: "Finished", final: true, detail: undefined });
    expect(holdConversationActivity([], hub([deciding, status, event(4), settled])).map((entry) => entry.sequence)).toEqual([3, 4]);
  });

  it("is bounded per unit, keeping the newest, and keeps the units heard from most recently", () => {
    const limits = { units: 2, eventsPerUnit: 3 };
    const unit = (id: string, from: number) => Array.from({ length: 5 }, (_, index) => event(from + index, { activityId: id }));
    const held = holdConversationActivity([], { current: null, recent: [...unit("a", 1), ...unit("b", 10), ...unit("c", 20)] }, limits);
    expect(held.map((entry) => `${entry.activityId}${entry.sequence}`)).toEqual(["b12", "b13", "b14", "c22", "c23", "c24"]);
    expect(CONVERSATION_ACTIVITY_HISTORY_LIMITS).toEqual({ units: 10, eventsPerUnit: 500 });
  });
});
