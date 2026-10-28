// The status during a build's tests says what is really happening (t769 b13,
// round 6's UI reviews of `run-mvrj7qg9-b6dc94f6` and `run-mvrj7qgf-a44a1427`):
//
// - a setup rerun (the parts before a part, run only to put the page where it
//   starts) reads as getting the page ready, never as testing, even when one of
//   its steps is skipped;
// - a test Core refused before it ran reads that it didn't run, and why, never
//   "Testing" (round 6 photo moments 21-25: "Testing one part of the Flow" for
//   tests refused for a needed put-back);
// - a test checked against the recorded run reads as that, and a failure the
//   recording kept says it was not tried on the site;
// - a test that runs on the site, after a recorded check or on its own, reads
//   as testing on the site.
//
// The rows follow Core's emitters: the observer's tool rows (`activity/
// observer.ts`, the record's `Declined:`/`Said:` words from `activity/
// candidate/`), and step rows (`activity/step/started.ts`).

import { expect, test } from "vitest";

import type { ActivityDisplay, ClientGatewayActivity } from "../index.ts";
import { personFacingTextFaults } from "../../person-facing/index.ts";
import { ACTIVITY_HEADLINE_DWELL_MS, ActivityPacer } from "../pacer.ts";
import { FakeClock } from "./fake-clock.ts";
import { TEST_HOST_WORDS } from "./test-host-words.ts";

let sequence = 0;
function event(fields: Partial<ClientGatewayActivity> & Pick<ClientGatewayActivity, "phase" | "label">, id: string): ClientGatewayActivity {
  sequence += 1;
  return { activityId: `build:${id}`, sequence, subject: { kind: "build", id, projectId: "p" }, at: "2026-10-27T03:21:36.000Z", ...fields };
}

function harness() {
  const clock = new FakeClock(1_000);
  const pacer = new ActivityPacer({ clock, hostWords: TEST_HOST_WORDS, onChange: () => undefined });
  /** Feeds each event a headline's dwell apart, so every one is shown; returns the display after each. */
  const feed = (...events: ClientGatewayActivity[]): ActivityDisplay[] => events.map((each) => {
    clock.advance(ACTIVITY_HEADLINE_DWELL_MS);
    pacer.accept(each);
    return pacer.display()!;
  });
  return { feed };
}

const SUBFLOW_TEST = "Testing one part of the Flow";
const WHOLE_TEST = "Testing the whole Flow from the start";
const ON_SITE = "Testing your Flow on the site";
const RECORDED = "Checking your Flow against the recorded run";
const SETUP = "Getting the page ready";

const testStarted = (id: string, ref = "core.test_subflow", title = SUBFLOW_TEST) =>
  event({ phase: "exploring", label: title, detail: { kind: "tool", title, status: "started", ref } }, id);
const testEnded = (id: string, record: string, status: "succeeded" | "failed", outcome: string, ref = "core.test_subflow", title = SUBFLOW_TEST) =>
  event({ phase: "exploring", label: `${title} — ${outcome}`, detail: { kind: "tool", title, status, ref, text: record } }, id);
const deciding = (id: string) => event({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } }, id);
/** A step the Flow runs on the site (`started.ts`). */
const liveStep = (id: string, index: number, count: number, action: string) =>
  event({ phase: "running", label: `Running step ${index} of ${count}: ${action}`, step: { index, count, nodeId: `n${index}` }, detail: { kind: "step", title: action, status: "started", ref: `n${index}` } }, id);
/** A step run only to get the page ready (`started.ts` under `preparation.ts`). */
const setupStep = (id: string, index: number, count: number, action: string) =>
  event({ phase: "running", label: `${SETUP}: ${action}`, step: { index, count, nodeId: `p${index}` }, detail: { kind: "step", title: action, status: "started", ref: `p${index}` } }, id);
/** A step checked against the recorded run (`started.ts` under `recorded-check.ts`). */
const recordedStep = (id: string, index: number, count: number, action: string) =>
  event({ phase: "running", label: `Checking against the recorded run: ${action}`, step: { index, count, nodeId: `r${index}` }, detail: { kind: "step", title: action, status: "started", ref: `r${index}` } }, id);
/** A step passed over, which carries the step it is numbered as (`skipped.ts`). */
const skippedStep = (id: string, index: number, count: number, what: string) =>
  event({ phase: "running", label: `Skipped “${what}”: it was not shown`, step: { index, count, nodeId: `s${index}` }, detail: { kind: "step", title: `Skipped “${what}”: it was not shown`, status: "succeeded", ref: `s${index}`, skipped: { reason: "optional_absent" } } }, id);

const words = (display: ActivityDisplay) => `${display.headline} | ${display.step ? `Step ${display.step.index} of ${display.step.count}` : "-"} | ${display.detail ?? ""}`;
const TESTING = /\btesting\b/iu;

test("a setup rerun reads as getting the page ready, a skipped step in it too, and the part's own test then reads as testing on the site", () => {
  const h = harness();
  const id = "setup";
  const shown = h.feed(
    testStarted(id),
    setupStep(id, 2, 4, "Opening another page"),
    skippedStep(id, 3, 4, "Not now"),
    setupStep(id, 4, 4, "Save the job (row 1)")
  );
  const setup = shown.slice(1);
  expect(setup.map((display) => display.headline), setup.map(words).join("\n")).toStrictEqual(setup.map(() => SETUP));
  expect(setup.every((display) => display.step === null && !TESTING.test(display.detail ?? "")), setup.map(words).join("\n")).toBe(true);
  const [own] = h.feed(liveStep(id, 1, 2, "Reading the list"));
  expect([own!.headline, own!.step]).toStrictEqual([ON_SITE, { index: 1, count: 2 }]);
});

test("a test refused before it ran reads that it didn't run, with its plain reason, never 'Testing'", () => {
  const h = harness();
  const id = "refused";
  const [started, ended] = h.feed(
    testStarted(id),
    testEnded(id, "Result: candidate.trial_reset_required · Reason: retry_allowed · Declined: the site first has to be put back the way the build found it", "failed", "not done")
  );
  expect(started!.headline, "a test call that has run nothing yet is no test under way").toBe("Building your Flow");
  expect([ended!.headline, ended!.detail]).toStrictEqual(["Building your Flow", "The test didn't run: the site first has to be put back the way the build found it"]);

  // The supervisor's whole-Flow test, refused for leftovers under the project's code, whose card words are generic.
  const h2 = harness();
  const id2 = "refused-whole";
  const shown = h2.feed(
    testStarted(id2, "core.test_candidate", WHOLE_TEST),
    testEnded(id2, "Result: project.trial_reset_required · Reason: retry_allowed · Declined: the test couldn't start", "failed", "not done", "core.test_candidate", WHOLE_TEST)
  );
  expect(shown.map((display) => display.headline), shown.map(words).join("\n")).toStrictEqual(["Building your Flow", "Building your Flow"]);
  expect(shown.at(-1)!.detail).toBe("The test didn't run: the site had changes left from earlier in the build");

  // A retest limit, worded by Core's card.
  const h3 = harness();
  const [, limited] = h3.feed(
    testStarted("limit"),
    testEnded("limit", "Result: subflow.trial_retest_limit · Declined: these steps were already tested as often as they may be, so they have to change first", "failed", "not done")
  );
  expect(limited!.detail).toBe("The test didn't run: these steps were already tested as often as they may be, so they have to change first");
  // The next decision keeps the line, not the test call's words.
  const [next] = h3.feed(deciding("limit"));
  expect(next!.detail).toBe(limited!.detail);
});

test("a failure the recorded run kept reads as checked against the recording, never as testing on the site", () => {
  const h = harness();
  const id = "kept";
  const shown = h.feed(
    testStarted(id),
    recordedStep(id, 1, 3, "Opening the start page"),
    skippedStep(id, 2, 3, "Not now"),
    recordedStep(id, 3, 3, "Clicking “Save”"),
    testEnded(id, "Result: subflow.trial_no · Reason: retry_allowed · Said: checked against the recorded run, not the site: the Flow ran, but it didn't do what you asked", "failed", "didn't pass")
  );
  const checking = shown.slice(1, -1);
  expect(checking.map((display) => display.headline), checking.map(words).join("\n")).toStrictEqual(checking.map(() => RECORDED));
  expect(shown.every((display) => display.headline !== ON_SITE), shown.map(words).join("\n")).toBe(true);
  const ended = shown.at(-1)!;
  expect([ended.headline, ended.detail]).toStrictEqual(["Building your Flow", "Checked against the recorded run, not the site: the Flow still didn't do what you asked. Next: changing it and testing again"]);
});

test("a test checked against the recording and then run on the site, and a plain live test, read as testing on the site", () => {
  const h = harness();
  const id = "then-live";
  const shown = h.feed(
    testStarted(id, "core.test_candidate", WHOLE_TEST),
    recordedStep(id, 1, 2, "Opening the start page"),
    liveStep(id, 1, 2, "Opening the start page"),
    liveStep(id, 2, 2, "Clicking “Save”"),
    testEnded(id, "Result: candidate.trial_yes · Said: it passed against the recorded run, then on the site: the test passed and the Flow did what you asked", "succeeded", "passed", "core.test_candidate", WHOLE_TEST)
  );
  expect(shown.map((display) => display.headline), shown.map(words).join("\n")).toStrictEqual(["Building your Flow", RECORDED, ON_SITE, ON_SITE, "Building your Flow"]);
  expect(shown.at(-1)!.detail).toBe("The test passed: the Flow did what you asked");

  const h2 = harness();
  const live = h2.feed(testStarted("live"), liveStep("live", 1, 2, "Opening the start page"), liveStep("live", 2, 2, "Reading the list"));
  expect(live.slice(1).map((display) => display.headline)).toStrictEqual([ON_SITE, ON_SITE]);
});

test("the new words are plain: no internal term, id or code", () => {
  for (const text of [ON_SITE, RECORDED, SETUP, "The test didn't run: the site first has to be put back the way the build found it", "Checked against the recorded run, not the site: the Flow still didn't do what you asked. Next: changing it and testing again", "Checked against the recorded run, not the site: a step still didn't work. Next: changing the Flow and testing again"]) {
    expect(personFacingTextFaults(text), text).toStrictEqual([]);
  }
});
