// An answer-first attempt does the task and builds no Flow, so its headline never says one is
// being built or is ready; every other unit keeps its headline exactly (t869).

import { describe, expect, test } from "vitest";
import type { ActivityDisplay, ClientGatewayActivity } from "../index.ts";
import { ACTIVITY_ATTEMPT_WORDS } from "../attempt/index.ts";
import { activityHeadline } from "../headline.ts";
import { ActivityPacer } from "../pacer.ts";
import { FakeClock } from "./fake-clock.ts";
import { TEST_HOST_WORDS } from "./test-host-words.ts";

let sequence = 0;
function event(fields: Partial<ClientGatewayActivity> & Pick<ClientGatewayActivity, "phase" | "label">): ClientGatewayActivity {
  sequence += 1;
  return { activityId: "build:b1", sequence, subject: { kind: "build", id: "b1", projectId: "p" }, at: "2026-11-04T00:00:00.000Z", ...fields };
}

/** The headlines a unit shows, in order, as each row settles. */
function headlinesOf(rows: ClientGatewayActivity[]): string[] {
  const shown: ActivityDisplay[] = [];
  const clock = new FakeClock(1_000);
  const pacer = new ActivityPacer({ clock, hostWords: TEST_HOST_WORDS, onChange: (display) => shown.push(display) });
  for (const row of rows) {
    pacer.accept(row);
    clock.advance(5_000);
  }
  return shown.map((display) => display.headline);
}

describe("an attempt's headline", () => {
  test.each([
    ["Finished", "done", "Finished"],
    ["Reached this task's budget", "done", "Reached this task's budget"],
    ["Stopped", "done", "Stopped"],
    ["Waiting for you", "done", "Waiting for you"],
    ["Before I can start", "done", "Before I can start"]
  ] as const)("ends on %s", (label, phase, headline) => {
    const shown = headlinesOf([
      event({ phase: "building", label: ACTIVITY_ATTEMPT_WORDS.working, detail: { kind: "step", title: "Started", status: "started" } }),
      event({ phase: "exploring", label: "Opening the page" }),
      event({ phase, label, final: true })
    ]);
    expect(shown[0]).toBe("Working on your task");
    expect(shown.at(-1)).toBe(headline);
    expect(shown.join("|")).not.toMatch(/Flow|Build/u);
  });

  test("a cancelled attempt says Stopped and an unexplained error says it could not finish", () => {
    expect(activityHeadline("build", "failed", TEST_HOST_WORDS, { attempt: { label: "Build stopped" }, stopped: true })).toBe("Stopped");
    expect(activityHeadline("build", "failed", TEST_HOST_WORDS, { attempt: { label: "Build failed" } })).toBe("Couldn't finish your task");
  });

  test("a wait on the person keeps the host's words", () => {
    expect(activityHeadline("build", "waiting", TEST_HOST_WORDS, { attempt: { label: "x" }, waitingOn: "answer" })).toBe(TEST_HOST_WORDS.answer);
  });
});

describe("any other build's headline", () => {
  test("is byte for byte what it was", () => {
    expect(activityHeadline("build", null, TEST_HOST_WORDS)).toBe("Building your Flow");
    expect(activityHeadline("build", "done", TEST_HOST_WORDS)).toBe("Flow ready");
    expect(activityHeadline("build", "failed", TEST_HOST_WORDS)).toBe("Build failed");
    expect(activityHeadline("build", "failed", TEST_HOST_WORDS, { stopped: true })).toBe("Build stopped");
  });

  test("through the pacer, a build with no attempt row says Flow ready", () => {
    const shown = headlinesOf([
      event({ phase: "building", label: "Building the Flow" }),
      event({ phase: "done", label: "Your Flow is ready", final: true })
    ]);
    expect(shown[0]).toBe("Building your Flow");
    expect(shown.at(-1)).toBe("Flow ready");
  });
});

describe("an attempt's tick", () => {
  /** The newest display once the attempt has settled on `label`. */
  function endingOf(label: string): ActivityDisplay {
    const shown: ActivityDisplay[] = [];
    const clock = new FakeClock(1_000);
    const pacer = new ActivityPacer({ clock, hostWords: TEST_HOST_WORDS, onChange: (display) => shown.push(display) });
    for (const row of [event({ phase: "building", label: ACTIVITY_ATTEMPT_WORDS.working }), event({ phase: "done", label, final: true })]) {
      pacer.accept(row);
      clock.advance(5_000);
    }
    return shown.at(-1)!;
  }

  test("only a task that reached its result may be drawn with one", () => {
    expect(endingOf(ACTIVITY_ATTEMPT_WORDS.finished).unconfirmed).toBeUndefined();
  });

  test.each([ACTIVITY_ATTEMPT_WORDS.budget, ACTIVITY_ATTEMPT_WORDS.stopped, ACTIVITY_ATTEMPT_WORDS.waiting, ACTIVITY_ATTEMPT_WORDS.setup])("%s is never drawn with one", (label) => {
    expect(endingOf(label).unconfirmed).toBe(true);
  });
});
