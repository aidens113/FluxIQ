// What a call under `undoes` may name, what it may act on, and what an undo
// or a look under `undoes` that ran did to its act (t743: moved out of
// `../site-reset/ledger.ts` with these header paragraphs; the ledger hands it its acts and
// its own judgements of them). The control-by-control admission itself is
// `./admission.ts`.
//
// - **An undo acts only on its own act's item (t475).** Each action an undo
//   call puts to the gate is read first (`target`), before the domain acts:
//   it is admitted on the item -- row, card, list item -- and dialog the act
//   itself acted on (the domain's opaque tokens on the declaration: t463 row
//   identity, t469 dialog identity), on an item the act itself created, in a
//   dialog the site opened to confirm that undo, or for a move with nothing
//   lasting and no item. Anything else is refused unrun
//   (`candidate.undo_wrong_target`) and never pressed. Lane D round 10
//   (`run-mv5tusge-1400ddf7`, `run-mv5upw4g-2482be12`) aimed Delete and
//   Confirm on other requests' rows under `undoes`; only an over-declared
//   `delete` stopped a Confirm on a row the build never touched.
// - **Only a positive identity match is the act's own item (t479).** The act's
//   item token and the control's must both be present and equal; a token
//   missing on either side is never a match, whatever else agrees. Lane B
//   round 11 (`run-mv5yaapd-ad19eaae`) undid an Add to cart that sat in no
//   row by pressing Remove on the cart's only line -- the dish soap the cart
//   held before the build -- because a one-line list names no row, and two
//   missing items compared equal. A dialog alone is no identity either: a
//   drawer can hold several lines no token tells apart. Where no reverse is
//   positively identified, legacy unscoped acts are kept. Modern scoped acts
//   remain unresolved and refuse an ordinary trial until restored.
// - **One lasting press per confirmation (t479).** A dialog control with no
//   item follows an undo that landed on the act's own or created item only
//   once with a lasting class: the site's one confirmation. After it, the
//   chain is spent, and a further lasting press in a dialog is refused.
// - **Removing without asking is allowed only on what the act created
//   (t475).** An item counts as created only when the act's own page showed
//   it just after the act and no read of this build had seen it before
//   (`../site-reset/act-places.ts`). Lane B round 10 (`run-mv5tusj4-b7ee0630`) removed the
//   dish soap the cart held before the build began, twice, unasked, under
//   `undoes` of two adds: the old allowance followed the act, not the item.
//   Once per act: an unasked removal that landed spends it, and a later claim
//   on that act is refused before anything runs (`candidate.undo_already_done`).
//   Any other removal is gated exactly as any call is, and asked.
// - **Legacy unscoped refusals keep an act (t475).** These retain the older
//   startedWith.cannotUndo policy. Modern scoped wrong-target attempts are
//   recoverable: nothing runs, and the build can correct its target. An unproved
//   modern inverse never admits an ordinary trial on leftovers.
//
// **A look under `undoes` is no undo (L1 build repeats).** The domain
// declares a navigation `mutate` with no consequences, so one under `undoes`
// was admitted `moving` and counted as a landed undo: on job (installed proof
// `l1-d3-browser-proof`) a press the site itself failed then settled
// `restored`, and no later trial's judge heard it was left. A call admitted
// `moving` -- nothing lasting, no item -- is now a look: it may name a
// destination, and counts no attempt, sets no `undoneBy`, moves no clock and
// presses no place. A call declaring a lasting class or an item is never a
// look, whatever it was admitted as. The fresh read settles the act,
// `unchanged` when it shows the baseline.
//
// **An act already back is answered from settlement (t751 R2).** A call
// naming an act a fresh read settled `restored` -- whatever put it back -- is
// refused `candidate.undo_already_back`, met by no call, with the act listed
// nowhere, never `candidate.undo_unknown_act`; one aimed at its own control
// while that shows the build's start, with no fresh read of it yet, is met on
// this page by a look (`./admission.ts`).
//
// **Acts no call can settle are listed apart (t743).** Every refusal here that
// lists the acts to undo lists those no call can settle beside them, under
// `actsUnsettleable` (`../site-reset/ledger.ts`, `unsatisfiable`). An undo refused because
// the act's own control answered a state that is neither the build's nor the
// act's (`control_state_differs`, `no_call`) marks the act at once
// (`pressBackRefused`, `./reach.ts`, t748), so that same refusal already
// lists it apart when that was its last open condition; a press back admitted
// at its place clears the mark.
//
// **`undoes` is a hint: an undo is paired by its effect (P4, CC4).** A landed
// press that names no act, and whose observed effect reverses an open act's
// recorded effect at the same witness -- the same place token, on the same
// resource, the opposite delta: the act took it from before to after, the press
// from after back to before -- is that act's undo (`pairOf`). The ledger
// records it as a press named under `undoes` and admitted `own` (`paired`),
// never as an act of its own (`../reset-ledger/recording.ts`). The effect is
// the client's record where the act has one (`effect.places`,
// `../site-reset/contracts.ts`); without one, the act's own control's toggle
// and the press's counts at that place just before and after it. An `inverse`
// the client gave narrows the pairing to the operation and control it names;
// an `irreversible` act is never paired. A press two open acts would match
// pairs neither and is recorded as before. A press named under `undoes` is
// admitted as before (`target`) and never paired.
//
// **A look attaches a list only where the act's change could show (t772 w3,
// P4).** One the act already named; for an act whose change showed on its own
// page, a list read at that page alone; otherwise one read on its resource.
// Office `run-mvrj7qg8-6916b3f7` settled a choice confirmed on its own page by a
// list a look named on another page of the same tab: a resource is the whole
// tab there, so it bounded nothing.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { automationStudioSiteResetRefusal as refusal } from "../reset-answers/index.ts";
import type { AutomationStudioSiteResetObservations } from "../reset-settlement/index.ts";
import type {
  AutomationStudioSiteResetClaim,
  AutomationStudioSiteResetExplored,
  AutomationStudioSiteResetNamedAct,
  AutomationStudioSiteResetTarget,
  AutomationStudioSiteResetUnsettleableAct
} from "../site-reset/index.ts";
import type { AutomationStudioSiteResetLedgerAct as Act } from "../reset-ledger/index.ts";
import { automationStudioSiteResetUndoAdmission as undoAdmission, type AutomationStudioSiteResetUndoDeclared } from "./admission.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "../site-reset/words.ts";

/** The classes whose press ends the site's one confirmation of an undo (header, t479): every lasting one. */
const LASTING: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing", "delete", "move_money", "send_or_publish"]);

/** The ledger as its undo claims read it (header): its acts, receipts and reads, and its own judgements of each act. */
export type AutomationStudioSiteResetUndoClaimsLedger = {
  /** The ledger's acts, the live list. */
  acts: readonly Act[];
  seen: AutomationStudioSiteResetObservations;
  receipts: {
    unissued(reference: unknown): { ok: false; code: string; instruction: string } | undefined;
    named(reference: unknown): { scope: string; group: string } | undefined;
    /** The resource a list scope was read on, and where (`../site-reset/create-baselines.ts`). */
    resourceOf(scope: string): string | undefined;
    described(scope: string): { location?: string } | undefined;
  };
  claimable(act: Act): boolean;
  settledNow(act: Act): "restored" | "unchanged" | undefined;
  toUndo(act: Act): boolean;
  inPlace(): AutomationStudioSiteResetNamedAct[];
  unsatisfiable(): AutomationStudioSiteResetUnsettleableAct[];
  /** The act as the model is shown it, with what settles it while open; and plainly. */
  named(act: Act): AutomationStudioSiteResetNamedAct;
  plain(act: Act): AutomationStudioSiteResetNamedAct;
  /** The toggle the act's own press made, once read. */
  toggle(act: Act): { place: string; from: string; to: string } | undefined;
  /** A landed press under `undoes` changed the site: the clock moves, and its place, if any, gets a press (header, L1). */
  pressed(place: string | undefined): void;
};

export class AutomationStudioSiteResetUndoClaims {
  private readonly ledger: AutomationStudioSiteResetUndoClaimsLedger;

  constructor(ledger: AutomationStudioSiteResetUndoClaimsLedger) {
    this.ledger = ledger;
  }

  /** How a call's `undoes` value reads (`AutomationStudioSiteResetClaim`): refused before it runs, or the undo the gate is told. */
  claim(undoes: unknown, resetDestination?: unknown): AutomationStudioSiteResetClaim {
    const ledger = this.ledger;
    if (undoes === undefined) return { kind: "none" };
    // A ref no receipt printed is refused before the call runs, never ignored (`../site-reset/create-baselines.ts`, rerun round 2).
    const unissued = ledger.receipts.unissued(resetDestination);
    if (unissued) return { kind: "refused", evidence: unissued };
    const act = typeof undoes === "string" ? ledger.acts.find((entry) => entry.id === undoes) : undefined;
    const settled = act === undefined ? undefined : ledger.settledNow(act);
    const left = settled === "unchanged";
    // Acts no call can settle are listed beside the acts to undo wherever those are answered (header, t743).
    const apart = unsettleable(ledger.unsatisfiable());
    if (act && settled === "restored") return { kind: "refused", evidence: back(ledger, act, apart) };
    if (act && !act.undone && act.undoable && ((act.kept && !act.strictReset) || left)) return { kind: "refused", evidence: refusal("candidate.undo_act_kept", { act: act.id, failed: left ? "act_left" : "act_kept", canMeet: "no_call", instruction: WORDS.keptAct(left, act.unread), actsToUndo: ledger.inPlace(), ...apart }) };
    if (!act || !ledger.claimable(act)) {
      const actsToUndo = ledger.inPlace();
      return { kind: "refused", evidence: refusal("candidate.undo_unknown_act", { failed: "act_not_listed", canMeet: "this_page", instruction: WORDS.unknownAct(actsToUndo.length > 0), actsToUndo, ...apart }) };
    }
    if (act.spent) {
      // Acts an undo already landed on are checked before the trial; the model is pointed only at those nobody has tried.
      const actsToUndo = ledger.acts.filter((entry) => ledger.toUndo(entry) && entry !== act && !(entry.attempts > 0 && entry.undoChanged !== false)).map((entry) => ledger.named(entry));
      return { kind: "refused", evidence: refusal("candidate.undo_already_done", { act: act.id, failed: "undo_spent", canMeet: "no_call", ...(act.undoneBy ? { undoneBy: act.undoneBy } : {}), instruction: WORDS.alreadyUndone(actsToUndo.length > 0), actsToUndo, ...apart }) };
    }
    // What the undo may do unasked is decided per control, before it is acted on (`target`).
    return { kind: "undo", undo: { act: act.id, allowed: [] } };
  }

  /**
   * Whether an undo of `actId` may act on the control the domain declared,
   * read before it acts (`./admission.ts`). Modern refusals leave the act
   * correctable; no refused control runs, and unresolved strict effects still
   * block ordinary trials. A refusal listing the acts to undo lists those no
   * call can settle beside them (header, t743).
   */
  target(actId: string, declared: AutomationStudioSiteResetUndoDeclared): AutomationStudioSiteResetTarget {
    const ledger = this.ledger;
    const act = ledger.acts.find((entry) => entry.id === actId);
    const apart = unsettleable(ledger.unsatisfiable());
    if (act && ledger.settledNow(act) === "restored") return { kind: "refused", evidence: back(ledger, act, apart) };
    if (!act || !ledger.claimable(act)) {
      const actsToUndo = ledger.inPlace();
      return { kind: "refused", evidence: refusal("candidate.undo_unknown_act", { failed: "act_not_listed", canMeet: "this_page", instruction: WORDS.unknownAct(actsToUndo.length > 0), actsToUndo, ...apart }) };
    }
    const answer = undoAdmission({ acts: ledger.acts, seen: ledger.seen, claimable: (entry) => ledger.claimable(entry), inPlace: () => ledger.inPlace(), toggle: (entry) => ledger.toggle(entry), named: (entry) => ledger.named(entry), plain: (entry) => ledger.plain(entry) }, act, declared);
    if (answer.kind === "admit" && answer.on === "own" && declared.control.place !== undefined && declared.control.place === ledger.toggle(act)?.place) delete act.pressBackRefused;
    if (answer.kind !== "refused" || !("actsToUndo" in answer.evidence)) return answer;
    // Its own control can never be pressed back from a third state it declared (header, t748): listed apart in this very refusal.
    if (answer.evidence.failed === "control_state_differs" && typeof declared.control.state === "string" && !act.pressBackRefused) {
      act.pressBackRefused = true;
      return { kind: "refused", evidence: { ...answer.evidence, actsToUndo: ledger.inPlace(), ...unsettleable(ledger.unsatisfiable()) } };
    }
    return { kind: "refused", evidence: { ...answer.evidence, ...apart } };
  }

  /**
   * Whether `list` could show `act`'s effect (t772 w3, header): one the act already named; else, for an act whose change showed
   * on its own page, a list read at that page only (P4); else one read on the act's own resource.
   */
  private reads(act: Act, list: { scope: string; group: string }): boolean {
    const receipts = this.ledger.receipts;
    if (act.destinations.some((entry) => entry.scope === list.scope || entry.group === list.group)) return true;
    // Its change showed on its own page: only a list read there attaches, never one read on another page of the same resource (header, P4).
    if (act.place?.location !== undefined) return receipts.described(list.scope)?.location === act.place.location;
    // An act that records neither a resource nor a location (a trial's act with no witness) says nowhere it ran: nothing shows
    // the list is elsewhere, so it is named as before (office r2).
    if (act.spot?.resource === undefined) return true;
    return receipts.resourceOf(list.scope) === act.spot.resource;
  }

  /**
   * The one act a landed press that named no act under `undoes` reverses (header, P4), or none: an earlier act still open on the
   * same resource whose recorded effect the press shows exactly reversed -- by the client's effect places where the act has
   * them, else by its own control's toggle (`toggle`: the press's, from its counts before and after). Two such acts pair none.
   */
  pairOf(by: Act, toggle: { place: string; from: string; to: string } | undefined): Act | undefined {
    const ledger = this.ledger;
    const resource = by.spot?.resource;
    const sequence = ledger.acts.indexOf(by);
    if (resource === undefined || sequence < 0 || !by.undoable || by.possible || by.pairedWith !== undefined) return undefined;
    const matches = ledger.acts.filter((act, index) => index < sequence && act.pairedWith === undefined && !act.possible && !act.spent && act.spot?.resource === resource && ledger.claimable(act) && reverses(act, ledger.toggle(act), by, toggle));
    return matches.length === 1 ? matches[0] : undefined;
  }

  /**
   * `by` was paired with `act` by its effect (header, P4): recorded as an undo of it on its own control, as `ran` records a press
   * named under `undoes` and admitted `own` -- the lists it named, an attempt, who made it, its chain -- its press already counted.
   */
  paired(act: Act, by: Act): void {
    for (const named of by.destinations) if (this.reads(act, named) && !act.destinations.some((entry) => entry.scope === named.scope)) act.destinations.push(named);
    act.attempts += 1;
    if (by.call !== undefined) act.undoneBy = by.call;
    act.chain = "own";
  }

  /** An exploration call that named an act under `undoes` ran (header): what it did to that act. */
  ran(call: AutomationStudioSiteResetExplored & { undoes: string }): void {
    const ledger = this.ledger;
    const declared = call.declared;
    const pressed = call.landed && declared?.permitted === true && declared.effect === "mutate";
    // A call admitted `moving` (nothing lasting, no item: a navigation, opening a view) is a look, never an undo attempt (header, L1).
    // Only as declared: a lasting class or an item is never a look, whatever it was admitted as.
    const look = call.on === "moving" && (declared === undefined || (declared.consequences.length === 0 && declared.control.item === undefined));
    // A landed press under `undoes` changed the site whatever it names: earlier reads are stale, and its place gets a press (header, L1).
    if (pressed && !look) ledger.pressed(declared.control.place);
    const act = ledger.acts.find((entry) => entry.id === call.undoes);
    if (!act || !ledger.claimable(act)) return;
    // Where its effect would show, named after it: an issued ref, resolved without the act's resource (header, F1, L1); accumulated,
    // and only from a call that landed (t751 R6: office `run-mvhibit5-e1d3a4f3` settled acts on a list a refused call named).
    // t772 w3, P4: only a list the act's effect could show on (`reads`, header) is attached; a list read elsewhere could never
    // show the act, so its staying unchanged settles nothing.
    const found = !call.landed || call.resetDestination === undefined ? undefined : ledger.receipts.named(call.resetDestination);
    const named = found !== undefined && this.reads(act, found) ? found : undefined;
    if (named && !act.destinations.some((entry) => entry.scope === named.scope)) act.destinations.push(named);
    // A look leaves the act as it was: the fresh read settles it (header, L1).
    if (look) return;
    // An undo the gate refused is not tried again: the act stays, and the trial runs with it (t475).
    if (declared && declared.effect === "mutate" && !declared.permitted) {
      act.kept = true;
      return;
    }
    // Only a call that acted on the site is an attempt: a look leaves the act as it was.
    if (!pressed || act.spent) return;
    if (call.on === "subject" && act.subjectUndo === undefined) return;
    act.attempts += 1;
    act.undoneBy = call.callId;
    const unasked = call.on === "created" || (call.on === "subject" && act.subjectUndo !== undefined) || (call.on === "follow_up" && act.chain === "created");
    if (unasked && (declared.consequences.includes("delete") || act.subjectUndo?.origin !== undefined)) act.spent = true;
    if (call.on === "own" || call.on === "created") act.chain = call.on;
    // An undo on a control about the act's own thing may be confirmed once, as one on its own item (header, t719).
    else if (call.on === "subject") act.chain = "own";
    // The site's one confirmation of that undo is given: no further lasting dialog press follows from it (header, t479).
    else if (call.on === "follow_up" && declared.consequences.some((consequence) => LASTING.has(consequence))) act.chain = undefined;
  }
}

/** An act a fresh read settled `restored`, named under `undoes` (header, t751 R2): already back, listed nowhere, nothing owed. */
function back(ledger: AutomationStudioSiteResetUndoClaimsLedger, act: Act, apart: ReturnType<typeof unsettleable>): JsonObject & { code: string } {
  return refusal("candidate.undo_already_back", { act: act.id, failed: "already_back", canMeet: "no_call", instruction: WORDS.alreadyBack(true, act.unread), actsToUndo: ledger.inPlace(), ...apart });
}

/**
 * Whether `by` shows `act`'s recorded effect exactly reversed (header, P4): by effect places where `act` has them, each place it
 * changed back from its `after` to its `before` and nothing else; else by toggles at one place, `to` back to `from`. An
 * `inverse` on `act` narrows it to that operation on that control (and state); `irreversible` is never reversed.
 */
function reverses(act: Act, toggle: { place: string; from: string; to: string } | undefined, by: Act, byToggle: { place: string; from: string; to: string } | undefined): boolean {
  const inverse = act.effect?.inverse;
  if (inverse && "kind" in inverse) return false;
  const done = changedPlaces(act.effect);
  const back = changedPlaces(by.effect);
  const reversed = done.length
    ? done.length === back.length && done.every((entry) => back.some((other) => other.place === entry.place && other.before === entry.after && other.after === entry.before))
    : toggle !== undefined && byToggle !== undefined && byToggle.place === toggle.place && byToggle.from === toggle.to && byToggle.to === toggle.from;
  if (!reversed || !inverse) return reversed;
  if (by.operation !== inverse.action || by.spot?.place !== inverse.control) return false;
  return inverse.toState === undefined || (byToggle?.place === inverse.control && byToggle.to === inverse.toState) || back.some((entry) => entry.place === inverse.control && entry.after === inverse.toState);
}

/** The places an effect record says changed, before differing from after; none where a place is named twice, since then it cannot say. */
function changedPlaces(effect: Act["effect"]): Array<{ place: string; before: string; after: string }> {
  const places = (effect?.places ?? []).filter((entry) => entry.before !== entry.after);
  return new Set(places.map((entry) => entry.place)).size === places.length ? places : [];
}

/** The acts no call can settle, under `actsUnsettleable` beside `actsToUndo`, or nothing where there are none (header, t743). */
function unsettleable(acts: readonly AutomationStudioSiteResetUnsettleableAct[]): { actsUnsettleable?: AutomationStudioSiteResetUnsettleableAct[] } {
  return acts.length ? { actsUnsettleable: [...acts] } : {};
}
