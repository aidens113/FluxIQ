// The ledger of this build's own lasting acts (t462: a build resets the site
// before it re-runs its Flow; user, 2026-10-12).
//
// Candidate mode had no record of what a build left on the site: the draft
// steps that carry it exist only in legacy mode. So the build's permission
// wrapper (`../action-permissions.ts`) tells this ledger every exploration call
// it ran (`explored`), and the trial gate tells it each trial's own lasting
// acts (`trialRan`). Each becomes an act `act-N`, numbered once and never
// reused, which the model names under `undoes` on the `core.run_node` call
// that reverses it (`claim`).
//
// - An act is recorded only when it landed, was permitted, applied an effect
//   ("mutate") and declared a lasting class: `create_new`, `modify_existing` or
//   `delete`. One declaring `move_money` or `send_or_publish` cannot be undone
//   through the site, so it is recorded as such and never asked for.
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
//   (`./act-places.ts`). Lane B round 10 (`run-mv5tusj4-b7ee0630`) removed the
//   dish soap the cart held before the build began, twice, unasked, under
//   `undoes` of two adds: the old allowance followed the act, not the item.
//   Once per act: an unasked removal that landed spends it, and a later claim
//   on that act is refused before anything runs (`candidate.undo_already_done`).
//   Any other removal is gated exactly as any call is, and asked.
// - **Legacy unscoped refusals keep an act (t475).** These retain the older
//   startedWith.cannotUndo policy. Modern scoped wrong-target attempts are
//   recoverable: nothing runs, and the build can correct its target. An unproved
//   modern inverse never admits an ordinary trial on leftovers.
// - **An unchanged source proves no destination absence.** Legacy unscoped
//   acts retain the noEffect policy (t475). Identified reversible effects
//   stay pending until positive original inventories prove restoration or a
//   truly failed act; a source notice disappearing never clears them.
//
// **An undo counts only when the act's effect is gone (t471).** A call that
// names an act never marks it undone. Lane D round 9
// (`run-mv5q4j2n-25784472`) clicked the static words of a confirmed request
// under `undoes`, and that click "landed". Instead the build's candidate loop
// reads each act's own page just before and just after it (`placed`), and
// before a trial the reset goes back to that page and looks. Source-line
// disappearance settles only legacy unscoped acts (`beforeTrial`). An act
// with no such place -- a trial's act, or one whose page could not be read --
// uses the older undoSeen fallback only for legacy unscoped effects. Modern
// scoped reversible effects require positive baseline restoration instead.
//
// **Legacy unscoped acts can be kept.** One the model names under `cannotUndo`
// once the reset has asked for it is kept: never asked for again, and every
// trial runs with it in place, saying so under `startedWith.cannotUndo`
// (`./trial-policy.ts`). Being asked for twice and still there keeps nothing,
// and no trial is admitted on an act still to undo (F1 continuation: F3 saw a
// whole trial run on two acts a blocked reset never undid). Modern scoped
// reversible acts still refuse ordinary trials; cannotUndo is an honest
// unresolved outcome.
//
// **A start hook's reset asks the model for nothing (t475, t479).** When the
// deployment's start hook has just put the site back (`startReset`), every act
// of this build, kept ones too, counts undone, nothing is compared, and the
// trial runs. Each act it took back is answered as `absorbedByStartReset`, by
// what it did and the call that made it (t504): lane D round 17
// (`run-mv6lgt3s-c3aa6fac`) pressed one row's control while exploring, the hook
// took it back, and no trial evidence or run record said the act had existed. The hook is the deployment's own reset of the whole site; what a
// look after it still sees is content that changes by itself, a cover the
// runtime closed during the act, or a gap in the hook -- never something the
// model can put back better. t475 looked again on each act's own page and
// asked for what it still saw: lane B round 11 (`run-mv5yaapd-ad19eaae`) was
// asked to undo a rotating carousel and a chat card's cover, and that ask is
// what drove the removal of the dish soap.
//
// **What the hook took back says who made it and on what (t647).** Each act it
// answers carries, for Core alone, the brief whose ledger recorded it
// (`owner`, a project build's) and the name of the control its exploration
// call acted on (`control`), so a trial gate can say when the page a builder
// explored was changed by an act the hook undid and no step of the Flow does
// (`./explored-on-absorbed.ts`). Neither is ever shown to a model.
//
// **A press with an effect but no lasting class is possibly lasting (t593).**
// A press that declares `none` can still leave something on the site: on A8
// crossborder `run-mv8c76i3-61b9ca89` a coupon press declared nothing, the
// coupon stayed collected for every later phase, and the build's ending said
// nothing of it was left. So where a ledger is asked to (`possible`, which a
// project build's ledgers are, `./project-ledger.ts`), a landed, permitted
// `mutate` on a named control that declared no lasting class is recorded too,
// marked `possible`, and so is a trial step that declared none and changed its
// own page in place (`possible` on the trial act,
// `../../service/candidate-trial/landed-acts.ts`). The ledger decides what is
// done with it, and nothing is refused for it: it is never asked for, never
// refuses a trial and is never kept; a start hook takes it back as it takes
// back any act, without naming it among the acts it took back (a build presses
// many controls that declare `none`, and a list of them all would only be
// noise beside every trial); the model may still undo it under `undoes`, and
// the ledger judges that undo as any other; and while it may still be there it
// is answered under `possiblyInPlace`, so a phase's start can say so
// (`../../service/project-build/phase-start.ts`). A navigation names no
// control and is never one.
//
// **A trial's act is tied to its own item too (t598).** A trial's act used to
// be recorded with no item, so every undo of it was refused
// `candidate.undo_wrong_target`, and on a site with no start hook what a
// passing trial left -- with t597, every one of them -- could only be named
// under `cannotUndo` and stayed on the site. A trial step's act now carries
// where its control sat and the items its own page showed new, read off that
// step's state diff (`spot`, `created` on the trial act,
// `../../service/candidate-trial/landed-acts.ts`), and an undo of it is
// admitted on them exactly as on an explored act's. Where the diff gave
// neither, it is recorded as before. A start hook takes it back as before.
//
// **Cross-page inverses need a destination baseline (t719 review).** A
// subject/title says which item an effect concerns; it never proves that the
// whole item belongs to the build. Before adding something whose removal will
// happen elsewhere, the build observes that destination. The domain supplies
// an opaque scope and its subject tokens, including singleton/hidden items.
// The ledger retains the first such read and the local act sequence. A
// subject-only deletion is admitted only for create_new when that scope was
// read before the act, the subject was absent then and is present now. It is
// unasked once and completes only after a fresh read restores the whole baseline
// inventory and row states, without moving the subject into a sibling
// collection. An existing line's quantities, or an unseen destination,
// cannot meet this proof. Unproved quantity inverses stay refused; a changed
// page alone never marks a subject inverse complete. A project reset updates
// the act owner's current observation without manufacturing a baseline for a
// different brief's independent resource.
//
// **An act whose destination shows no change needs no proven undo (F1).**
// Its destination is the original its call named with an issued
// `resetDestination` ref -- or a later call naming it under `undoes` did -- and
// the list its control sat in, read before it; a control in no list with none
// named has none. Where each group it lands in was read complete again after
// it, exactly as first observed, and one of them held none of what it was
// about (`./destination-unchanged.ts`), it is never asked for and refuses no
// trial: each trial runs with it listed under `startedWith.cannotUndo` as left
// with no change seen, which its judge is told. A changed, partial, stale,
// unnamed or unbaselined destination still refuses, and nothing predating the
// build is touched: a claim on it is answered `candidate.undo_act_kept`, unrun.
//
// A phase runs from the build's start, or from one trial to the next. The
// policy before a trial (`./trial-policy.ts`) reads it.

import { AutomationStudioSiteResetCreateBaselines } from "./create-baselines.ts";
import { automationStudioSiteResetDestinationUnchanged as destinationUnchanged } from "./destination-unchanged.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionEffect } from "../../action-permissions/index.ts";
import type {
  AutomationStudioSiteResetAbsorbedAct,
  AutomationStudioSiteResetBeforeTrialOptions,
  AutomationStudioSiteResetCalls,
  AutomationStudioSiteResetChecks,
  AutomationStudioSiteResetClaim,
  AutomationStudioSiteResetComparison,
  AutomationStudioSiteResetDecision,
  AutomationStudioSiteResetDeclared,
  AutomationStudioSiteResetExplored,
  AutomationStudioSiteResetNamedAct,
  AutomationStudioSiteResetPlace,
  AutomationStudioSiteResetRead,
  AutomationStudioSiteResetSpot,
  AutomationStudioSiteResetTarget,
  AutomationStudioSiteResetTrialAct
} from "./contracts.ts";
import { automationStudioSiteResetTrialPolicy, type AutomationStudioSiteResetPhase } from "./trial-policy.ts";
import { automationStudioSiteResetInvalidCollectionGroups as invalidCollectionGroups } from "./collection-groups.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** The classes an act may leave that the site's own controls can reverse. */
const UNDOABLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing", "delete"]);
/** The classes no control of the site takes back. */
const IRREVERSIBLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["move_money", "send_or_publish"]);
/** For each undoable class, the classes an undo tied to its act by subject may declare (header, t719): what reverses it, and nothing else lasting. */
const REVERSES: Readonly<Partial<Record<AutomationStudioActionConsequence, readonly AutomationStudioActionConsequence[]>>> = {
  create_new: ["delete", "modify_existing"],
  modify_existing: ["modify_existing"],
  delete: ["create_new", "modify_existing"]
};
/** The highest act number `undoes` can name (`^act-[1-9][0-9]{0,3}$`); no build comes near it, and past it nothing more is recorded. */
const MAX_ACT = 9999;
/** Reset attempts before an act with a subject undo is kept unresolved; being strict, it still refuses ordinary trials. */
const ASKED_BEFORE_KEPT = 2;
/** What a possibly lasting act's words end with (header, t593). */
const POSSIBLY_LASTING = "declared no lasting act, but had an effect: possibly lasting";

type Act = {
  id: string;
  did: string;
  /** The exploration call, or the trial step, that made it. */
  ref: string;
  /** The exploration call's id, as the model gave it; absent for a trial's act. */
  call?: string;
  /** The name of the control the exploration call acted on, as the gate carried it; absent when withheld or for a trial's act (t647). */
  control?: string;
  operation?: string;
  /** The lasting classes it declared: what an undo tied to it by subject may reverse (header, t719). */
  consequences: readonly AutomationStudioActionConsequence[];
  undoable: boolean;
  /** Subject-bearing effects require positive baseline restoration, never an ordinary trial on leftovers. */
  strictReset: boolean;
  undone: boolean;
  /** The call that last tried to undo it, as the model gave its id. */
  undoneBy?: string;
  /** Undo calls of it that landed. */
  attempts: number;
  /** Whether a landed undo changed the page it ran on and stayed there: unknown when no read was made. */
  undoChanged?: boolean;
  /** An unasked removal of what it created landed: spent. */
  spent: boolean;
  /** Destination whose witnessed-new subject a removal must make absent. */
  subjectUndo?: { scope: string; subject: string; group: string; origin?: string };
  /** A pure transition witnessed immediately around this effect; later reset reads cannot manufacture it. */
  transfer?: { origin: string; scope: string; group: string; subject: string; state: string };
  /** The original a creation was admitted against: where its effect would show (F1). */
  destination?: { scope: string; group: string };
  /** Its own page before it, and what it changed there. */
  place?: AutomationStudioSiteResetPlace;
  /** Where the control it acted on sat; absent when that is not known (a trial's act whose step's diff gave none, t598). */
  spot?: AutomationStudioSiteResetSpot;
  /** The items it created, as its own page showed them (t475), a trial step's read off its own diff (t598). */
  createdItems: string[];
  /** In this phase an undo of it landed on its own item (`own`, or one about the same thing, t719) or on one it created (`created`): a dialog that follows may confirm it. */
  chain?: "own" | "created" | undefined;
  /** What it changed that was still there when the reset last looked. */
  stillThere?: string[];
  /** Reset refusals that named it. */
  askedFor: number;
  /** The site cannot undo it: every trial runs with it in place. */
  kept: boolean;
  /** It declared no lasting class, but had an effect: possibly lasting, never asked for (header, t593). */
  possible: boolean;
};

/**
 * Who a ledger records for, where its `act-N` ids come from (undefined: none
 * left, nothing more recorded), and who hears each act recorded (unit A4b).
 * Absent, a ledger numbers its own acts from `act-1` and tells no one, as
 * before; a project ledger (`./project-ledger.ts`) sets all three per brief.
 */
export type AutomationStudioSiteResetLedgerOptions = {
  owner?: string;
  nextActId?: () => string | undefined;
  sink?: (recorded: AutomationStudioSiteResetRecordedAct) => void;
  /** Records a press with an effect but no lasting class as possibly lasting (header, t593); absent, it is not recorded, as before. */
  possible?: boolean;
  /** Shared original receipts for every owner of one project build. */
  createBaselines?: AutomationStudioSiteResetCreateBaselines;
};

/** One act as a ledger recorded it, for its sink. */
export type AutomationStudioSiteResetRecordedAct = AutomationStudioSiteResetNamedAct & { owner?: string; ref: string; undoable: boolean };

export class AutomationStudioSiteResetLedger implements AutomationStudioSiteResetCalls {
  private readonly acts: Act[] = [];
  private readonly createBaselines: AutomationStudioSiteResetCreateBaselines;
  private next = 1;
  private readonly observedScopes = new Map<string, { beforeAct: number; subjects: ReadonlySet<string>; group: string; states: ReadonlyMap<string, string> }>();
  /** Last act sequence already recorded when this group's complete read landed. */
  private readonly groupObservedAfter = new Map<string, number>();
  private readonly currentSubjects = new Map<string, ReadonlySet<string>>();
  private readonly currentStates = new Map<string, ReadonlyMap<string, string>>();
  private readonly currentGroups = new Map<string, string>();
  private readonly latestGroupScopes = new Map<string, ReadonlySet<string>>();
  private phase: AutomationStudioSiteResetPhase = { recorded: 0, refusals: 0, startDiffersSent: false };
  private readonly options: AutomationStudioSiteResetLedgerOptions;

  constructor(options: AutomationStudioSiteResetLedgerOptions = {}) {
    this.options = { ...options };
    this.createBaselines = options.createBaselines ?? new AutomationStudioSiteResetCreateBaselines();
  }

  createBaseline(declared: Pick<AutomationStudioSiteResetDeclared, "effect" | "consequences" | "control">, reference: unknown) { return this.createBaselines.check(declared, reference); }

  destinationReceipts() { return this.createBaselines.receipts(); }

  /** Original project evidence predates every lasting act; adoption never changes current observations. */
  adoptOriginalCollections(collections: NonNullable<AutomationStudioSiteResetRead["collections"]>): void {
    const invalid = invalidCollectionGroups(collections);
    for (const collection of collections) {
      if (invalid.has(collection.group)) continue;
      if (!this.observedScopes.has(collection.scope)) this.observedScopes.set(collection.scope, { beforeAct: 0, subjects: new Set(collection.subjects), group: collection.group, states: new Map(Object.entries(collection.states)) });
    }
  }

  /** A passive whole-scope observation; the first read is a baseline only for later acts. */
  observed(read: AutomationStudioSiteResetRead, baseline = true): void {
    this.createBaselines.observed(read, baseline);
    const observed = new Map<string, Set<string>>();
    const collections = read.collections ?? [];
    const invalid = invalidCollectionGroups(collections);
    // Never shrink a malformed group into an apparently complete subset, or
    // reuse an earlier positive inverse witness after an invalid fresh read.
    for (const group of invalid) observed.set(group, new Set());
    for (const collection of collections) {
      if (invalid.has(collection.group)) continue;
      const subjects = new Set(collection.subjects);
      if (baseline && !this.observedScopes.has(collection.scope)) this.observedScopes.set(collection.scope, { beforeAct: this.acts.length, subjects, group: collection.group, states: new Map(Object.entries(collection.states)) });
      this.currentSubjects.set(collection.scope, subjects);
      this.currentStates.set(collection.scope, new Map(Object.entries(collection.states)));
      this.currentGroups.set(collection.scope, collection.group);
      const scopes = observed.get(collection.group) ?? new Set<string>();
      scopes.add(collection.scope);
      observed.set(collection.group, scopes);
    }
    for (const [group, scopes] of observed) {
      this.latestGroupScopes.set(group, scopes);
      this.groupObservedAfter.set(group, this.acts.length);
    }
  }

  claim(undoes: unknown): AutomationStudioSiteResetClaim {
    if (undoes === undefined) return { kind: "none" };
    const act = typeof undoes === "string" ? this.acts.find((entry) => entry.id === undoes) : undefined;
    if (act && !act.undone && act.undoable && ((act.kept && !act.strictReset) || this.leftUnchanged(act))) return { kind: "refused", evidence: { ok: false, code: "candidate.undo_act_kept", act: act.id, instruction: WORDS.keptAct(this.leftUnchanged(act)), actsToUndo: this.inPlace() } };
    if (!act || !this.claimable(act)) {
      const actsToUndo = this.inPlace();
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_unknown_act", instruction: WORDS.unknownAct(actsToUndo.length > 0), actsToUndo } };
    }
    if (act.spent) {
      // Acts an undo already landed on are checked before the trial; the model is pointed only at those nobody has tried.
      const actsToUndo = this.acts.filter((entry) => this.toUndo(entry) && entry !== act && !(entry.attempts > 0 && entry.undoChanged !== false)).map(namedAct);
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_already_done", act: act.id, ...(act.undoneBy ? { undoneBy: act.undoneBy } : {}), instruction: WORDS.alreadyUndone(actsToUndo.length > 0), actsToUndo } };
    }
    // What the undo may do unasked is decided per control, before it is acted on (`target`).
    return { kind: "undo", undo: { act: act.id, allowed: [] } };
  }

  /**
   * Whether an undo of `actId` may act on the control the domain declared,
   * read before it acts. Modern refusals leave the act correctable; no refused
   * control runs, and unresolved strict effects still block ordinary trials.
   */
  target(actId: string, declared: { effect: AutomationStudioActionEffect; consequences: readonly AutomationStudioActionConsequence[]; control: AutomationStudioSiteResetSpot }): AutomationStudioSiteResetTarget {
    const act = this.acts.find((entry) => entry.id === actId);
    if (!act || !this.claimable(act)) {
      const actsToUndo = this.inPlace();
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_unknown_act", instruction: WORDS.unknownAct(actsToUndo.length > 0), actsToUndo } };
    }
    // A look changes nothing, wherever it looks.
    if (declared.effect === "observe") return { kind: "admit", on: "moving", allowed: [] };
    const unproved = (): AutomationStudioSiteResetTarget => {
      const other = this.otherObservedEffect(act, declared);
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_unproved", act: act.id, instruction: WORDS.unprovedUndo(other !== undefined), actsToUndo: this.inPlace(), ...(other ? { otherActsWithObservedEffect: [other] } : {}) } };
    };
    if (act.strictReset && declared.consequences.length === 0 && (declared.control.scope !== undefined || declared.control.subject !== undefined || declared.control.item !== undefined)) return unproved();
    if (act.transfer && declared.consequences.length > 0) {
      const transfer = act.transfer;
      if (this.transferTarget(act, declared)) {
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
    // About what the act was about, by a positive match, reversing its classes only (header, t719).
    if (aboutTheAct(act, declared.control) && reverses(act.consequences, declared.consequences)) {
      const { scope, subject } = declared.control;
      const baseline = scope === undefined ? undefined : this.observedScopes.get(scope);
      // A name is identity, never evidence that the whole effect is ours.
      // Only deleting a subject absent on a positively observed destination
      // before this act is an exact inverse here. Quantitative edits need a
      // deterministic inverse witness, which this seam does not yet supply.
      if (scope !== undefined && subject !== undefined && baseline && baseline.beforeAct < this.acts.indexOf(act) + 1 && this.currentGroups.get(scope) === baseline.group && this.latestGroupScopes.get(baseline.group)?.has(scope) && !baseline.subjects.has(subject) && this.currentSubjects.get(scope)?.has(subject) && act.consequences.includes("create_new") && declared.consequences.length === 1 && declared.consequences[0] === "delete") {
        act.subjectUndo = { scope, subject, group: baseline.group };
        // Repeated executions of one registered creation on the same source
        // control can share a newly-created destination line. Its disappearance
        // restores them all; a second destructive press would touch baseline.
        if (act.operation && act.control && act.spot?.scope) {
          for (const other of this.acts) {
            if (other === act || !this.claimable(other) || other.operation !== act.operation || other.control !== act.control || other.spot?.scope !== act.spot.scope || other.spot?.subject !== act.spot.subject || other.spot?.page !== act.spot.page || other.spot?.item !== act.spot.item || other.spot?.dialog !== act.spot.dialog || other.consequences.length !== 1 || other.consequences[0] !== "create_new" || baseline.beforeAct >= this.acts.indexOf(other) + 1 || !aboutTheAct(other, declared.control)) continue;
            other.subjectUndo = { scope, subject, group: baseline.group };
          }
        }
        return { kind: "admit", on: "subject", allowed: ["delete"] };
      }
    }
    if (act.strictReset) return unproved();
    act.kept = true;
    return { kind: "refused", evidence: { ok: false, code: "candidate.undo_wrong_target", act: act.id, instruction: WORDS.wrongTarget(), cannotUndo: [namedAct(act)] } };
  }

  /** The existing admission predicate, without assigning inverse evidence. */
  private transferTarget(act: Act, declared: Parameters<AutomationStudioSiteResetLedger["target"]>[1]): boolean {
    const transfer = act.transfer;
    return !!(transfer && !act.spent && declared.consequences.length === 1 && declared.consequences[0] === "modify_existing" && declared.control.scope === transfer.scope && declared.control.subject === transfer.subject && this.currentGroups.get(transfer.scope) === transfer.group && this.latestGroupScopes.get(transfer.group)?.has(transfer.origin) && this.latestGroupScopes.get(transfer.group)?.has(transfer.scope) && !this.currentSubjects.get(transfer.origin)?.has(transfer.subject) && this.currentSubjects.get(transfer.scope)?.has(transfer.subject) && this.currentStates.get(transfer.scope)?.get(transfer.subject) === transfer.state);
  }

  /** Information only: no probe may authorize, consume or reassign an act. */
  private otherObservedEffect(act: Act, declared: Parameters<AutomationStudioSiteResetLedger["target"]>[1]): AutomationStudioSiteResetNamedAct | undefined {
    const scope = act.spot?.scope, subject = act.spot?.subject;
    const first = this.acts.indexOf(act), baseline = scope ? this.observedScopes.get(scope) : undefined;
    if (!scope || !subject || act.consequences.length !== 1 || act.consequences[0] !== "modify_existing" || !baseline || baseline.beforeAct >= first + 1 || !baseline.subjects.has(subject)) return undefined;
    const others = this.acts.slice(first + 1).filter(other => {
      if (!this.claimable(other) || other.spot?.scope !== scope || other.spot?.subject !== subject || other.transfer?.origin !== scope || !this.transferTarget(other, declared)) return false;
      const resources = [act.spot?.resource, other.spot?.resource, declared.control.resource];
      if (resources.some(resource => resource !== undefined) && (!resources[0] || resources.some(resource => resource !== resources[0]))) return false;
      const group = other.transfer.group, sequence = this.acts.indexOf(other) + 1;
      const fresh = this.latestGroupScopes.get(group);
      const original = [...this.observedScopes].filter(([, entry]) => entry.group === group && entry.beforeAct < sequence);
      // Feedback is stricter than admission: require the fresh whole group.
      return (this.groupObservedAfter.get(group) ?? -1) >= sequence && fresh?.size === original.length && original.every(([originalScope]) => fresh.has(originalScope));
    });
    return others.length === 1 ? namedAct(others[0]!) : undefined;
  }

  explored(call: AutomationStudioSiteResetExplored): void {
    const declared = call.declared;
    if (call.undoes !== undefined) {
      const act = this.acts.find((entry) => entry.id === call.undoes);
      if (!act || !this.claimable(act)) return;
      // Where its effect would show, named after it (header, F1); never renamed once named.
      const named = act.destination || call.resetDestination === undefined ? undefined : this.createBaselines.destination({ effect: "mutate", consequences: act.consequences, control: { name: null, kind: null, ...act.spot } }, call.resetDestination);
      if (named) act.destination = named;
      // An undo the gate refused is not tried again: the act stays, and the trial runs with it (t475).
      if (declared && declared.effect === "mutate" && !declared.permitted) {
        act.kept = true;
        return;
      }
      // Only a call that acted on the site is an attempt: a look leaves the act as it was.
      if (!call.landed || act.spent || !declared?.permitted || declared.effect !== "mutate") return;
      if (call.on === "subject" && act.subjectUndo === undefined) return;
      act.attempts += 1;
      act.undoneBy = call.callId;
      const unasked = call.on === "created" || (call.on === "subject" && act.subjectUndo !== undefined) || (call.on === "follow_up" && act.chain === "created");
      if (unasked && (declared.consequences.includes("delete") || act.subjectUndo?.origin !== undefined)) act.spent = true;
      if (call.on === "own" || call.on === "created") act.chain = call.on;
      // An undo on a control about the act's own thing may be confirmed once, as one on its own item (header, t719).
      else if (call.on === "subject") act.chain = "own";
      // The site's one confirmation of that undo is given: no further lasting dialog press follows from it (header, t479).
      else if (call.on === "follow_up" && declared.consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence))) act.chain = undefined;
      return;
    }
    if (!call.landed || !declared?.permitted || declared.effect !== "mutate") return;
    const words = [declared.verb, declared.control.name === null ? "" : JSON.stringify(declared.control.name), declared.control.kind ?? ""];
    const spot = spotOf(declared.control) ?? {};
    // A press on a named control that declared nothing lasting is possibly lasting, where this ledger records those (header).
    const possible = this.options.possible === true && declared.control.name !== null;
    const act = this.record(words.filter((word) => word.trim()).join(" ").trim(), call.callId, declared.consequences, call.callId, spot, possible, [], declared.control.name ?? undefined, call.operation);
    const destination = act && this.createBaselines.destination(declared, call.resetDestination);
    if (act && destination) act.destination = destination;
  }

  /** The act the exploration call `callId` made, if it made one. */
  actOf(callId: string): string | undefined {
    return [...this.acts].reverse().find((act) => act.call === callId)?.id;
  }

  /** Where `act` was made: its page before it, what it changed there, and the items it created. Nothing changed there, nothing to look for. */
  placed(act: string, place: AutomationStudioSiteResetPlace): void {
    const entry = this.acts.find((candidate) => candidate.id === act);
    if (!entry) return;
    this.witnessTransfer(entry, place.collections);
    if (place.created?.length) entry.createdItems = [...new Set([...entry.createdItems, ...place.created])];
    if (place.changed.length > 0) {
      entry.place = { state: structuredClone(place.state), location: place.location, changed: [...place.changed], ...(place.lines ? { lines: { gone: [...place.lines.gone], added: [...place.lines.added] } } : {}) };
    }
  }

  /**
   * An unchanged source suppresses only a legacy unscoped act (t475).
   * Identified effects require positive original-inventory restoration.
   */
  noEffect(act: string): void {
    const entry = this.acts.find((candidate) => candidate.id === act);
    // An unchanged source says nothing about an effect in another collection.
    if (entry && !entry.strictReset && entry.attempts === 0) entry.undoable = false;
  }

  /** What an undo of `act` did to the page it ran on: whether it changed that page and stayed on it. */
  undoSeen(act: string, changedInPlace: boolean): void {
    const entry = this.acts.find((candidate) => candidate.id === act);
    if (entry) entry.undoChanged = (entry.undoChanged ?? false) || changedInPlace;
  }

  /**
   * The reset before a trial: cannotUndo keeps unresolved acts, strict
   * reversible leftovers refuse, and other acts are looked for before the policy
   * applies to this
   * phase. `checks.compare` is asked only when it is needed, and once. After a
   * start hook (`startReset`), every act counts undone and the trial runs, with
   * nothing compared or asked (header, t479).
   */
  async beforeTrial(checks: AutomationStudioSiteResetChecks | AutomationStudioSiteResetChecks["compare"], cannotUndo?: readonly string[], options: AutomationStudioSiteResetBeforeTrialOptions = {}): Promise<AutomationStudioSiteResetDecision> {
    const asked: AutomationStudioSiteResetChecks = typeof checks === "function" ? { compare: checks } : checks;
    let start: Promise<AutomationStudioSiteResetComparison> | undefined;
    const compare = (): Promise<AutomationStudioSiteResetComparison> => (start ??= asked.compare());
    for (const act of this.acts) act.chain = undefined;
    for (const id of cannotUndo ?? []) {
      const act = this.acts.find((entry) => entry.id === id);
      // Only an act the reset has already asked for: the model has seen it listed, and had the chance to try.
      if (act && this.toUndo(act) && act.askedFor > 0) act.kept = true;
    }
    if (options.startReset === true) {
      // The hook put the whole site back: no act of this build is on it, and the model is asked for nothing (header).
      // Each act it took back is answered, never erased in silence (t504).
      const absorbed: AutomationStudioSiteResetAbsorbedAct[] = [];
      for (const act of this.acts) {
        if (!act.undoable || act.undone) continue;
        act.undone = true;
        delete act.stillThere;
        // A possibly lasting act is taken back unnamed (header).
        // With who recorded it and the control it acted on, for Core's own reading (t647, `./explored-on-absorbed.ts`).
        if (!act.possible) absorbed.push({ ...namedAct(act), ...(this.options.owner !== undefined ? { owner: this.options.owner } : {}), ...(act.control ? { control: act.control } : {}) });
      }
      this.phase = { recorded: 0, refusals: 0, startDiffersSent: false };
      return { kind: "admit", ...(absorbed.length > 0 ? { absorbedByStartReset: absorbed } : {}) };
    }
    let moved = false;
    // A possibly lasting act an undo was tried on is judged as any act is, though it is never asked for (header).
    for (const act of this.acts.filter((entry) => this.claimable(entry) || (entry.strictReset && entry.undoable && !entry.undone && entry.kept))) {
      // A proved no-op or a corrected retry needs no redundant inverse. This
      // uses the original complete resource group, never source-page lines.
      if (act.strictReset && this.originalGroupRestored(act)) {
        act.undone = true;
        continue;
      }
      if (act.subjectUndo) {
        // Changing a page is insufficient: require disappearance of precisely
        // the subject we proved absent before the act, on that same scope.
        if (this.subjectRestored(act)) act.undone = true;
        if (!act.undone && act.askedFor >= ASKED_BEFORE_KEPT) act.kept = true;
        continue;
      }
      // Its destination shows no change: nothing to look for or ask (header, F1).
      if (this.leftUnchanged(act)) continue;
      const looked = act.place && asked.compareAt ? await asked.compareAt(act.place) : undefined;
      moved = moved || looked?.moved === true;
      if (looked?.differs && act.place) {
        act.stillThere = this.stillThere(act, act.place, looked);
        if (!act.strictReset && !act.stillThere.length) act.undone = true;
      } else if (!act.strictReset && act.attempts > 0 && act.undoChanged !== false) {
        act.undone = true;
      }
    }
    const unproved = this.unprovedReset();
    if (unproved) return unproved;
    const kept = this.acts.filter((act) => act.undoable && !act.undone && (act.kept || this.leftUnchanged(act))).map((act) => (this.leftUnchanged(act) ? { ...namedAct(act), did: `${act.did} (${WORDS.leftUnchanged()})` } : namedAct(act)));
    const answer = await automationStudioSiteResetTrialPolicy({ phase: { ...this.phase }, inPlace: this.inPlace(), kept, compare });
    if (answer.kind === "refuse") {
      this.phase = { ...this.phase, refusals: this.phase.refusals + 1, lastRefusal: answer.signature, startDiffersSent: this.phase.startDiffersSent || answer.startDiffers };
      for (const act of this.acts) if (this.toUndo(act)) act.askedFor += 1;
      return { kind: "refuse", evidence: answer.evidence, moved: moved || answer.moved };
    }
    const unresolved = this.unprovedReset();
    if (unresolved) return unresolved;
    return { kind: "admit", ...(answer.startedWith ? { startedWith: answer.startedWith } : {}) };
  }

  /** One complete collection restored in its original order, including every baseline row value. */
  private collectionRestored(scope: string): boolean {
    const before = this.observedScopes.get(scope), now = this.currentSubjects.get(scope), states = this.currentStates.get(scope);
    const ordered = [...(now ?? [])];
    return !!before && !!now && !!states && this.currentGroups.get(scope) === before.group && ordered.length === before.subjects.size && states.size === ordered.length && before.states.size === before.subjects.size && [...before.subjects].every((subject, index) => {
      const original = before.states.get(subject);
      return ordered[index] === subject && typeof original === "string" && original.length > 0 && states.get(subject) === original;
    });
  }

  /** Fresh exact original inventories can settle an existing subject's intent. */
  private originalGroupRestored(act: Act): boolean {
    const scope = act.spot?.scope, subject = act.spot?.subject;
    const baseline = scope === undefined ? undefined : this.observedScopes.get(scope);
    const sequence = this.acts.indexOf(act) + 1;
    if (!baseline || !subject || !baseline.subjects.has(subject) || baseline.beforeAct >= sequence || (this.groupObservedAfter.get(baseline.group) ?? -1) < sequence) return false;
    const fresh = this.latestGroupScopes.get(baseline.group);
    const original = [...this.observedScopes].filter(([, entry]) => entry.group === baseline.group && entry.beforeAct < sequence);
    return !!fresh && fresh.size === original.length && original.every(([scope]) => fresh.has(scope) && this.collectionRestored(scope));
  }

  /** Freeze only a pure, unambiguous immediate transition; no later current observation establishes ownership. */
  private witnessTransfer(act: Act, witness: AutomationStudioSiteResetPlace["collections"]): void {
    if (act.transfer || !witness || act.consequences.length !== 1 || act.consequences[0] !== "modify_existing" || !act.spot?.scope || !act.spot.subject) return;
    if ([...witness.before, ...witness.after].some((collection) => new Set(collection.subjects).size !== collection.subjects.length || Object.keys(collection.states).length !== collection.subjects.length || collection.subjects.some((subject) => typeof collection.states[subject] !== "string" || !collection.states[subject]))) return;
    const subject = act.spot.subject;
    const origin = witness.before.find((collection) => collection.scope === act.spot!.scope);
    const baseline = origin && this.observedScopes.get(origin.scope);
    const sequence = this.acts.indexOf(act) + 1;
    if (!origin || !baseline || baseline.beforeAct >= sequence || baseline.group !== origin.group || !baseline.subjects.has(subject) || !origin.subjects.includes(subject)) return;
    const before = witness.before.filter((collection) => collection.group === origin.group);
    const after = witness.after.filter((collection) => collection.group === origin.group);
    if (new Set(before.map((collection) => collection.scope)).size !== before.length || new Set(after.map((collection) => collection.scope)).size !== after.length) return;
    if (before.filter((collection) => collection.subjects.includes(subject)).length !== 1 || after.filter((collection) => collection.subjects.includes(subject)).length !== 1) return;
    const destination = after.find((collection) => collection.scope !== origin.scope && collection.subjects.includes(subject));
    const destinationBefore = destination && before.find((collection) => collection.scope === destination.scope);
    const destinationBaseline = destination && this.observedScopes.get(destination.scope);
    const originAfter = after.find((collection) => collection.scope === origin.scope);
    if (!destination || !destinationBefore || !destinationBaseline || destinationBaseline.group !== origin.group || destinationBaseline.beforeAct >= sequence || destinationBaseline.subjects.has(subject) || !originAfter || originAfter.subjects.includes(subject) || !destination.states[subject]) return;
    // Other rows and their order must survive the effect, on both collections and captured siblings.
    if (before.length !== after.length || before.some((collection) => {
      const current = after.find((candidate) => candidate.scope === collection.scope);
      const expected = collection.subjects.filter((value) => value !== subject);
      const actual = current?.subjects.filter((value) => value !== subject);
      return !current || !actual || actual.length !== expected.length || expected.some((value, index) => actual[index] !== value || collection.states[value] !== current.states[value]);
    })) return;
    act.transfer = { origin: origin.scope, scope: destination.scope, group: origin.group, subject, state: destination.states[subject] };
  }

  /** A vanished subject is insufficient if its list lost baseline data or it moved into a sibling list. */
  private subjectRestored(act: Act): boolean {
    const inverse = act.subjectUndo;
    if (!inverse) return false;
    if (!this.collectionRestored(inverse.origin ?? inverse.scope)) return false;
    const fresh = this.latestGroupScopes.get(inverse.group);
    for (const [scope, before] of this.observedScopes) {
      if (before.group === inverse.group && before.beforeAct < this.acts.indexOf(act) + 1 && (!fresh?.has(scope) || (inverse.origin !== undefined && !this.collectionRestored(scope)))) return false;
    }
    for (const [scope, subjects] of this.currentSubjects) {
      if (this.currentGroups.get(scope) !== inverse.group) continue;
      if (inverse.origin !== undefined && fresh?.has(scope) && !this.observedScopes.has(scope) && subjects.size > 0) return false;
      if (scope === inverse.scope || !subjects.has(inverse.subject)) continue;
      const before = this.observedScopes.get(scope);
      if (!before || before.beforeAct >= this.acts.indexOf(act) + 1 || !before.subjects.has(inverse.subject) || before.states.get(inverse.subject) !== this.currentStates.get(scope)?.get(inverse.subject)) return false;
    }
    return true;
  }

  /** Reversible modern effects cannot be waved through as cannotUndo leftovers. */
  private unprovedReset(): AutomationStudioSiteResetDecision | undefined {
    const acts = this.acts.filter((act) => act.strictReset && act.undoable && !act.undone && act.kept && !this.leftUnchanged(act)).map(namedAct);
    if (!acts.length) return undefined;
    return { kind: "refuse", moved: false, evidence: { ok: false, code: "candidate.trial_reset_unproved", actsToRestore: acts, instruction: "The build's reversible effects have not been proved restored to their original state. An ordinary trial on these leftovers would not measure a fresh run. Restore the original state through its own controls; a matching name, a partial change, or cannotUndo does not prove restoration. " + WORDS.nameDestination() } };
  }

  /** A trial ran: a new phase starts with what was still in place and the trial's own acts, which are answered as left on the site. */
  trialRan(acts: readonly AutomationStudioSiteResetTrialAct[], trialRunId?: string): AutomationStudioSiteResetNamedAct[] {
    this.phase = { recorded: 0, refusals: 0, startDiffersSent: false };
    for (const act of this.acts) act.chain = undefined;
    for (const act of acts) {
      const label = act.label ? JSON.stringify(act.label) : act.definitionId;
      const did = `trial step ${act.step} ${label}${act.control ? ` on ${JSON.stringify(act.control)}` : ""}`;
      // Where its step's control sat and what it made, as exploration records an act (header, t598).
      const recorded = this.record(did, `${trialRunId ?? "trial"}#step-${act.step}`, act.consequences, undefined, trialSpot(act.spot), this.options.possible === true && act.possible === true, act.created, act.control, act.definitionId);
      if (recorded) this.witnessTransfer(recorded, act.collections);
    }
    // A possibly lasting act is not answered as left: it is answered under `possiblyInPlace` (header).
    return this.acts.filter((act) => act.undoable && !act.undone && !act.possible).map(namedAct);
  }

  /**
   * What `act` changed on its page that is still there now. With the domain's
   * lines: each line it added still present, and each line it removed still
   * gone -- unless another act of this build added that line, as when two acts
   * each change one total: the later act's "removal" of the total the earlier
   * one wrote is that earlier act's to undo, not its own. Without them, each of
   * its worded changes that is still a difference.
   */
  private stillThere(act: Act, place: AutomationStudioSiteResetPlace, looked: AutomationStudioSiteResetComparison): string[] {
    if (place.lines && looked.lines) {
      const nowAdded = new Set(looked.lines.added), nowGone = new Set(looked.lines.gone);
      const addedByOthers = new Set(this.acts.filter((other) => other !== act).flatMap((other) => other.place?.lines?.added ?? []));
      return [...place.lines.added.filter((line) => nowAdded.has(line)), ...place.lines.gone.filter((line) => nowGone.has(line) && !addedByOthers.has(line))];
    }
    const now = new Set(looked.differs ?? []);
    return place.changed.filter((change) => now.has(change));
  }

  /** This build's acts still to undo, as the model is shown them. */
  inPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.acts.filter((act) => this.toUndo(act)).map(namedAct);
  }

  /** This build's possibly lasting acts that may still be on the site (header, t593): never asked for, each marked `possible`. */
  possiblyInPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.acts.filter((act) => act.possible && this.claimable(act)).map(namedAct);
  }

  /** Still on the site, and still the model's to undo. */
  private toUndo(act: Act): boolean {
    return this.claimable(act) && !act.possible && !this.leftUnchanged(act);
  }

  /** A strict act whose destination a complete read after it shows exactly as first observed (header, F1). */
  private leftUnchanged(act: Act): boolean {
    if (!act.strictReset || !act.undoable || act.undone || act.possible) return false;
    const sequence = this.acts.indexOf(act) + 1, spot = act.spot ?? {};
    const baseline = spot.scope === undefined ? undefined : this.observedScopes.get(spot.scope);
    const own = baseline && baseline.beforeAct < sequence ? baseline : undefined;
    // A creation sent elsewhere lands in its named destination; any other act in a list lands in that list too, read before it.
    const elsewhere = act.destination !== undefined && act.consequences.length === 1 && act.consequences[0] === "create_new";
    if (spot.scope !== undefined && !own && !elsewhere) return false;
    const groups = [...(act.destination ? [act.destination.group] : []), ...(own && !elsewhere ? [own.group] : [])];
    const subjects = [spot.subject, ...(spot.item === undefined ? [spot.page] : [])].filter((subject): subject is string => subject !== undefined);
    return groups.length > 0 && destinationUnchanged({ sequence, groups, subjects, originals: this.observedScopes, observedAfter: this.groupObservedAfter, fresh: this.latestGroupScopes, restored: (scope) => this.collectionRestored(scope) });
  }

  /** Still on the site, and an undo may name it: a possibly lasting act too, though it is never asked for (header). */
  private claimable(act: Act): boolean {
    return act.undoable && !act.undone && (!act.kept || act.strictReset);
  }

  private record(did: string, ref: string, consequences: readonly AutomationStudioActionConsequence[], call?: string, spot?: AutomationStudioSiteResetSpot, possible = false, created: readonly string[] = [], control?: string, operation?: string): Act | undefined {
    const lasting = consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence));
    if (!lasting && !possible) return;
    const id = this.options.nextActId ? this.options.nextActId() : this.next <= MAX_ACT ? `act-${this.next}` : undefined;
    if (id === undefined) return;
    const undoable = !consequences.some((consequence) => IRREVERSIBLE.has(consequence));
    // Said as possibly lasting wherever it is named, since some answers carry only what an act did (header).
    const words = lasting ? did || "an act" : `${did || "an act"} (${POSSIBLY_LASTING})`;
    const act: Act = { id, did: words, ref, ...(call ? { call } : {}), ...(control?.trim() ? { control: control.trim() } : {}), ...(operation ? { operation } : {}), ...(spot ? { spot } : {}), createdItems: [...new Set(created)], strictReset: lasting && (spot?.subject !== undefined || spot?.page !== undefined || spot?.scope !== undefined), consequences: [...consequences], undoable, undone: false, attempts: 0, spent: false, askedFor: 0, kept: false, possible: !lasting };
    if (lasting) this.createBaselines.seal();
    this.acts.push(act);
    this.next += 1;
    // A possibly lasting act never makes a reset due: it refuses no trial (header).
    if (lasting) this.phase = { ...this.phase, recorded: this.phase.recorded + 1 };
    this.options.sink?.({ ...namedAct(act), ...(this.options.owner !== undefined ? { owner: this.options.owner } : {}), ref, undoable });
    return act;
  }
}

/**
 * Whether `control` sits on the item `spot` names, by a positive match (header,
 * t479): both item tokens present and equal, in the same dialog or in none. A
 * token missing on either side is never a match.
 */
function sameItem(spot: AutomationStudioSiteResetSpot, control: AutomationStudioSiteResetSpot): boolean {
  if (spot.item === undefined || control.item === undefined || spot.item !== control.item) return false;
  return (spot.dialog ?? null) === (control.dialog ?? null) && (spot.scope ?? null) === (control.scope ?? null);
}

/**
 * Whether `control` is about what `act` was about (header, t719): its `subject`
 * equals the act's, or the act's `page` where the act sat in no item. Both
 * tokens present and equal; a token missing on either side is never a match.
 */
function aboutTheAct(act: Act, control: AutomationStudioSiteResetSpot): boolean {
  if (control.subject === undefined) return false;
  if (act.spot?.subject === control.subject) return true;
  return act.spot?.item === undefined && act.spot?.page === control.subject;
}

/** Whether every lasting class an undo declares reverses one of the act's (header, t719); declaring none reverses nothing and is no harm. */
function reverses(acted: readonly AutomationStudioActionConsequence[], undo: readonly AutomationStudioActionConsequence[]): boolean {
  const allowed = new Set(acted.flatMap((consequence) => REVERSES[consequence] ?? []));
  return undo.every((consequence) => allowed.has(consequence));
}

/** A spot's tokens, copied, or none when it named none of them. */
function spotOf(spot: AutomationStudioSiteResetSpot | undefined): AutomationStudioSiteResetSpot | undefined {
  const copied: AutomationStudioSiteResetSpot = {
    ...(spot?.item !== undefined ? { item: spot.item } : {}),
    ...(spot?.dialog !== undefined ? { dialog: spot.dialog } : {}),
    ...(spot?.subject !== undefined ? { subject: spot.subject } : {}),
    ...(spot?.page !== undefined ? { page: spot.page } : {}),
    ...(spot?.scope !== undefined ? { scope: spot.scope } : {}),
    ...(spot?.resource !== undefined ? { resource: spot.resource } : {})
  };
  return Object.keys(copied).length > 0 ? copied : undefined;
}

/** A trial step's spot, copied, or none when it named nothing. */
function trialSpot(spot: AutomationStudioSiteResetSpot | undefined): AutomationStudioSiteResetSpot | undefined {
  return spotOf(spot);
}

/** An act as the model is shown it. */
function namedAct(act: Act): AutomationStudioSiteResetNamedAct {
  return { act: act.id, did: act.did, ...(act.call ? { call: act.call } : {}), ...(act.stillThere?.length ? { stillThere: [...act.stillThere] } : {}), ...(act.possible ? { possible: true as const } : {}) };
}
