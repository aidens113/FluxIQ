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
// - Anything else is refused unrun: `candidate.undo_unproved` for a strict act,
//   with another act whose effect was observed there when exactly one fits
//   (information only), and `candidate.undo_wrong_target` for a legacy act,
//   which is then kept.

import type { AutomationStudioActionConsequence, AutomationStudioActionEffect } from "../../action-permissions/index.ts";
import type { AutomationStudioSiteResetNamedAct, AutomationStudioSiteResetSpot, AutomationStudioSiteResetTarget } from "./contracts.ts";
import type { AutomationStudioSiteResetObservations } from "./settlement-observations.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** For each undoable class, the classes an undo tied to its act by subject may declare (t719): what reverses it, and nothing else lasting. */
const REVERSES: Readonly<Partial<Record<AutomationStudioActionConsequence, readonly AutomationStudioActionConsequence[]>>> = {
  create_new: ["delete", "modify_existing"],
  modify_existing: ["modify_existing"],
  delete: ["create_new", "modify_existing"]
};

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
  /** The toggle the act's own press made, once read. */
  toggle(act: A): { place: string; to: string } | undefined;
  /** The act as the model is shown it, with what settles it while open. */
  named(act: A): AutomationStudioSiteResetNamedAct;
  /** The act as the model is shown it, plainly. */
  plain(act: A): AutomationStudioSiteResetNamedAct;
};

/** What the domain declared for the control an undo would act on. */
export type AutomationStudioSiteResetUndoDeclared = { effect: AutomationStudioActionEffect; consequences: readonly AutomationStudioActionConsequence[]; control: AutomationStudioSiteResetSpot };

/** Whether an undo of `act`, a known act still claimable, may act on `declared` (header). */
export function automationStudioSiteResetUndoAdmission<A extends AutomationStudioSiteResetAdmittedAct>(ledger: AutomationStudioSiteResetAdmissionLedger<A>, act: A, declared: AutomationStudioSiteResetUndoDeclared): AutomationStudioSiteResetTarget {
  // A look changes nothing, wherever it looks.
  if (declared.effect === "observe") return { kind: "admit", on: "moving", allowed: [] };
  const unproved = (): AutomationStudioSiteResetTarget => {
    const other = otherObservedEffect(ledger, act, declared);
    return { kind: "refused", evidence: { ok: false, code: "candidate.undo_unproved", act: act.id, instruction: WORDS.unprovedUndo(other !== undefined), actsToUndo: ledger.inPlace(), ...(other ? { otherActsWithObservedEffect: [other] } : {}) } };
  };
  // Its own toggle pressed back (L1): the same place, still showing the state the act set, declaring nothing else lasting.
  const toggle = ledger.toggle(act);
  if (toggle && declared.control.place === toggle.place) {
    const back = declared.consequences.length === 0 || (declared.consequences.length === 1 && declared.consequences[0] === "modify_existing");
    return back && declared.control.state === toggle.to ? { kind: "admit", on: "own", allowed: ["modify_existing"] } : unproved();
  }
  if (act.strictReset && declared.consequences.length === 0 && (declared.control.scope !== undefined || declared.control.subject !== undefined || declared.control.item !== undefined)) return unproved();
  if (act.transfer && declared.consequences.length > 0) {
    const transfer = act.transfer;
    if (transferTarget(ledger.seen, act, declared)) {
      act.subjectUndo = { scope: transfer.scope, subject: transfer.subject, group: transfer.group, origin: transfer.origin };
      return { kind: "admit", on: "subject", allowed: ["modify_existing"] };
    }
    return unproved();
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
  if (act.strictReset) return unproved();
  act.kept = true;
  return { kind: "refused", evidence: { ok: false, code: "candidate.undo_wrong_target", act: act.id, instruction: WORDS.wrongTarget(), cannotUndo: [ledger.named(act)] } };
}

/**
 * The one exact subject inverse (t719): deleting a subject absent on a
 * positively observed destination before this act, and present now. A name is
 * identity, never evidence that the whole effect is ours; quantitative edits
 * need a deterministic inverse witness, which this seam does not yet supply.
 */
function subjectDeletion<A extends AutomationStudioSiteResetAdmittedAct>(ledger: AutomationStudioSiteResetAdmissionLedger<A>, act: A, declared: AutomationStudioSiteResetUndoDeclared): AutomationStudioSiteResetTarget | undefined {
  const { seen, acts } = ledger;
  const { scope, subject } = declared.control;
  const baseline = scope === undefined ? undefined : seen.originals.get(scope);
  if (scope === undefined || subject === undefined || !baseline || baseline.beforeAct >= acts.indexOf(act) + 1 || seen.currentGroups.get(scope) !== baseline.group || !seen.latestGroupScopes.get(baseline.group)?.has(scope) || baseline.subjects.has(subject) || !seen.currentSubjects.get(scope)?.has(subject) || !act.consequences.includes("create_new") || declared.consequences.length !== 1 || declared.consequences[0] !== "delete") return undefined;
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

/** The transfer admission predicate, without assigning inverse evidence. */
function transferTarget(seen: AutomationStudioSiteResetObservations, act: AutomationStudioSiteResetAdmittedAct, declared: AutomationStudioSiteResetUndoDeclared): boolean {
  const transfer = act.transfer;
  return !!(transfer && !act.spent && declared.consequences.length === 1 && declared.consequences[0] === "modify_existing" && declared.control.scope === transfer.scope && declared.control.subject === transfer.subject && seen.currentGroups.get(transfer.scope) === transfer.group && seen.latestGroupScopes.get(transfer.group)?.has(transfer.origin) && seen.latestGroupScopes.get(transfer.group)?.has(transfer.scope) && !seen.currentSubjects.get(transfer.origin)?.has(transfer.subject) && seen.currentSubjects.get(transfer.scope)?.has(transfer.subject) && seen.currentStates.get(transfer.scope)?.get(transfer.subject) === transfer.state);
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
