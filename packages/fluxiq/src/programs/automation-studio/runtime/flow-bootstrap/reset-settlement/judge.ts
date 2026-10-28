// The settlement judgement of one site-reset ledger's acts (t743: moved out
// of `../site-reset/ledger.ts`, which hands it its acts, its reads and its
// receipts; the ledger keeps recording, claims and the trial gate).
//
// **One settlement model for every strict act (L1, 2026-10-19).** Three narrow
// proofs -- whole-group restoration, subject restoration, F1's unchanged named
// destination -- each needed one exact look, over evidence only some sites
// give, and seven failures recurred around them (canonical r5/r6, office r1/r2,
// job r1/r2, photo r2). An act now carries witnesses of what it could change:
// complete list groups (its own list read before it, every destination named
// for it on its own call or on a look under `undoes`, the one its creation was
// admitted against, the destination its subject undo or transfer was proved
// on, and the destinations of the explored acts a trial act repeats,
// `./trial-repeat.ts`), and its own control's toggle
// (`./toggle-witness.ts`, `./control-tracker.ts`). It is
// settled when fresh complete reads -- after it and after the latest lasting
// call or trial, by its ledger's clock -- show every witness as the build
// found it (`./group-witness.ts`, `./decision.ts`):
// `restored` when a change was seen or an undo landed, otherwise `unchanged`,
// which is sticky, never asked for, and listed in every later trial's
// `startedWith.cannotUndo` as left with nothing it could change showing a
// change. Open otherwise, and every open act says under `settle` what to read
// or undo (`./words.ts`); before refusing, the ledger's `beforeTrial` has Core
// look at each stale witness's place itself (`lookFirst`, `checks.lookAt`), and
// loads again, once per landed undo, a list that still differs after that act's
// undo landed: a site may draw a removal only on the list's next load, so the
// read in place just after the undo is not yet a fresh read of it (t751 final
// acceptance, job-board My jobs).
// `cannotUndo` never settles a strict act. A toggle is undone by pressing its
// own control back at its place, admitted `own` with `modify_existing` unasked;
// a control at another place, or already back, is refused unrun.
//
// **A trial act repeats any explored act of its build.** In a single-subflow
// plan the builder's test is the judged whole run, whose acts the supervisor's
// ledger records; it holds none of the builder's explored acts, so on office
// the trial's press never inherited the explored press's named destination. A
// ledger is handed the build's explored acts (`explored`, from
// `../site-reset/project-ledger.ts`), asked at each match and each judgement,
// so a destination named later still counts; a standalone ledger has its own.
//
// **An act with no witness names a list read before it (t751 R6).** A trial
// act with no witness once adopted the build's issued lists it could have
// changed (office r3, narrowed by t743). Those were lists named for other
// acts: office `run-mvhibit5-e1d3a4f3` (cause 2) settled three trial acts
// `unchanged` on a home-page list named for an address act, through a
// destination attached by a call that never landed. Adoption is deleted: an
// act with no witness of its own -- no group, no toggle, after its repeats'
// lent destinations -- is open with `name`, whoever made it. Naming can meet
// it only with a list read complete before it (`./group-witness.ts`: an
// original counts only when read before the act), so `name` is judged per act:
// meetable while some list with a receipt -- not lost (`./reach.ts`) -- was
// read complete before the act, and `nothing_to_name` otherwise (this replaced
// the build-wide `refsClosed`). A receipt not yet shown still counts: reading
// that list again prints its ref (t743's "a ref can still be issued"). Its
// words list only the issued refs among those lists (`./words.ts`).
//
// **A list Core cannot read again (t743, photo `run-mvgw7320-de416190`).**
// When Core's own look at a stale list's location lands and the list is still
// not read fresh and complete there (the address opens a different document),
// or that look answers unread in two separate pre-trial checks of this
// ledger, the list's group is lost for the whole build (`./reach.ts`) and is
// never a `look` again (`./decision.ts`).
//
// **No call can meet it: `gate_unsatisfiable` (t743).** An open act whose
// every reason no call can meet -- its only witnesses lost, nothing read
// before it to name, or its control's start never read (`baseline`,
// `./control-tracker.ts`, t751 R1) -- is answered by `unmet` with the closed condition
// that failed; the ledger takes it out of the acts to undo and lists it
// apart, and trials stay refused while it is in place. A reason only
// site-reset can judge -- a list that still differs, an own control -- is
// answered by the ledger's own rule (`more`: `../site-reset/undo-reach.ts`,
// t748), handed the lists that differ (`differing`).

import type { AutomationStudioSiteResetFailed } from "../reset-answers/index.ts";
import { automationStudioSiteResetActGroups as actGroups } from "./act-groups.ts";
import type { AutomationStudioSiteResetControlTracker, AutomationStudioSiteResetPress } from "./control-tracker.ts";
import { automationStudioSiteResetSettleDecision as settleDecision, type AutomationStudioSiteResetJudgedGroup, type AutomationStudioSiteResetOpenReason, type AutomationStudioSiteResetSettlement } from "./decision.ts";
import type { AutomationStudioSiteResetObservations } from "./observations.ts";
import type { AutomationStudioSiteResetReach } from "./reach.ts";
import type { AutomationStudioSiteResetSettlementSpot } from "./spot.ts";
import { automationStudioSiteResetToggleWitness as toggleWitness } from "./toggle-witness.ts";
import { automationStudioSiteResetSettleWords as settleWords, type AutomationStudioSiteResetIssuedRef } from "./words.ts";

type Scope = { scope: string; group: string };

/** An act as the judgement reads it, the ledger's own object: the judgement fills its toggle and marks a change seen (header). */
export type AutomationStudioSiteResetJudgedAct = {
  id: string;
  /** The exploration call that made it; absent for a trial step's or an entry preparation's act. */
  call?: string | undefined;
  spot?: AutomationStudioSiteResetSettlementSpot | undefined;
  destinations: Scope[];
  /** The explored acts a trial act repeats, by id. */
  repeats: string[];
  transfer?: { origin: string; scope: string; group: string } | undefined;
  subjectUndo?: Scope | undefined;
  /** The ledger clock it landed at. */
  clock: number;
  press?: AutomationStudioSiteResetPress | undefined;
  /** Immutable counts retained by the step's trusted admission receipt, independent of runtime diff completeness. */
  controlOriginal?: { resource: string; page: string; place: string; before: Readonly<Record<string, number>>; location?: string; at?: string } | undefined;
  toggle?: { page: string; place: string; from: string; to: string } | undefined;
  changeSeen: boolean;
  /** Undo calls of it that landed. */
  attempts: number;
};

/**
 * The closed conditions an act no call can settle fails on (header): its only witnesses lost, nothing read before it to
 * name, what still differs no undo could put back (t748), or its control's start never read (`no_baseline`, t751 R1).
 */
export type AutomationStudioSiteResetUnmet = Extract<AutomationStudioSiteResetFailed, "witness_unreachable" | "nothing_to_name" | "no_admissible_undo" | "no_baseline">;

/** What the judgement is handed by its ledger (header). */
export type AutomationStudioSiteResetJudgePorts = {
  seen: AutomationStudioSiteResetObservations;
  tracker: AutomationStudioSiteResetControlTracker;
  /** The build's lost groups, shared by every ledger of one build. */
  reach: AutomationStudioSiteResetReach;
  /** The build's destination receipts (`../site-reset/create-baselines.ts`). */
  receipts: {
    named(reference: unknown): Scope | undefined;
    described(scope: string): { ref: string; location?: string } | undefined;
    issuedRefs(): AutomationStudioSiteResetIssuedRef[];
  };
  /** The ledger's acts, in the order recorded. */
  acts(): readonly AutomationStudioSiteResetJudgedAct[];
  /** The ledger clock now. */
  clock(): number;
  /** The build's explored acts, each with every destination named for it so far. */
  explored(): ReadonlyArray<{ id: string; destinations: readonly Scope[] }>;
};

/** Pre-trial checks of this ledger in which Core's look at a list answered unread, before the list is lost (header). */
const UNREAD_CHECKS = 2;

export class AutomationStudioSiteResetSettlementJudge {
  private readonly ports: AutomationStudioSiteResetJudgePorts;
  /** Reads this ledger has taken in: a look landed when it rose while the look ran. */
  private reads = 0;
  /** Pre-trial looks this ledger has made, and per group the ones that answered unread (header). */
  private checks = 0;
  private readonly unread = new Map<string, Set<number>>();
  /** Per act, the landed undo count at Core's last reload of each location an `undo` reason named (`lookFirst`). */
  private readonly reloaded = new WeakMap<AutomationStudioSiteResetJudgedAct, Map<string, number>>();

  constructor(ports: AutomationStudioSiteResetJudgePorts) {
    this.ports = ports;
  }

  /** A read reached the ledger. */
  read(): void {
    this.reads += 1;
  }

  /** Every witness of `act`, judged against the latest reads (`./decision.ts`); a witness seen changed is remembered. */
  evaluate(act: AutomationStudioSiteResetJudgedAct): AutomationStudioSiteResetSettlement {
    // A trial act's destinations include those of the explored acts it repeats, named whenever (header).
    const groups = this.groupsOf(act, [...act.destinations, ...this.lent(act)]);
    if (groups.some((group) => group.changed)) act.changeSeen = true;
    const toggle = this.toggleOf(act);
    const { tracker } = this.ports;
    const control = act.controlOriginal ? tracker.originalStanding(act.controlOriginal, act.clock, this.ports.clock(), toggle) : toggle ? tracker.standing(toggle.place, toggle, act.clock, this.ports.clock()) : act.press ? tracker.unread(act.press) : undefined;
    if (act.controlOriginal && control?.status === "open") act.changeSeen = true;
    return settleDecision({ groups, toggle: control, changeSeen: act.changeSeen, undoLanded: act.attempts > 0 });
  }

  /** The destinations the explored acts `act` repeats lend it, named whenever (header); the site-reset admission reads them too (t743). */
  lent(act: Pick<AutomationStudioSiteResetJudgedAct, "repeats">): Scope[] {
    if (!act.repeats.length) return [];
    const explored = this.ports.explored();
    return act.repeats.flatMap((id) => explored.find((other) => other.id === id)?.destinations ?? []);
  }

  /** The toggle its own press made, once the read after it is in (header). */
  toggleOf(act: AutomationStudioSiteResetJudgedAct): AutomationStudioSiteResetJudgedAct["toggle"] {
    if (act.controlOriginal && !act.toggle) act.toggle = this.ports.tracker.originalToggle(act.controlOriginal, act.clock, this.ports.clock());
    const press = act.press;
    if (act.toggle || !press?.after) return act.toggle;
    delete act.press;
    const toggle = toggleWitness({ state: act.spot?.state, before: press.before, after: press.after });
    if (!toggle) return undefined;
    act.toggle = { page: press.page, place: press.place, ...toggle };
    act.changeSeen = true;
    return act.toggle;
  }

  /** What an open act's `settle` says (`./words.ts`); none where it is not open. */
  settle(act: AutomationStudioSiteResetJudgedAct): string | undefined {
    const decision = this.evaluate(act);
    if (decision.kind !== "open") return undefined;
    const namable = this.namable(act);
    return settleWords(decision.reasons, namable.issued, { unnamable: !namable.any });
  }

  /**
   * The closed condition no call can meet, where every open reason of `act` is one (header); none otherwise. `more` judges a
   * reason this judgement leaves open (an `undo` or a `toggle`), asked only while every reason before it is unmet.
   */
  unmet(act: AutomationStudioSiteResetJudgedAct, more?: (reason: AutomationStudioSiteResetOpenReason) => AutomationStudioSiteResetUnmet | undefined): AutomationStudioSiteResetUnmet | undefined {
    const decision = this.evaluate(act);
    if (decision.kind !== "open") return undefined;
    // `name` is unmet where no list with a receipt was read complete before this act (header).
    let nameUnmet: boolean | undefined;
    const unmet: AutomationStudioSiteResetUnmet[] = [];
    for (const reason of decision.reasons) {
      if (reason.reason === "name") nameUnmet ??= !this.namable(act).any;
      const failed = reason.reason === "unreachable" ? "witness_unreachable" : reason.reason === "baseline" ? "no_baseline" : reason.reason === "name" ? (nameUnmet ? "nothing_to_name" : undefined) : more?.(reason);
      if (failed === undefined) return undefined;
      unmet.push(failed);
    }
    return unmet[0];
  }

  /** The act's own list witnesses that differ now, each with its relevant scopes (`./group-witness.ts`): what an undo would have to put back (header, t748). */
  differing(act: AutomationStudioSiteResetJudgedAct): Array<{ group?: string | undefined; scopes: string[] }> {
    return this.groupsOf(act, [...act.destinations, ...this.lent(act)]).filter((group) => group.status === "differs").map((group) => ({ group: group.group, scopes: [...group.scopes] }));
  }

  /**
   * Core looks once at each place where an open act's witness is stale (header); each read reaches the ledgers through the
   * caller. A list still not read fresh and complete after a look there landed is lost at once; one whose look answered unread
   * is lost after `UNREAD_CHECKS` pre-trial checks.
   */
  async lookFirst(open: readonly AutomationStudioSiteResetJudgedAct[], lookAt: (location: string) => Promise<void>): Promise<void> {
    this.checks += 1;
    const looked = new Set<string>();
    for (const act of open) {
      const decision = this.evaluate(act);
      if (decision.kind !== "open") continue;
      for (const reason of decision.reasons) {
        if (!reason.location) continue;
        // A list that still differs after this act's undo landed is loaded again once per landed undo (t751 R2, final
        // acceptance job): a site may draw the removal only on its next load, so a read in place can be stale.
        const reload = reason.reason === "undo" && act.attempts > 0 && this.reloaded.get(act)?.get(reason.location) !== act.attempts;
        if (reason.reason !== "look" && !reload) continue;
        if (reload) this.reloaded.set(act, new Map([...(this.reloaded.get(act) ?? []), [reason.location, act.attempts]]));
        if (looked.has(reason.location)) continue;
        looked.add(reason.location);
        const before = this.reads;
        await lookAt(reason.location);
        this.reached(open, reason.location, this.reads > before);
      }
    }
  }

  /** After Core's look at `location`: every list still stale there is lost, at once where the look landed (header). */
  private reached(open: readonly AutomationStudioSiteResetJudgedAct[], location: string, landed: boolean): void {
    const stale = new Set(open.flatMap((act) => {
      const decision = this.evaluate(act);
      if (decision.kind !== "open") return [];
      return decision.reasons.flatMap((reason) => (reason.reason === "look" && reason.witness === "group" && reason.location === location && reason.group !== undefined ? [reason.group] : []));
    }));
    for (const group of stale) {
      if (landed) {
        this.ports.reach.lost(group);
        continue;
      }
      const checks = this.unread.get(group) ?? new Set<number>();
      checks.add(this.checks);
      this.unread.set(group, checks);
      if (checks.size >= UNREAD_CHECKS) this.ports.reach.lost(group);
    }
  }

  /** Every complete list group `act` could change, with `destinations` as its named ones (`./act-groups.ts`), each marked lost or not. */
  private groupsOf(act: AutomationStudioSiteResetJudgedAct, destinations: readonly Scope[]): AutomationStudioSiteResetJudgedGroup[] {
    const { seen, receipts, reach } = this.ports;
    const groups = actGroups({ act: { ...act, destinations }, sequence: this.ports.acts().indexOf(act) + 1, since: act.clock, clock: this.ports.clock(), observations: seen, described: (scope) => receipts.described(scope) });
    return groups.map((group) => ({ ...group, unreachable: reach.unreachable(group.group) }));
  }

  /**
   * Whether any list with a receipt, not lost, was read complete before `act` (`any`, header), and the issued refs among those
   * lists (`issued`): the only ones naming can meet it with.
   */
  private namable(act: AutomationStudioSiteResetJudgedAct): { any: boolean; issued: AutomationStudioSiteResetIssuedRef[] } {
    const { receipts, seen, reach } = this.ports;
    const sequence = this.ports.acts().indexOf(act) + 1;
    const scopes = new Set([...seen.originals].flatMap(([scope, original]) => (original.beforeAct < sequence && !reach.unreachable(original.group) && receipts.described(scope) !== undefined ? [scope] : [])));
    const issued = receipts.issuedRefs().filter((entry) => {
      const list = receipts.named(entry.ref);
      return list !== undefined && scopes.has(list.scope) && seen.originals.get(list.scope)?.group === list.group;
    });
    return { any: scopes.size > 0, issued };
  }
}
