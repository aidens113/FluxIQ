// Tells a run that presses a failed step again from a run whose Flow is being
// repaired. Core reports both in its `repairing` phase: its recovery ladder
// ("Recovering from a failed step", then a choice such as "Trying the step
// again", Core's `activity/wording/recovery-choice.ts`) and its repair of the
// step ("Working out what went wrong", "Deciding how to repair the step").
// Only the second changes the Flow, so only the second heads the status
// "Fixing your Flow"; a retry keeps "Running your Flow" and says why it tries
// again ("The page was busy, trying again": D12 of the t174 UI review of
// run-musp8nz1-dbd3905a, where the overlay said "Fixing your Flow" while the
// chat rightly said "Trying the step again"). Every `repairing` event of a
// build is a repair; a build's test of its Flow is told as a run (`pacer.ts`).
//
// "Trying again" is said only once the ladder chose to press the step again.
// The failed step's row comes before the ladder decides, so it says only why
// the step failed ("The page turned it down"): a refusal the ladder never
// retries read "The page turned it down, trying again" until the ladder's end
// took it down (t366, lane A round 5, `run-muz0f12h-eae63685`).
//
// Every event of the unit passes through `observe`, the model's thoughts
// included: a recovery choice is a thought row, and it is what keeps a retry
// a retry (`pacer.ts`).

import { activityActionOf } from "../activity-action/index.ts";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { ActivityDisplay } from "./activity-display.ts";

/** Core's sentence for a run step that failed, before its recovery ladder runs (Core's `activity/step/recovering.ts`). */
const RECOVERING = /^Recovering from a failed step\b/u;

/**
 * Core's recovery-ladder choices that press the step again, and those that
 * end the ladder without pressing it. None of them changes the Flow.
 */
const RETRY_CHOICES: ReadonlySet<string> = new Set(["Trying the step again", "Waiting for the page to catch up", "Clearing what was in the way"]);
const LADDER_ENDS: ReadonlySet<string> = new Set([
  "Moving on: the step's result is already there",
  // A ladder that pressed the step again and still failed, and one that did not press it again (t366).
  "Trying again didn't help",
  "Not repeating the step",
  // Both, as a Core before t366 said them.
  "The quick fixes didn't help"
]);

/** A failed step whose failure names no reason. */
const UNEXPLAINED = "That step didn't work";
/** What a retry adds to why the step failed. */
const TRYING_AGAIN = ", trying again";

/** What a run's recovery makes of one event. */
export type RetryState = {
  /** The status line in place of the event's own words, from a run's failed step until it runs on: why it failed, then that it is pressed again. */
  readonly line: string | null;
  /** The retry line this very event ended, so a display still showing it can let it go. */
  readonly ended: string | null;
  /** Core is repairing the Flow, not only pressing a step again. */
  readonly repairing: boolean;
};

export class RunRetry {
  private activityId: string | undefined;
  private line: string | null = null;
  /** Why the step being recovered failed, as the line says it. */
  private why: string | null = null;
  private repairing = false;

  /** Folds `event`, of a unit of `kind`, in and answers what the run's recovery makes of it. */
  observe(event: ClientGatewayActivity, kind: ActivityDisplay["subjectKind"]): RetryState {
    if (event.activityId !== this.activityId) {
      this.activityId = event.activityId;
      this.line = null;
      this.why = null;
      this.repairing = false;
    }
    if (kind === "build") return { line: null, ended: null, repairing: true };
    const before = this.line;
    const line = this.fold(event);
    return { line, ended: before !== null && this.line === null ? before : null, repairing: this.repairing };
  }

  private fold(event: ClientGatewayActivity): string | null {
    if (event.phase !== "repairing") {
      // The run reported its next step: the retry, or the repair, is over.
      if (event.phase === "running" && event.step !== undefined) {
        this.line = null;
        this.why = null;
        this.repairing = false;
      }
      return null;
    }
    if (RECOVERING.test(event.label)) {
      // Why the step failed, as its card says it ("the page was busy").
      const why = event.detail ? activityActionOf(event)?.why : null;
      this.why = why ? capitalised(why) : UNEXPLAINED;
      this.line = this.why;
      return this.line;
    }
    const title = event.detail?.kind === "thought" ? event.detail.title : event.label;
    if (RETRY_CHOICES.has(title)) {
      if (this.why !== null) this.line = `${this.why}${TRYING_AGAIN}`;
      return this.line ?? title;
    }
    this.line = null;
    this.why = null;
    if (!LADDER_ENDS.has(title)) this.repairing = true;
    return null;
  }
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
