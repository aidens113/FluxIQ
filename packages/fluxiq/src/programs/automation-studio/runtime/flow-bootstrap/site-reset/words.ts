// What the model is told about putting the site back before a trial (t462).
//
// Generic by rule: the words name no site, page, product or task, only this
// build's own acts by the ids the ledger gave them, so they hold for any
// domain and never teach to a scenario (AGENTS.md, "Model guidance never
// teaches to the test").

import { AUTOMATION_STUDIO_WITHHELD_VALUE } from "../../executor/trace-withholding.ts";
import { automationStudioSiteResetConditionWords, type AutomationStudioSiteResetCanMeet, type AutomationStudioSiteResetFailed } from "../reset-answers/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY as UNDOES, type AutomationStudioSiteResetIssuedRef } from "../reset-settlement/index.ts";

/**
 * Where a destination should be read (t743, photo debug fix 2): a list shown over another page may not read the same when
 * its URL is loaded again, and then nothing could ever show the act put back. Said wherever a destination is asked for.
 */
const OWN_URL = "Name a list read on a page that loads at its own URL, so the reset can read it there again.";

/**
 * Which list a creation's destination is (t748, office rounds 2 and 4, C5): a builder named a list of other items suggested
 * beside the subject, which nothing the creation makes ever joins. Core cannot tell that list from one a creation on its
 * own page does join (a reply joins the replies under what it answers), so only the words say which to name.
 */
const JOINS = "Name the list the new entry would join: a list on this page shows the creation only where the new entry would appear in that very list. "
  + "A list that only suggests or relates other items to the one acted on never gains the new entry, so it could never show the creation or its undo.";

/** The same, for any reversible press (C5): said wherever a ref is offered for one. */
const SHOWS = "A list that only suggests or relates other items to the one acted on never shows the effect of a press on it.";

/**
 * How a reversible act of this build settles (L1, `../reset-settlement/decision.ts`):
 * the one rule, said once, beside each open act's own `settle`.
 */
const SETTLE_MODEL = "An act counts as settled when fresh complete reads, taken after it and after the latest lasting action or trial, show everything it could change as the build found it: a list it sat in or was named for, row for row and value for value, and its own control's state where it flipped one. "
  + "Settled after a change was seen or an undo landed, it is restored; settled with no change ever seen, it is left as it is, and every later trial's judge is told. "
  + "Core reads the lists and pages it can reach again itself before asking. Each open act says under settle what is still needed: read a named list completely again, undo what still differs there, press its own control back, or, where nothing read shows where its effect would be, read that list completely and name its ref as resetDestination on a look that names the act under undoes, a ref only a resetDestinations receipt prints. Where nothing was read complete before the build's first lasting act, such an act cannot be settled in this build. "
  + "cannotUndo never settles a reversible act.";

/** How an act settled with no change seen is said (L1). */
const LEFT_UNCHANGED = "left on the site; nothing it could change showed a change in fresh complete reads taken after it";

/** The instructions the ledger and its trial policy answer with. */
export const AUTOMATION_STUDIO_SITE_RESET_WORDS = Object.freeze({
  /** The condition a refusal names as failed, and whether any call can meet it (`../reset-answers/condition-words.ts`, t743). */
  condition(failed: AutomationStudioSiteResetFailed, canMeet: AutomationStudioSiteResetCanMeet): string {
    return automationStudioSiteResetConditionWords(failed, canMeet);
  },
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
      + SETTLE_MODEL + " "
      + "Then test the same revision again.";
  },
  /** How a reversible act settles (L1, `../reset-settlement/decision.ts`): said with each refusal that lists open acts. */
  settleModel(): string {
    return SETTLE_MODEL;
  },
  /** Said after an act settled with no change seen (L1): fresh complete reads of everything it could change showed it as the build found it. */
  leftUnchanged(): string {
    return LEFT_UNCHANGED;
  },
  /**
   * How a settled act is said to every later trial's judge under `startedWith.cannotUndo` (L1, t743): left unchanged, or put
   * back, with the refs of lists named for it that Core could not read again (`unread`) where there were any.
   */
  settledAs(how: "restored" | "unchanged", unread?: readonly string[]): string {
    const lists = unread === undefined ? "" : unread.length ? `${unread.length === 1 ? "the list" : "the lists"} named for it (${unread.join(", ")})` : "a list named for it";
    const notRead = lists ? `${lists} could not be read again, so whether ${unread !== undefined && unread.length > 1 ? "they are" : "it is"} as the build found it is not known` : "";
    if (how === "unchanged") return notRead ? `${LEFT_UNCHANGED}; ${notRead}` : LEFT_UNCHANGED;
    return notRead ? `put back as far as fresh complete reads can show; ${notRead}` : "put back: fresh complete reads show everything it could change as the build found it";
  },
  /**
   * Acts no call can settle (t743, `gate_unsatisfiable`): said with each refusal that lists them under actsUnsettleable.
   * `toUndo`: other acts are still listed under actsToUndo, and are undone first.
   */
  unsettleable(toUndo: boolean): string {
    return "Each act under actsUnsettleable is still on the site, and no call can settle it: its failed condition says why, and nothing that can still be read would show it put back. "
      + "Do not try to undo it, look for it again, or name it under cannotUndo: none of that settles it, and no trial can run while it is in place. "
      + (toUndo ? "Undo the acts under actsToUndo first, each with core.run_node; then, if acts under actsUnsettleable remain, end this brief as blocked, naming each of them and gate_unsatisfiable as the reason." : "End this brief now as blocked, naming each act under actsUnsettleable and gate_unsatisfiable as the reason.");
  },
  /** A trial refused because a kept reversible act of this build is not settled (L1): cannotUndo does not settle it. */
  unprovedReset(): string {
    return "These reversible effects of the build are not settled, so an ordinary trial on them would not measure a fresh run. "
      + "Naming an act under cannotUndo does not settle it, and neither does a matching name or a partial change: each act under actsToRestore says under settle what is still needed. "
      + SETTLE_MODEL
      + ` Make each call its settle names with core.run_node, naming that act under "${UNDOES}", then test the same revision again.`;
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
      + (kept ? "Each act under cannotUndo is left in place, or could not be fully checked, and its words say why: the site offers no control that undoes it, nothing it could change showed a change, or a list named for it could not be read again. It is listed before every later trial too. " : "")
      + "A step that would do one of these acts again may find it already done; write the Flow so it passes over an item that is already done rather than failing on it.";
  },
  /** A call whose `undoes` names an act whose one unasked removal is spent. */
  alreadyUndone(acts: boolean): string {
    return "An undo of that act already removed something without asking (the call under undoneBy), and an act's undo removes without asking only once, so this call was not run. "
      + "Positive original-state evidence is checked before the next trial; a changed page alone is insufficient for an effect in another collection. Whatever this call would change now is not proved to be something that act made: "
      + `do not name the act again. To change it anyway, make the call without "${UNDOES}", and anything it would delete is asked about. `
      + (acts ? "Undo the acts still listed under actsToUndo, then test the same revision again." : "Test the same revision again.");
  },
  /**
   * A call whose `undoes` names an act that is no longer the model's to undo:
   * `left`, settled because nothing it could change showed a change (L1), or
   * kept because the site offers no control that undoes it (an act with no
   * identified item or resource; an identified one is never kept this way).
   */
  keptAct(left = false): string {
    if (left) return `That act is left on the site: fresh complete reads of everything it could change showed no change, so no undo is owed and this call was not run. Do not try to undo it; trials run with it listed, and their judge is told. Make the call without "${UNDOES}" if it does something else.`;
    return "That act is kept on this site: the site offered no control that undoes it, so this call was not run. Trials run with it listed under startedWith.cannotUndo, and their judge is told. "
      + `Do not try to undo it again; make the call without "${UNDOES}" if it does something else.`;
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
  /** A refused undo changes nothing; the current reset conditions still decide what remains and whether a trial can run. */
  undoRefused(): string {
    return "That undo was not allowed, so nothing was done. Do not repeat the refused effect. "
      + "Follow the current listed reset and settlement conditions; a refusal alone proves no restoration and admits no trial. "
      + "Undo another listed act through an allowed control, or end honestly naming the unresolved condition.";
  },
  /**
   * An unproved claim stays refused, even when another owned effect is observed. Its refusal names the failed condition
   * under condition (t743, rerun round 4 job `run-mvgw1854-5d10955b`: "inspect" words with no condition sent the builder
   * through every variation of one refused call).
   */
  unprovedUndo(other: boolean): string {
    return "That call is not a proved exact inverse of the act, for the reason under condition, and was not run. "
      + "Heed what condition says about whether another call can meet it; where it says no call can, do not send this call or a variation of it again. "
      + (other ? `Another recorded act on this item has its own observed effect. Inspect its receipt and explicitly name its id in "${UNDOES}" if that is the effect you are reversing. This information does not reassign or execute the refused claim. ` : "")
      + "Where condition says another call can meet it, make that call with core.run_node where instruction and condition point. "
      + "Looking or navigating is safe; an undeclared control press or a matching name alone proves no restoration. Remaining effects still require fresh complete original-state evidence before an ordinary trial.";
  },
  /**
   * An undo of an act that is already back (t743 photo `run-mvgw7320-de416190` 0151; t751 R2, office
   * `run-mvhibit5-e1d3a4f3`). `settled`: fresh reads already show everything it could change as the build found it, so it
   * is listed nowhere and nothing is owed. Otherwise its own control was aimed at while showing the state the build found,
   * and no fresh read shows that yet: pressing would make the act's change again, and a look on this page settles it.
   */
  alreadyBack(settled = false): string {
    if (settled) {
      return "That call was not run: this act is already back. Fresh reads show everything it could change as this build found it, so it is settled, it is no longer listed, and nothing is owed for it. "
        + `Do not name it under "${UNDOES}" again; undo the acts still listed under actsToUndo, if any, then test the same revision again.`;
    }
    return "That call was not run: the act's own control already shows the state this build found it in, so there is nothing to press, and pressing it would make the act's change again. "
      + `Do not press it under "${UNDOES}". Read this page again with core.run_node -- a look that names this act under "${UNDOES}" and presses nothing -- so a fresh read shows the control as found; the act then settles and leaves actsToUndo. `
      + "settle, where present, says what else this act still needs.";
  },
  /** A call whose `undoes` names no act of this build that may be undone now. */
  unknownAct(acts: boolean): string {
    return `"${UNDOES}" may name only an act of this build that core.test_candidate listed under actsToUndo, and only on the call that undoes it. `
      + (acts ? `Name one of the acts listed here, or make the call without "${UNDOES}".` : `No act of this build is waiting to be undone now: make the call without "${UNDOES}".`);
  },
  /**
   * A reversible lasting press with no witness (`../reset-admission/admission.ts`, rerun round 2; asked after any earlier
   * lasting act too since t751): nothing could ever show it put back. `issued`: the refs already shown (rerun round 3, job
   * `run-mvgo9wzn-fad4e050`), each named, never at a withheld place.
   */
  witnessRequired(issued: readonly AutomationStudioSiteResetIssuedRef[] = []): string {
    const known = issued.map((entry) => `${entry.ref} (${entry.count} ${entry.count === 1 ? "item" : "items"}${placed(entry.location)})`);
    return "This press was not run. Through the site's own controls, observe completely the list where its effect would show, before any act of this build changes it, "
      + `then retry this press with core.run_node, naming the resetDestination ref that observation issues. ${OWN_URL} `
      + (known.length ? `Refs already issued for lists read complete: ${known.join(", ")}; if the list where this press's effect would show is one of them, retry naming its ref as resetDestination without reading it again. ` : "")
      + "A press on a control inside a list already read complete, or on a control whose own state the page shows, needs no ref. "
      + `${SHOWS} `
      + "Without such a list nothing could ever show the change put back, and no trial could run for the rest of the build. Looking and navigating remain available; no new permission is needed.";
  },
  /** A project control's pre-act original was not read (`../reset-admission/admission.ts`). */
  controlOriginalRequired(): string {
    return "This build has no proven original counts for this control. Read its stateful controls with core.run_node before any press; if that original is no longer provable, end honestly naming the unresolved baseline.";
  },
  /**
   * A plan step that is a reversible lasting press with no witness (`../reset-admission/admission.ts`, the step door, t751):
   * a step can carry no resetDestination, so its witness is made while exploring -- one press of that control, naming the ref
   * of the list where its effect shows unless the control shows its own state -- and the step then repeats that press.
   */
  stepWitnessRequired(issued: readonly AutomationStudioSiteResetIssuedRef[] = []): string {
    return "Nothing could ever show this step's press put back after a trial: no list it would show in was read complete, its control shows no state of its own, and it repeats no press made while exploring that has such a witness. "
      + "To give it one, press that control once while exploring with core.run_node, naming as resetDestination the ref of the list where its effect would show, read completely before any act of this build changes it, then submit again; a control inside a list already read complete, or one whose own state the page shows, needs no ref. "
      + `${OWN_URL} `
      + (issued.length ? `Refs already issued for lists read complete: ${refList(issued, true)}. ` : "")
      + SHOWS;
  },
  /**
   * What a call naming an act under `undoes` settled (rerun round 3, office `run-mvgo5xft-25460ba2`): a settling look used to
   * answer with only its page, so the model repeated it. `settled`: the act is settled; `open`: acts of the build are still open.
   */
  lookSettled(settled: boolean, open: boolean): string {
    const head = settled
      ? `This call settled the act it named under ${UNDOES}: fresh complete reads show everything it could change as the build found it, so nothing more is owed for it; do not name it again. `
      : `This call has not settled the act it named under ${UNDOES} yet: its settle says what is still needed. `;
    return head + (open ? "Each act under actsStillOpen, across the whole build, says under settle what is still needed." : "No act of this build is still open.");
  },
  /**
   * A call naming `resetDestination` with no `undoes` while acts are open (rerun round 3, office 0133-0136): it ran as an
   * ordinary look and settled nothing. `example`: an example call is given beside it.
   */
  destinationWithoutUndoes(example: boolean): string {
    return `This call named resetDestination but no act under "${UNDOES}", so it settled nothing: a ref names the list for an act only on a call that also names that act under "${UNDOES}". `
      + "Each act under actsStillOpen says under settle what is still needed."
      + (example ? " To name a list for one, make the look again with both keys, as in example." : "");
  },
  /**
   * An identified reversible creation with no original of its destination (`../reset-admission/admission.ts`): moved here from its
   * refusal whole (t743), with the clause naming a list read on a page that loads at its own URL (photo debug fix 2).
   */
  createBaselineRequired(here: readonly AutomationStudioSiteResetIssuedRef[] = [], elsewhere: readonly AutomationStudioSiteResetIssuedRef[] = []): string {
    return "This creation was not run. Before creating an identified reversible effect, observe its destination's complete original inventory through the site's own controls, before any act of this build changes it, then return and retry the creation with core.run_node, naming the resetDestination reference that observation issued. "
      + "The original inventory must belong to this resource and prove the subject absent. A first observation of that list after an act of this build changed it, another resource, a matching name, or an invented reference is insufficient. "
      + `${JOINS} `
      + (here.length ? `Lists read complete on this page: ${refList(here, false)}. ` : "")
      + (elsewhere.length ? `Lists read complete elsewhere: ${refList(elsewhere, true)}; if the list the new entry would join is one of them, retry naming its ref without reading it again. ` : "")
      + `${OWN_URL} Looking and navigating remain available; no new permission is needed.`;
  },
  /**
   * Said beside a complete read's receipts while a press stands refused for want of a ref (t748, office rounds 2-4, C6:
   * builders read the list, got its ref, and went back and forth for 9 and 14 turns before pressing with it). `call`: the
   * refused call's id; `refs`: the refs this read printed that were not printed beside the refusal itself.
   */
  retryRefused(call: string, refs: readonly AutomationStudioSiteResetIssuedRef[]): string {
    return `The call ${JSON.stringify(call)} was refused for want of a resetDestination ref, and this complete read issued ${refs.length === 1 ? "a ref" : "refs"}: ${refList(refs, true)}. `
      + "If what that call makes or changes would show in one of these lists, go back to where it was refused and make that call again, the same as before, naming that list's ref as resetDestination; do not read the list again first. "
      + `If none of them is where its effect would show, read that list completely, then make the call again naming the ref that read issues. ${SHOWS}`;
  },
  /**
   * The build's standing guidance on declaring lasting acts and observing their destinations, aligned with
   * `resetDestination` in `./undoes-tool.ts` (t743, photo debug fix 2: an unconditional "observe its destination's
   * complete original inventory" sent a builder whose press already had a toggle witness after a list it could never read
   * again). Only a press with no other witness needs a destination; a control that shows its own state needs none.
   */
  actionDeclarations(): string {
    return "Before a reversible lasting press that has no other witness, observe completely the list where its effect would show; a control that shows its own state, or one inside a list already read complete, needs none. "
      + `${OWN_URL} `
      + "Identified reversible create_new exploration requires its issued resetDestinations.collections ref under resetDestination, unless exact same-scope original evidence already proves absence; a missing baseline refusal changes nothing, so observe safely and retry. "
      + "Declare the lasting consequences of every recovery press as honestly as the original operation, even when its control offers recovery from an error. Truly nonlasting actions keep an empty declaration. "
      + "A successful control press or a vanished source message does not prove destination restoration. Return every identified original collection to its original ordered rows and values before another trial; report unproved restoration honestly.";
  },
  /** Where a destination should be read (t743, photo debug fix 2): said beside `resetDestination` in `./undoes-tool.ts` and wherever a destination is asked for. */
  ownUrl(): string {
    return OWN_URL;
  },
  /** A `resetDestination` naming no ref this build was shown (rerun round 2): refused before the call runs. */
  destinationUnissued(): string {
    return "This call was not run: its resetDestination names no ref this build was shown. Refs come only from a resetDestinations receipt printed after a complete observation of a list; never invent one. "
      + "Retry the call with core.run_node without resetDestination, or with a ref such a receipt printed. Looking and navigating remain available; no new permission is needed.";
  }
});

/** `ref (n items at <location>), ...`: each ref with its count, and where it was read when `where` and a location may be said. */
function refList(refs: readonly AutomationStudioSiteResetIssuedRef[], where: boolean): string {
  return refs.map((entry) => `${entry.ref} (${entry.count} ${entry.count === 1 ? "item" : "items"}${where ? placed(entry.location) : ""})`).join(", ");
}

/** ` at <location>`, or nothing where the location is absent or withheld (`../reset-settlement/words.ts` says places the same way). */
function placed(location: string | undefined): string {
  return location && !location.includes(AUTOMATION_STUDIO_WITHHELD_VALUE) ? ` at ${location}` : "";
}
