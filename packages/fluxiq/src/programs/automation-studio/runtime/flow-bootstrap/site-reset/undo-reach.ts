// Whether any undo this build may make could still put back what an open
// act's lists show (t748; t743 open item 2). Job `run-mvgw1854-5d10955b`: an
// act's list still differed, every undo of it was refused with a condition no
// call could meet, and the act stayed listed to undo, so the builder resent
// every variation of one call until the repeat guard ended its brief. t743
// listed an act apart as `gate_unsatisfiable` only when its witnesses were
// lists Core cannot read again or nothing could be named for it. This rule adds
// the third case, `no_admissible_undo`, which the ledger asks for each open
// reason the settlement judge leaves to it (`./ledger.ts`, `unmet`;
// `../reset-settlement/judge.ts`, `more`).
//
// **A list that still differs (`undo`).** Read off the ledger's own state:
// each list group of the act's that differs on a fresh complete read, with
// its relevant scopes (`differing`), the originals read before the act, and
// the latest reads. The admission paths of `./undo-admission.ts` fall in two
// kinds:
//
// - Paths no read can rule out: a confirmation dialog after an undo that
//   landed (`chain`), a witnessed transfer moved back, an own control's
//   toggle (pressed or read as one, unless that control already answered a
//   state that is neither the build's nor the act's, below), a legacy act's
//   created item, and a press on the act's own item -- unless a fresh complete
//   read of the list that item sat in no longer holds it. While any claimable
//   act of this ledger that is not spent has one, nothing is judged here.
// - Removals of one subject a list holds now that its original, read before
//   the removing act, did not hold: the subject deletion (t719) for an act that
//   created that subject, and the removal on a destination the act named (or
//   can still name: any list with a receipt can be named on a look under
//   `undoes`) for a strict act that created or changed something (t743). An
//   act removes at most one subject this way: once it lands the act is spent,
//   and a spent act is refused before any admission (`./undo-claims.ts`).
//
// So what the differing lists show is put back only by removing subjects new
// there. A row the original held that is gone, a value of one it held that
// changed, or rows out of the original's order (`restored`, row for row and
// value for value) are reversed by no removal; nor is a subject new on a list
// whose original came after every act that could remove it. Where any of those
// is shown, or the subjects new there outnumber what the acts able to remove
// them could remove one each (a matching), no undo could ever settle the act.
//
// **An own control that answered a third state (`toggle`).** Only an answered
// call can say it: the act's own control at its place declared a state that is
// neither the one the build found nor the one the act set
// (`control_state_differs`, `no_call`). The undo claims mark the act at once
// (`pressBackRefused`), so the refusal that says so already lists it apart;
// a press back admitted later clears it.
//
// Nothing here admits a call or weakens the reset rule: an act listed apart
// still refuses every trial, and the admission still decides every undo.
// Only undo calls under `undoes` count; a call without it is a new act.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioSiteResetObservations, AutomationStudioSiteResetOpenReason, AutomationStudioSiteResetOriginal } from "../reset-settlement/index.ts";
import type { AutomationStudioSiteResetLedgerAct as Act } from "./ledger-act.ts";

type Scope = { scope: string; group: string };
/** One subject a differing list holds now that its original did not: what a removal must take away. */
type Removal = { scope: string; subject: string };

/** The ledger as this rule reads it (header). */
type Ledger = {
  acts: readonly Act[];
  seen: AutomationStudioSiteResetObservations;
  clock(): number;
  claimable(act: Act): boolean;
  /** The destinations the explored acts it repeats lend it. */
  lent(act: Act): readonly Scope[];
  /** Its own control's toggle, once read. */
  toggle(act: Act): unknown;
  /** Its list groups that differ on a fresh complete read, each with its relevant scopes; a group the reads could not name has no `group`. */
  differing(act: Act): ReadonlyArray<{ group?: string | undefined; scopes: readonly string[] }>;
  /** A list scope's receipt, if it has one: a look under `undoes` can name it. */
  described(scope: string): unknown;
};

/** The classes after which a removal on a destination the act named is admitted (`./undo-admission.ts`, `destinationRemovalUnmet`). */
const CHANGED: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing"]);

/** How `act`'s open reasons this rule judges read (header): `no_admissible_undo` where no undo could meet one, none otherwise. Computed once per call. */
export function automationStudioSiteResetUndoReach(ledger: Ledger, act: Act): (reason: AutomationStudioSiteResetOpenReason) => "no_admissible_undo" | undefined {
  let unreachable: boolean | undefined;
  return (reason) => {
    if (reason.reason === "toggle") return act.pressBackRefused ? "no_admissible_undo" : undefined;
    if (reason.reason !== "undo") return undefined;
    unreachable ??= noUndoReaches(ledger, act);
    return unreachable ? "no_admissible_undo" : undefined;
  };
}

/** Whether no undo of any act of this ledger could ever put back what `act`'s differing lists show (header). */
function noUndoReaches(ledger: Ledger, act: Act): boolean {
  const differing = ledger.differing(act);
  const groups = differing.flatMap((entry) => (entry.group === undefined ? [] : [{ group: entry.group, scopes: entry.scopes }]));
  // A differing list the reads could not name cannot be judged: nothing is listed apart on it.
  if (!groups.length || groups.length < differing.length) return false;
  const able = ledger.acts.filter((other) => ledger.claimable(other) && !other.spent);
  if (able.some((other) => unruled(ledger, other))) return false;
  const removals = differences(ledger, act, groups);
  return removals === undefined || !everyRemoved(removals, able.map((other) => (removal: Removal) => removes(ledger, other, removal)));
}

/** A path of `act`'s that no read rules out (header). */
function unruled(ledger: Ledger, act: Act): boolean {
  if (act.chain !== undefined || act.transfer !== undefined) return true;
  if ((act.press !== undefined || ledger.toggle(act) !== undefined) && !act.pressBackRefused) return true;
  if (!act.strictReset && act.createdItems.length > 0) return true;
  const item = act.spot?.item;
  return item !== undefined && !act.createdItems.includes(item) && !ownItemGone(ledger, act);
}

/** Whether a fresh complete read of the list `act`'s own item sat in no longer holds it. */
function ownItemGone(ledger: Ledger, act: Act): boolean {
  const scope = act.spot?.scope, subject = act.spot?.subject;
  if (scope === undefined || subject === undefined) return false;
  const { seen } = ledger;
  const group = seen.currentGroups.get(scope);
  if (group === undefined || !seen.latestGroupScopes.get(group)?.has(scope) || (seen.groupClock.get(group) ?? -1) < ledger.clock()) return false;
  return !seen.currentSubjects.get(scope)?.has(subject);
}

/** The subjects to remove for every differing list of `act` to read as its original, or undefined where something no removal reverses is shown (header). */
function differences(ledger: Ledger, act: Act, groups: ReadonlyArray<{ group: string; scopes: readonly string[] }>): Removal[] | undefined {
  const { seen } = ledger;
  const sequence = ledger.acts.indexOf(act) + 1;
  const about = subjectsOf(act);
  const removals = new Map<string, Removal>();
  const add = (scope: string, subject: string): void => void removals.set(JSON.stringify([scope, subject]), { scope, subject });
  for (const { group, scopes } of groups) {
    // Its relevant scopes: restored row for row once the subjects new there are gone, or never by a removal.
    for (const scope of scopes) {
      const original = seen.originals.get(scope);
      if (!original) return undefined;
      const now = [...(seen.currentSubjects.get(scope) ?? [])];
      if (!backWithout(seen, scope, original, now.filter((subject) => original.subjects.has(subject)))) return undefined;
      for (const subject of now) if (!original.subjects.has(subject)) add(scope, subject);
    }
    // Any other list of the group holding what the act was about, other than as originally held.
    for (const scope of seen.latestGroupScopes.get(group) ?? []) {
      if (scopes.includes(scope)) continue;
      const original = seen.originals.get(scope);
      const before = original && original.beforeAct < sequence ? original : undefined;
      for (const subject of about) {
        if (!seen.currentSubjects.get(scope)?.has(subject)) continue;
        if (!before?.subjects.has(subject)) add(scope, subject);
        else if (before.states.get(subject) !== seen.currentStates.get(scope)?.get(subject)) return undefined;
      }
    }
  }
  return [...removals.values()];
}

/** Whether `scope`, with only the rows its original held, is that original row for row and value for value (`restored`). */
function backWithout(seen: AutomationStudioSiteResetObservations, scope: string, original: AutomationStudioSiteResetOriginal, held: readonly string[]): boolean {
  const states = seen.currentStates.get(scope);
  const before = [...original.subjects];
  if (seen.currentGroups.get(scope) !== original.group || original.states.size !== before.length || held.length !== before.length) return false;
  return before.every((subject, index) => {
    const value = original.states.get(subject);
    return held[index] === subject && typeof value === "string" && value.length > 0 && states?.get(subject) === value;
  });
}

/** Whether an undo of `act` could be admitted to remove `removal` (header): its subject deletion, or a removal on a destination it named or can name. */
function removes(ledger: Ledger, act: Act, removal: Removal): boolean {
  const original = ledger.seen.originals.get(removal.scope);
  if (!original || original.beforeAct >= ledger.acts.indexOf(act) + 1 || original.subjects.has(removal.subject)) return false;
  if (act.consequences.includes("create_new") && subjectsOf(act).includes(removal.subject)) return true;
  if (!act.strictReset || !act.consequences.some((consequence) => CHANGED.has(consequence))) return false;
  return [...act.destinations, ...ledger.lent(act)].some((entry) => entry.scope === removal.scope) || ledger.described(removal.scope) !== undefined;
}

/** Whether each removal can go to a different act able to make it: one unasked removal per act (header), by augmenting paths. */
function everyRemoved(removals: readonly Removal[], acts: ReadonlyArray<(removal: Removal) => boolean>): boolean {
  const holder = new Map<number, number>();
  const assign = (index: number, tried: Set<number>): boolean => {
    for (const [act, can] of acts.entries()) {
      if (tried.has(act) || !can(removals[index]!)) continue;
      tried.add(act);
      const held = holder.get(act);
      if (held === undefined || assign(held, tried)) {
        holder.set(act, index);
        return true;
      }
    }
    return false;
  };
  return removals.every((_, index) => assign(index, new Set()));
}

/** What an act was about: its subject, and its page where it sat in no item (`../reset-settlement/act-groups.ts`). */
function subjectsOf(act: Act): string[] {
  const spot = act.spot ?? {};
  return [spot.subject, ...(spot.item === undefined ? [spot.page] : [])].filter((subject): subject is string => subject !== undefined);
}
