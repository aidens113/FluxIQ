import { describe, expect, it } from "vitest";
import { parseConversationActivitySnapshot } from "..";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    activityId: "run.7",
    sequence: 1,
    subject: { kind: "run", id: "run.7", projectId: "project.one" },
    phase: "paused",
    label: "Paused: you have the page",
    at: new Date(1_790_000_000_000).toISOString(),
    ...overrides
  };
}

function read(event: unknown) {
  return parseConversationActivitySnapshot({ current: event, recent: [event] }).current;
}

describe("a paused or stopped unit of work", () => {
  it("accepts the paused phase", () => {
    expect(read(wire())?.phase).toBe("paused");
  });

  it("reads stopped only when Core sends true", () => {
    expect(read(wire({ phase: "failed", final: true, stopped: true }))?.stopped).toBe(true);
    expect(read(wire({ phase: "failed", final: true, stopped: false }))).not.toHaveProperty("stopped");
    expect(read(wire({ phase: "failed", final: true, stopped: "yes" }))).not.toHaveProperty("stopped");
  });

  it("still refuses a phase it does not know", () => {
    expect(read(wire({ phase: "napping" }))).toBeNull();
  });
});
