// What the model is told about putting the site back before a trial (t462).
//
// Generic by rule: the words name no site, page, product or task, only this
// build's own acts by the ids the ledger gave them, so they hold for any
// domain and never teach to a scenario (AGENTS.md, "Model guidance never
// teaches to the test").

import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY as UNDOES } from "./contracts.ts";

/** The instructions the ledger and its trial policy answer with. */
export const AUTOMATION_STUDIO_SITE_RESET_WORDS = Object.freeze({
  /** A trial refused because acts this build made are still in place. */
  resetRequired(differs: boolean): string {
    return "Before this trial, put the site back the way this build found it, so the trial measures only what the Flow does. "
      + `Undo each act listed under actsToUndo with core.run_node, adding "${UNDOES}": "<act>" to that call: remove what the act added, or set back what it changed. `
      + "Undoing this build's own act needs no permission and is not a repeat. Do not change anything that was there before the build began. "
      + (differs ? "differs lists what is still not as the build found it. " : "")
      + "Then test the same revision again.";
  },
  /** A trial refused because every act is undone but the start still differs. */
  startDiffers(): string {
    return "Every act this build recorded is undone, but the site still differs from how this build found it (differs lists how). "
      + "If any of it is something this build did, set it back with core.run_node. Do not change anything that was there before the build began. "
      + "Then test the same revision again; if nothing listed is this build's doing, the trial runs as the site stands.";
  },
  /** A call whose `undoes` names no act of this build that may be undone now. */
  unknownAct(acts: boolean): string {
    return `"${UNDOES}" may name only an act of this build that core.test_candidate listed under actsToUndo, and only on the call that undoes it. `
      + (acts ? `Name one of the acts listed here, or make the call without "${UNDOES}".` : `No act of this build is waiting to be undone now: make the call without "${UNDOES}".`);
  }
});
