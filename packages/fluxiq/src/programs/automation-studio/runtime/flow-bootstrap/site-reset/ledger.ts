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
//   acts retain the noEffect policy (t475); strict acts settle only by their
//   witnesses (below).
//
// **An undo counts only when the act's effect is gone (t471).** A call that
// names an act never marks it undone. Lane D round 9
// (`run-mv5q4j2n-25784472`) clicked the static words of a confirmed request
// under `undoes`, and that click "landed". Instead the build's candidate loop
// reads each act's own page just before and just after it (`placed`), and
// before a trial the reset goes back to that page and looks. Source-line
// disappearance, or for an act with no such place the older undoSeen
// fallback, settles only legacy unscoped acts (`beforeTrial`).
//
// **Legacy unscoped acts can be kept.** One the model names under `cannotUndo`
// once the reset has asked for it is kept: never asked for again, and every
// trial runs with it in place, saying so under `startedWith.cannotUndo`
// (`./trial-policy.ts`). Being asked for twice and still there keeps nothing,
// and no trial is admitted on an act still to undo (F1 continuation: F3 saw a
// whole trial run on two acts a blocked reset never undid). A strict act never
// leaves by cannotUndo (below).
//
// **A start hook's reset asks the model for nothing (t475, t479).** When the
// deployment's start hook has just put the site back (`startReset`), every act
// of this build, kept ones too, counts undone, nothing is compared, and the
// trial runs. Each act it took back is answered as `absorbedByStartReset`, by
// what it did and the call that made it (t504): lane D round 17
// (`run-mv6lgt3s-c3aa6fac`) pressed one row's control while exploring, the hook
// took it back, and no trial evidence or run record said the act had existed.
// The hook is the deployment's own reset of the whole site; what a look after it still sees is content that changes by itself, a cover the
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
// **No witness, no first lasting press (rerun round 2).** Before the seal a
// reversible press nothing could ever settle is refused unrun
// (`./reset-witness.ts`), and a `resetDestination` no receipt printed is
// refused before its call runs, here under `undoes` (`claim`) too.
//
// **Cross-page inverses need a destination baseline (t719 review).** A
// subject/title says which item an effect concerns; it never proves that the
// whole item belongs to the build. Before adding something whose removal will
// happen elsewhere, the build observes that destination. The domain supplies
// an opaque scope and its subject tokens, including singleton/hidden items.
// The ledger retains the first such read and the local act sequence. A
// subject-only deletion is admitted only for create_new when that scope was
// read before the act, the subject was absent then and is present now. It is
// unasked once, and the act settles as any act does (below). Unproved
// quantity inverses stay refused; a changed page alone never marks a subject
// inverse complete. A project reset updates the act owner's current
// observation without manufacturing a baseline for a different brief's
// independent resource.
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
// `./settlement-trial-repeat.ts`), and its own control's toggle
// (`./settlement-toggle-witness.ts`, `./settlement-control-tracker.ts`). It is
// settled when fresh complete reads -- after it and after the latest lasting
// call or trial, by this ledger's clock -- show every witness as the build
// found it (`./settlement-group-witness.ts`, `./settlement-decision.ts`):
// `restored` when a change was seen or an undo landed, otherwise `unchanged`,
// which is sticky, never asked for, and listed in every later trial's
// `startedWith.cannotUndo` as left with nothing it could change showing a
// change. Open otherwise, and every open act says under `settle` what to read
// or undo (`./settlement-words.ts`); before refusing, `beforeTrial` looks at
// each stale witness's place itself (`checks.lookAt`). `cannotUndo` never
// settles a strict act. A toggle is undone by pressing its own control back at
// its place, admitted `own` with `modify_existing` unasked; a control at
// another place, or already back, is refused unrun.
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
// **A trial act repeats any explored act of its build.** In a single-subflow
// plan the builder's test is the judged whole run, whose acts the supervisor's
// ledger records; it holds none of the builder's explored acts, so on office
// the trial's press never inherited the explored press's named destination. A
// ledger is handed the build's explored acts (`buildExplored`, from
// `./project-ledger.ts`), asked at each match and each judgement, so a
// destination named later still counts; a standalone ledger has its own.
//
// **A trial act with no witness adopts the build's issued lists (office r3).**
// Every trial and every entry preparation that re-runs a predecessor makes a
// new act; one in no list had no witness, and each needed its own model look
// naming a list under `undoes`, which any issued list settled (office rerun
// round 3, `run-mvgo5xft-25460ba2`: act-12, act-15, act-18, one per brief, and
// the build stalled one look short). That look added nothing Core cannot do.
// So an act made by no exploration call (`call` absent: a trial step's or an
// entry preparation's) with no witness of its own -- no group, no toggle,
// after its repeats' lent destinations -- is judged on every list whose ref
// the model was shown, and Core's own pre-trial look (`lookFirst`) reads them.
// Every one holding settles it `unchanged`, sticky and told to every later
// trial's judge, exactly as above. One differing never asks to undo it there
// (another act may have changed that list): it stays open with its `name`
// words. An adopted list is never a change seen of its own. With no issued
// ref nothing is adopted, and its words are as before. Explored acts are
// untouched: the witness rule before the seal covers them (`./reset-witness.ts`).
//
// A phase runs from the build's start, or from one trial to the next. The
// policy before a trial (`./trial-policy.ts`) reads it.

import { AutomationStudioSiteResetCreateBaselines } from "./create-baselines.ts";
import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
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
import { AutomationStudioSiteResetControlTracker, type AutomationStudioSiteResetPress } from "./settlement-control-tracker.ts";
import { automationStudioSiteResetSettleDecision as settleDecision, type AutomationStudioSiteResetSettlement } from "./settlement-decision.ts";
import { automationStudioSiteResetActGroups as actGroups } from "./settlement-act-groups.ts";
import { AutomationStudioSiteResetObservations } from "./settlement-observations.ts";
import { automationStudioSiteResetToggleWitness as toggleWitness } from "./settlement-toggle-witness.ts";
import { automationStudioSiteResetTransferWitness as transferWitness } from "./settlement-transfer-witness.ts";
import { automationStudioSiteResetTrialRepeats as repeats } from "./settlement-trial-repeat.ts";
import { automationStudioSiteResetSettleWords as settleWords } from "./settlement-words.ts";
import { automationStudioSiteResetUndoAdmission as undoAdmission, type AutomationStudioSiteResetUndoDeclared } from "./undo-admission.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** The classes an act may leave that the site's own controls can reverse. */
const UNDOABLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing", "delete"]);
/** The classes no control of the site takes back. */
const IRREVERSIBLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["move_money", "send_or_publish"]);
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
  /** Every list named as where its effect would show (F1, L1): on its own call, on a look under `undoes`, or admitted against. Accumulated, never removed. */
  destinations: Array<{ scope: string; group: string }>;
  /** The explored acts a trial act repeats: their destinations, named whenever, cover it too (header, L1). */
  repeats: string[];
  /** The ledger clock it landed at: a read counts for it only from then on. */
  clock: number;
  /** Its own press, until the read after it says whether it was a toggle (L1). */
  press?: AutomationStudioSiteResetPress;
  /** One control at its place flipped from `from` to `to` (L1); only for an act that declared exactly `modify_existing`. */
  toggle?: { page: string; place: string; from: string; to: string };
  /** A read after it showed one of its witnesses changed. */
  changeSeen: boolean;
  /** Settled, for good (header, L1): `restored` also marks it undone. */
  settled?: "restored" | "unchanged";
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
  /** Every explored act of the build this ledger belongs to, asked whenever a trial act is matched or judged (header, L1); absent, this ledger's own. */
  buildExplored?: () => readonly AutomationStudioSiteResetExploredAct[];
};

/** One explored act as a trial act of the same build is matched against and lent destinations by (header, L1). */
export type AutomationStudioSiteResetExploredAct = { id: string; consequences: readonly AutomationStudioActionConsequence[]; operation?: string; spot?: AutomationStudioSiteResetSpot; destinations: ReadonlyArray<{ scope: string; group: string }> };

/** One act as a ledger recorded it, for its sink. */
export type AutomationStudioSiteResetRecordedAct = AutomationStudioSiteResetNamedAct & { owner?: string; ref: string; undoable: boolean };

export class AutomationStudioSiteResetLedger implements AutomationStudioSiteResetCalls {
  private readonly acts: Act[] = [];
  private readonly createBaselines: AutomationStudioSiteResetCreateBaselines;
  private next = 1;
  /** The complete lists this ledger has seen: originals and latest reads (`./settlement-observations.ts`). */
  private readonly seen = new AutomationStudioSiteResetObservations();
  /** The stateful controls it has seen, and the presses on them (`./settlement-control-tracker.ts`). */
  private readonly tracker = new AutomationStudioSiteResetControlTracker();
  /** Moves on every landed lasting call, undo and trial: a read is fresh only at the current value (header, L1). */
  private clock = 0;
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
    this.seen.adopt(collections);
  }

  /** A passive whole-scope observation; the first read is a baseline only for later acts. It feeds the lists, the controls and the clock's freshness (header, L1). */
  observed(read: AutomationStudioSiteResetRead, baseline = true): void {
    // A read after an act showing one of its witnesses changed is a change seen (`restored`, not `unchanged`): judged on the
    // latest read before this one too, so a witness named since that read counts what it showed.
    for (const act of this.acts) if (this.open(act)) this.evaluate(act);
    this.createBaselines.observed(read, baseline);
    this.seen.observe(read, baseline, this.acts.length, this.clock);
    this.tracker.read(read, this.clock);
    // Settled by this read, for good: a later trial makes the read stale, not the act open again (header, L1).
    for (const act of this.acts) this.settledNow(act);
  }

  claim(undoes: unknown, resetDestination?: unknown): AutomationStudioSiteResetClaim {
    if (undoes === undefined) return { kind: "none" };
    // A ref no receipt printed is refused before the call runs, never ignored (`./create-baselines.ts`, rerun round 2).
    const unissued = this.createBaselines.unissued(resetDestination);
    if (unissued) return { kind: "refused", evidence: unissued };
    const act = typeof undoes === "string" ? this.acts.find((entry) => entry.id === undoes) : undefined;
    const left = act !== undefined && this.settledNow(act) === "unchanged";
    if (act && !act.undone && act.undoable && ((act.kept && !act.strictReset) || left)) return { kind: "refused", evidence: { ok: false, code: "candidate.undo_act_kept", act: act.id, instruction: WORDS.keptAct(left), actsToUndo: this.inPlace() } };
    if (!act || !this.claimable(act)) {
      const actsToUndo = this.inPlace();
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_unknown_act", instruction: WORDS.unknownAct(actsToUndo.length > 0), actsToUndo } };
    }
    if (act.spent) {
      // Acts an undo already landed on are checked before the trial; the model is pointed only at those nobody has tried.
      const actsToUndo = this.acts.filter((entry) => this.toUndo(entry) && entry !== act && !(entry.attempts > 0 && entry.undoChanged !== false)).map((entry) => this.named(entry));
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_already_done", act: act.id, ...(act.undoneBy ? { undoneBy: act.undoneBy } : {}), instruction: WORDS.alreadyUndone(actsToUndo.length > 0), actsToUndo } };
    }
    // What the undo may do unasked is decided per control, before it is acted on (`target`).
    return { kind: "undo", undo: { act: act.id, allowed: [] } };
  }

  /**
   * Whether an undo of `actId` may act on the control the domain declared,
   * read before it acts (`./undo-admission.ts`). Modern refusals leave the act
   * correctable; no refused control runs, and unresolved strict effects still
   * block ordinary trials.
   */
  target(actId: string, declared: AutomationStudioSiteResetUndoDeclared): AutomationStudioSiteResetTarget {
    const act = this.acts.find((entry) => entry.id === actId);
    if (!act || !this.claimable(act)) {
      const actsToUndo = this.inPlace();
      return { kind: "refused", evidence: { ok: false, code: "candidate.undo_unknown_act", instruction: WORDS.unknownAct(actsToUndo.length > 0), actsToUndo } };
    }
    return undoAdmission({ acts: this.acts, seen: this.seen, claimable: (entry) => this.claimable(entry), inPlace: () => this.inPlace(), toggle: (entry) => this.toggleOf(entry), named: (entry) => this.named(entry), plain: namedAct }, act, declared);
  }

  explored(call: AutomationStudioSiteResetExplored): void {
    const declared = call.declared;
    const pressed = call.landed && declared?.permitted === true && declared.effect === "mutate";
    if (call.undoes !== undefined) {
      // A call admitted `moving` (nothing lasting, no item: a navigation, opening a view) is a look, never an undo attempt (header, L1).
      // Only as declared: a lasting class or an item is never a look, whatever it was admitted as.
      const look = call.on === "moving" && (declared === undefined || (declared.consequences.length === 0 && declared.control.item === undefined));
      // A landed press under `undoes` changed the site whatever it names: earlier reads are stale, and its place gets a press (header, L1).
      if (pressed && !look) this.clock += 1;
      if (pressed && !look && declared.control.place !== undefined) this.tracker.press(declared.control.place, this.clock);
      const act = this.acts.find((entry) => entry.id === call.undoes);
      if (!act || !this.claimable(act)) return;
      // Where its effect would show, named after it: an issued ref, resolved without the act's resource (header, F1, L1); accumulated.
      const named = call.resetDestination === undefined ? undefined : this.createBaselines.named(call.resetDestination);
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
      else if (call.on === "follow_up" && declared.consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence))) act.chain = undefined;
      return;
    }
    if (!pressed) return;
    const words = [declared.verb, declared.control.name === null ? "" : JSON.stringify(declared.control.name), declared.control.kind ?? ""];
    const spot = spotOf(declared.control) ?? {};
    // A press on a named control that declared nothing lasting is possibly lasting, where this ledger records those (header).
    const possible = this.options.possible === true && declared.control.name !== null;
    if (possible || declared.consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence))) this.clock += 1;
    const act = this.record(words.filter((word) => word.trim()).join(" ").trim(), call.callId, declared.consequences, call.callId, spot, possible, [], declared.control.name ?? undefined, call.operation);
    if (!act) return;
    const destination = this.createBaselines.destination(declared, call.resetDestination);
    if (destination) act.destinations.push(destination);
    // Its own press, filled by the next read of its page: a toggle only for exactly `modify_existing` (header, L1).
    const press = declared.control.place === undefined ? undefined : this.tracker.press(declared.control.place, this.clock);
    if (press && onlyModifies(declared.consequences)) act.press = press;
  }

  /** The act the exploration call `callId` made, if it made one. */
  actOf(callId: string): string | undefined {
    return [...this.acts].reverse().find((act) => act.call === callId)?.id;
  }

  /** This ledger's explored acts, each with every destination named for it so far (header, L1). */
  exploredActs(): AutomationStudioSiteResetExploredAct[] {
    return this.acts.filter((act) => act.call !== undefined).map((act) => ({ id: act.id, consequences: act.consequences, ...(act.operation ? { operation: act.operation } : {}), ...(act.spot ? { spot: act.spot } : {}), destinations: [...act.destinations] }));
  }

  /** The build's explored acts, every brief's in a project build (header, L1). */
  private buildExplored(): readonly AutomationStudioSiteResetExploredAct[] {
    return this.options.buildExplored ? this.options.buildExplored() : this.exploredActs();
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
    // Core looks at every stale witness's place itself before it asks the model for anything (header, L1).
    await this.lookFirst(asked);
    let moved = false;
    // A possibly lasting act an undo was tried on is judged as any act is, though it is never asked for (header).
    for (const act of this.acts.filter((entry) => this.claimable(entry) || (entry.strictReset && entry.undoable && !entry.undone && entry.kept))) {
      // Settled by fresh complete reads of everything it could change (header, L1); never by source-page lines.
      if (act.strictReset && this.settledNow(act)) continue;
      if (act.subjectUndo) {
        if (act.askedFor >= ASKED_BEFORE_KEPT) act.kept = true;
        continue;
      }
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
    // Kept: a legacy act the site cannot undo, or a strict act settled with no change seen (header, L1). An open strict act was refused above.
    const kept = this.acts.filter((act) => act.undoable && !act.undone && ((act.kept && !act.strictReset) || act.settled === "unchanged")).map((act) => (act.settled === "unchanged" ? { ...namedAct(act), did: `${act.did} (${WORDS.leftUnchanged()})` } : namedAct(act)));
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

  /** Core looks once at each place where an open strict act's witness is stale (header, L1); each read reaches the ledgers through the caller. */
  private async lookFirst(asked: AutomationStudioSiteResetChecks): Promise<void> {
    const lookAt = asked.lookAt;
    if (!lookAt) return;
    const looked = new Set<string>();
    for (const act of this.acts) {
      if (!this.open(act)) continue;
      const decision = this.evaluate(act);
      if (decision.kind !== "open") continue;
      for (const reason of decision.reasons) {
        if (reason.reason !== "look" || !reason.location || looked.has(reason.location)) continue;
        looked.add(reason.location);
        await lookAt(reason.location);
      }
    }
  }

  /** Freeze only a pure, unambiguous immediate transition (`./settlement-transfer-witness.ts`); no later current observation establishes ownership. */
  private witnessTransfer(act: Act, witness: AutomationStudioSiteResetPlace["collections"]): void {
    if (act.transfer) return;
    const transfer = transferWitness({ consequences: act.consequences, spot: act.spot, witness, originals: this.seen.originals, sequence: this.acts.indexOf(act) + 1 });
    if (transfer) act.transfer = transfer;
  }

  /** Reversible modern effects cannot be waved through as cannotUndo leftovers: a kept strict act still refuses until it is settled (header, L1). */
  private unprovedReset(): AutomationStudioSiteResetDecision | undefined {
    const acts = this.acts.filter((act) => act.strictReset && act.undoable && !act.undone && act.kept && !this.settledNow(act)).map((act) => this.named(act));
    if (!acts.length) return undefined;
    return { kind: "refuse", moved: false, evidence: { ok: false, code: "candidate.trial_reset_unproved", actsToRestore: acts, instruction: WORDS.unprovedReset() } };
  }

  /** A trial ran: a new phase starts with what was still in place and the trial's own acts, which are answered as left on the site. */
  trialRan(acts: readonly AutomationStudioSiteResetTrialAct[], trialRunId?: string): AutomationStudioSiteResetNamedAct[] {
    this.phase = { recorded: 0, refusals: 0, startDiffersSent: false };
    for (const act of this.acts) act.chain = undefined;
    // A trial changed the site: every read before it is stale (header, L1).
    this.clock += 1;
    const explored = this.buildExplored();
    for (const act of acts) {
      const label = act.label ? JSON.stringify(act.label) : act.definitionId;
      const did = `trial step ${act.step} ${label}${act.control ? ` on ${JSON.stringify(act.control)}` : ""}`;
      // Where its step's control sat and what it made, as exploration records an act (header, t598).
      const recorded = this.record(did, `${trialRunId ?? "trial"}#step-${act.step}`, act.consequences, undefined, spotOf(act.spot), this.options.possible === true && act.possible === true, act.created, act.control, act.definitionId);
      const place = act.spot?.place;
      // Its step's press at its control's place, read on both sides by the step's own diff, with where its page is (L1, d7).
      const press = place !== undefined && act.controls ? this.tracker.landed(act.controls.page, place, act.controls.before, act.controls.after, this.clock, act.controls.location) : undefined;
      if (!recorded) continue;
      this.witnessTransfer(recorded, act.collections);
      if (press && onlyModifies(act.consequences)) recorded.press = press;
      // The explored acts it repeats lend it their destinations, named whenever (header, L1).
      if (recorded.strictReset) recorded.repeats = explored.filter((other) => repeats({ consequences: act.consequences, definitionId: act.definitionId, spot: act.spot }, { consequences: other.consequences, operation: other.operation, spot: other.spot })).map((other) => other.id);
    }
    // A possibly lasting act is not answered as left: it is answered under `possiblyInPlace` (header).
    return this.acts.filter((act) => act.undoable && !act.undone && !act.possible).map((act) => this.named(act));
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
    const addedByOthers = new Set(this.acts.filter((other) => other !== act).flatMap((other) => other.place?.lines?.added ?? []));
    if (place.lines && looked.lines) return [...place.lines.added.filter((line) => looked.lines!.added.includes(line)), ...place.lines.gone.filter((line) => looked.lines!.gone.includes(line) && !addedByOthers.has(line))];
    return place.changed.filter((change) => (looked.differs ?? []).includes(change));
  }

  /** This build's acts still to undo, as the model is shown them; an open strict act says under `settle` what settles it (header, L1). */
  inPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.acts.filter((act) => this.toUndo(act)).map((act) => this.named(act));
  }

  /** This build's possibly lasting acts that may still be on the site (header, t593): never asked for, each marked `possible`. */
  possiblyInPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.acts.filter((act) => act.possible && this.claimable(act)).map(namedAct);
  }

  /**
   * Where one act stands (L1), for words said about it: `in_place` still the model's (or possibly lasting), `restored` undone
   * or taken back, `unchanged` settled with no change seen (or, legacy, its page showed nothing of it), `kept` a legacy act
   * the site cannot undo, `irreversible` one no control takes back; undefined for an id this ledger never gave.
   */
  standing(actId: string): "in_place" | "restored" | "unchanged" | "kept" | "irreversible" | undefined {
    const act = this.acts.find((entry) => entry.id === actId);
    if (!act) return undefined;
    if (!act.undoable) return act.consequences.some((consequence) => IRREVERSIBLE.has(consequence)) ? "irreversible" : "unchanged";
    const settled = this.settledNow(act);
    if (act.undone) return "restored";
    return settled === "unchanged" ? "unchanged" : act.kept && !act.strictReset ? "kept" : "in_place";
  }

  /** Whether any read after the act ever showed a change it made, for words said about it (t738); undefined for an id this ledger never gave. */
  changeSeen(actId: string): boolean | undefined {
    return this.acts.find((entry) => entry.id === actId)?.changeSeen;
  }

  /** Still on the site, and still the model's to undo. */
  private toUndo(act: Act): boolean {
    return !this.settledNow(act) && this.claimable(act) && !act.possible;
  }

  /** A strict act that may still settle (header, L1). */
  private open(act: Act): boolean {
    return act.strictReset && act.undoable && !act.undone && !act.possible && act.settled === undefined;
  }

  /** Settled for good, judged now where it is still open (header, L1); `restored` marks it undone. */
  private settledNow(act: Act): "restored" | "unchanged" | undefined {
    if (act.settled || !this.open(act)) return act.settled;
    const decision = this.evaluate(act);
    if (decision.kind !== "settled") return undefined;
    act.settled = decision.how;
    if (decision.how === "restored") act.undone = true;
    return decision.how;
  }

  /** Every witness of `act`, judged against the latest reads (`./settlement-decision.ts`); a witness seen changed is remembered. */
  private evaluate(act: Act): AutomationStudioSiteResetSettlement {
    // A trial act's destinations include those of the explored acts it repeats, named whenever (header, L1).
    const lent = act.repeats.length ? this.buildExplored() : [];
    const destinations = [...act.destinations, ...act.repeats.flatMap((id) => lent.find((other) => other.id === id)?.destinations ?? [])];
    const groups = this.groupsOf(act, destinations);
    if (groups.some((group) => group.changed)) act.changeSeen = true;
    const toggle = this.toggleOf(act);
    const control = toggle ? this.tracker.standing(toggle.place, toggle, act.clock, this.clock) : act.press ? this.tracker.unread(act.press) : undefined;
    // A trial act with no witness of its own adopts the build's issued lists; never their changes (header, office r3).
    const witnessless = act.call === undefined && !control && groups.every((group) => group.status === "none");
    const adopted = witnessless ? this.groupsOf(act, this.issuedDestinations()) : undefined;
    return settleDecision({ groups, toggle: control, changeSeen: act.changeSeen, undoLanded: act.attempts > 0, adopted });
  }

  /** Every complete list group `act` could change, with `destinations` as its named ones (`./settlement-act-groups.ts`). */
  private groupsOf(act: Act, destinations: ReadonlyArray<{ scope: string; group: string }>): ReturnType<typeof actGroups> {
    return actGroups({ act: { ...act, destinations }, sequence: this.acts.indexOf(act) + 1, since: act.clock, clock: this.clock, observations: this.seen, described: (scope) => this.createBaselines.described(scope) });
  }

  /** Every list whose ref the model was shown, as a destination (header, office r3); none where no ref was issued. */
  private issuedDestinations(): Array<{ scope: string; group: string }> {
    const issued = this.createBaselines.issuedRefs().map((entry) => this.createBaselines.named(entry.ref));
    return issued.filter((entry): entry is { scope: string; group: string } => entry !== undefined);
  }

  /** The toggle its own press made, once the read after it is in (header, L1). */
  private toggleOf(act: Act): Act["toggle"] {
    const press = act.press;
    if (act.toggle || !press?.after) return act.toggle;
    delete act.press;
    const toggle = toggleWitness({ state: act.spot?.state, before: press.before, after: press.after });
    if (!toggle) return undefined;
    act.toggle = { page: press.page, place: press.place, ...toggle };
    act.changeSeen = true;
    return act.toggle;
  }

  /** An act as the model is shown it: an open strict act with what settles it (header, L1). */
  private named(act: Act): AutomationStudioSiteResetNamedAct {
    const said = namedAct(act);
    if (!this.open(act)) return said;
    const decision = this.evaluate(act);
    return decision.kind === "open" ? { ...said, settle: settleWords(decision.reasons, this.createBaselines.issuedRefs(), { closed: this.createBaselines.refsClosed() }) } : said;
  }

  /** Still on the site, and an undo may name it: a possibly lasting act too, though it is never asked for (header). An act settled unchanged is left. */
  private claimable(act: Act): boolean {
    return act.undoable && !act.undone && (!act.kept || act.strictReset) && act.settled !== "unchanged";
  }

  private record(did: string, ref: string, consequences: readonly AutomationStudioActionConsequence[], call?: string, spot?: AutomationStudioSiteResetSpot, possible = false, created: readonly string[] = [], control?: string, operation?: string): Act | undefined {
    const lasting = consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence));
    if (!lasting && !possible) return;
    const id = this.options.nextActId ? this.options.nextActId() : this.next <= MAX_ACT ? `act-${this.next}` : undefined;
    if (id === undefined) return;
    const undoable = !consequences.some((consequence) => IRREVERSIBLE.has(consequence));
    // Said as possibly lasting wherever it is named, since some answers carry only what an act did (header).
    const words = lasting ? did || "an act" : `${did || "an act"} (${POSSIBLY_LASTING})`;
    const act: Act = { id, did: words, ref, ...(call ? { call } : {}), ...(control?.trim() ? { control: control.trim() } : {}), ...(operation ? { operation } : {}), ...(spot ? { spot } : {}), createdItems: [...new Set(created)], destinations: [], repeats: [], clock: this.clock, changeSeen: false, strictReset: lasting && (spot?.subject !== undefined || spot?.page !== undefined || spot?.scope !== undefined), consequences: [...consequences], undoable, undone: false, attempts: 0, spent: false, askedFor: 0, kept: false, possible: !lasting };
    if (lasting) this.createBaselines.seal();
    this.acts.push(act);
    this.next += 1;
    // A possibly lasting act never makes a reset due: it refuses no trial (header).
    if (lasting) this.phase = { ...this.phase, recorded: this.phase.recorded + 1 };
    this.options.sink?.({ ...namedAct(act), ...(this.options.owner !== undefined ? { owner: this.options.owner } : {}), ref, undoable });
    return act;
  }
}

/** A spot's tokens, copied, or none when it named none of them. */
function spotOf(spot: AutomationStudioSiteResetSpot | undefined): AutomationStudioSiteResetSpot | undefined {
  const copied: AutomationStudioSiteResetSpot = {};
  for (const key of ["item", "dialog", "subject", "page", "scope", "resource", "place", "state"] as const) if (spot?.[key] !== undefined) copied[key] = spot[key];
  return Object.keys(copied).length > 0 ? copied : undefined;
}

/** Whether an act declared exactly `modify_existing`: the only act a toggle witnesses (header, L1). */
function onlyModifies(consequences: readonly AutomationStudioActionConsequence[]): boolean {
  return consequences.length === 1 && consequences[0] === "modify_existing";
}

/** An act as the model is shown it. */
function namedAct(act: Act): AutomationStudioSiteResetNamedAct {
  return { act: act.id, did: act.did, ...(act.call ? { call: act.call } : {}), ...(act.stillThere?.length ? { stillThere: [...act.stillThere] } : {}), ...(act.possible ? { possible: true as const } : {}) };
}
