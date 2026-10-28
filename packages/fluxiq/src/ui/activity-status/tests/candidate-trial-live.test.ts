// The status during a candidate trial, fed the rows Core really sends
// (lane A round 5, `run-muz0f12h-eae63685`, t366). t363 headed a trial
// "Testing your Flow" from the build's `core.test_candidate` tool row, but Core
// sends no such row: the candidate authoring loop runs its two tools itself,
// outside the `executeTool` the activity observer wraps
// (`flow-bootstrap/candidate/authoring-loop.ts`), so a trial reaches the
// activity stream only as the decision's thought ("Testing the whole Flow from
// the start", sent when the model gave a reason) and then the trial run's own
// rows: "Running step N of M", a failed step's "Recovering from a failed
// step", the recovery ladder's choice, all in the build's unit of work. The
// overlay samples of that run read "Building your Flow | Step 2 of 10" during
// trial 2 and "Fixing your Flow | Step 9 of 10 | Looking over the whole page"
// after it.
//
// The rows below follow Core's emitters: `activity/observer.ts` (the decision
// rows and the exploring tool rows), `activity/step/started.ts`,
// `activity/step/recovering.ts`, `executor/state-routing/announcement.ts` and
// `activity/wording/recovery-choice.ts` (the ladder's choice, as round 5's Core
// worded it).

import { expect, test } from "vitest";

import type { ActivityDisplay, ClientGatewayActivity } from "../index.ts";
import { ACTIVITY_HEADLINE_DWELL_MS, ActivityPacer } from "../pacer.ts";
import { FakeClock } from "./fake-clock.ts";
import { TEST_HOST_WORDS } from "./test-host-words.ts";

let sequence = 0;
function event(fields: Partial<ClientGatewayActivity> & Pick<ClientGatewayActivity, "phase" | "label">, kind: "build" | "run" = "build", id = "b5"): ClientGatewayActivity {
  sequence += 1;
  return { activityId: `${kind}:${id}`, sequence, subject: { kind, id, projectId: "p" }, at: "2026-10-08T04:04:10.000Z", ...fields };
}

function harness() {
  const clock = new FakeClock(1_000);
  const shown: ActivityDisplay[] = [];
  const pacer = new ActivityPacer({ clock, hostWords: TEST_HOST_WORDS, onChange: (display) => shown.push(display) });
  /** Feeds each event a headline's dwell apart, so every one is shown, a new headline too; returns the display after each. */
  const feed = (...events: ClientGatewayActivity[]): ActivityDisplay[] => events.map((each) => {
    clock.advance(ACTIVITY_HEADLINE_DWELL_MS);
    pacer.accept(each);
    return pacer.display()!;
  });
  return { shown, feed };
}

const TEST_TITLE = "Testing the whole Flow from the start";
const COUNT = 10;
const deciding = (kind: "build" | "run" = "build", id = "b5") => event({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } }, kind, id);
const decidedToTest = (id = "b5") => event({ phase: "exploring", label: TEST_TITLE, detail: { kind: "thought", title: TEST_TITLE, text: "Revision 2 uses clicks for the choices; testing it from the start.", status: "succeeded" } }, "build", id);
const step = (index: number, title: string, kind: "build" | "run" = "build", id = "b5") =>
  event({ phase: "running", label: `Running step ${index} of ${COUNT}: ${title}`, step: { index, count: COUNT, nodeId: `s${index}` }, detail: { kind: "step", title, status: "started", ref: `s${index}`, text: "Node: web.output.dom-click" } }, kind, id);
const skipped = (index: number, title: string, id = "b5") => event({ phase: "running", label: `Skipped ${title}: it was not shown`, detail: { kind: "step", title: `Skipped ${title}: it was not shown`, status: "succeeded", ref: `s${index}` } }, "build", id);
const recovering = (index: number, label: string, title: string, code: string, kind: "build" | "run" = "build", id = "b5") =>
  event({ phase: "repairing", label: `Recovering from a failed step: ${label}`, detail: { kind: "step", title, status: "failed", ref: `s${index}`, text: `Result: ${code} · Node: web.output.dom-click` } }, kind, id);
const retryChoice = (index: number, kind: "build" | "run" = "build", id = "b5") =>
  event({ phase: "repairing", label: "Trying the step again", detail: { kind: "thought", title: "Trying the step again", text: "The step didn't work, and a step like this often works on a second try, so FluxIQ is trying it once more.", status: "succeeded", ref: `s${index}` } }, kind, id);
/** The ladder's end as round 5's Core worded it, for a refusal it never tried again. */
const oldStop = (index: number, kind: "build" | "run" = "build", id = "b5") =>
  event({ phase: "repairing", label: "The quick fixes didn't help", detail: { kind: "thought", title: "The quick fixes didn't help", text: "Trying again didn't fix the step, so the run follows what the Flow says to do when this step fails.", status: "succeeded", ref: `s${index}` } }, kind, id);
/** The same end as Core words it since t366 (`activity/wording/recovery-choice.ts`). */
const newStop = (index: number, kind: "build" | "run" = "build", id = "b5") =>
  event({ phase: "repairing", label: "Not repeating the step", detail: { kind: "thought", title: "Not repeating the step", text: "Another try wouldn't change what happened, so the test follows what the Flow says to do when this step fails.", status: "succeeded", ref: `s${index}` } }, kind, id);
const look = (status: "started" | "succeeded", id = "b5") =>
  event({ phase: "exploring", label: status === "started" ? "Looking over the whole page" : "Looking over the whole page — done", detail: { kind: "tool", title: "Looking over the whole page", status, ref: "web.find_on_page", ...(status === "succeeded" ? { text: "Result: web.find.found" } : {}) } }, "build", id);

/** Trial 2 of round 5: coupon busy once and retried, Space Grey clicked, then Add to cart refused, not retryable. */
function roundFiveTrial(stop: (index: number) => ClientGatewayActivity) {
  return [
    step(1, "Opening the start page"),
    skipped(2, "“Choice Day · free returns on every Choice item”"),
    step(3, "Clicking “Not now”"),
    step(4, "Clicking “Get coupons”"),
    recovering(4, "Get coupons", "Clicking “Get coupons”", "web.action.rate_limited"),
    retryChoice(4),
    step(4, "Clicking “Get coupons”"),
    step(5, "Clicking “Space Grey”"),
    step(6, "Clicking “7-in-1”"),
    step(7, "Clicking “Spain”"),
    step(8, "Typing “3”"),
    step(9, "Clicking “Add to cart”"),
    recovering(9, "Add to cart", "Clicking “Add to cart”", "web.action.refused_by_page"),
    stop(9)
  ];
}

const words = (display: ActivityDisplay) => `${display.headline} | ${display.step ? `Step ${display.step.index} of ${display.step.count}` : "-"} | ${display.detail ?? ""}`;

for (const [name, stop] of [["round 5's ladder words", oldStop], ["t366's ladder words", newStop]] as const) {
  test(`round 5's trial reads "Testing your Flow on the site" throughout, and the build after it is "Building your Flow" with no step count (${name})`, () => {
    const h = harness();
    const before = h.feed(deciding(), look("started"), look("succeeded"), deciding(), decidedToTest());
    // t769 b13: the decision only begins the call -- the gate may still refuse it -- so nothing is tested on the site yet.
    expect([before.at(-1)!.headline, before.at(-1)!.detail], "the decision to test says so, under the build's headline").toStrictEqual(["Building your Flow", TEST_TITLE]);
    const during = h.feed(...roundFiveTrial(stop));
    expect(during.map((display) => display.headline), during.map(words).join("\n")).toStrictEqual(during.map(() => "Testing your Flow on the site"));
    expect(during.every((display) => display.phase !== "repairing"), "a test is coloured as running").toBeTruthy();
    expect(during.at(-1)!.step).toStrictEqual({ index: 9, count: COUNT });
    const after = h.feed(deciding(), look("started"), look("succeeded"));
    expect(after.map((display) => [display.headline, display.step]), after.map(words).join("\n")).toStrictEqual(after.map(() => ["Building your Flow", null]));
    expect(h.shown.every((display) => !/\bfix|repair/iu.test(words(display))), h.shown.map(words).join("\n")).toBeTruthy();
  });

  test(`the refusal round 5's trial never tried again is never said as "trying again" (${name})`, () => {
    const h = harness();
    h.feed(deciding(), decidedToTest());
    const shown = h.feed(...roundFiveTrial(stop));
    const refused = shown.slice(-2);
    for (const display of refused) expect(display.detail ?? "", words(display)).not.toMatch(/trying (it )?again/iu);
    expect(refused[0]!.detail).toBe("A step didn't work in the test: the page turned it down");
    // The busy coupon press that was tried again says so, and only once the ladder chose to.
    const busy = shown.slice(4, 6).map((display) => display.detail);
    expect(busy).toStrictEqual(["A step didn't work in the test: the site asked FluxIQ to slow down", "The site asked FluxIQ to slow down, trying again"]);
  });
}

test("a trial whose decision gave no reason opens at its first run step", () => {
  const h = harness();
  h.feed(deciding(), look("started"), look("succeeded"), deciding());
  const [first] = h.feed(step(1, "Opening the start page"));
  expect([first!.headline, first!.step]).toStrictEqual(["Testing your Flow on the site", { index: 1, count: COUNT }]);
});

test("a saved Flow's run never says 'trying again' for a refusal its ladder does not retry", () => {
  const h = harness();
  const shown = h.feed(step(9, "Clicking “Add to cart”", "run", "r5"), recovering(9, "Add to cart", "Clicking “Add to cart”", "web.action.refused_by_page", "run", "r5"), newStop(9, "run", "r5"), oldStop(9, "run", "r5"));
  for (const display of shown) {
    expect(display.headline, words(display)).toBe("Running your Flow");
    expect(display.detail ?? "", words(display)).not.toMatch(/trying (it )?again/iu);
  }
  // One it does retry says so once the ladder chose to.
  const h2 = harness();
  const retried = h2.feed(step(4, "Clicking “Get coupons”", "run", "r6"), recovering(4, "Get coupons", "Clicking “Get coupons”", "web.action.rate_limited", "run", "r6"), retryChoice(4, "run", "r6"));
  expect(retried.map((display) => display.detail)).toStrictEqual(["Running step 4 of 10: Clicking “Get coupons”", "The site asked FluxIQ to slow down", "The site asked FluxIQ to slow down, trying again"]);
});
