// What the model is told about putting the site back before a trial (t462).
//
// Generic by rule: the words name no site, page, product or task, only this
// build's own acts by the ids the ledger gave them, so they hold for any
// domain and never teach to a scenario (AGENTS.md, "Model guidance never
// teaches to the test").

import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY as UNDOES } from "./contracts.ts";

/** How an act that may have changed nothing settles with no undo (F1). */
const NAME_DESTINATION = "An act that may have had no effect settles without an undo only against a destination named for it: if its effect would show in a list you can read (for example a playlist), read that list completely and name it with its resetDestination ref, on the act's own call or on a look that names the act under undoes; when a complete read after the act shows that list exactly as first observed, the act is left as it is and the judge is told.";

/** The instructions the ledger and its trial policy answer with. */
export const AUTOMATION_STUDIO_SITE_RESET_WORDS = Object.freeze({
  /** A trial refused because acts this build made are still in place. */
  resetRequired(differs: boolean): string {
    return "Before this trial, put the site back the way this build found it, so the trial measures only what the Flow does. "
      + `Undo each act listed under actsToUndo with core.run_node, adding "${UNDOES}": "<act>" to that call: remove what the act added, or set back what it changed. `
      + "stillThere lists source-page changes that remain. Their disappearance alone does not prove a lasting effect in another collection was reversed; effects tied to an identified item or resource require positive original-state evidence. "
      + "An undo may act only on the act's own item -- the same row or card it acted on, told apart from the others -- or on what the act itself created; a control on any other item, or on one that cannot be told apart, is refused unrun. "
      + "Before creating an effect that must later be removed from another page or list, inspect that destination's complete item inventory first so the reset has evidence of what already exists. Remove only a subject proved absent there before this build's act. A matching name alone never proves ownership of an existing item or its quantity; an unproved inverse stays unresolved. "
      + "Removing only what the act created needs no permission; anything else is asked. Do not change anything that was there before the build began. "
      + (differs ? "differs lists what is still not as the build found it. " : "")
      + "If the site offers no control that reverses an act, report its id under cannotUndo honestly. This does not restore a reversible effect tied to an identified item or resource, or permit an ordinary trial on those leftovers; the effect remains listed and a later proved correction is still allowed. A trial explicitly admitted with other unresolved acts reports them to its judge. "
      + NAME_DESTINATION + " "
      + "Then test the same revision again.";
  },
  /** How an act that may have changed nothing settles with no undo (`./destination-unchanged.ts`, F1). */
  nameDestination(): string {
    return NAME_DESTINATION;
  },
  /** Said after an act listed as left because a complete read of where it lands, taken after it, showed no change there (`./destination-unchanged.ts`). */
  leftUnchanged(): string {
    return "left on the site; a complete read of its destination taken after it showed that destination exactly as first observed";
  },
  /** A trial refused because every act is undone but the start still differs. */
  startDiffers(): string {
    return "Every act this build recorded is undone, but the site still differs from how this build found it (differs lists how). "
      + "If any of it is something this build did, set it back with core.run_node. Do not change anything that was there before the build began. "
      + "Then test the same revision again; unresolved reversible effects still require proved restoration.";
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
      + "Positive original-state evidence is checked before the next trial; a changed page alone is insufficient for an effect in another collection. Whatever this call would change now is not proved to be something that act made: "
      + `do not name the act again. To change it anyway, make the call without "${UNDOES}", and anything it would delete is asked about. `
      + (acts ? "Undo the acts still listed under actsToUndo, then test the same revision again." : "Test the same revision again.");
  },
  /** A call whose `undoes` names an act kept because the site cannot undo it, or one `left` because its destination showed no change (F1). */
  keptAct(left = false): string {
    if (left) return `That act is left on the site: a complete read of its destination after it showed no change, so no undo is owed and this call was not run. Do not try to undo it; trials run with it listed, and their judge is told. Make the call without "${UNDOES}" if it does something else.`;
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
        + "This act is reported as unresolved; any explicitly admitted run reports that fact to its judge. Identified reversible effects still require proved restoration. "
        + `Do not try to undo it again. Undo another listed act on its own item with "${UNDOES}", or, when no listed act has a control on its own item that reverses it, complete and name those acts under cannotUndo.`;
    }
    return head
      + "This act is reported under cannotUndo; any trial explicitly admitted with it in place reports that fact to its judge. Identified reversible effects still require proved restoration. "
      + `Do not try to undo it again. Test the same revision again now, or undo another listed act on its own item with "${UNDOES}".`;
  },
  /** An undo the permission gate refused (t475). */
  undoRefused(): string {
    return "That undo was not allowed, so nothing was done and this act remains unresolved. An identified reversible effect still requires proved restoration; any trial explicitly admitted with other unresolved acts reports them to its judge. "
      + "Do not repeat a refused effect. Retarget only with positive ownership and inverse evidence, or report the unresolved reset honestly.";
  },
  /** An unproved claim stays refused, even when another owned effect is observed. */
  unprovedUndo(other: boolean): string {
    return "That call has no proved exact inverse on its target and was not run. Inspect what this build created or changed and the original observations needed to restore it; declare the inverse honestly. "
      + (other ? `Another recorded act on this item has its own observed effect. Inspect its receipt and explicitly name its id in "${UNDOES}" if that is the effect you are reversing. This information does not reassign or execute the refused claim. ` : "")
      + "Looking or navigating is safe; an undeclared control press or a matching name alone proves no restoration. Remaining effects still require fresh complete original-state evidence before an ordinary trial.";
  },
  /** A call whose `undoes` names no act of this build that may be undone now. */
  unknownAct(acts: boolean): string {
    return `"${UNDOES}" may name only an act of this build that core.test_candidate listed under actsToUndo, and only on the call that undoes it. `
      + (acts ? `Name one of the acts listed here, or make the call without "${UNDOES}".` : `No act of this build is waiting to be undone now: make the call without "${UNDOES}".`);
  }
});
