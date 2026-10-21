// Tells a build's test of its Flow apart from the rest of the build, so the
// status names it as a test of the Flow, never as a repair.
//
// A candidate creation build tests each Flow it submits by running it once,
// from its start, with no model (Core's `runtime/service/candidate-trial/
// run.ts`). That run reports its steps under the build's own unit of work, and
// a step that fails in it reports Core's "Recovering from a failed step" row in
// the `repairing` phase, as any run's failed step does. Read as the build's own
// events, that row headed the status "Fixing your Flow" with the trial's "Step
// 2 of 8", and the heading stayed after the trial ended (lane A round 4,
// `run-muyrpbnk-fef374e7`): nothing was being fixed.
//
// What Core sends, and nothing guessed. t363 opened the test on the build's
// tool row for `core.test_candidate`, but Core sends no such row: the candidate
// authoring loop runs its own two tools outside the `executeTool` the activity
// observer wraps (Core's `flow-bootstrap/candidate/authoring-loop.ts`), so lane
// A round 5 (`run-muz0f12h-eae63685`) still read "Building your Flow | Step 2
// of 10" through trial 2 and "Fixing your Flow | Step 9 of 10" after it (t366).
// A test reaches the stream as:
//
// - the decision's thought, titled with Core's own words for the test tool
//   ("Testing the whole Flow from the start", `activity/wording/core-tool.ts`),
//   sent only when the model gave a reason;
// - the run's rows: a "Running step N of M" row carries `step`, which only the
//   graph executor sends (`activity/step/started.ts`). A build runs its Flow's
//   steps only to test it, so a build's row with a `step` is its test running;
// - the build's tool row for `core.test_candidate`, should Core ever send it:
//   it opens the test (`started`) and closes it with the trial gate's verdict
//   (record "Result: candidate.trial_<verdict>", `flow-bootstrap/candidate/
//   trial-gate.ts`).
//
// The test ends when the build goes back to its own work: the next decision
// ("Deciding the next step", Core's row opening every decision), any other
// tool row, or the unit settling.

import { activityActionOf } from "../activity-action/index.ts";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { ActivityDisplay } from "./activity-display.ts";

/** Core's tool id for testing a submitted candidate (`flow-bootstrap/candidate/trial-gate.ts`). */
const TEST_CANDIDATE = "core.test_candidate";

/** Core's words for a decision to call the test tool (`activity/wording/core-tool.ts`). */
const TEST_DECISION_TITLE = "Testing the whole Flow from the start";

/** Core's sentence for a run step that failed (`activity/step/recovering.ts`). */
const RECOVERING = /^Recovering from a failed step\b/u;

/** The result code a trial's closing row carries in its record. */
const RESULT_CODE = /^Result:\s*(\S+)/u;

/** What the status says when a trial ends, by the trial gate's result code; anything else did not run. */
const ENDINGS: ReadonlyMap<string, string> = new Map([
  ["candidate.trial_yes", "The test passed: the Flow did what you asked"],
  ["candidate.trial_no", "The test failed: the Flow didn't do what you asked. Next: changing it and testing again"],
  ["candidate.trial_execution_failed", "The test failed: a step didn't work. Next: changing the Flow and testing again"],
  ["candidate.trial_unsure", "The test couldn't be judged. Next: testing the Flow again"],
  ["candidate.trial_not_judged", "The test couldn't be judged. Next: testing the Flow again"]
]);
const NOT_RUN = "The test didn't run. Next: deciding what to do";
const STEP_FAILED = "A step didn't work in the test";

/** What a build's test of its Flow makes of one event. */
export type TrialState = {
  /** This event belongs to a test still under way: the row that opened it or one of its run's events. */
  readonly testing: boolean;
  /** This event is the row that opened the test. */
  readonly startedNow: boolean;
  /** This event is the row that closed the test. */
  readonly endedNow: boolean;
  /** The status line in place of the event's own words, when the test has one to say. */
  readonly line: string | null;
};

const OUTSIDE: TrialState = Object.freeze({ testing: false, startedNow: false, endedNow: false, line: null });

export class CandidateTrial {
  private activityId: string | undefined;
  private open = false;

  /**
   * Folds `event`, of a unit of `kind`, in and answers what the test makes of
   * it. A step run only to get the page ready (`preparing`,
   * `steady/page-preparation.ts`) is no test of the Flow, and ends one still
   * open (t753: a setup rerun read "Testing your Flow").
   */
  observe(event: ClientGatewayActivity, kind: ActivityDisplay["subjectKind"], preparing = false): TrialState {
    if (event.activityId !== this.activityId) {
      this.activityId = event.activityId;
      this.open = false;
    }
    // A saved Flow's run is the run itself, never a test of it.
    if (kind !== "build") return OUTSIDE;
    if (preparing) {
      const wasOpen = this.open;
      this.open = false;
      return wasOpen ? { testing: false, startedNow: false, endedNow: true, line: null } : OUTSIDE;
    }
    const detail = event.detail;
    if (detail?.kind === "tool" && detail.ref === TEST_CANDIDATE) {
      if (detail.status === "started") return this.opened(null);
      this.open = false;
      const code = RESULT_CODE.exec(detail.text ?? "")?.[1];
      return { testing: false, startedNow: false, endedNow: true, line: (code ? ENDINGS.get(code) : undefined) ?? NOT_RUN };
    }
    // The unit settled: a test under way ends with it.
    if (event.final === true || event.phase === "failed" || event.phase === "done") {
      this.open = false;
      return OUTSIDE;
    }
    if (!this.open) {
      if (detail?.kind === "thought" && detail.title === TEST_DECISION_TITLE) return this.opened(TEST_DECISION_TITLE);
      return event.step !== undefined ? this.opened(null) : OUTSIDE;
    }
    if (backToTheBuild(event)) {
      this.open = false;
      return { testing: false, startedNow: false, endedNow: true, line: null };
    }
    return { testing: true, startedNow: false, endedNow: false, line: RECOVERING.test(event.label) ? stepFailed(event) : null };
  }

  private opened(line: string | null): TrialState {
    this.open = true;
    return { testing: true, startedNow: true, endedNow: false, line };
  }
}

/**
 * The build doing its own work again, which no row of the test's run is: the
 * row opening its next decision (a thought `started`, or a bare thinking
 * event), or a tool row -- the loop's calls; the run's own rows are steps,
 * the ladder's thoughts and asks.
 */
function backToTheBuild(event: ClientGatewayActivity): boolean {
  const detail = event.detail;
  if (detail === undefined) return event.phase === "thinking";
  return (detail.kind === "thought" && detail.status === "started") || detail.kind === "tool";
}

/** A test's failed step, with why when the row says it ("A step didn't work in the test: it wasn't on the page"). */
function stepFailed(event: ClientGatewayActivity): string {
  const why = event.detail ? activityActionOf(event)?.why : null;
  return why ? `${STEP_FAILED}: ${why}` : STEP_FAILED;
}
