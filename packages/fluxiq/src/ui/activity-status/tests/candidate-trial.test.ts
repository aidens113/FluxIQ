// Coverage of candidate-trial.ts and the status it heads (pacer.ts,
// headline.ts): each kind of work the overlay shows is named in plain words --
// building, testing a candidate from its start, running a saved Flow, repairing
// a saved Flow -- and a candidate trial, passed or failed, never reads as a
// repair. Lane A round 4 (`run-muyrpbnk-fef374e7`): during the trial of
// revision 2 the overlay said "Fixing your Flow · Step 2 of 8", and the chat
// "Trying again didn't fix the step".

import { expect, test } from "vitest";

import type { ActivityDisplay, ClientGatewayActivity } from "../index.ts";
import { CandidateTrial } from "../candidate-trial.ts";
import { activityHeadline } from "../headline.ts";
import { ACTIVITY_DETAIL_INTERVAL_MS, ActivityPacer } from "../pacer.ts";
import { FakeClock } from "./fake-clock.ts";

let sequence = 0;
function event(fields: Partial<ClientGatewayActivity> & Pick<ClientGatewayActivity, "phase" | "label">, kind: "build" | "run" = "build", id = "b1"): ClientGatewayActivity {
  sequence += 1;
  return { activityId: `${kind}:${id}`, sequence, subject: { kind, id, projectId: "p" }, at: "2026-10-07T00:00:00.000Z", ...fields };
}

function harness() {
  const clock = new FakeClock(1_000);
  const shown: ActivityDisplay[] = [];
  const pacer = new ActivityPacer({ clock, onChange: (display) => shown.push(display) });
  /** Feeds each event a full interval apart, so every one is shown. */
  const feed = (...events: ClientGatewayActivity[]) => {
    for (const each of events) {
      clock.advance(ACTIVITY_DETAIL_INTERVAL_MS);
      pacer.accept(each);
    }
  };
  return { pacer, shown, feed, now: () => pacer.display()! };
}

const TITLE = "Testing the whole Flow from the start";
const trialStarted = (id = "b1") => event({ phase: "exploring", label: TITLE, detail: { kind: "tool", title: TITLE, status: "started", ref: "core.test_candidate" } }, "build", id);
const trialEnded = (code: string, id = "b1") => event({ phase: "exploring", label: `${TITLE} — didn't work`, detail: { kind: "tool", title: TITLE, status: code === "candidate.trial_yes" ? "succeeded" : "failed", ref: "core.test_candidate", text: `Result: ${code}` } }, "build", id);
const trialStep = (index: number, title: string, id = "b1") => event({ phase: "running", label: `Running step ${index} of 8: ${title}`, step: { index, count: 8, nodeId: `n${index}` }, detail: { kind: "step", title, status: "started", ref: `n${index}` } }, "build", id);
/** Core's rows for a step that failed in the trial: the recovering row, then its ladder's end, a thought. */
const trialStepFailed = (index: number, title: string, id = "b1") => [
  event({ phase: "repairing", label: `Recovering from a failed step: ${title}`, detail: { kind: "step", title, status: "failed", ref: `n${index}`, text: "Result: web.target.not_found · Node: web.output.dom-click" } }, "build", id),
  event({ phase: "repairing", label: "The quick fixes didn't help", detail: { kind: "thought", title: "The quick fixes didn't help", text: "Trying again didn't fix the step.", status: "succeeded", ref: `n${index}` } }, "build", id)
];

const REPAIR_WORDS = /\bfix|repair/iu;
const words = (display: ActivityDisplay) => `${display.headline} · ${display.detail ?? ""}`;

test("a build exploring the page is headed 'Building your Flow'", () => {
  const h = harness();
  h.feed(event({ phase: "building", label: "Reading your request" }), event({ phase: "exploring", label: "Using core.run_node" }));
  expect(new Set(h.shown.map((display) => display.headline))).toStrictEqual(new Set(["Building your Flow"]));
});

test("a candidate trial is headed 'Testing your Flow' with its run's steps, and a step that fails in it is never a repair", () => {
  const h = harness();
  h.feed(event({ phase: "exploring", label: "Using core.run_node" }), trialStarted());
  expect([h.now().headline, h.now().detail, h.now().step], "the trial opens with no step of the build's carried in").toStrictEqual(["Testing your Flow", TITLE, null]);
  h.feed(trialStep(1, "Opening the start page"), trialStep(2, "Clicking “Collected”"));
  expect([h.now().headline, h.now().step]).toStrictEqual(["Testing your Flow", { index: 2, count: 8 }]);
  h.feed(...trialStepFailed(2, "Clicking “Collected”"));
  const failedStep = h.now();
  expect([failedStep.headline, failedStep.detail, failedStep.phase, failedStep.step]).toStrictEqual(["Testing your Flow", "A step didn't work in the test: FluxIQ couldn't find it where it was saved", "running", { index: 2, count: 8 }]);
  const during = h.shown.slice(1);
  expect(during.every((display) => !REPAIR_WORDS.test(words(display))), during.map(words).join(" | ")).toBeTruthy();
  expect(during.every((display) => display.phase !== "repairing"), "a trial is coloured as running, not repairing").toBeTruthy();
});

test("a failed trial says the test failed and what comes next, then the build goes on as building, never as fixing", () => {
  const h = harness();
  h.feed(trialStarted(), trialStep(1, "Opening the start page"), trialStep(2, "Clicking “Collected”"), ...trialStepFailed(2, "Clicking “Collected”"), trialEnded("candidate.trial_execution_failed"));
  const ended = h.now();
  expect([ended.headline, ended.detail, ended.step, ended.working]).toStrictEqual(["Building your Flow", "The test failed: a step didn't work. Next: changing the Flow and testing again", null, true]);
  // The decision after it holds the verdict's line, and the build's next steps carry no trial step count.
  h.feed(event({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } }));
  expect(h.now().detail).toBe(ended.detail);
  h.feed(event({ phase: "exploring", label: "Using core.run_node" }), event({ phase: "building", label: "Saving the Flow's steps" }));
  expect(h.shown.every((display) => !REPAIR_WORDS.test(words(display))), h.shown.map(words).join(" | ")).toBeTruthy();
  expect(h.now().headline).toBe("Building your Flow");
  expect(h.now().step).toBe(null);
});

test("each trial verdict is said as the test's own result", () => {
  const cases: Array<[string, string]> = [
    ["candidate.trial_yes", "The test passed: the Flow did what you asked"],
    ["candidate.trial_no", "The test failed: the Flow didn't do what you asked. Next: changing it and testing again"],
    ["candidate.trial_execution_failed", "The test failed: a step didn't work. Next: changing the Flow and testing again"],
    ["candidate.trial_unsure", "The test couldn't be judged. Next: testing the Flow again"],
    ["candidate.trial_not_judged", "The test couldn't be judged. Next: testing the Flow again"],
    ["candidate.trial_stale_revision", "The test didn't run. Next: deciding what to do"]
  ];
  for (const [code, detail] of cases) {
    const h = harness();
    h.feed(trialStarted(`v-${code}`), trialStep(1, "Opening the start page", `v-${code}`), trialEnded(code, `v-${code}`));
    expect([h.now().headline, h.now().detail], code).toStrictEqual(["Building your Flow", detail]);
    expect(!REPAIR_WORDS.test(words(h.now())), code).toBeTruthy();
  }
});

test("a build that ends during its trial says the build failed, never that a fix failed", () => {
  const h = harness();
  h.feed(trialStarted(), trialStep(2, "Clicking “Collected”"), ...trialStepFailed(2, "Clicking “Collected”"), event({ phase: "failed", label: "Build stopped: a budget ran out", final: true }));
  // "Build stopped" is only Core's bare cancellation label (pacer.ts); a stop with a cause reads as the build's failure.
  expect([h.now().headline, h.now().outcome]).toStrictEqual(["Build failed", "failed"]);
  const h2 = harness();
  h2.feed(trialStarted("b2"), ...trialStepFailed(2, "Clicking “Collected”", "b2"), event({ phase: "failed", label: "Build failed", final: true }, "build", "b2"));
  expect([h2.now().headline, h2.now().outcome]).toStrictEqual(["Build failed", "failed"]);
});

test("a saved Flow's run is 'Running your Flow', and its repair is still 'Fixing your Flow'", () => {
  const h = harness();
  h.feed(event({ phase: "running", label: "Running step 3 of 5: Open the cart", step: { index: 3, count: 5 } }, "run", "r1"));
  expect(h.now().headline).toBe("Running your Flow");
  h.feed(
    event({ phase: "repairing", label: "Recovering from a failed step: Open the cart" }, "run", "r1"),
    event({ phase: "repairing", label: "Working out what went wrong", detail: { kind: "thought", title: "Working out what went wrong", text: "The cart link moved to the header.", status: "succeeded" } }, "run", "r1")
  );
  expect(h.now().headline).toBe("Fixing your Flow");
  h.feed(event({ phase: "failed", label: "Run failed", final: true }, "run", "r1"));
  expect(h.now().headline).toBe("Couldn't fix your Flow");
});

test("a build's repair of a refuted answer outside any trial is still 'Fixing your Flow'", () => {
  const h = harness();
  h.feed(trialStarted(), trialEnded("candidate.trial_yes"), event({ phase: "repairing", label: "Repairing the Flow: the result check refuted its answer (attempt 1 of 2)" }));
  expect(h.now().headline).toBe("Fixing your Flow");
});

test("a test is opened by the build's core.test_candidate row, its decision to test, or its run's first step, and closed by the build's own next work", () => {
  const trial = new CandidateTrial();
  expect(trial.observe(event({ phase: "exploring", label: "Saving the Flow's steps", detail: { kind: "tool", title: "Saving the Flow's steps", status: "started", ref: "core.submit_candidate" } }), "build").testing).toBe(false);
  expect(trial.observe(trialStarted(), "build")).toStrictEqual({ testing: true, startedNow: true, endedNow: false, line: null });
  expect(trial.observe(trialStep(1, "Opening the start page"), "build").testing).toBe(true);
  // A new unit of work starts outside any test; a build's run step there opens its own (t366: Core sends no core.test_candidate row).
  expect(trial.observe(event({ phase: "exploring", label: "Using core.run_node" }, "build", "other"), "build")).toStrictEqual({ testing: false, startedNow: false, endedNow: false, line: null });
  expect(trial.observe(trialStep(1, "Opening the start page", "other"), "build")).toStrictEqual({ testing: true, startedNow: true, endedNow: false, line: null });
  // The build's next decision closes it, with no line of its own.
  expect(trial.observe(event({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } }, "build", "other"), "build")).toStrictEqual({ testing: false, startedNow: false, endedNow: true, line: null });
  // The decision to test opens it with Core's words for the test, and a loop tool row closes it.
  expect(trial.observe(event({ phase: "exploring", label: TITLE, detail: { kind: "thought", title: TITLE, text: "Testing revision 2.", status: "succeeded" } }, "build", "other"), "build")).toStrictEqual({ testing: true, startedNow: true, endedNow: false, line: TITLE });
  expect(trial.observe(event({ phase: "exploring", label: "Looking over the whole page", detail: { kind: "tool", title: "Looking over the whole page", status: "started", ref: "web.find_on_page" } }, "build", "other"), "build").endedNow).toBe(true);
  // A saved Flow's run step is the run itself, never a test.
  expect(trial.observe(trialStep(1, "Opening the start page", "r1"), "run").testing).toBe(false);
  expect(trial.observe(trialStarted("b3"), "build").startedNow).toStrictEqual(true);
  // A unit that settles with its test open closes it.
  expect(trial.observe(event({ phase: "failed", label: "Build failed", final: true }, "build", "b3"), "build").testing).toBe(false);
  expect(trial.observe(event({ phase: "exploring", label: "Using core.run_node" }, "build", "b3"), "build").testing).toBe(false);
});

test("the headline names a test above a repair, and a failed test is never a failed fix", () => {
  expect(activityHeadline("build", null, { testing: true })).toBe("Testing your Flow");
  expect(activityHeadline("build", null, { testing: true, repairing: true })).toBe("Testing your Flow");
  expect(activityHeadline("run", "failed", { testing: true, repairing: true })).toBe("Run failed");
  expect(activityHeadline("build", "waiting", { testing: true, waitingOn: "check" })).toBe("Waiting for you: finish the check on the page");
});
