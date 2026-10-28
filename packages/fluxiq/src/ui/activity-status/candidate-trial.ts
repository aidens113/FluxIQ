// Tells a build's test of its Flow on the site apart from the rest of the
// build, so the status names it as a test on the site, never as a repair, and
// only while the Flow really runs on the site (t769 b13).
//
// A candidate creation build tests each Flow it submits by running it once,
// from its start, with no model (Core's `runtime/service/candidate-trial/
// run.ts`); a project builder tests its part the same way, and the supervisor
// the whole Flow. That run reports its steps under the build's own unit of
// work, and a step that fails in it reports Core's "Recovering from a failed
// step" row in the `repairing` phase, as any run's failed step does. Read as
// the build's own events, that row headed the status "Fixing your Flow" with
// the trial's "Step 2 of 8" (lane A round 4, `run-muyrpbnk-fef374e7`).
//
// What Core sends, and nothing guessed. A test reaches the stream as:
//
// - the decision's thought, titled with Core's own words for the test tool
//   ("Testing the whole Flow from the start", "Testing one part of the Flow",
//   `activity/wording/core-tool.ts`), sent only when the model gave a reason;
// - the test call's tool row (`core.test_*`), where the observer wraps the
//   call: `started`, then closed with the gate's code and Core's words
//   (`steady/test-ending.ts`);
// - the run's rows: a "Running step N of M" row carries `step`, which only the
//   graph executor sends (`activity/step/started.ts`). A build runs its Flow's
//   steps only to test it, so a build's row with a step is its test running on
//   the site.
//
// **Only a step on the site opens the test (t769 b13).** The decision to test
// and the call's opening row run nothing: the gate may refuse the test before
// anything runs (a put-back still needed, a retest limit), and the status read
// "Testing your Flow" for tests that never ran (round 6,
// `run-mvrj7qgf-a44a1427`, moments 21-25). They only begin the call, whose
// closing row then says how it ended: that it didn't run and why, the
// verdict, or that it was checked against the recorded run and never tried on
// the site. Steps run aside from the test -- to get the page ready
// (`steady/page-preparation.ts`) or to check the Flow against the recorded run
// (`steady/recorded-check.ts`) -- are no test on the site, and end one open.
//
// The test ends when the build goes back to its own work: the next decision
// ("Deciding the next step", Core's row opening every decision), any other
// tool row, or the unit settling.

import { activityActionOf } from "../activity-action/index.ts";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { ActivityDisplay } from "./activity-display.ts";
import { activityTestEnding } from "./steady/test-ending.ts";

/** The tools that test a build's Flow: `core.test_candidate`, `core.test_subflow` (`runtime/activity/candidate/result.ts`). */
const TEST_TOOL = /^core\.test_[a-z_]+$/u;

/** Core's words for a decision to call a test tool (`activity/wording/core-tool.ts`). */
const TEST_DECISION_TITLES: ReadonlySet<string> = new Set(["Testing the whole Flow from the start", "Testing one part of the Flow"]);

/** Core's sentence for a run step that failed (`activity/step/recovering.ts`). */
const RECOVERING = /^Recovering from a failed step\b/u;

const STEP_FAILED = "A step didn't work in the test";

/** A run made aside from the test on the site: getting the page ready, or checking against the recorded run. */
export type TrialAside = "preparing" | "recorded" | null;

/** What a build's test of its Flow makes of one event. */
export type TrialState = {
  /** This event belongs to a test still under way: the row that opened it or one of its run's events. */
  readonly testing: boolean;
  /** This event is the row that opened the test. */
  readonly startedNow: boolean;
  /** This event is the row that closed the test. */
  readonly endedNow: boolean;
  /** This event is the decision or the call that begins a test, before anything of it runs. */
  readonly calledNow?: boolean;
  /** The status line in place of the event's own words, when the test has one to say. */
  readonly line: string | null;
};

const OUTSIDE: TrialState = Object.freeze({ testing: false, startedNow: false, endedNow: false, line: null });

export class CandidateTrial {
  private activityId: string | undefined;
  private open = false;
  /** Since the test call began: a step was checked against the recorded run, and a step ran on the site. */
  private checkedOnRecording = false;
  private ranOnSite = false;

  /**
   * Folds `event`, of a unit of `kind`, in and answers what the test makes of
   * it. `aside` says the event belongs to a run made aside from the test on
   * the site (header): it is no test of the Flow on the site, and ends one
   * still open. `true` reads as `"preparing"`, as before t769.
   */
  observe(event: ClientGatewayActivity, kind: ActivityDisplay["subjectKind"], aside: TrialAside | boolean = null): TrialState {
    if (event.activityId !== this.activityId) {
      this.activityId = event.activityId;
      this.open = false;
      this.called();
    }
    // A saved Flow's run is the run itself, never a test of it.
    if (kind !== "build") return OUTSIDE;
    const apart = aside === true ? "preparing" : aside === false ? null : aside;
    if (apart !== null) {
      if (apart === "recorded") this.checkedOnRecording = true;
      const wasOpen = this.open;
      this.open = false;
      return wasOpen ? { testing: false, startedNow: false, endedNow: true, line: null } : OUTSIDE;
    }
    const detail = event.detail;
    if (detail?.kind === "tool" && detail.ref !== undefined && TEST_TOOL.test(detail.ref)) {
      this.open = false;
      if (detail.status === "started") {
        this.called();
        return { testing: false, startedNow: false, endedNow: false, calledNow: true, line: null };
      }
      const line = activityTestEnding(event, this.checkedOnRecording && !this.ranOnSite);
      this.called();
      return { testing: false, startedNow: false, endedNow: true, line };
    }
    // The unit settled: a test under way ends with it.
    if (event.final === true || event.phase === "failed" || event.phase === "done") {
      this.open = false;
      return OUTSIDE;
    }
    if (!this.open) {
      if (detail?.kind === "thought" && TEST_DECISION_TITLES.has(detail.title)) {
        this.called();
        return { testing: false, startedNow: false, endedNow: false, calledNow: true, line: detail.title };
      }
      if (event.step === undefined) return OUTSIDE;
      this.ranOnSite = true;
      this.open = true;
      return { testing: true, startedNow: true, endedNow: false, line: null };
    }
    if (backToTheBuild(event)) {
      this.open = false;
      return { testing: false, startedNow: false, endedNow: true, line: null };
    }
    return { testing: true, startedNow: false, endedNow: false, line: RECOVERING.test(event.label) ? stepFailed(event) : null };
  }

  /** A test call begins, or ended: nothing of it has run yet. */
  private called(): void {
    this.checkedOnRecording = false;
    this.ranOnSite = false;
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
