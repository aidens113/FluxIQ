// Tells a build's test checked against the recorded run apart from a test on
// the site (trace plan P6, t769 b13), so the status heads it as that.
//
// Before a test touches the site, Core may run the Flow against the recording
// of the build's last live test, through its real executor. That run reports
// its steps under the build's unit of work like any run, and a build's row
// with a step reads as its test on the site (`../candidate-trial.ts`).
//
// Core marks those steps in its own words: their row says "Checking against
// the recorded run: <action>" in place of "Running step N of M: <action>"
// (Core's `activity/step/started.ts`, under `activity/step/recorded-check.ts`).
// The check lasts from its first such row until the build goes back to its own
// work (the next decision, a tool row), a step that is not the check's starts
// (the test on the site), a supervisor's card opens or closes a brief, or the
// unit settles (`./aside-end.ts`).

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { activityAsideEnds } from "./aside-end.ts";

/** Core's words opening every row of a step checked against the recorded run. */
export const ACTIVITY_RECORDED_CHECK_WORDS = "Checking against the recorded run";

/** The headline while it lasts. */
export const ACTIVITY_RECORDED_CHECK_HEADLINE = "Checking your Flow against the recorded run";

const RECORDED_ROW = /^Checking against the recorded run\b:?\s*/u;

/** What checking against the recorded run makes of one event. */
export type RecordedCheckState = {
  /** This event belongs to the check. */
  readonly checking: boolean;
  /** This event is the first of it. */
  readonly startedNow: boolean;
  /** The status line in place of the event's own words: the step's action, without the opening words. */
  readonly line: string | null;
};

const OUTSIDE: RecordedCheckState = Object.freeze({ checking: false, startedNow: false, line: null });

export class RecordedCheck {
  private open = false;

  /** Folds `event` in and answers what the check makes of it. */
  observe(event: ClientGatewayActivity): RecordedCheckState {
    if (RECORDED_ROW.test(event.label)) {
      const startedNow = !this.open;
      this.open = true;
      const action = event.label.replace(RECORDED_ROW, "").trim();
      return { checking: true, startedNow, line: action ? `${action.charAt(0).toUpperCase()}${action.slice(1)}` : null };
    }
    if (!this.open) return OUTSIDE;
    if (activityAsideEnds(event)) {
      this.open = false;
      return OUTSIDE;
    }
    return { checking: true, startedNow: false, line: null };
  }
}
