// The paced status and the words a step is said in.

import { describe, expect, it } from "vitest";
import {
  CONVERSATION_ACTIVITY_DETAIL_INTERVAL_MS,
  ConversationActivityPacer,
  conversationActivitySentence,
  type ConversationActivity,
  type ConversationActivityDisplay
} from "..";

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
  it("names the unit of work and keeps that headline while the detail changes", () => {
    const time = fakeClock();
    const shown: ConversationActivityDisplay[] = [];
    const pacer = new ConversationActivityPacer(time.clock, (display) => shown.push(display));
    pacer.accept(event(1));
    time.advance(CONVERSATION_ACTIVITY_DETAIL_INTERVAL_MS);
    pacer.accept(event(2, { phase: "building", label: "Updating the draft Flow" }));
    expect(shown.map((display) => display.headline)).toEqual(["Building your Flow", "Building your Flow"]);
    expect(shown.map((display) => display.detail)).toEqual(["Looking at the page 1", "Updating the draft Flow"]);
  });

  it("changes the detail at most once per interval and shows only the newest that waited", () => {
    const time = fakeClock();
    const shown: string[] = [];
    const pacer = new ConversationActivityPacer(time.clock, (display) => shown.push(display.detail ?? ""));
    pacer.accept(event(1));
    time.advance(100);
    pacer.accept(event(2));
    time.advance(100);
    pacer.accept(event(3));
    expect(shown).toEqual(["Looking at the page 1"]);
    expect(pacer.display()?.detail).toBe("Looking at the page 1");
    time.advance(CONVERSATION_ACTIVITY_DETAIL_INTERVAL_MS - 200);
    expect(shown).toEqual(["Looking at the page 1", "Looking at the page 3"]);
  });

  it("shows a settling, a repair or a new unit of work at once", () => {
    const time = fakeClock();
    const shown: string[] = [];
    const pacer = new ConversationActivityPacer(time.clock, (display) => shown.push(display.headline));
    pacer.accept(event(1));
    time.advance(10);
    pacer.accept(event(2, { phase: "repairing", label: "Trying another way" }));
    time.advance(10);
    pacer.accept(event(3, { phase: "exploring", label: "Looking again" }));
    time.advance(10);
    pacer.accept(event(4, { phase: "failed", label: "Stopped", final: true }));
    time.advance(10);
    pacer.accept(event(5, { activityId: "run.2", subject: { kind: "run", id: "run.2", projectId: "project.one" }, phase: "running" }));
    expect(shown).toEqual(["Building your Flow", "Fixing your Flow", "Couldn't fix your Flow", "Running your Flow"]);
  });

  it("ignores an event no newer than the last one taken", () => {
    const time = fakeClock();
    const shown: string[] = [];
    const pacer = new ConversationActivityPacer(time.clock, (display) => shown.push(display.detail ?? ""));
    pacer.accept(event(2));
    time.advance(5_000);
    pacer.accept(event(1));
    pacer.accept(event(2, { label: "Something else" }));
    expect(shown).toEqual(["Looking at the page 2"]);
  });
});

describe("the words a step is said in", () => {
  it("takes Core's sentence without its outcome", () => {
    expect(conversationActivitySentence(event(1, { label: "Clicking “Get a free quote” — done", detail: { kind: "tool", title: "Clicking “Get a free quote”", status: "succeeded" } })))
      .toBe("Clicking “Get a free quote”");
  });

  it("never says a tool id or a result code", () => {
    const raw = event(1, { label: "Using core.run_node: web.action.rejected.target_unobserved", detail: { kind: "tool", title: "web.detect_repeating_structure", ref: "core.run_node" } });
    expect(conversationActivitySentence(raw)).toBe("Working on the page");
    expect(conversationActivitySentence(event(2, { label: "Using web.inspect", detail: { kind: "step", title: "Step 6" } }))).toBe("Step 6");
    expect(conversationActivitySentence(event(3, { label: "target_unobserved", detail: { kind: "check", title: "n3.web_click" } }))).toBe("Checking the Flow");
  });
});
