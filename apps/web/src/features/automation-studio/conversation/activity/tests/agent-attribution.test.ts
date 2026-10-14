// Core's own panel keeps working on a project build's activity: an event that
// names its agent, and a `note` row that carries a project card, both read as
// before. The panel ignores `agent` and treats every note as internal, so
// neither changes what it shows.
import { describe, expect, it } from "vitest";
import { conversationActivityIsInternal, conversationStepMessages, conversationStream, parseConversationActivitySnapshot } from "..";

const at = (sequence: number) => new Date(1_790_000_000_000 + sequence * 1_000).toISOString();

/** Events as Core's hub publishes them inside a project build's agent frames. */
const events = [
  {
    activityId: "build:b1",
    sequence: 1,
    subject: { kind: "build", id: "b1", projectId: "project.one" },
    phase: "thinking",
    label: "Planning the Flow",
    detail: {
      kind: "note",
      title: "Plan: 2 parts in 2 subflows",
      status: "succeeded",
      project: {
        kind: "plan",
        parts: [{ id: "p1", words: "list the five newest soups" }],
        subflows: [{ key: "list_soups", name: "List soups", purpose: "list the five newest soups", parts: ["p1"] }],
        reserveUsd: 0.08
      }
    },
    agent: { role: "supervisor" },
    at: at(1)
  },
  {
    activityId: "build:b1",
    sequence: 2,
    subject: { kind: "build", id: "b1", projectId: "project.one" },
    phase: "building",
    label: "Building Save recipe",
    detail: {
      kind: "note",
      title: "Building Save recipe: save the first one",
      status: "started",
      ref: "b-save",
      project: { kind: "brief", briefId: "b-save", brief: "build", subflowKey: "save_recipe", subflowName: "Save recipe", purpose: "save the first one", allowanceUsd: 0.05 }
    },
    agent: { role: "supervisor" },
    at: at(2)
  },
  {
    activityId: "build:b1",
    sequence: 3,
    subject: { kind: "build", id: "b1", projectId: "project.one" },
    phase: "exploring",
    label: "Opening the cookbook",
    detail: { kind: "thought", title: "Opening the cookbook", text: "The save button is in the cookbook.", status: "succeeded" },
    agent: { role: "builder", briefId: "b-save", subflowName: "Save recipe" },
    at: at(3)
  }
];

describe("a project build's activity in Core's panel", () => {
  it("parses every stamped event and every project note, dropping the fields it does not know", () => {
    const read = parseConversationActivitySnapshot({ current: events.at(-1), recent: events });
    expect(read.recent.map((event) => event.sequence)).toEqual([1, 2, 3]);
    for (const event of read.recent) expect(event).not.toHaveProperty("agent");
    expect(read.recent[1]!.detail).toEqual({ kind: "note", title: "Building Save recipe: save the first one", status: "started", ref: "b-save" });
    expect(read.current?.label).toBe("Opening the cookbook");
  });

  it("keeps the project notes internal, so only the builder's own step is a message", () => {
    const read = parseConversationActivitySnapshot({ current: null, recent: events });
    expect(read.recent.slice(0, 2).every((event) => event.detail !== undefined && conversationActivityIsInternal(event.detail))).toBe(true);
    expect(conversationStepMessages(read.recent).map((message) => message.title)).toEqual(["Opening the cookbook"]);
    expect(conversationStream({ turns: [], activity: read.recent }).length).toBeGreaterThan(0);
  });
});
