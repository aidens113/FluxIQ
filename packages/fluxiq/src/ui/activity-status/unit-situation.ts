// What one unit of work is in the middle of, beyond its latest event: whether
// Core is repairing the Flow, and whether the page is waiting on a check only
// the person can answer. Both last across events -- a repair spans many model
// calls and page steps, and a robot check stays on the page while the build
// keeps deciding what to do -- so the headline they choose cannot be read off
// one event alone (`headline.ts`).
//
// Every event of the unit passes through `observe`, whether or not the pacer
// shows it, so a repair or a check that begins inside a paced interval still
// changes the headline at once.
//
// What Core reports, and nothing guessed:
//
// - A repair begins with a `repairing` event: a run's "Recovering from a failed
//   step", a build's "Repairing the Flow: the result check refuted its
//   answer". For a run it ends when the run reports its next step; for a build
//   it lasts until the build settles or its result check passes (the `check`
//   row titled "Result check", `succeeded`): Core sends no "repair finished",
//   and a repaired result the check accepted is no longer being fixed (D10 of
//   the t174 UI review of run-murwd8le-79e735a8: "Fixing your Flow" stayed up
//   through the cross-check that followed a passed check).
// - A repair of the Flow itself -- a re-author after the result check refuted
//   a run's answer, Core's "Repairing the Flow" row ("Result repair started")
//   -- is on no step of the run, so the run's step count does not carry into
//   it (U2 of t194, run-musp39u8-9ac026ab: "Fixing your Flow · Step 5 of 5"
//   for the whole four-minute re-author). It lasts until the run reports its
//   next step, which is the repaired Flow's re-run counting its own steps. A
//   run recovering from one failed step is still on that step and keeps it.
// - A check needs the person when a page action's result code is the
//   extension's `web.intervention.required` (`domain/src/runtime/failure/
//   codes.ts`: the page asks for what only a person can give -- a robot check,
//   a code prompt). Core has no event of its own for this; the result code on
//   the build's tool event is the one signal there is. It ends when a later
//   page action succeeds, a run reports its next step, or the wait on the
//   person settles -- Core's closing `ask` row, sent when the person pressed
//   Continue or Stop or nobody answered (D7 of the same review: after
//   Continue the overlay still said "Waiting for you").
// - A run held between steps (Core's `paused` phase, a Take over) gives the
//   page to the person. When Core lets it go on (`running`, "Continuing from
//   step N") whatever stood on the page was theirs to deal with, so a check
//   ends then too, even when the held step has no number (a Merge).

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

/** The extension's result code for a page that only a person can get past. */
const INTERVENTION_CODE = /\bweb\.intervention\.[a-z_.]+|\buser_intervention_required\b/u;

export type UnitState = {
  readonly repairing: boolean;
  /** Core is repairing the Flow itself, not one step of the run: no run step is current. */
  readonly rebuilding: boolean;
  readonly check: boolean;
  /** This very event is the one that reported the check. */
  readonly checkReportedNow: boolean;
};

export class UnitSituation {
  private activityId: string | undefined;
  private repairing = false;
  private rebuilding = false;
  private check = false;
  private paused = false;

  /**
   * Folds `event` in and answers the unit's state after it. An event of a
   * candidate trial (`inTrial`, `candidate-trial.ts`) starts no repair: the
   * trial's run repairs nothing, though its failed step reports the
   * `repairing` phase as any run's does.
   */
  observe(event: ClientGatewayActivity, inTrial = false): UnitState {
    if (event.activityId !== this.activityId) {
      this.activityId = event.activityId;
      this.repairing = false;
      this.rebuilding = false;
      this.check = false;
      this.paused = false;
    }
    const continued = this.paused && event.phase === "running";
    this.paused = event.phase === "paused";
    if (event.phase === "repairing" && !inTrial) this.repairing = true;
    if (repairsTheFlow(event) && !inTrial) this.rebuilding = true;
    const runMovedOn = event.phase === "running" && event.step !== undefined;
    if (runMovedOn || resultCheckPassed(event)) this.repairing = false;
    if (runMovedOn) this.rebuilding = false;
    const reported = asksForPerson(event);
    if (reported) this.check = true;
    else if (runMovedOn || continued || pageActionSucceeded(event) || isSettledAsk(event)) this.check = false;
    return { repairing: this.repairing, rebuilding: this.rebuilding, check: this.check, checkReportedNow: reported };
  }
}

/** Core's title on the row that opens a repair of a refuted answer (`recovery/refuted-result/repair.ts`). */
const RESULT_REPAIR_TITLE = "Result repair started";

/** Core opening a repair of the Flow itself: its "Repairing the Flow" row, never a run's "Recovering from a failed step". */
function repairsTheFlow(event: ClientGatewayActivity): boolean {
  return event.phase === "repairing" && (event.detail?.title === RESULT_REPAIR_TITLE || /^Repairing the Flow/u.test(event.label));
}

/** The event's page action reported that only a person can get past the page. */
function asksForPerson(event: ClientGatewayActivity): boolean {
  return INTERVENTION_CODE.test(event.detail?.text ?? "") || INTERVENTION_CODE.test(event.label);
}

/** A page action that ended well: the page let FluxIQ through, so no check stands in the way now. */
function pageActionSucceeded(event: ClientGatewayActivity): boolean {
  if (event.detail?.kind !== "tool" || event.detail.status !== "succeeded") return false;
  const code = /^Result:\s*(\S+)/u.exec(event.detail.text ?? "")?.[1];
  return code === undefined || /\.(?:succeeded|ok|done)$/u.test(code);
}

/** Core's title on the result check's verdict row (`result-verification/verify.ts`). */
const RESULT_CHECK_TITLE = "Result check";

/** The result check accepted the result: a repair that led to it is over. */
function resultCheckPassed(event: ClientGatewayActivity): boolean {
  return event.detail?.kind === "check" && event.detail.status === "succeeded" && event.detail.title === RESULT_CHECK_TITLE;
}

/** Core's row closing a wait on the person: the wait's own `ask` row, now settled one way or the other. */
function isSettledAsk(event: ClientGatewayActivity): boolean {
  return event.detail?.kind === "ask" && (event.detail.status === "succeeded" || event.detail.status === "failed");
}
