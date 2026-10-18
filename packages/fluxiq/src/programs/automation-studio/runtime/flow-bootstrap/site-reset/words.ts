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
      + "stillThere lists what the act changed on its own page that is still there; an act counts as undone only once that is gone. "
      + "An undo may act only on the act's own item -- the same row or card it acted on, told apart from the others -- or on what the act itself created; a control on any other item, or on one that cannot be told apart, is refused unrun. "
      + "Before creating an effect that must later be removed from another page or list, inspect that destination's complete item inventory first so the reset has evidence of what already exists. Remove only a subject proved absent there before this build's act. A matching name alone never proves ownership of an existing item or its quantity; an unproved inverse stays unresolved. "
      + "Removing only what the act created needs no permission; anything else is asked. Do not change anything that was there before the build began. "
      + (differs ? "differs lists what is still not as the build found it. " : "")
      + "If the site offers no control that reverses an act, do not keep trying: test the same revision again with its id under cannotUndo, and the trial runs with that act already done. "
      + "Then test the same revision again.";
  },
  /** A trial refused because every act is undone but the start still differs. */
  startDiffers(): string {
    return "Every act this build recorded is undone, but the site still differs from how this build found it (differs lists how). "
      + "If any of it is something this build did, set it back with core.run_node. Do not change anything that was there before the build began. "
      + "Then test the same revision again; if nothing listed is this build's doing, the trial runs as the site stands.";
  },
  /** A trial that ran with acts of this build still in place (`startedWith`). */
  startedWith(kept: boolean): string {
    return "This trial ran on a site that was not wholly as the build found it: what is listed here was already in place when it began, and the judge was told so. "
      + (kept ? "The acts under cannotUndo could not be undone on this site, so they will be in place before every later trial too. " : "")
      + "A step that would do one of these acts again may find it already done; write the Flow so it passes over an item that is already done rather than failing on it.";
  },
  /** A call whose `undoes` names an act whose one unasked removal is spent. */
  alreadyUndone(acts: boolean): string {
    return "An undo of that act already removed something without asking (the call under undoneBy), and an act's undo removes without asking only once, so this call was not run. "
      + "Whether that act is gone is checked on its own page before the next trial. Whatever this call would change now is not something that act made: "
      + `do not name the act again. To change it anyway, make the call without "${UNDOES}", and anything it would delete is asked about. `
      + (acts ? "Undo the acts still listed under actsToUndo, then test the same revision again." : "Test the same revision again.");
  },
  /** A call whose `undoes` names an act kept because the site cannot undo it. */
  keptAct(): string {
    return "That act remains unresolved on this site. This call was not run. A reversible effect still requires proved baseline restoration before an ordinary trial. "
      + `Do not try to undo it again; make the call without "${UNDOES}" if it does something else, or report the unresolved reset honestly.`;
  },
  /**
   * An undo whose control is not on the act's own item, nor on what it created
   * (t475). `reset`: said to a reset brief, which has no test to run (t591,
   * social debug fix 4): it undoes another listed act or completes, naming
   * under `cannotUndo` an act the site offers no control to reverse.
   */
  wrongTarget(role?: "reset"): string {
    const head = "That control is not shown to be on the item this act acted on, nor on anything it created, so it was not touched: an undo never acts on another item, or on one it cannot tell apart. ";
    if (role === "reset") {
      return head
        + "This act stays as it is and is kept as one this build cannot undo: trials run with it already done, and the judge is told. "
        + `Do not try to undo it again. Undo another listed act on its own item with "${UNDOES}", or, when no listed act has a control on its own item that reverses it, complete and name those acts under cannotUndo.`;
    }
    return head
      + "This act stays as it is and is listed under cannotUndo: the next trial runs with it already done, and the judge is told. "
      + `Do not try to undo it again. Test the same revision again now, or undo another listed act on its own item with "${UNDOES}".`;
  },
  /** An undo the permission gate refused (t475). */
  undoRefused(): string {
    return "That undo was not allowed, so nothing was done, and this act stays as it is: the next trial runs with it already done, and the judge is told. "
      + "Do not try to undo it again. Test the same revision again now.";
  },
  /** A call whose `undoes` names no act of this build that may be undone now. */
  unknownAct(acts: boolean): string {
    return `"${UNDOES}" may name only an act of this build that core.test_candidate listed under actsToUndo, and only on the call that undoes it. `
      + (acts ? `Name one of the acts listed here, or make the call without "${UNDOES}".` : `No act of this build is waiting to be undone now: make the call without "${UNDOES}".`);
  }
});
