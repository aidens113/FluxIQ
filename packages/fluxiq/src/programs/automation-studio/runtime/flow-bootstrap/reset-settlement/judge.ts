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
// loads again a list that differs on a read made in place after an undo landed
// on an act it witnesses: a site may draw a removal only on the list's next
// load, so that read is not yet a fresh read of it (t751 final acceptance; t772
// R1). Whether a list's latest read is such a read is one fact, kept by the
// observations (`./observations.ts`, `readInPlace`) from the undos this judge
// counts per group (`undosOn`) at each load; `evaluate` (the `reload` reason,
// `./decision.ts`), `lookFirst` and `../site-reset/undo-reach.ts` (through
// `differing`) all read it, so no act is called unsettleable on that read
// (rerun round 6 `run-mvrj7qg9-b6dc94f6`).
// An undone act on a list several acts changed settles by its own subjects
// (t772 w10, headed job-undo-redraws-on-load: two undone acts stayed open, and
// were reported left, while the third's row still showed). For an act an undo of
// which landed, on a group whose latest read is not stale in place, a
// difference may be put down to another act of this ledger still left on the
// site -- not undone, not settled -- that witnesses that group too and was
// recorded after the list's original was read, by its own subjects
// (`othersOn`, `./group-witness.ts`). Such an act's own witness on the group
// still differs, so it stays open while its subject shows, whatever order the
// acts are judged in. A difference no such act explains keeps every act open.
// An act's own subjects there include the row its admitted subject undo removes
// on that group (`./group-subjects.ts`, t772 w11): a press from an item's own
// page is often about nothing that tells the items apart, and that row is then
// the only subject tying it to the list. Only an undone act is judged so, and so it settles only `restored`: a read
// just after an act on a list that draws a new row only on its next load does
// not yet show that act's row, and would settle it `unchanged` for good on a
// sibling's row (shape B's failed press keeps the whole-list rule too).
// `cannotUndo` never settles a strict act. A toggle is undone by pressing its
// own control back at its place, admitted `own` with `modify_existing` unasked;
// a control at another place, or already back, is refused unrun.
//
// **A value witness (t772, rerun round 6 `run-mvrj7qg8-6916b3f7` cause 1).** A
// lasting `modify_existing` press that confirms a choice and reloads its page to
// the same address shows its effect on no list and not on its own control,
// only on a value the page shows. The shown values its press replaced -- read
// around it by Core, or off a trial step's own diff -- witness it
// (`./value-tracker.ts`, `valued`), and only while nothing else does: no list
// group, no toggle or control original, no transfer, no subject undo, so an act
// another witness settles is never blocked by a notice that changed with it.
// It is settled `restored` when a fresh read after the latest lasting call
// shows the build's start value at its place; `look` while stale, `baseline`
// (`no_baseline`) where that place was never read before the build replaced
// it, and `value` otherwise, set back by its own control
// (`../site-reset/undo-admission.ts`). An own control with no tokens is
// answered by the ledger's own rule (`more`: `no_admissible_undo`). After
// `VALUE_UNDOS` landed undos, each read fresh still showing the value it set,
// it is closed `value_not_back`: its value never came back, so it is never
// left open as meetable.
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
// apart, and trials stay refused while it is in place. An act whose own
// control a fresh read shows back at the state the build found
// (`./own-control.ts`, the same answer the undo admission gives
// `already_back` on) while its control witness stays open is one (`own_back`,
// `already_back`, t772): no press is left to make, so it is never left open
// as meetable (rerun round 6 `run-mvrj7qgf-a44a1427`: settlement asked to
// press a control back that the admission answered already back, for 110
// steps). A reason only
// site-reset can judge -- a list that still differs, an own control -- is
// answered by the ledger's own rule (`more`: `../site-reset/undo-reach.ts`,
// t748), handed the lists that differ (`differing`).

import type { AutomationStudioSiteResetFailed } from "../reset-answers/index.ts";
import { automationStudioSiteResetActGroups as actGroups } from "./act-groups.ts";
import type { AutomationStudioSiteResetControlTracker, AutomationStudioSiteResetPress } from "./control-tracker.ts";
import { automationStudioSiteResetSettleDecision as settleDecision, type AutomationStudioSiteResetJudgedGroup, type AutomationStudioSiteResetOpenReason, type AutomationStudioSiteResetSettlement } from "./decision.ts";
import { automationStudioSiteResetGroupSubjects as groupSubjects } from "./group-subjects.ts";
import type { AutomationStudioSiteResetOtherAct } from "./group-witness.ts";
import type { AutomationStudioSiteResetObservations } from "./observations.ts";
import { automationStudioSiteResetOwnControlStanding as ownControlStanding } from "./own-control.ts";
import type { AutomationStudioSiteResetReach } from "./reach.ts";
import type { AutomationStudioSiteResetSettlementSpot } from "./spot.ts";
import { automationStudioSiteResetToggleWitness as toggleWitness } from "./toggle-witness.ts";
import { AutomationStudioSiteResetValueTracker, type AutomationStudioSiteResetValueWitness } from "./value-tracker.ts";
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
  /** Where its admitted subject undo removes, and what (`./group-subjects.ts`). */
  subjectUndo?: (Scope & { subject?: string | undefined }) | undefined;
  /** The ledger clock it landed at. */
  clock: number;
  press?: AutomationStudioSiteResetPress | undefined;
  /** Immutable counts retained by the step's trusted admission receipt, independent of runtime diff completeness. */
  controlOriginal?: { resource: string; page: string; place: string; before: Readonly<Record<string, number>>; location?: string; at?: string } | undefined;
  toggle?: { page: string; place: string; from: string; to: string } | undefined;
  /** The shown values its press replaced, while nothing else witnesses it (header, t772). */
  value?: AutomationStudioSiteResetValueWitness | undefined;
  changeSeen: boolean;
  /** Undo calls of it that landed. */
  attempts: number;
  /** Counted undone, and settled for good, by its ledger: either way no longer left on the site to explain a difference (header, t772 w10). */
  undone?: boolean | undefined;
  settled?: "restored" | "unchanged" | undefined;
};

/**
 * The closed conditions an act no call can settle fails on (header): its only witnesses lost, nothing read before it to
 * name, what still differs no undo could put back (t748), its control's start never read (`no_baseline`, t751 R1), or its
 * own control already back while its witness stays open (`already_back`, header, t772), or its value never back after
 * `VALUE_UNDOS` undos (`value_not_back`, header, t772).
 */
export type AutomationStudioSiteResetUnmet = Extract<AutomationStudioSiteResetFailed, "witness_unreachable" | "nothing_to_name" | "no_admissible_undo" | "no_baseline" | "already_back" | "value_not_back">;

/** What the judgement is handed by its ledger (header). */
export type AutomationStudioSiteResetJudgePorts = {
  seen: AutomationStudioSiteResetObservations;
  tracker: AutomationStudioSiteResetControlTracker;
  /** The shown values it has seen (header, t772); absent, the judge keeps its own, fed by `read`. */
  values?: AutomationStudioSiteResetValueTracker;
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
/** Landed undos, each read fresh still not showing the value it set, after which a value act is closed (header, t772). */
const VALUE_UNDOS = 2;

export class AutomationStudioSiteResetSettlementJudge {
  private readonly ports: AutomationStudioSiteResetJudgePorts;
  /** Reads this ledger has taken in: a look landed when it rose while the look ran. */
  private reads = 0;
  /** Pre-trial looks this ledger has made, and per group the ones that answered unread (header). */
  private checks = 0;
  private readonly unread = new Map<string, Set<number>>();
  private readonly values: AutomationStudioSiteResetValueTracker;
  /** Per value act, the landed-undo counts after which a fresh read still showed the value it set (header, t772). */
  private readonly misses = new WeakMap<AutomationStudioSiteResetJudgedAct, Set<number>>();

  constructor(ports: AutomationStudioSiteResetJudgePorts) {
    this.ports = ports;
    this.values = ports.values ?? new AutomationStudioSiteResetValueTracker();
  }

  /**
   * A read reached the ledger: its shown values are taken in at the ledger's clock (header, t772), and each group it loaded
   * counts the undos landed on the acts it witnesses now (header, t772 R1).
   */
  read(read?: { scope?: string | undefined; location?: string | undefined; values?: Readonly<Record<string, string>> | undefined }): void {
    this.reads += 1;
    if (read) this.values.read(read, this.ports.clock());
    this.ports.seen.loads((group) => this.undosOn(group));
  }

  /**
   * The shown values `act`'s press replaced (header, t772), read around it by Core (`read`) or off its trial step's own diff
   * (`diff`: a place with no start starts at its `from`). Its places are the build's from now on; they witness the act only
   * where nothing else does, and then a change was seen.
   */
  valued(act: AutomationStudioSiteResetJudgedAct, witness: AutomationStudioSiteResetValueWitness, how: "read" | "diff"): void {
    if (how === "diff") this.values.landed(witness);
    else this.values.witnessed(witness);
    if (this.toggleOf(act) || act.controlOriginal || act.transfer || act.subjectUndo || this.groupsOf(act, [...act.destinations, ...this.lent(act)]).some((group) => group.status !== "none")) return;
    act.value = witness;
    act.changeSeen = true;
  }

  /** Every witness of `act`, judged against the latest reads (`./decision.ts`); a witness seen changed is remembered. */
  evaluate(act: AutomationStudioSiteResetJudgedAct): AutomationStudioSiteResetSettlement {
    // A trial act's destinations include those of the explored acts it repeats, named whenever (header).
    const groups = this.groupsOf(act, [...act.destinations, ...this.lent(act)]);
    if (groups.some((group) => group.changed)) act.changeSeen = true;
    const toggle = this.toggleOf(act);
    const { tracker } = this.ports;
    let control = act.controlOriginal ? tracker.originalStanding(act.controlOriginal, act.clock, this.ports.clock(), toggle) : toggle ? tracker.standing(toggle.place, toggle, act.clock, this.ports.clock()) : act.press ? tracker.unread(act.press) : undefined;
    if (act.controlOriginal && control?.status === "open") act.changeSeen = true;
    // Its own control read back where its witness stays open: closed, never a press to ask for (header, t772).
    if (control?.status === "open" && this.ownBack(act, toggle)) control = { ...control, status: "own_back" };
    // Its value witness, only where nothing else witnesses it (header, t772).
    const value = act.value && !control && !act.transfer && !act.subjectUndo && !groups.some((group) => group.status !== "none") ? this.valueStanding(act, act.value) : undefined;
    return settleDecision({ groups, toggle: control, value, changeSeen: act.changeSeen, undoLanded: act.attempts > 0 });
  }

  /** Where a value act's witness stands (`./value-tracker.ts`); a fresh read still open after landed undos is a miss (header, t772). */
  private valueStanding(act: AutomationStudioSiteResetJudgedAct, witness: AutomationStudioSiteResetValueWitness): ReturnType<AutomationStudioSiteResetValueTracker["standing"]> {
    const standing = this.values.standing(witness, act.clock, this.ports.clock());
    if (standing.status === "open" && act.attempts > 0) this.misses.set(act, (this.misses.get(act) ?? new Set<number>()).add(act.attempts));
    return standing;
  }

  /**
   * Whether a fresh read -- after the act and at the ledger's clock -- shows the act's own control (its toggle) back at the
   * state the build found at its place (`./own-control.ts`, header, t772): at its original's place, against the original's
   * counts and only where the original is judged; at any other place, against that place's start.
   */
  private ownBack(act: AutomationStudioSiteResetJudgedAct, toggle: AutomationStudioSiteResetJudgedAct["toggle"]): boolean {
    if (!toggle) return false;
    const { tracker } = this.ports;
    const original = act.controlOriginal?.place === toggle.place ? act.controlOriginal : undefined;
    const counts = tracker.freshAt(toggle.place, toggle.page, act.clock, this.ports.clock(), original?.resource ?? act.spot?.resource, original?.at);
    const found = original ? original.before : tracker.start(toggle.place);
    return counts !== undefined && found !== undefined && ownControlStanding(toggle, { place: toggle.place, counts, found }) === "back";
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
      const failed = reason.reason === "unreachable" ? "witness_unreachable" : reason.reason === "baseline" ? "no_baseline" : reason.reason === "own_back" ? "already_back" : reason.reason === "name" ? (nameUnmet ? "nothing_to_name" : undefined) : this.neverBack(act, reason) ? "value_not_back" : more?.(reason);
      if (failed === undefined) return undefined;
      unmet.push(failed);
    }
    return unmet[0];
  }

  /** Whether `reason` is a value still showing after `VALUE_UNDOS` landed undos, each read fresh (header, t772). */
  private neverBack(act: AutomationStudioSiteResetJudgedAct, reason: AutomationStudioSiteResetOpenReason): boolean {
    return reason.reason === "value" && (this.misses.get(act)?.size ?? 0) >= VALUE_UNDOS;
  }

  /**
   * The act's own list witnesses that differ now, each with its relevant scopes (`./group-witness.ts`): what an undo would
   * have to put back (header, t748); `inPlace` where that read was made in place after an undo (header, t772 R1).
   */
  differing(act: AutomationStudioSiteResetJudgedAct): Array<{ group?: string | undefined; scopes: string[]; inPlace: boolean }> {
    return this.groupsOf(act, [...act.destinations, ...this.lent(act)]).filter((group) => group.status === "differs").map((group) => ({ group: group.group, scopes: [...group.scopes], inPlace: group.inPlace === true }));
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
        // A list that differs on a read in place after an undo landed is loaded again (t751 R2, t772 R1): a site may draw
        // the removal only on its next load. The load clears that fact (`./observations.ts`), so it is loaded once per undo.
        if (reason.reason !== "look" && reason.reason !== "reload") continue;
        if (looked.has(reason.location)) continue;
        looked.add(reason.location);
        const before = this.reads;
        this.ports.seen.loading(reason.location);
        try {
          await lookAt(reason.location);
        } finally {
          this.ports.seen.loading(undefined);
        }
        this.reached(open, reason.location, this.reads > before);
      }
    }
  }

  /** After Core's look at `location`: every list still stale there is lost, at once where the look landed (header). */
  private reached(open: readonly AutomationStudioSiteResetJudgedAct[], location: string, landed: boolean): void {
    const stale = new Set(open.flatMap((act) => {
      const decision = this.evaluate(act);
      if (decision.kind !== "open") return [];
      return decision.reasons.flatMap((reason) => ((reason.reason === "look" || reason.reason === "reload") && reason.witness === "group" && reason.location === location && reason.group !== undefined ? [reason.group] : []));
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

  /**
   * Every complete list group `act` could change, with `destinations` as its named ones (`./act-groups.ts`), each marked lost
   * or not, and read in place after an undo or not (`./observations.ts`, header, t772 R1).
   */
  private groupsOf(act: AutomationStudioSiteResetJudgedAct, destinations: readonly Scope[]): AutomationStudioSiteResetJudgedGroup[] {
    const { seen, reach } = this.ports;
    const inPlace = new Map<string, boolean>();
    const placed = (group: string): boolean => inPlace.get(group) ?? inPlace.set(group, seen.readInPlace(group, this.undosOn(group))).get(group)!;
    // For an undone act, a difference on a group read fresh, not in place, may be another open act's (header, t772 w10).
    const others = (group: string): AutomationStudioSiteResetOtherAct[] | undefined => (act.attempts === 0 || placed(group) ? undefined : this.othersOn(act, group));
    return this.witnessed(act, destinations, others).map((group) => ({ ...group, unreachable: reach.unreachable(group.group), inPlace: placed(group.group) }));
  }

  /** `act`'s list group witnesses as judged against the latest reads (`./act-groups.ts`), a difference put down to `others` where handed. */
  private witnessed(act: AutomationStudioSiteResetJudgedAct, destinations: readonly Scope[], others?: (group: string) => AutomationStudioSiteResetOtherAct[] | undefined): ReturnType<typeof actGroups> {
    const { seen, receipts } = this.ports;
    return actGroups({ act: { ...act, destinations }, sequence: this.ports.acts().indexOf(act) + 1, since: act.clock, clock: this.ports.clock(), observations: seen, described: (scope) => receipts.described(scope), ...(others ? { others } : {}) });
  }

  /** The other acts of this ledger still left on the site that witness `group`, with their place and own subjects: what a difference there may be put down to (header, t772 w10). */
  private othersOn(act: AutomationStudioSiteResetJudgedAct, group: string): AutomationStudioSiteResetOtherAct[] {
    return this.ports.acts().flatMap((other, index) => {
      if (other === act || other.undone === true || other.settled !== undefined) return [];
      const subjects = groupSubjects(other, group);
      if (!subjects.length || !this.witnessed(other, [...other.destinations, ...this.lent(other)]).some((entry) => entry.group === group)) return [];
      return [{ sequence: index + 1, subjects }];
    });
  }

  /** The undos landed, in all, on this ledger's acts that witness `group` (header, t772 R1). */
  private undosOn(group: string): number {
    let undos = 0;
    for (const act of this.ports.acts()) {
      if (act.attempts > 0 && this.witnessed(act, [...act.destinations, ...this.lent(act)]).some((entry) => entry.group === group)) undos += act.attempts;
    }
    return undos;
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
