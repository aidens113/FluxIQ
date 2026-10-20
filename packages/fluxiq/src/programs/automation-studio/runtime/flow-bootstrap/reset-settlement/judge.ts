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
// look at each stale witness's place itself (`lookFirst`, `checks.lookAt`).
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
// **A trial act with no witness adopts the lists it could have changed (office
// r3, narrowed by t743).** Every trial and every entry preparation that re-runs
// a predecessor makes a new act; one in no list had no witness, and each
// needed its own model look naming a list under `undoes` (office rerun round
// 3, `run-mvgo5xft-25460ba2`: act-12, act-15, act-18, one per brief, and the
// build stalled one look short). That look added nothing Core cannot do. So an
// act made by no exploration call (`call` absent: a trial step's or an entry
// preparation's) with no witness of its own -- no group, no toggle, after its
// repeats' lent destinations -- is judged on the issued lists it could have
// changed, and Core's own pre-trial look reads them. Round 4 (office
// `run-mvgvyaip-d856e135`) adopted every issued list, a search-results list
// only a typed search reaches among them, and Core's look could not reach it,
// so the act stayed open on it across briefs. Adopted now are only (a) issued
// lists some act of this build named as where its effect shows -- any act of
// this ledger, any explored act of the build -- and (b) issued lists read on
// the act's own page (its step's page location); a list Core cannot read again
// (`./reach.ts`) is dropped. Every one holding settles it `unchanged`, sticky
// and told to every later trial's judge, exactly as above. One differing never
// asks to undo it there (another act may have changed that list): it stays
// open with its `name` words. An adopted list is never a change seen of its
// own. With nothing adoptable it is to `name` a list while refs can still be
// issued; once no ref can be (`refsClosed`), no call can settle it. Explored
// acts are untouched: the witness rule before the seal covers them
// (`../site-reset/reset-witness.ts`).
//
// **A list Core cannot read again (t743, photo `run-mvgw7320-de416190`).**
// When Core's own look at a stale list's location lands and the list is still
// not read fresh and complete there (the address opens a different document),
// or that look answers unread in two separate pre-trial checks of this
// ledger, the list's group is lost for the whole build (`./reach.ts`) and is
// never a `look` again (`./decision.ts`).
//
// **No call can meet it: `gate_unsatisfiable` (t743).** An open act whose
// every reason no call can meet -- its only witnesses lost, or nothing to name
// once refs are closed -- is answered by `unmet` with the closed condition
// that failed; the ledger takes it out of the acts to undo and lists it
// apart, and trials stay refused while it is in place.

import type { AutomationStudioSiteResetFailed } from "../reset-answers/index.ts";
import { automationStudioSiteResetActGroups as actGroups } from "./act-groups.ts";
import type { AutomationStudioSiteResetControlTracker, AutomationStudioSiteResetPress } from "./control-tracker.ts";
import { automationStudioSiteResetSettleDecision as settleDecision, type AutomationStudioSiteResetJudgedGroup, type AutomationStudioSiteResetSettlement } from "./decision.ts";
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
  toggle?: { page: string; place: string; from: string; to: string } | undefined;
  changeSeen: boolean;
  /** Undo calls of it that landed. */
  attempts: number;
  /** Where its own page is, for a trial step's act whose step gave it: lists read there may be adopted (header). */
  pageLocation?: string | undefined;
};

/** The closed conditions an act no call can settle fails on (header): its only witnesses lost, or nothing to name once refs are closed. */
export type AutomationStudioSiteResetUnmet = Extract<AutomationStudioSiteResetFailed, "witness_unreachable" | "nothing_to_name">;

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
    refsClosed(): boolean;
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
    const control = toggle ? tracker.standing(toggle.place, toggle, act.clock, this.ports.clock()) : act.press ? tracker.unread(act.press) : undefined;
    // A trial act with no witness of its own adopts the issued lists it could have changed; never their changes (header).
    const witnessless = act.call === undefined && !control && groups.every((group) => group.status === "none");
    const adopted = witnessless ? this.groupsOf(act, this.adoptable(act)) : undefined;
    return settleDecision({ groups, toggle: control, changeSeen: act.changeSeen, undoLanded: act.attempts > 0, adopted });
  }

  /** The destinations the explored acts `act` repeats lend it, named whenever (header); the site-reset admission reads them too (t743). */
  lent(act: Pick<AutomationStudioSiteResetJudgedAct, "repeats">): Scope[] {
    if (!act.repeats.length) return [];
    const explored = this.ports.explored();
    return act.repeats.flatMap((id) => explored.find((other) => other.id === id)?.destinations ?? []);
  }

  /** The toggle its own press made, once the read after it is in (header). */
  toggleOf(act: AutomationStudioSiteResetJudgedAct): AutomationStudioSiteResetJudgedAct["toggle"] {
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
    const { receipts } = this.ports;
    return settleWords(decision.reasons, receipts.issuedRefs(), { closed: receipts.refsClosed() });
  }

  /** The closed condition no call can meet, where every open reason of `act` is one (header); none otherwise. */
  unmet(act: AutomationStudioSiteResetJudgedAct): AutomationStudioSiteResetUnmet | undefined {
    const decision = this.evaluate(act);
    if (decision.kind !== "open") return undefined;
    const { receipts } = this.ports;
    // `name` is unmet only once no ref can be issued: for a trial act always then (header), for an explored act when none was.
    const nameUnmet = receipts.refsClosed() && (act.call === undefined || receipts.issuedRefs().length === 0);
    const unmet = decision.reasons.map((reason): AutomationStudioSiteResetUnmet | undefined => (reason.reason === "unreachable" ? "witness_unreachable" : reason.reason === "name" && reason.adopted !== true && nameUnmet ? "nothing_to_name" : undefined));
    return unmet.every((entry) => entry !== undefined) ? unmet[0] : undefined;
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
        if (reason.reason !== "look" || !reason.location || looked.has(reason.location)) continue;
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

  /** The issued lists a witnessless trial act could have changed (header): named for some act of the build, or read on its own page. */
  private adoptable(act: AutomationStudioSiteResetJudgedAct): Scope[] {
    const { receipts, reach } = this.ports;
    const named = new Set([...this.ports.acts().flatMap((entry) => entry.destinations), ...this.ports.explored().flatMap((entry) => entry.destinations)].map((entry) => entry.scope));
    return receipts.issuedRefs().flatMap((entry) => {
      const list = receipts.named(entry.ref);
      if (!list || reach.unreachable(list.group)) return [];
      const ownPage = act.pageLocation !== undefined && entry.location === act.pageLocation;
      return named.has(list.scope) || ownPage ? [list] : [];
    });
  }
}
