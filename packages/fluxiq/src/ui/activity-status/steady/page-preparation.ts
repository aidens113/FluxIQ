// Tells the steps Core runs only to get the page ready apart from a test of
// the Flow (t753), so the status names them plainly and counts no step.
//
// Before a part of a Flow is built or tested from where the parts before it
// leave the site, Core runs those earlier parts once to put the page there
// (its `service/project-build/entry-preparation.ts`). That run reports its
// steps under the build's unit of work like any run, and a build's row with a
// step reads as its test (`../candidate-trial.ts`): the status said "Testing
// your Flow" and its count jumped from "Step 1 of 3" to "Step 2 of 5" as the
// run went from the outer Flow into a part's own steps.
//
// Core marks those steps in its own words: their row says "Getting the page
// ready: <action>" in place of "Running step N of M: <action>" (Core's
// `activity/step/started.ts`). The preparation lasts from its first such row
// until the build goes back to its own work (the next decision, a tool row),
// a step that is not a preparation's starts (the test), a supervisor's card
// opens or closes a brief, or the unit settles (`./aside-end.ts`); a step
// passed over inside it keeps it (t769 b13).

import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { activityAsideEnds } from "./aside-end.ts";

/** Core's words opening every row of a step run to get the page ready; the headline while it lasts. */
export const ACTIVITY_PAGE_PREPARATION_WORDS = "Getting the page ready";

const PREPARATION_ROW = /^Getting the page ready\b:?\s*/u;

/** What getting the page ready makes of one event. */
export type PreparationState = {
  /** This event belongs to the page being got ready. */
  readonly preparing: boolean;
  /** This event is the first of it. */
  readonly startedNow: boolean;
  /** The status line in place of the event's own words: the step's action, without the opening words. */
  readonly line: string | null;
};

const OUTSIDE: PreparationState = Object.freeze({ preparing: false, startedNow: false, line: null });

/** True for Core's row of a step run only to get the page ready. */
export function isPagePreparationRow(event: ClientGatewayActivity): boolean {
  return PREPARATION_ROW.test(event.label);
}

export class PagePreparation {
  private open = false;

  /** Folds `event` in and answers what getting the page ready makes of it. */
  observe(event: ClientGatewayActivity): PreparationState {
    if (isPagePreparationRow(event)) {
      const startedNow = !this.open;
      this.open = true;
      const action = event.label.replace(PREPARATION_ROW, "").trim();
      return { preparing: true, startedNow, line: action ? `${action.charAt(0).toUpperCase()}${action.slice(1)}` : null };
    }
    if (!this.open) return OUTSIDE;
    if (activityAsideEnds(event)) {
      this.open = false;
      return OUTSIDE;
    }
    return { preparing: true, startedNow: false, line: null };
  }
}

