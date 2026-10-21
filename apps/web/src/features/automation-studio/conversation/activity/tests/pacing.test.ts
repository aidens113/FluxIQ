// The paced status: the shared pacer (`ActivityPacer` in `fluxiq/ui`) read for
// the panel's live line, so it says what the web extension's status says, at
// the same pace.

import { ACTIVITY_DETAIL_INTERVAL_MS, ACTIVITY_HEADLINE_DWELL_MS } from "fluxiq/ui";
import { describe, expect, it } from "vitest";
import { ConversationPacedStatus, type ConversationActivity, type ConversationActivityDisplay } from "..";

function event(sequence: number, overrides: Partial<ConversationActivity> = {}): ConversationActivity {
  const atMs = 1_790_000_000_000 + sequence * 1_000;
  return {
    activityId: "build.1",
    sequence,
    subject: { kind: "build", id: "build.1", projectId: "project.one" },
    phase: "exploring",
    label: `Looking at the page ${sequence}`,
    at: new Date(atMs).toISOString(),
    atMs,
    ...overrides
  };
}

const RUN = { activityId: "run.2", subject: { kind: "run" as const, id: "run.2", projectId: "project.one" } };

function fakeClock() {
  let now = 0;
  const timers: Array<{ at: number; callback: () => void; live: boolean }> = [];
  return {
    clock: {
      now: () => now,
      setTimeout: (callback: () => void, delayMs: number) => {
        const timer = { at: now + delayMs, callback, live: true };
        timers.push(timer);
        return timer;
      },
      clearTimeout: (timer: unknown) => {
        (timer as { live: boolean }).live = false;
      }
    },
    advance(ms: number) {
      now += ms;
      for (const timer of timers) {
        if (timer.live && timer.at <= now) {
          timer.live = false;
          timer.callback();
        }
      }
    }
  };
}

describe("the paced status", () => {
  it("paces the detail by the shared interval, 1.6 s", () => {
    expect(ACTIVITY_DETAIL_INTERVAL_MS).toBe(1_600);
  });

  it("names the unit of work and keeps that headline while the detail changes", () => {
    const time = fakeClock();
    const shown: ConversationActivityDisplay[] = [];
    const status = new ConversationPacedStatus(time.clock, (display) => shown.push(display));
    status.accept(event(1));
    time.advance(ACTIVITY_DETAIL_INTERVAL_MS);
    status.accept(event(2, { phase: "building", label: "Updating the draft Flow" }));
    expect(shown.map((display) => display.headline)).toEqual(["Building your Flow", "Building your Flow"]);
    expect(shown.map((display) => display.detail)).toEqual(["Looking at the page 1", "Updating the draft Flow"]);
  });

  it("changes the detail at most once per interval and shows only the newest that waited", () => {
    const time = fakeClock();
    const shown: string[] = [];
    const status = new ConversationPacedStatus(time.clock, (display) => shown.push(display.detail ?? ""));
    status.accept(event(1));
    time.advance(100);
    status.accept(event(2));
    time.advance(100);
    status.accept(event(3));
    expect(shown).toEqual(["Looking at the page 1"]);
    expect(status.display()?.detail).toBe("Looking at the page 1");
    time.advance(ACTIVITY_DETAIL_INTERVAL_MS - 201);
    expect(shown).toEqual(["Looking at the page 1"]);
    time.advance(1);
    expect(shown).toEqual(["Looking at the page 1", "Looking at the page 3"]);
  });

  it("shows settlement and new work at once without flashing a brief repair headline", () => {
    const time = fakeClock();
    const shown: string[] = [];
    const status = new ConversationPacedStatus(time.clock, (display) => shown.push(display.headline));
    status.accept(event(1));
    time.advance(10);
    status.accept(event(2, { phase: "repairing", label: "Trying another way" }));
    time.advance(10);
    status.accept(event(3, { phase: "exploring", label: "Looking again" }));
    time.advance(10);
    status.accept(event(4, { phase: "failed", label: "Stopped", final: true }));
    time.advance(10);
    status.accept(event(5, { ...RUN, phase: "running", label: "Run started" }));
    // A build that fails mid-repair failed as a build: it had no Flow to fix.
    expect(shown).toEqual(["Building your Flow", "Build failed", "Running your Flow"]);
  });

  it("says a run whose repair failed couldn't fix the Flow", () => {
    const time = fakeClock();
    const shown: string[] = [];
    const status = new ConversationPacedStatus(time.clock, (display) => shown.push(display.headline));
    status.accept(event(1, { ...RUN, phase: "running", label: "Run started" }));
    status.accept(event(2, { ...RUN, phase: "repairing", label: "Repairing the Flow" }));
    time.advance(ACTIVITY_HEADLINE_DWELL_MS);
    status.accept(event(3, { ...RUN, phase: "failed", label: "Stopped", final: true }));
    expect(shown).toEqual(["Running your Flow", "Fixing your Flow", "Couldn't fix your Flow"]);
  });

  it("says a check only the person can pass in this panel's words: finish it in the browser", () => {
    const time = fakeClock();
    const status = new ConversationPacedStatus(time.clock, () => undefined);
    status.accept(event(1, { phase: "building", label: "Reading your request" }));
    const check = { kind: "tool" as const, title: "Using core.run_node", status: "succeeded" as const, ref: "core.run_node", text: "Result: web.intervention.required" };
    status.accept(event(2, { phase: "exploring", label: "Using core.run_node: web.intervention.required", detail: check }));
    expect(status.display()).toMatchObject({ headline: "Waiting for you: finish the check in your browser", outcome: "waiting" });
  });

  it("says what the person is waited on for, and holds a paused run as its own outcome", () => {
    const time = fakeClock();
    const status = new ConversationPacedStatus(time.clock, () => undefined);
    status.accept(event(1, { phase: "waiting_permission", label: "Waiting for your answer" }));
    // This panel is where the question is answered: its own words, never the extension's "answer in the FluxIQ panel".
    expect(status.display()).toMatchObject({ headline: "Waiting for your answer", outcome: "waiting" });
    status.accept(event(2, { ...RUN, phase: "paused", label: "Paused: you have the page" }));
    expect(status.display()).toMatchObject({ headline: "Paused: your turn on the page", outcome: "paused", detail: null });
    status.accept(event(3, { ...RUN, phase: "running", label: "Continuing from step 2" }));
    expect(status.display()).toMatchObject({ headline: "Running your Flow", outcome: null });
  });

  it("ignores an event no newer than the last one taken", () => {
    const time = fakeClock();
    const shown: string[] = [];
    const status = new ConversationPacedStatus(time.clock, (display) => shown.push(display.detail ?? ""));
    status.accept(event(2));
    time.advance(5_000);
    status.accept(event(1));
    status.accept(event(2, { label: "Something else" }));
    expect(shown).toEqual(["Looking at the page 2"]);
  });
});
