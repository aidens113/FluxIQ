// Whether an undo of one act may act on the control the domain declared, read
// before the domain acts: the admission the ledger's `target` answers
// (`./ledger.ts`, header; t475, t479, t719, L1). Moved out of the ledger whole,
// behaviour unchanged.
//
// - A look changes nothing, wherever it looks: admitted `moving`.
// - Its own toggle pressed back at its place, still showing the state the act
//   set, declaring nothing else lasting: admitted `own`, `modify_existing`
//   unasked (L1).
// - A witnessed transfer moved back on the same subject: admitted `subject`.
// - An item the act created (legacy acts only), its own item by a positive
//   token match, the site's one confirmation dialog after either, or a move
//   with nothing lasting and no item.
// - A control about what the act was about, reversing only its classes, may
//   delete a subject the act created on a destination read before it (t719).
// - Then a control on one of the act's own named destinations (its
//   `destinations`, and those lent by the explored acts it repeats, as the
//   settlement gathers them: `lent`) may remove, once and unasked, a subject
//   that destination's original read before the act did not hold and its
//   fresh complete read holds now, for an act that declared `create_new` or
//   `modify_existing`, declaring only `delete` or `modify_existing` (t743, job
//   `t743-e1-job`: a save from an item's own page, naming the saved list, where
//   the domain gives the item one subject token on its page and another as a
//   row of the list, so no path above could undo it). Removing a subject proved
//   absent before the act never touches what existed before the build began.
//   It is recorded as the subject inverse is (`subjectUndo`), so the settlement
//   reads that destination's group witness, and is spent once it lands
//   (`./ledger.ts`). A control there on a subject the original held is refused
//   `subject_there_before`; a list the act never named keeps its condition.
// - Anything else is refused unrun: `candidate.undo_unproved` for a strict act,
//   with another act whose effect was observed there when exactly one fits
//   (information only), and `candidate.undo_wrong_target` for a legacy act,
//   which is then kept.
//
// Every refusal goes through `../reset-answers/` and names the one condition that
// failed, read off the same code path that refused it, with whether any call
// can meet it (t743, rerun round 4: job `run-mvgw1854-5d10955b`, where an
// unnamed subject mismatch sent the builder through every variation of one
// call). Its own toggle's place pressed while the control already shows the
// state the build found is `candidate.undo_already_back`: nothing to press,
// and pressing would make the act's change again (photo `run-mvgw7320-de416190`
// 0151). Which condition is named never changes what is admitted.
//
// `./undo-reach.ts` reads these paths to say when none could ever admit an
// undo for what an act's differing lists show (t748, `no_admissible_undo`):
// a path added or widened here must be added or widened there too, or an act
// an undo could still settle would be listed apart.

import type { AutomationStudioActionConsequence, AutomationStudioActionEffect } from "../../action-permissions/index.ts";
import { automationStudioSiteResetRefusal as refusal, type AutomationStudioSiteResetCanMeet, type AutomationStudioSiteResetFailed } from "../reset-answers/index.ts";
import type { AutomationStudioSiteResetObservations } from "../reset-settlement/index.ts";
import type { AutomationStudioSiteResetNamedAct, AutomationStudioSiteResetSpot, AutomationStudioSiteResetTarget } from "./contracts.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** For each undoable class, the classes an undo tied to its act by subject may declare (t719): what reverses it, and nothing else lasting. */
const REVERSES: Readonly<Partial<Record<AutomationStudioActionConsequence, readonly AutomationStudioActionConsequence[]>>> = {
  create_new: ["delete", "modify_existing"],
  modify_existing: ["modify_existing"],
  delete: ["create_new", "modify_existing"]
};

/** The removal classes an undo on a destination the act named may declare (header, t743). */
const REMOVES: ReadonlySet<AutomationStudioActionConsequence> = new Set(["delete", "modify_existing"]);

/** What the admission reads of one act, and may write: a subject undo tied to it, or a legacy act kept. */
export type AutomationStudioSiteResetAdmittedAct = {
  id: string;
  control?: string;
  operation?: string;
  consequences: readonly AutomationStudioActionConsequence[];
  strictReset: boolean;
  kept: boolean;
  spent: boolean;
  spot?: AutomationStudioSiteResetSpot;
  createdItems: readonly string[];
  /** The lists named as where its effect would show, and those the explored acts it repeats lend it (`./ledger-act.ts`). */
  destinations: ReadonlyArray<{ scope: string; group: string }>;
  lent?: ReadonlyArray<{ scope: string; group: string }> | undefined;
  chain?: "own" | "created" | undefined;
  subjectUndo?: { scope: string; subject: string; group: string; origin?: string };
  transfer?: { origin: string; scope: string; group: string; subject: string; state: string };
};

/** The ledger as the admission reads it. */
export type AutomationStudioSiteResetAdmissionLedger<A extends AutomationStudioSiteResetAdmittedAct> = {
  acts: readonly A[];
  seen: AutomationStudioSiteResetObservations;
  claimable(act: A): boolean;
  inPlace(): AutomationStudioSiteResetNamedAct[];
  /** The toggle the act's own press made, once read: its place, the state the build found (`from`) and the state the act set (`to`). */
  toggle(act: A): { place: string; from: string; to: string } | undefined;
  /** The act as the model is shown it, with what settles it while open. */
  named(act: A): AutomationStudioSiteResetNamedAct;
  /** The act as the model is shown it, plainly. */
  plain(act: A): AutomationStudioSiteResetNamedAct;
};

/** What the domain declared for the control an undo would act on. */
export type AutomationStudioSiteResetUndoDeclared = { effect: AutomationStudioActionEffect; consequences: readonly AutomationStudioActionConsequence[]; control: AutomationStudioSiteResetSpot };

/** The condition a refused undo failed, and whether any call can meet it (`../reset-answers/`). */
type Unmet = readonly [AutomationStudioSiteResetFailed, AutomationStudioSiteResetCanMeet];

/** Whether an undo of `act`, a known act still claimable, may act on `declared` (header). */
export function automationStudioSiteResetUndoAdmission<A extends AutomationStudioSiteResetAdmittedAct>(ledger: AutomationStudioSiteResetAdmissionLedger<A>, act: A, declared: AutomationStudioSiteResetUndoDeclared): AutomationStudioSiteResetTarget {
  // A look changes nothing, wherever it looks.
  if (declared.effect === "observe") return { kind: "admit", on: "moving", allowed: [] };
  const unproved = ([failed, canMeet]: Unmet): AutomationStudioSiteResetTarget => {
    const other = otherObservedEffect(ledger, act, declared);
    return { kind: "refused", evidence: refusal("candidate.undo_unproved", { act: act.id, failed, canMeet, instruction: WORDS.unprovedUndo(other !== undefined), actsToUndo: ledger.inPlace(), ...(other ? { otherActsWithObservedEffect: [other] } : {}) }) };
  };
  // Its own toggle pressed back (L1): the same place, still showing the state the act set, declaring nothing else lasting.
  const toggle = ledger.toggle(act);
  if (toggle && declared.control.place === toggle.place) {
    const back = declared.consequences.length === 0 || (declared.consequences.length === 1 && declared.consequences[0] === "modify_existing");
    if (back && declared.control.state === toggle.to) return { kind: "admit", on: "own", allowed: ["modify_existing"] };
    // Already showing the state the build found (t743, photo 0151): nothing to press, and pressing would make the act's change again.
    if (declared.control.state === toggle.from) return alreadyBack(ledger, act);
    return unproved(declared.control.state !== toggle.to ? ["control_state_differs", "no_call"] : ["consequence_not_inverse", "this_page"]);
  }
  if (act.strictReset && declared.consequences.length === 0 && (declared.control.scope !== undefined || declared.control.subject !== undefined || declared.control.item !== undefined)) return unproved(toggle ? ["control_elsewhere", "another_page"] : ["undeclared_press", "this_page"]);
  if (act.transfer && declared.consequences.length > 0) {
    const transfer = act.transfer;
    const unmet = transferUnmet(ledger.seen, act, declared);
    if (!unmet) {
      act.subjectUndo = { scope: transfer.scope, subject: transfer.subject, group: transfer.group, origin: transfer.origin };
      return { kind: "admit", on: "subject", allowed: ["modify_existing"] };
    }
    return unproved(unmet);
  }
  const { item, dialog } = declared.control;
  const createdItem = item !== undefined && act.createdItems.includes(item);
  if (createdItem && !act.strictReset) return { kind: "admit", on: "created", allowed: act.spent ? [] : ["delete"] };
  // Identified created items use the same complete original-scope proof as
  // cross-page subjects below; an item token alone cannot prove restoration.
  if (!createdItem && act.spot && sameItem(act.spot, declared.control)) return { kind: "admit", on: "own", allowed: [] };
  if (item === undefined && dialog !== undefined && act.chain) return { kind: "admit", on: "follow_up", allowed: act.chain === "created" && !act.spent ? ["delete"] : [] };
  if (item === undefined && dialog === undefined && declared.consequences.length === 0) return { kind: "admit", on: "moving", allowed: [] };
  // About what the act was about, by a positive match, reversing its classes only (t719).
  if (aboutTheAct(act, declared.control) && reverses(act.consequences, declared.consequences)) {
    const admitted = subjectDeletion(ledger, act, declared);
    if (admitted) return admitted;
  }
  // A subject newly present on a destination the act named, removed once unasked (t743).
  const removal = destinationRemoval(ledger, act, declared);
  if (removal) return removal;
  if (act.strictReset) return unproved(unmatched(ledger, act, declared, toggle !== undefined));
  act.kept = true;
  return { kind: "refused", evidence: refusal("candidate.undo_wrong_target", { act: act.id, failed: "not_own_item", canMeet: "no_call", instruction: WORDS.wrongTarget(), cannotUndo: [ledger.named(act)] }) };
}

/**
 * Its own toggle's place, already showing the state the build found (t743,
 * photo `run-mvgw7320-de416190` 0151): refused unrun as already back, with the
 * act's remaining settle. The act stays listed as today (`actsToUndo`).
 */
function alreadyBack<A extends AutomationStudioSiteResetAdmittedAct>(ledger: AutomationStudioSiteResetAdmissionLedger<A>, act: A): AutomationStudioSiteResetTarget {
  const actsToUndo = ledger.inPlace();
  const settle = actsToUndo.find((entry) => entry.act === act.id)?.settle;
  return { kind: "refused", evidence: refusal("candidate.undo_already_back", { act: act.id, failed: "already_back", canMeet: "no_call", instruction: WORDS.alreadyBack(), ...(settle ? { settle } : {}), actsToUndo }) };
}

/**
 * Why a strict act's undo found no admission past its own item (t743): the
 * first of the conditions the paths above checked that does not hold, in the
 * order they check them. Its own control elsewhere, a control about another
 * item or about none, classes that do not reverse the act's, then the subject
 * deletion's own conditions.
 */
function unmatched<A extends AutomationStudioSiteResetAdmittedAct>(ledger: AutomationStudioSiteResetAdmissionLedger<A>, act: A, declared: AutomationStudioSiteResetUndoDeclared, toggled: boolean): Unmet {
  if (!aboutTheAct(act, declared.control)) {
    // On a destination the act named, the removal's own condition (t743).
    if (namedDestination(act, declared.control)) return destinationRemovalUnmet(ledger, act, declared) ?? ["no_exact_inverse", "no_call"];
    if (toggled) return ["control_elsewhere", "another_page"];
    return declared.control.subject === undefined ? ["no_item_identity", "this_page"] : ["subject_differs", "another_page"];
  }
  if (!reverses(act.consequences, declared.consequences)) return ["consequence_not_inverse", "this_page"];
  return subjectDeletionUnmet(ledger, act, declared) ?? ["no_exact_inverse", "no_call"];
}

/**
 * The one exact subject inverse (t719): deleting a subject absent on a
 * positively observed destination before this act, and present now. A name is
 * identity, never evidence that the whole effect is ours; quantitative edits
 * need a deterministic inverse witness, which this seam does not yet supply.
 */
function subjectDeletion<A extends AutomationStudioSiteResetAdmittedAct>(ledger: AutomationStudioSiteResetAdmissionLedger<A>, act: A, declared: AutomationStudioSiteResetUndoDeclared): AutomationStudioSiteResetTarget | undefined {
  if (subjectDeletionUnmet(ledger, act, declared)) return undefined;
  const { seen, acts } = ledger;
  const scope = declared.control.scope!, subject = declared.control.subject!;
  const baseline = seen.originals.get(scope)!;
  act.subjectUndo = { scope, subject, group: baseline.group };
  // Repeated executions of one registered creation on the same source
  // control can share a newly-created destination line. Its disappearance
  // restores them all; a second destructive press would touch baseline.
  if (act.operation && act.control && act.spot?.scope) {
    for (const other of acts) {
      if (other === act || !ledger.claimable(other) || other.operation !== act.operation || other.control !== act.control || other.spot?.scope !== act.spot.scope || other.spot?.subject !== act.spot.subject || other.spot?.page !== act.spot.page || other.spot?.item !== act.spot.item || other.spot?.dialog !== act.spot.dialog || other.consequences.length !== 1 || other.consequences[0] !== "create_new" || baseline.beforeAct >= acts.indexOf(other) + 1 || !aboutTheAct(other, declared.control)) continue;
      other.subjectUndo = { scope, subject, group: baseline.group };
    }
  }
  return { kind: "admit", on: "subject", allowed: ["delete"] };
}

/**
 * The subject deletion's conditions (`subjectDeletion`), each named (t743):
 * the first that does not hold, or none when it may delete. A subject token on
 * the control; a complete read of its list before this act; that list read
 * completely now; the subject absent there before; present now; an act that
 * created; an undo declaring exactly `delete`.
 */
function subjectDeletionUnmet<A extends AutomationStudioSiteResetAdmittedAct>(ledger: AutomationStudioSiteResetAdmissionLedger<A>, act: A, declared: AutomationStudioSiteResetUndoDeclared): Unmet | undefined {
  const { seen, acts } = ledger;
  const { scope, subject } = declared.control;
  if (scope === undefined || subject === undefined) return ["no_item_identity", "this_page"];
  const baseline = seen.originals.get(scope);
  if (!baseline || baseline.beforeAct >= acts.indexOf(act) + 1) return ["no_destination_read_before", "no_call"];
  if (seen.currentGroups.get(scope) !== baseline.group || !seen.latestGroupScopes.get(baseline.group)?.has(scope)) return ["destination_not_read_now", "this_page"];
  if (baseline.subjects.has(subject)) return ["subject_there_before", "no_call"];
  if (!seen.currentSubjects.get(scope)?.has(subject)) return ["subject_not_present_now", "no_call"];
  if (!act.consequences.includes("create_new")) return ["no_exact_inverse", "no_call"];
  if (declared.consequences.length !== 1 || declared.consequences[0] !== "delete") return ["consequence_not_inverse", "this_page"];
  return undefined;
}

/**
 * A removal on a destination the act named (header, t743): a strict act's
 * control on one of its named lists, every condition met, recorded as its
 * subject inverse.
 */
function destinationRemoval<A extends AutomationStudioSiteResetAdmittedAct>(ledger: AutomationStudioSiteResetAdmissionLedger<A>, act: A, declared: AutomationStudioSiteResetUndoDeclared): AutomationStudioSiteResetTarget | undefined {
  if (!act.strictReset || !namedDestination(act, declared.control) || destinationRemovalUnmet(ledger, act, declared)) return undefined;
  const scope = declared.control.scope!, subject = declared.control.subject!;
  act.subjectUndo = { scope, subject, group: ledger.seen.originals.get(scope)!.group };
  return { kind: "admit", on: "subject", allowed: [...new Set(declared.consequences)] };
}

/** Whether `control` sits in a list the act named, its own or lent (header, t743). */
function namedDestination(act: AutomationStudioSiteResetAdmittedAct, control: AutomationStudioSiteResetSpot): boolean {
  if (control.scope === undefined) return false;
  return [...act.destinations, ...(act.lent ?? [])].some((entry) => entry.scope === control.scope);
}

/**
 * The removal's conditions (`destinationRemoval`), each named (t743): the
 * first that does not hold, or none when it may remove. A subject token on
 * the control; not yet spent; a complete read of the list before this act;
 * that list read completely now, after the act; the subject absent there
 * before; present now; an act that created or changed something; an undo
 * declaring only `delete` or `modify_existing`.
 */
function destinationRemovalUnmet<A extends AutomationStudioSiteResetAdmittedAct>(ledger: AutomationStudioSiteResetAdmissionLedger<A>, act: A, declared: AutomationStudioSiteResetUndoDeclared): Unmet | undefined {
  const { seen, acts } = ledger;
  const { scope, subject } = declared.control;
  if (scope === undefined || subject === undefined) return ["no_item_identity", "this_page"];
  if (act.spent) return ["undo_spent", "no_call"];
  const sequence = acts.indexOf(act) + 1;
  const baseline = seen.originals.get(scope);
  if (!baseline || baseline.beforeAct >= sequence) return ["no_destination_read_before", "no_call"];
  const fresh = seen.currentGroups.get(scope) === baseline.group && seen.latestGroupScopes.get(baseline.group)?.has(scope) === true && (seen.groupObservedAfter.get(baseline.group) ?? -1) >= sequence;
  if (!fresh) return ["destination_not_read_now", "this_page"];
  if (baseline.subjects.has(subject)) return ["subject_there_before", "no_call"];
  if (!seen.currentSubjects.get(scope)?.has(subject)) return ["subject_not_present_now", "no_call"];
  if (!act.consequences.some((consequence) => consequence === "create_new" || consequence === "modify_existing")) return ["no_exact_inverse", "no_call"];
  if (declared.consequences.length === 0 || declared.consequences.some((consequence) => !REMOVES.has(consequence))) return ["consequence_not_inverse", "this_page"];
  return undefined;
}

/** The transfer admission predicate, without assigning inverse evidence. */
function transferTarget(seen: AutomationStudioSiteResetObservations, act: AutomationStudioSiteResetAdmittedAct, declared: AutomationStudioSiteResetUndoDeclared): boolean {
  return transferUnmet(seen, act, declared) === undefined;
}

/**
 * The transfer admission's conditions (`transferTarget`), each named (t743):
 * the first that does not hold, or none when the transfer may be moved back.
 * Not yet undone; exactly `modify_existing`; the same list and subject; both
 * lists read completely now; the subject in the list the act moved it to, gone
 * from the one it came from, in the state the act left it.
 */
function transferUnmet(seen: AutomationStudioSiteResetObservations, act: AutomationStudioSiteResetAdmittedAct, declared: AutomationStudioSiteResetUndoDeclared): Unmet | undefined {
  const transfer = act.transfer;
  if (!transfer) return ["transfer_not_witnessed", "no_call"];
  if (act.spent) return ["undo_spent", "no_call"];
  if (declared.consequences.length !== 1 || declared.consequences[0] !== "modify_existing") return ["consequence_not_inverse", "this_page"];
  if (declared.control.scope !== transfer.scope || declared.control.subject !== transfer.subject) return ["subject_differs", "another_page"];
  const fresh = seen.latestGroupScopes.get(transfer.group);
  if (seen.currentGroups.get(transfer.scope) !== transfer.group || !fresh?.has(transfer.origin) || !fresh.has(transfer.scope)) return ["destination_not_read_now", "this_page"];
  if (!seen.currentSubjects.get(transfer.scope)?.has(transfer.subject)) return ["subject_not_present_now", "no_call"];
  if (seen.currentSubjects.get(transfer.origin)?.has(transfer.subject) || seen.currentStates.get(transfer.scope)?.get(transfer.subject) !== transfer.state) return ["transfer_not_witnessed", "no_call"];
  return undefined;
}

/** Information only: no probe may authorize, consume or reassign an act. */
function otherObservedEffect<A extends AutomationStudioSiteResetAdmittedAct>(ledger: AutomationStudioSiteResetAdmissionLedger<A>, act: A, declared: AutomationStudioSiteResetUndoDeclared): AutomationStudioSiteResetNamedAct | undefined {
  const { seen, acts } = ledger;
  const scope = act.spot?.scope, subject = act.spot?.subject;
  const first = acts.indexOf(act), baseline = scope ? seen.originals.get(scope) : undefined;
  if (!scope || !subject || act.consequences.length !== 1 || act.consequences[0] !== "modify_existing" || !baseline || baseline.beforeAct >= first + 1 || !baseline.subjects.has(subject)) return undefined;
  const others = acts.slice(first + 1).filter(other => {
    if (!ledger.claimable(other) || other.spot?.scope !== scope || other.spot?.subject !== subject || other.transfer?.origin !== scope || !transferTarget(seen, other, declared)) return false;
    const resources = [act.spot?.resource, other.spot?.resource, declared.control.resource];
    if (resources.some(resource => resource !== undefined) && (!resources[0] || resources.some(resource => resource !== resources[0]))) return false;
    const group = other.transfer.group, sequence = acts.indexOf(other) + 1;
    const fresh = seen.latestGroupScopes.get(group);
    const original = [...seen.originals].filter(([, entry]) => entry.group === group && entry.beforeAct < sequence);
    // Feedback is stricter than admission: require the fresh whole group.
    return (seen.groupObservedAfter.get(group) ?? -1) >= sequence && fresh?.size === original.length && original.every(([originalScope]) => fresh.has(originalScope));
  });
  return others.length === 1 ? ledger.plain(others[0]!) : undefined;
}

/**
 * Whether `control` sits on the item `spot` names, by a positive match (t479):
 * both item tokens present and equal, in the same dialog or in none. A token
 * missing on either side is never a match.
 */
function sameItem(spot: AutomationStudioSiteResetSpot, control: AutomationStudioSiteResetSpot): boolean {
  if (spot.item === undefined || control.item === undefined || spot.item !== control.item) return false;
  return (spot.dialog ?? null) === (control.dialog ?? null) && (spot.scope ?? null) === (control.scope ?? null);
}

/**
 * Whether `control` is about what `act` was about (t719): its `subject` equals
 * the act's, or the act's `page` where the act sat in no item. Both tokens
 * present and equal; a token missing on either side is never a match.
 */
function aboutTheAct(act: AutomationStudioSiteResetAdmittedAct, control: AutomationStudioSiteResetSpot): boolean {
  if (control.subject === undefined) return false;
  if (act.spot?.subject === control.subject) return true;
  return act.spot?.item === undefined && act.spot?.page === control.subject;
}

/** Whether every lasting class an undo declares reverses one of the act's (t719); declaring none reverses nothing and is no harm. */
function reverses(acted: readonly AutomationStudioActionConsequence[], undo: readonly AutomationStudioActionConsequence[]): boolean {
  const allowed = new Set(acted.flatMap((consequence) => REVERSES[consequence] ?? []));
  return undo.every((consequence) => allowed.has(consequence));
}
