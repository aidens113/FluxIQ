// What the model is told about this build's own lasting acts on the site
// (t462). Since t775 a trial is judged against the state recorded just before
// it and the change asked for (user, 2026-10-27), so nothing here says acts
// are undone before a trial: an undo is asked only by the one targeted refusal
// (`startsInEndState`) or by a reset the person asks for ("put it back").
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
const OWN_URL = "Name a list read on a page that loads at its own URL, so Core can read it there again.";

/** Which list a press's change shows in (t748, C5): said wherever a ref is offered for one. */
const SHOWS = "A list that only suggests or relates other items to the one acted on never shows the effect of a press on it.";

/**
 * How a reversible act of this build settles (L1, `../reset-settlement/decision.ts`):
 * the one rule, said once, beside each open act's own `settle`.
 */
const SETTLE_MODEL = "An act counts as settled when fresh complete reads, taken after it and after the latest lasting action or trial, show everything it could change as the build found it: a list it sat in or was named for, row for row and value for value, and its own control's state where it flipped one. "
  + "Settled after a change was seen or an undo landed, it is restored; settled with no change ever seen, it is left as it is, and every later trial's judge is told what is on the site. "
  + "Core reads the lists and pages it can reach again itself before asking. Each open act says under settle what is still needed: read a named list completely again, undo what still differs there, press its own control back, or, where nothing read shows where its effect would be, read that list completely and name its ref as resetDestination on a look that names the act under undoes, a ref only a resetDestinations receipt prints. Where nothing was read complete before the build's first lasting act, such an act cannot be settled in this build. "
  + "cannotUndo never settles a reversible act.";

/** How an act settled with no change seen is said (L1). */
const LEFT_UNCHANGED = "left on the site; nothing it could change showed a change in fresh complete reads taken after it";

/** What a settled act's unread lists mean (L1, t743, t783): said identically by an undo's answer and a later trial's `startedWith`. Empty where every list was read again. */
function unreadWords(unread?: readonly string[]): string {
  if (unread === undefined) return "";
  const lists = unread.length ? `${unread.length === 1 ? "the list" : "the lists"} named for it (${unread.join(", ")})` : "a list named for it";
  return `${lists} could not be read again, so whether ${unread.length > 1 ? "they are" : "it is"} as the build found it is not known`;
}

/** The instructions the ledger and its trial policy answer with. */
export const AUTOMATION_STUDIO_SITE_RESET_WORDS = Object.freeze({
  /** The condition a refusal names as failed, and whether any call can meet it (`../reset-answers/condition-words.ts`, t743). */
  condition(failed: AutomationStudioSiteResetFailed, canMeet: AutomationStudioSiteResetCanMeet): string {
    return automationStudioSiteResetConditionWords(failed, canMeet);
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
    const notRead = unreadWords(unread);
    if (how === "unchanged") return notRead ? `${LEFT_UNCHANGED}; ${notRead}` : LEFT_UNCHANGED;
    return notRead ? `put back as far as fresh complete reads can show; ${notRead}` : "put back: fresh complete reads show everything it could change as the build found it";
  },
  /** A trial that ran with acts of this build on the site (`startedWith`, t775): judged by what it changed from that start. */
  startedWith(kept: boolean): string {
    return "This trial began with what is listed here already on the site, made by this build earlier; nothing was undone first. "
      + "Its judge was told, and judges the trial by what changed from the state just before it, against what the task asks for, never by totals that include what was already there. "
      + (kept ? "Each act under cannotUndo is left as it is, or could not be fully checked, and its words say why. " : "")
      + "A step that would do one of these acts again may find it already done; write the Flow so it passes over an item that is already in the asked state rather than failing on it or flipping it back.";
  },
  /**
   * The one refusal left before a trial (t775, `candidate.trial_starts_in_end_state`): a step's asked end state is already
   * shown, put there by an act of this build made with another step, so the trial could not show this step making it.
   */
  startsInEndState(): string {
    return "This trial was not run: a step of it is to bring something to a state the task asks for, and the site already shows that state, put there by the act under actsToUndo, which this build made with a different step. "
      + "A trial on it could not show this step making the change. "
      + `Undo just that act with core.run_node, adding "${UNDOES}": "<act>" to that call, so the state is as it was before it; leave everything else as it is. Then test the same revision again.`;
  },
  /** A call whose `undoes` names an act whose one unasked removal is spent. */
  alreadyUndone(acts: boolean): string {
    return "An undo of that act already removed something without asking (the call under undoneBy), and an act's undo removes without asking only once, so this call was not run. "
      + "A changed page alone does not show an effect in another collection put back. Whatever this call would change now is not proved to be something that act made: "
      + `do not name the act again. To change it anyway, make the call without "${UNDOES}", and anything it would delete is asked about. `
      + (acts ? "Undo the other acts still listed under actsToUndo, if that is what you were asked to do." : "Go on with what you were doing.");
  },
  /**
   * A call whose `undoes` names an act that is no longer the model's to undo:
   * `left`, settled because nothing it could change showed a change (L1), or
   * kept because the site offers no control that undoes it (an act with no
   * identified item or resource; an identified one is never kept this way).
   */
  keptAct(left = false, unread?: readonly string[]): string {
    if (left && unread !== undefined) return `That act is left on the site: ${LEFT_UNCHANGED}; ${unreadWords(unread)}. No undo is owed and this call was not run. Do not try to undo it; trials run with it on the site, and their judge is told. Make the call without "${UNDOES}" if it does something else.`;
    if (left) return `That act is left on the site: fresh complete reads of everything it could change showed no change, so no undo is owed and this call was not run. Do not try to undo it; trials run with it on the site, and their judge is told. Make the call without "${UNDOES}" if it does something else.`;
    return "That act is kept on this site: the site offered no control that undoes it, so this call was not run. Trials run with it on the site, listed under startedWith.cannotUndo, and their judge is told. "
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
        + "This act is reported as unresolved and stays on the site; every trial's judge is told it was there. "
        + `Do not try to undo it again. Undo another listed act on its own item with "${UNDOES}", or, when no listed act has a control on its own item that reverses it, complete and name those acts under cannotUndo.`;
    }
    return head
      + "This act stays on the site; every trial's judge is told it was there, and judges the trial by what it changed. "
      + `Do not try to undo it again. Test the same revision again now, or undo another listed act on its own item with "${UNDOES}".`;
  },
  /** A refused undo changes nothing; the current reset conditions still decide what remains and whether a trial can run. */
  undoRefused(): string {
    return "That undo was not allowed, so nothing was done. Do not repeat the refused effect. "
      + "Keep to the current listed reset and settlement conditions; a refusal alone proves no restoration. "
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
      + "Looking or navigating is safe; an undeclared control press or a matching name alone proves no restoration. An effect counts as put back only once fresh complete reads show it as this build found it.";
  },
  /**
   * An undo of an act that is already back (t743 photo `run-mvgw7320-de416190` 0151; t751 R2, office
   * `run-mvhibit5-e1d3a4f3`). `settled`: fresh reads already show everything it could change as the build found it, so it
   * is listed nowhere and nothing is owed. Otherwise its own control was aimed at while showing the state the build found,
   * and no fresh read shows that yet: pressing would make the act's change again, and a look on this page settles it.
   */
  alreadyBack(settled = false, unread?: readonly string[]): string {
    if (settled && unread !== undefined) {
      return `That call was not run: this act is already settled, put back as far as fresh complete reads can show; ${unreadWords(unread)}. It is no longer listed, and nothing more can be read for it. `
        + `Do not name it under "${UNDOES}" again; undo the other acts still listed under actsToUndo, if any.`;
    }
    if (settled) {
      return "That call was not run: this act is already back. Fresh reads show everything it could change as this build found it, so it is settled, it is no longer listed, and nothing is owed for it. "
        + `Do not name it under "${UNDOES}" again; undo the other acts still listed under actsToUndo, if any.`;
    }
    return "That call was not run: the act's own control already shows the state this build found it in, so there is nothing to press, and pressing it would make the act's change again. "
      + `Do not press it under "${UNDOES}". Read this page again with core.run_node -- a look that names this act under "${UNDOES}" and presses nothing -- so a fresh read shows the control as found; the act then settles and leaves actsToUndo. `
      + "settle, where present, says what else this act still needs.";
  },
  /** A call whose `undoes` names no act of this build that may be undone now. */
  unknownAct(acts: boolean): string {
    return `"${UNDOES}" may name only an act of this build still on the site that a refusal or a reset listed under actsToUndo, and only on the core.run_node call that undoes it. `
      + (acts ? `Name one of the acts listed here, or make the call without "${UNDOES}".` : `No act of this build is waiting to be undone now: make the call without "${UNDOES}".`);
  },
  /** A project control's pre-act original was not read (`../reset-admission/admission.ts`). */
  controlOriginalRequired(): string {
    return "This build has no proven original counts for this control. Read its stateful controls with core.run_node before any press; if that original is no longer provable, end honestly naming the unresolved baseline.";
  },
  /**
   * A plan step that is a reversible lasting press with no witness (`../reset-admission/admission.ts`, the step door, t751;
   * t775): a trial is judged by the change it made, so each lasting step names where that change shows. A step can carry no
   * resetDestination, so its witness is made while exploring -- one press of that control, naming the ref of the list where
   * its effect shows unless the control shows its own state -- and the step then repeats that press.
   */
  stepWitnessRequired(issued: readonly AutomationStudioSiteResetIssuedRef[] = []): string {
    return "Name where this step's change shows, so its trial can be judged by the change: no list it would show in was read complete, its control shows no state of its own, and it repeats no press made while exploring that names such a place. "
      + "To name one, press that control once while exploring with core.run_node, in the tab where the step acts, naming as resetDestination the ref printed after a complete read, in that same tab, of the list where its effect would show, then submit again. "
      + "A step that creates something may instead name the ref of the whole page where the made item will appear: a page with no list, an empty page included, is read whole and its ref is printed marked page: true. "
      + "A control inside a list already read complete, or one whose own state the page shows, needs no ref. "
      + `${OWN_URL} `
      + (issued.length ? `Refs already issued for lists read complete in this step's tab: ${refList(issued, true)}. ` : "No ref has been read in this step's tab yet, and a ref read in another tab cannot show a press in this one. ")
      + SHOWS;
  },
  /**
   * A plan step whose change no call in its own tab can give Core a place to read (`../reset-admission/step-reach.ts`, t791 fix 2):
   * its control names no tab or no item, page or list to read, or no new place can be recorded. Its trial still runs.
   */
  stepWitnessUnreachable(): string {
    return "No call in the tab this step acts in can give Core a place that shows its change, so none will be asked for. "
      + "Its trial runs and is judged by its end view and each step's done-when check only, and the task parts it serves stay unproven by what Core read: give it a done-when check that shows its change on the page.";
  },
  /**
   * An exploration press that landed naming a ref that shows nothing of its change (t791 fix 3, `./press-notes.ts`): the ref was
   * read in another tab, is not a list or page where this press's change would show, or already held the item the press made.
   */
  destinationUnreaching(ref: string): string {
    return `The ref ${ref} cannot show this press's change: it was read in another tab, it is not where this press's effect would appear, or what the press made was already there. The press went ahead and has no place Core can read its change in. `
      + "To give it one, read in this tab, completely, the list or page where its effect would show, then press once naming the ref that read printed. Until then a trial of the step that repeats it is judged by its end view and each step's done-when check only.";
  },
  /**
   * What a call naming an act under `undoes` settled (rerun round 3, office `run-mvgo5xft-25460ba2`): a settling look used to
   * answer with only its page, so the model repeated it. `settled`: the act is settled; `open`: acts of the build are still open.
   */
  lookSettled(settled: boolean, open: boolean, unread?: readonly string[]): string {
    // Settled with a list unread (t783): says what `startedWith.cannotUndo` says of it, never "everything".
    const head = settled && unread !== undefined
      ? `This call settled the act it named under ${UNDOES}, put back as far as fresh complete reads can show; ${unreadWords(unread)}. Nothing more can be read for it now; do not name it again. `
      : settled
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
   * The build's standing guidance on declaring lasting acts and observing their destinations, aligned with
   * `resetDestination` in `./undoes-tool.ts` (t743, photo debug fix 2: an unconditional "observe its destination's
   * complete original inventory" sent a builder whose press already had a toggle witness after a list it could never read
   * again). Only a press with no other witness needs a destination; a control that shows its own state needs none.
   */
  actionDeclarations(): string {
    return "For a reversible lasting press that has no other witness, observe completely, in the tab where it acts, the list where its effect would show (for a creation, the whole page where its item will appear); a control that shows its own state, or one inside a list already read complete, needs none. "
      + `${OWN_URL} `
      + "A trial is judged by what it changed from the state just before it, so a lasting step needs a place where its change shows: a list or page read complete, or its own control's state. "
      + "Declare the lasting consequences of every recovery press as honestly as the original operation, even when its control offers recovery from an error. Truly nonlasting actions keep an empty declaration. "
      + "A successful control press or a vanished source message does not prove destination restoration; report unproved restoration honestly.";
  },
  /** Where a destination should be read (t743, photo debug fix 2): said beside `resetDestination` in `./undoes-tool.ts` and wherever a destination is asked for. */
  ownUrl(): string {
    return OWN_URL;
  },
  /** A `resetDestination` naming no ref this build was shown (rerun round 2): refused before the call runs. */
  destinationUnissued(): string {
    return "This call was not run: its resetDestination names no ref this build was shown. Refs come only from a resetDestinations receipt printed after a complete read of a list, or of a whole page that has no list; never invent one. "
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
