// This panel's words for a wait on the person, in the shared pacer's headline
// (`ActivityPacer` in `fluxiq/ui`): a question is answered here, and a check is
// finished on the site in the browser. The pacer's own timing is tested with it
// in Core; only the host words are the panel's.

import { ActivityPacer } from "fluxiq/ui";
import { describe, expect, it } from "vitest";
import { CONVERSATION_ACTIVITY_HOST_WORDS, type ConversationActivity } from "..";

function event(sequence: number, overrides: Partial<ConversationActivity> = {}): ConversationActivity {
  const atMs = 1_790_000_000_000 + sequence * 1_000;
  return {
    activityId: "run.7",
    sequence,
    subject: { kind: "run", id: "run.7", projectId: "project.one" },
    phase: "running",
    label: `Step ${sequence}`,
    at: new Date(atMs).toISOString(),
    atMs,
    ...overrides
  };
}

const clock = { now: () => 0, setTimeout: () => undefined, clearTimeout: () => undefined };

/** What a person reads for the events, in order, from the shared pacer with this panel's words. */
function shownAfter(events: ConversationActivity[]) {
  const pacer = new ActivityPacer({ clock, hostWords: CONVERSATION_ACTIVITY_HOST_WORDS, onChange: () => undefined });
  for (const entry of events) pacer.accept(entry);
  return pacer.display();
}

describe("this panel's words for a wait", () => {
  it("waits on a question in this panel's own words, never the extension's", () => {
    const waiting = shownAfter([event(1, { phase: "waiting_permission", label: "Run is waiting for an answer" })]);
    expect(waiting).toMatchObject({ outcome: "waiting", headline: "Waiting for your answer" });
    expect(waiting?.headline).not.toContain("FluxIQ panel");
  });

  it("says a check only the person can pass is finished in the browser", () => {
    const check = { kind: "tool" as const, title: "Using core.run_node", status: "succeeded" as const, ref: "core.run_node", text: "Result: web.intervention.required" };
    const shown = shownAfter([
      event(1, { activityId: "build.1", subject: { kind: "build", id: "build.1", projectId: "project.one" }, phase: "building", label: "Reading your request" }),
      event(2, { activityId: "build.1", subject: { kind: "build", id: "build.1", projectId: "project.one" }, phase: "exploring", label: "Using core.run_node: web.intervention.required", detail: check })
    ]);
    expect(shown).toMatchObject({ headline: "Waiting for you: finish the check in your browser", outcome: "waiting" });
  });

  it("holds a paused run as a wait on the person, and says stopped for a cancelled run or build", () => {
    expect(shownAfter([event(1, { phase: "paused", label: "Paused: you have the page" })])).toMatchObject({ outcome: "waiting", phase: "paused", headline: "Paused: your turn on the page" });
    const build = { activityId: "build.7", subject: { kind: "build" as const, id: "build.7", projectId: "project.one" } };
    expect(shownAfter([event(1, { phase: "failed", final: true, stopped: true, label: "Stopped" })])?.headline).toBe("Run stopped");
    expect(shownAfter([event(1, { ...build, phase: "failed", final: true, stopped: true, label: "Stopped" })])?.headline).toBe("Build stopped");
    expect(shownAfter([event(1, { phase: "failed", final: true, label: "Stopped" })])?.headline).toBe("Run failed");
    expect(shownAfter([event(1, { ...build, phase: "failed", final: true })])?.headline).toBe("Build failed");
  });
});
