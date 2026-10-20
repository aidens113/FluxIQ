import { describe, expect, it } from "vitest";
import { ConversationPacedStatus, parseConversationActivitySnapshot, type ConversationActivity } from "..";

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

const clock = { now: () => 0, setTimeout: () => undefined, clearTimeout: () => undefined };

/** The paced status a person reads for one event, from the shared pacer. */
function statusOf(event: ConversationActivity | null) {
  const status = new ConversationPacedStatus(clock, () => undefined);
  if (event) status.accept(event);
  return status.display();
}

describe("a paused or stopped unit of work", () => {
  it("accepts the paused phase and holds it as its own outcome", () => {
    const event = read(wire());
    expect(event?.phase).toBe("paused");
    expect(statusOf(event)).toMatchObject({ outcome: "paused", headline: "Paused: your turn on the page" });
  });

  it("waits on a question in this panel's own words, never the extension's", () => {
    const waiting = statusOf(read(wire({ phase: "waiting_permission", label: "Run is waiting for an answer" })));
    expect(waiting).toMatchObject({ outcome: "waiting", headline: "Waiting for your answer" });
    expect(waiting?.headline).not.toContain("FluxIQ panel");
  });

  it("reads stopped only when Core sends true", () => {
    expect(read(wire({ phase: "failed", final: true, stopped: true }))?.stopped).toBe(true);
    expect(read(wire({ phase: "failed", final: true, stopped: false }))).not.toHaveProperty("stopped");
    expect(read(wire({ phase: "failed", final: true, stopped: "yes" }))).not.toHaveProperty("stopped");
  });

  it("says stopped instead of failed for a cancelled run or build", () => {
    const build = { activityId: "build.7", subject: { kind: "build", id: "build.7", projectId: "project.one" }, label: "Stopped" };
    expect(statusOf(read(wire({ phase: "failed", final: true, stopped: true, label: "Stopped" })))?.headline).toBe("Run stopped");
    expect(statusOf(read(wire({ ...build, phase: "failed", final: true, stopped: true })))?.headline).toBe("Build stopped");
    expect(statusOf(read(wire({ phase: "failed", final: true, label: "Stopped" })))?.headline).toBe("Run failed");
    expect(statusOf(read(wire({ ...build, phase: "failed", final: true })))?.headline).toBe("Build failed");
  });

  it("still refuses a phase it does not know", () => {
    expect(read(wire({ phase: "napping" }))).toBeNull();
  });
});
