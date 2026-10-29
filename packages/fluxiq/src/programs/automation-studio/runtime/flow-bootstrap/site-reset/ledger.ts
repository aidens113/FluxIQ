// The ledger of this build's own lasting acts (t462; t775: a trial is judged
// against the state recorded just before it and the change asked for, so the
// site is reset as rarely as possible; user, 2026-10-27).
//
// **What a trial is told, and the one refusal left (t775).** Acts of this build
// still in place, kept, settled with no change seen, or that no call can
// settle never refuse a trial: `beforeTrial` admits it, says them under
// `startedWith` (`./trial-policy.ts`), and, given the trial's steps and parts
// (`change`), takes the readings its judge is shown as `siteChange`
// (`../trial-change/`, `trialChange`). It refuses only a start already in an asked
// end state by an in-place act of this build made with another step, with no
// earlier act of the trial's step seen making it (`endStateClash`,
// `candidate.trial_starts_in_end_state`). What follows on settlement serves that
// targeted undo and a "put it back" the person asks for.
//
// Candidate mode had no record of what a build left on the site. So the build's
// permission wrapper (`../action-permissions.ts`) tells this ledger every
// exploration call it ran (`explored`), and the trial gate tells it each trial's
// own lasting acts (`trialRan`). Each becomes an act `act-N`, numbered once and
// never reused, which the model names under `undoes` on the `core.run_node` call
// that reverses it (`claim`).
//
// - An act is recorded only when it landed, was permitted, applied an effect
//   ("mutate") and declared a lasting class: `create_new`, `modify_existing` or
//   `delete`. One declaring `move_money` or `send_or_publish` cannot be undone
//   through the site, so it is recorded as such and never asked for.
// - **What an undo may name and act on** -- its own act's item, a positive
//   identity match, one lasting press per confirmation, unasked removal only
//   of what the act created, legacy refusals keeping an act -- and what an
//   undo or a look under `undoes` that ran did to its act are judged by
//   `./undo-claims.ts` (t743: moved there with their header paragraphs).
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
// once a reset has asked for it is kept: never asked for again, and said under
// `startedWith.cannotUndo` (`./trial-policy.ts`); a strict act never is.
//
// **A start hook's reset asks the model for nothing (t475, t479).** When the
// deployment's start hook has just put the site back (`startReset`), every act
// of this build, kept ones too, counts undone, nothing is compared, and the
// trial runs. Each act it took back is answered as `absorbedByStartReset`, by
// what it did and the call that made it (t504): lane D round 17
// (`run-mv6lgt3s-c3aa6fac`) pressed a row's control while exploring, the hook
// took it back, and no run record said the act had existed. The hook is the
// deployment's own reset of the whole site; what a look after it still sees is
// content that changes by itself, a cover the runtime closed during the act, or
// a gap in the hook -- never something the model can put back better (lane B
// round 11, `run-mv5yaapd-ad19eaae`, was asked to undo a rotating carousel).
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
// `../../service/candidate-trial/landed-acts.ts`). Nothing is refused for it: it
// is never asked for, never refuses a trial and is never kept; a start hook
// takes it back without naming it among the acts it took back (a list of every
// control that declared `none` would be noise beside every trial); the model
// may still undo it under `undoes`, judged as any other undo; and while it may
// still be there it is answered under `possiblyInPlace`, so a phase's start can
// say so (`../../service/project-build/phase-start.ts`). A navigation names no
// control and is never one.
//
// **A trial's act is tied to its own item too (t598).** A trial step's act
// carries where its control sat and the items its own page showed new, read off
// that step's state diff (`spot`, `created` on the trial act,
// `../../service/candidate-trial/landed-acts.ts`), and an undo of it is
// admitted on them exactly as on an explored act's. Where the diff gave
// neither, it is recorded without them. A start hook takes it back as before.
// A step that ran in several loop passes says its pass (t748): `trial step 6,
// pass 3 of 3 "<label>"`; one that ran once keeps `trial step N "<label>"`.
//
// **The one admission (rerun round 2, t751 R3; t775, t791).** The exploration
// door (`createBaseline`, with the build's explored acts it may repeat) admits a
// press with no witness, and a `resetDestination` no receipt printed is refused
// before its call runs, here under `undoes` (`claim`) too; a ref showing nothing of
// the press's change gets a note (`./press-notes.ts`, t791 fix 3). A plan step is
// asked at submission (`admitStep`): its stamp is what its trial act takes
// (`trialRan`, `./trial-stamp.ts`), and with none `ask.gap` says whether a call in
// its own tab can make one (`../reset-admission/step-gaps.ts`, t791 fix 2).
//
// **The seal is per group (t751 R1).** Each act counts its witness groups --
// its destinations, its own list, a transfer's, its subject undo's and those
// its repeats lend -- and a first read of a group it touched is never an
// original (`./create-baselines.ts`, `touch`). Only a legacy unscoped act
// seals every group; since t775 a strict act with no witness at all (the
// exploration door admits one) seals nothing, so a list read after it still
// issues a ref a step can name. A destination named under `undoes` is kept only
// from a call that landed (`./undo-claims.ts`).
//
// **A page read whole is a destination (t791, `./page-collection.ts`)**, every read paged first (`observed`).
// **Cross-page inverses need a destination baseline (t719 review).** A
// subject/title says which item an effect concerns; it never proves that the
// whole item belongs to the build. Before adding something whose removal will
// happen elsewhere, the build observes that destination. The domain supplies
// an opaque scope and its subject tokens, including singleton/hidden items.
// The ledger retains the first such read and the local act sequence. A
// subject-only deletion is admitted only for create_new when that scope was
// read before the act, the subject was absent then and is present now. It is
// unasked once, and the act settles as any act does (below). So is removing,
// on a destination the act named (its own or lent by the acts it repeats), a
// subject that list's original did not hold and its fresh read holds now, even
// where the domain names the item differently there than on the act's own
// page (t743, job): `target` hands the admission the lent destinations, and
// any unasked subject undo that lands is spent. Unproved quantity inverses stay
// refused; a changed page alone never marks a subject inverse complete. A
// project reset updates the act owner's current observation without
// manufacturing a baseline for a different brief's independent resource.
//
// **One settlement model for every strict act (L1, 2026-10-19).** An act is
// settled by fresh complete reads of everything it could change -- its list
// groups and its own control's toggle -- `restored` when a change was seen or
// an undo landed, otherwise `unchanged`, sticky and told to every later
// trial's judge. The judgement -- the witnesses, the destinations a trial act
// repeats and the witnesses its plan step's stamp carries,
// Core's own look at each stale witness's place before a trial, lists that
// look cannot read again, and the words an open act says under `settle` --
// lives in `../reset-settlement/judge.ts`, with its header; this ledger hands
// it its acts, reads and receipts.
//
// **No call can settle it: `gate_unsatisfiable` (t743, rerun round 4).** An
// open act whose every reason no call can meet -- its only witnesses lists
// Core cannot read again (photo `run-mvgw7320-de416190`), or nothing to name
// once refs are closed (office `run-mvgvyaip-d856e135`) -- leaves the acts to
// undo (`inPlace`) and is listed apart under `actsUnsettleable`, with the
// closed condition it failed, wherever `actsToUndo` is answered
// (`unsatisfiable`). It never refuses a trial (t775): it is said under
// `startedWith.acts` and `siteChange.leftFromEarlier`. An act that settles with a
// list Core could not read again is told to every later trial's judge as such
// (`unread`), under `startedWith.cannotUndo` as an unchanged act is. A third
// case (t748, t743 open item 2): an act whose differing lists no undo could
// ever put back, or whose own control answered a state it cannot be pressed
// back from, fails `no_admissible_undo` (`./undo-reach.ts`) -- never on a list
// read in place after an undo landed, which says nothing yet (t772 R1,
// `../reset-settlement/observations.ts`). An undo refusal whose own act a call
// can still meet never lists that act apart (t772 R2,
// `../reset-answers/agreeing.ts`), checked again in `target` because the acts
// listed apart are added there after the refusal was built.
//
// **A value witness (t772).** An act no list, toggle, transfer or subject
// witnesses is witnessed by the shown values its press replaced (`placed`,
// `trialRan`; `../reset-settlement/judge.ts`, `valued`). A choice made under
// `undoes` before its own control confirms the undo is a step, no attempt.
//
// **What is left agrees with settlement (t772 w7).** Whether an act is left --
// `no` when settled (`restored`, or `unchanged`: never said to be left), `yes`
// while open, `possibly` once closed as one no call can settle (with what it
// failed), kept or possibly lasting -- is decided by one function
// (`./leftover.ts`, `leftOf`) that the acts to undo, the acts listed apart,
// `standing`, `leftover`, a project snapshot and a trial's acts left all read.
//
// A phase runs from the build's start, or from one trial to the next: the start
// is compared again before a trial only once something was recorded in it.

import { AutomationStudioSiteResetCreateBaselines } from "./create-baselines.ts";
import { AutomationStudioSitePressNotes } from "./press-notes.ts";
import {
  AutomationStudioSiteResetStepGaps,
  automationStudioSiteResetAdmission as admission,
  automationStudioSiteResetWitnessStampOf as stampOf,
  automationStudioSiteResetWitnessStampValid as stampValid,
  type AutomationStudioSiteResetAdmissionDeclared, type AutomationStudioSiteResetStepAsk,
  type AutomationStudioSiteResetWitnessStamp
} from "../reset-admission/index.ts";
import { automationStudioSiteResetAnswerAgreeing as agreeing, automationStudioSiteResetRefusal as refusal } from "../reset-answers/index.ts";
import {
  AutomationStudioSiteResetControlTracker,
  AutomationStudioSiteResetObservations,
  AutomationStudioSiteResetReach,
  AutomationStudioSiteResetSettlementJudge,
  automationStudioSiteResetTransferWitness as transferWitness,
  automationStudioSiteResetTrialRepeats as repeats,
  type AutomationStudioSiteResetIssuedRef
} from "../reset-settlement/index.ts";
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
  AutomationStudioSiteResetTrialAct,
  AutomationStudioSiteResetUnsettleableAct
} from "./contracts.ts";
import { automationStudioSiteResetLeftover as leftoverOf, type AutomationStudioSiteResetLeftover } from "./leftover.ts";
import { automationStudioSiteResetTrialPolicy } from "./trial-policy.ts";
import type { AutomationStudioTrialChangeAsk, AutomationStudioTrialChangeLedgerPort } from "../trial-change/index.ts";
import { AutomationStudioSiteResetTrialChange } from "./trial-change-port.ts";
import { automationStudioSiteResetTrialStamp as takeStamp } from "./trial-stamp.ts";
import type { AutomationStudioSiteResetLedgerAct } from "./ledger-act.ts";
import type { AutomationStudioSiteResetUndoDeclared } from "./undo-admission.ts";
import { AutomationStudioSiteResetUndoClaims } from "./undo-claims.ts";
import { automationStudioSiteResetUndoReach as undoReach } from "./undo-reach.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";
import { AutomationStudioSiteResetControlWitnesses } from "./control-witnesses.ts";

/** The classes an act may leave that the site's own controls can reverse. */
const UNDOABLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["create_new", "modify_existing", "delete"]);
/** The classes no control of the site takes back. */
const IRREVERSIBLE: ReadonlySet<AutomationStudioActionConsequence> = new Set(["move_money", "send_or_publish"]);
/** The highest act number `undoes` can name (`^act-[1-9][0-9]{0,3}$`); no build comes near it, and past it nothing more is recorded. */
const MAX_ACT = 9999;
/** Reset attempts before an act with a subject undo is kept unresolved; being strict, it still refuses ordinary trials. */
const ASKED_BEFORE_KEPT = 2;
/** Where an act stands when a trial returns it as left on the site (header, t772 w7): open, closed unsettleable, or kept. */
const LEFT_BY_TRIAL: ReadonlySet<AutomationStudioSiteResetLeftover["standing"]> = new Set(["in_place", "unsettleable", "kept"]);
/** What a possibly lasting act's words end with (header, t593). */
const POSSIBLY_LASTING = "declared no lasting act, but had an effect: possibly lasting";

/** One act of this build as the ledger keeps it (`./ledger-act.ts`). */
type Act = AutomationStudioSiteResetLedgerAct;

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
  controlWitnesses?: AutomationStudioSiteResetControlWitnesses;
  /** Every explored act of the build this ledger belongs to, asked whenever a trial act is matched or judged (header, L1); absent, this ledger's own. */
  buildExplored?: () => readonly AutomationStudioSiteResetExploredAct[];
  /** The lists Core cannot read again, shared by every ledger of one build (`../reset-settlement/reach.ts`, t743); absent, this ledger's own. */
  reach?: AutomationStudioSiteResetReach;
};

/**
 * One explored act as a trial act of the same build is matched against and lent destinations by (header, L1); `witnessed`,
 * it has a witness of its own -- a list group or an observed toggle -- to lend an action that repeats it (t751 R3).
 */
export type AutomationStudioSiteResetExploredAct = { id: string; consequences: readonly AutomationStudioActionConsequence[]; operation?: string; spot?: AutomationStudioSiteResetSpot; destinations: ReadonlyArray<{ scope: string; group: string }>; witnessed: boolean };

/** One act as a ledger recorded it, for its sink. */
export type AutomationStudioSiteResetRecordedAct = AutomationStudioSiteResetNamedAct & { owner?: string; ref: string; undoable: boolean };

export class AutomationStudioSiteResetLedger implements AutomationStudioSiteResetCalls {
  private readonly acts: Act[] = [];
  private readonly createBaselines: AutomationStudioSiteResetCreateBaselines;
  private readonly stepGaps: AutomationStudioSiteResetStepGaps;
  private readonly pressNotes: AutomationStudioSitePressNotes;
  private readonly controlWitnesses: AutomationStudioSiteResetControlWitnesses;
  private next = 1;
  /** The complete lists this ledger has seen: originals and latest reads (`../reset-settlement/observations.ts`). */
  private readonly seen = new AutomationStudioSiteResetObservations();
  /** The stateful controls it has seen, and the presses on them (`../reset-settlement/control-tracker.ts`). */
  private readonly tracker = new AutomationStudioSiteResetControlTracker();
  /** Moves on every landed lasting call, undo and trial: a read is fresh only at the current value (header, L1). */
  private clock = 0;
  /** Lasting acts recorded since the build began or since the last trial (header). */
  private recordedInPhase = 0;
  /** This ledger as a trial's readings see it, with the read log they read (header, t775; `./trial-change-port.ts`). */
  private readonly change: AutomationStudioSiteResetTrialChange;
  private readonly options: AutomationStudioSiteResetLedgerOptions;
  /** Whether each act is settled, and what an open one still needs (`../reset-settlement/judge.ts`). */
  private readonly judge: AutomationStudioSiteResetSettlementJudge;
  /** What a call under `undoes` may name and act on, and what one that ran did (`./undo-claims.ts`). */
  private readonly undos: AutomationStudioSiteResetUndoClaims;
  /** The ledger as `./undo-reach.ts` reads it: whether any undo could still put back what an open act's lists show (header, t748). */
  private readonly reachable: Parameters<typeof undoReach>[0];

  constructor(options: AutomationStudioSiteResetLedgerOptions = {}) {
    this.options = { ...options };
    this.createBaselines = options.createBaselines ?? new AutomationStudioSiteResetCreateBaselines();
    this.stepGaps = new AutomationStudioSiteResetStepGaps(this.createBaselines);
    this.pressNotes = new AutomationStudioSitePressNotes(this.createBaselines.known());
    this.controlWitnesses = options.controlWitnesses ?? new AutomationStudioSiteResetControlWitnesses();
    this.judge = new AutomationStudioSiteResetSettlementJudge({
      seen: this.seen,
      tracker: this.tracker,
      reach: options.reach ?? new AutomationStudioSiteResetReach(),
      receipts: this.createBaselines,
      acts: () => this.acts,
      clock: () => this.clock,
      explored: () => this.buildExplored()
    });
    this.undos = new AutomationStudioSiteResetUndoClaims({
      acts: this.acts,
      seen: this.seen,
      receipts: this.createBaselines,
      claimable: (act) => this.claimable(act),
      settledNow: (act) => this.settledNow(act),
      toUndo: (act) => this.toUndo(act),
      inPlace: () => this.inPlace(),
      unsatisfiable: () => this.unsatisfiable(),
      named: (act) => this.named(act),
      plain: namedAct,
      toggle: (act) => this.judge.toggleOf(act),
      pressed: (place) => this.pressedUnder(place)
    });
    this.change = new AutomationStudioSiteResetTrialChange({ acts: () => this.acts, clock: () => this.clock, createBaselines: this.createBaselines, controlWitnesses: this.controlWitnesses, explored: () => this.buildExplored(), standing: (act) => this.leftOf(act).standing, groups: (act) => this.witnessGroups(act), controlStart: (place) => this.tracker.start(place) });
    this.reachable = { acts: this.acts, seen: this.seen, clock: () => this.clock, claimable: (act) => this.claimable(act), lent: (act) => this.judge.lent(act), toggle: (act) => this.judge.toggleOf(act), differing: (act) => this.judge.differing(act), described: (scope) => this.createBaselines.described(scope) };
  }

  /** The exploration door of the one admission (header, t751 R3), with the build's explored acts an action may repeat. */
  createBaseline(declared: Pick<AutomationStudioSiteResetDeclared, "effect" | "consequences" | "control">, reference: unknown) {
    const verdict = admission({ declared, reference, door: "exploration", requireIdentity: this.options.owner !== undefined }, { ...this.createBaselines.known(), controlOriginal: (control) => this.controlWitnesses.proven(control), controlOriginalCanBeRead: (control) => this.controlWitnesses.canRead(control), explored: () => this.buildExplored() });
    this.pressNotes.asked(declared, reference, verdict.kind === "admit" && verdict.witness !== undefined);
    return verdict.kind === "admit" ? { kind: "admit" as const } : verdict;
  }

  /**
   * The step door of the one admission (header, t751 R3): asked of a plan step's declaration at submission, it answers the
   * witness stamp the step's node carries, or none where the step has no witness or needs none (refusing is the trial's).
   */
  admitStep(declared: AutomationStudioSiteResetAdmissionDeclared, operation?: string, ask?: AutomationStudioSiteResetStepAsk): AutomationStudioSiteResetWitnessStamp | undefined {
    const stamp = this.stepStamp(declared, operation);
    if (ask) this.stepGaps.asked(declared, operation, ask, stamp);
    return stamp;
  }

  private stepStamp(declared: AutomationStudioSiteResetAdmissionDeclared, operation?: string): AutomationStudioSiteResetWitnessStamp | undefined {
    const verdict = admission({ declared, door: "step", requireIdentity: this.options.owner !== undefined, ...(operation !== undefined ? { operation } : {}) }, { ...this.createBaselines.known(), controlOriginal: (control) => this.controlWitnesses.proven(control), controlOriginalCanBeRead: (control) => this.controlWitnesses.canRead(control), explored: () => this.buildExplored() });
    if (verdict.kind !== "admit" || !verdict.witness) return undefined;
    if (verdict.witness.via === "own_list") {
      const original = this.createBaselines.described(verdict.witness.scope);
      return original ? { via: "destination", ref: original.ref } : undefined;
    }
    if (verdict.witness.via === "control") return this.controlWitnesses.stamp(declared.control);
    if (verdict.witness.via === "repeats") {
      const repeatedId = verdict.witness.act;
      const repeated = this.buildExplored().find((act) => act.id === repeatedId);
      if (repeated && !repeated.destinations.length) {
        // A control-only repeat needs the exact retained place, not merely another control about the same subject.
        if (declared.control.place === undefined || declared.control.resource === undefined || declared.control.place !== repeated.spot?.place || declared.control.resource !== repeated.spot.resource) return undefined;
        return this.controlWitnesses.stamp(declared.control);
      }
    }
    return stampOf(verdict.witness);
  }

  destinationReceipts() { return this.createBaselines.receipts(); }

  /** Every destination ref the model was shown, with how many items its list held and where it was read (t743: for Core's own wiring). */
  issuedRefs(): AutomationStudioSiteResetIssuedRef[] {
    return this.createBaselines.issuedRefs();
  }

  /** Original project evidence predates every lasting act; adoption never changes current observations. */
  adoptOriginalCollections(collections: NonNullable<AutomationStudioSiteResetRead["collections"]>): void {
    this.seen.adopt(collections);
  }

  /** A passive whole-scope observation; the first read is a baseline only for later acts. It feeds the lists, the controls and the clock's freshness (header, L1). */
  observed(given: AutomationStudioSiteResetRead, baseline = true): void {
    const read = this.createBaselines.paged(given); // A page read whole among its lists, for every reader below (header, t791).
    this.controlWitnesses.observed(read);
    // A read after an act showing one of its witnesses changed is a change seen (`restored`, not `unchanged`): judged on the
    // latest read before this one too, so a witness named since that read counts what it showed.
    for (const act of this.acts) if (this.open(act)) this.judge.evaluate(act);
    this.createBaselines.observed(read, baseline);
    // The per-group seal (header, t751 R1): a group an act touched, or every group once one is sealed, takes no original.
    this.seen.observe(read, baseline, this.acts.length, this.clock, (group) => this.createBaselines.closed(group));
    this.tracker.read(read, this.clock);
    // A read reached this ledger: a look of Core's that ran meanwhile landed (`../reset-settlement/judge.ts`, t743).
    this.judge.read(read);
    // Settled by this read, for good: a later trial makes the read stale, not the act open again (header, L1).
    for (const act of this.acts) this.settledNow(act);
    // Kept for a trial's readings, at the clock now (header, t775).
    this.change.readLog.observed(read, this.clock);
  }

  /** How a call's `undoes` value reads (`./undo-claims.ts`). */
  claim(undoes: unknown, resetDestination?: unknown): AutomationStudioSiteResetClaim {
    return this.undos.claim(undoes, resetDestination);
  }

  /** Whether an undo of `actId` may act on the control the domain declared, read before it acts (`./undo-claims.ts`). */
  target(actId: string, declared: AutomationStudioSiteResetUndoDeclared): AutomationStudioSiteResetTarget {
    const act = this.acts.find((entry) => entry.id === actId);
    // The destinations its repeats lend it, as the settlement gathers them, for a removal on a destination it named (`./undo-admission.ts`, t743).
    if (act) act.lent = this.judge.lent(act);
    const answer = this.undos.target(actId, declared);
    // A subject undo it was admitted on names a list it could change (header, t751 R1).
    if (act && answer.kind === "admit") this.locate(act);
    // Its own act, where a call can still meet the refusal, is never listed apart beside it (header, t772 R2).
    return answer.kind === "refused" ? { ...answer, evidence: agreeing(answer.evidence) } : answer;
  }

  explored(call: AutomationStudioSiteResetExplored): void {
    const declared = call.declared;
    const note = this.pressNotes.taken(call);
    if (note) call.note = note;
    const pressed = call.landed && declared?.permitted === true && declared.effect === "mutate";
    // A call naming an act under `undoes`: an undo or a look, never an act of its own (`./undo-claims.ts`).
    if (call.undoes !== undefined) {
      // A step toward a value act's undo (`./undo-admission.ts`) is no attempt: it changed the page, so earlier reads are stale (header, t772).
      if (call.on === "step") return pressed ? this.pressedUnder(declared.control.place) : undefined;
      const undone = this.acts.find((entry) => entry.id === call.undoes);
      const attempts = undone?.attempts ?? 0;
      this.undos.ran({ ...call, undoes: call.undoes });
      // An unasked subject undo that landed is spent whatever class it declared: one on a destination the act named may declare `modify_existing` (`./undo-admission.ts`, t743).
      if (undone && call.on === "subject" && undone.attempts > attempts) undone.spent = true;
      // A list named for it under `undoes` is one it could change (header, t751 R1).
      if (undone) this.locate(undone);
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
    this.locate(act);
  }

  /** The act the exploration call `callId` made, if it made one. */
  actOf(callId: string): string | undefined {
    return [...this.acts].reverse().find((act) => act.call === callId)?.id;
  }

  /** This ledger's explored acts, each with every destination named for it so far (header, L1). */
  exploredActs(): AutomationStudioSiteResetExploredAct[] {
    return this.acts.filter((act) => act.call !== undefined).map((act) => ({ id: act.id, consequences: act.consequences, ...(act.operation ? { operation: act.operation } : {}), ...(act.spot ? { spot: act.spot } : {}), destinations: [...act.destinations], witnessed: this.witnessGroups(act).length > 0 || this.judge.toggleOf(act) !== undefined }));
  }

  /** Where `act` was made: its page before it, what it changed there, and the items it created. Nothing changed there, nothing to look for. */
  placed(act: string, place: AutomationStudioSiteResetPlace): void {
    const entry = this.acts.find((candidate) => candidate.id === act);
    if (!entry) return;
    witnessTransfer(entry, place.collections, this.seen, this.acts.indexOf(entry) + 1);
    if (entry.transfer) this.locate(entry);
    if (place.created?.length) entry.createdItems = [...new Set([...entry.createdItems, ...place.created])];
    if (place.changed.length > 0) {
      entry.place = { state: structuredClone(place.state), location: place.location, changed: [...place.changed], ...(place.lines ? { lines: { gone: [...place.lines.gone], added: [...place.lines.added] } } : {}) };
    }
    // The shown values its press replaced witness it where nothing else does (header, t772).
    if (place.values && onlyModifies(entry.consequences)) this.judge.valued(entry, place.values, "read");
  }

  /** A landed press under `undoes` changed the site: the clock moves, and its place, if any, gets a press (header, L1). */
  private pressedUnder(place: string | undefined): void {
    this.clock += 1;
    if (place !== undefined) this.tracker.press(place, this.clock);
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
   * Before a trial (header, t775): cannotUndo keeps unresolved legacy acts; a start already in an asked end state by this
   * build's own act made with another step is refused, naming just that act; otherwise Core looks at its open acts' stale
   * witnesses, takes the trial's before readings where `options.change` asks, returns the target to the start once
   * something moved it or was recorded, and admits the trial with what of the build is on the site said under
   * `startedWith`. After a start hook (`startReset`), every act counts undone and nothing is compared (t479).
   */
  async beforeTrial(checks: AutomationStudioSiteResetChecks | AutomationStudioSiteResetChecks["compare"], cannotUndo?: readonly string[], options: AutomationStudioSiteResetBeforeTrialOptions = {}): Promise<AutomationStudioSiteResetDecision> {
    const asked: AutomationStudioSiteResetChecks = typeof checks === "function" ? { compare: checks } : checks;
    for (const act of this.acts) act.chain = undefined;
    for (const id of cannotUndo ?? []) {
      const act = this.acts.find((entry) => entry.id === id);
      // Only an act a reset has already asked for: the model has seen it listed, and had the chance to try.
      if (act && this.toUndo(act) && act.askedFor > 0) act.kept = true;
    }
    if (options.startReset === true) {
      // The hook put the whole site back: no act of this build is on it, and the model is asked for nothing (header).
      // Each act it took back is answered, never erased in silence (t504).
      const absorbed: AutomationStudioSiteResetAbsorbedAct[] = [];
      for (const act of this.acts) {
        // The hook took back whatever a list Core could not read again would have shown: nothing more for a judge (header, t743).
        delete act.unread;
        if (!act.undoable || act.undone) continue;
        act.undone = true;
        delete act.stillThere;
        // A possibly lasting act is taken back unnamed (header).
        // With who recorded it and the control it acted on, for Core's own reading (t647, `./explored-on-absorbed.ts`).
        if (!act.possible) absorbed.push({ ...namedAct(act), ...(this.options.owner !== undefined ? { owner: this.options.owner } : {}), ...(act.control ? { control: act.control } : {}) });
      }
      this.recordedInPhase = 0;
      const change = await this.change.begin(options.change, asked);
      return { kind: "admit", ...(absorbed.length > 0 ? { absorbedByStartReset: absorbed } : {}), ...(change ? { change } : {}) };
    }
    // The one refusal left (header, t775): just the acts that already show an asked end state another step made.
    const clash = options.change ? this.endStateClash(options.change) : [];
    if (clash.length) return this.startsInEndState(clash);
    // Core looks at every stale witness's place itself, so what is said of each act is as fresh as a look makes it (header, L1).
    if (asked.lookAt) await this.judge.lookFirst(this.acts.filter((act) => this.open(act)), asked.lookAt);
    for (const act of this.acts.filter((entry) => this.claimable(entry) || (entry.strictReset && entry.undoable && !entry.undone && entry.kept))) {
      // Settled by fresh complete reads of everything it could change (header, L1); never by source-page lines.
      if (act.strictReset && this.settledNow(act)) continue;
      if (act.subjectUndo) {
        if (act.askedFor >= ASKED_BEFORE_KEPT) act.kept = true;
        continue;
      }
      const looked = act.place && asked.compareAt ? await asked.compareAt(act.place) : undefined;
      if (looked?.differs && act.place) {
        act.stillThere = stillThere(this.acts, act, act.place, looked);
        if (!act.strictReset && !act.stillThere.length) act.undone = true;
      } else if (!act.strictReset && act.attempts > 0 && act.undoChanged !== false) {
        act.undone = true;
      }
    }
    // The trial's before readings (header, t775), then back to the start once anything was recorded or is on the site.
    const change = await this.change.begin(options.change, asked);
    const due = this.recordedInPhase > 0 || this.acts.some((act) => this.claimable(act)) || change !== undefined;
    const comparison = due ? await asked.compare() : undefined;
    // Kept: a legacy act the site cannot undo, a strict act settled with no change seen, or one settled with a list Core could not read again (header, L1, t743).
    const kept = this.acts.filter((act) => act.undoable && (act.unread !== undefined || (!act.undone && ((act.kept && !act.strictReset) || act.settled === "unchanged")))).map((act) => (act.settled ? { ...namedAct(act), did: `${act.did} (${WORDS.settledAs(act.settled, act.unread)})` } : namedAct(act)));
    const answer = automationStudioSiteResetTrialPolicy({ inPlace: this.inPlace(), kept, unsettleable: this.unsatisfiable(), differs: comparison?.differs ?? [] });
    // Each act said in place has now been shown to the model, which may name it under cannotUndo from here (t471).
    for (const act of this.acts) if (this.toUndo(act)) act.askedFor += 1;
    return { kind: "admit", ...(answer.startedWith ? { startedWith: answer.startedWith } : {}), ...(change ? { change } : {}) };
  }

  /** This ledger as a trial's readings read it (header, t775; `./trial-change-port.ts`). */
  trialChange(): AutomationStudioTrialChangeLedgerPort {
    return this.change.port();
  }

  /** The in-place acts already showing an asked end state another step made, as the model is shown them (header, t775). */
  endStateClash(ask: AutomationStudioTrialChangeAsk, carried?: (step: AutomationStudioTrialChangeAsk["steps"][number]) => boolean): AutomationStudioSiteResetNamedAct[] {
    return this.change.endStateClash(ask, carried).map((act) => this.named(act));
  }

  /** The targeted refusal (header, t775): only the acts named, each asked for once more. */
  startsInEndState(acts: readonly AutomationStudioSiteResetNamedAct[]): AutomationStudioSiteResetDecision {
    for (const act of this.acts) if (acts.some((named) => named.act === act.id)) act.askedFor += 1;
    return { kind: "refuse", moved: false, evidence: refusal("candidate.trial_starts_in_end_state", { failed: "starts_in_end_state", canMeet: "another_page", actsToUndo: acts.map((act) => ({ ...act })), instruction: WORDS.startsInEndState() }) };
  }

  /** A trial ran: a new phase starts with what was still in place and the trial's own acts, which are answered as left on the site. */
  trialRan(acts: readonly AutomationStudioSiteResetTrialAct[], trialRunId?: string): AutomationStudioSiteResetNamedAct[] {
    this.recordedInPhase = 0;
    for (const act of this.acts) act.chain = undefined;
    // A trial changed the site: every read before it is stale (header, L1).
    this.clock += 1;
    const explored = this.buildExplored();
    for (const act of acts) {
      const label = act.label ? JSON.stringify(act.label) : act.definitionId;
      // A looped step's pass is named, so its passes' acts read apart (header, t748).
      const did = `trial step ${act.step}${passWords(act.pass)} ${label}${act.control ? ` on ${JSON.stringify(act.control)}` : ""}`;
      // Where its step's control sat and what it made, as exploration records an act (header, t598).
      const recorded = this.record(did, `${trialRunId ?? "trial"}#step-${act.step}`, act.consequences, undefined, spotOf(act.spot), this.options.possible === true && act.possible === true, act.created, act.control, act.definitionId);
      const place = act.spot?.place;
      // Whether the build pressed this step's own item (its page) at that place before: then its diff's before is no original (t751 R1).
      const itemPressed = place !== undefined && act.controls !== undefined && this.tracker.pressedAt(act.controls.page, place);
      // Its step's press at its control's place, read on both sides by the step's own diff, with where its page is (L1, d7).
      const press = place !== undefined && act.controls ? this.tracker.landed(act.controls.page, place, act.controls.before, act.controls.after, this.clock, act.controls.location) : undefined;
      // A lasting act at a place its step read no controls at: a press there, so no later read seeds that place's start (t751 R1).
      if (place !== undefined && !act.controls && lastingClasses(act.consequences)) this.tracker.touched(place);
      if (!recorded) continue;
      // The project admitted this scoped witness before execution; an incomplete diff cannot downgrade it to legacy.
      if (this.options.owner !== undefined && stampValid(act.witness) && act.witness.via !== "legacy" && lastingClasses(act.consequences)) recorded.strictReset = true;
      witnessTransfer(recorded, act.collections, this.seen, this.acts.indexOf(recorded) + 1);
      if (press && onlyModifies(act.consequences)) recorded.press = press;
      // The explored acts it repeats lend it their destinations, named whenever (header, L1).
      if (recorded.strictReset) recorded.repeats = explored.filter((other) => repeats({ consequences: act.consequences, definitionId: act.definitionId, spot: act.spot }, { consequences: other.consequences, operation: other.operation, spot: other.spot })).map((other) => other.id);
      takeStamp(recorded, act.witness, { createBaselines: this.createBaselines, controlWitnesses: this.controlWitnesses }, act.controls, itemPressed);
      // Its step's diff's replaced values witness it where nothing else does; an unread place starts at its from (header, t772).
      if (act.values && onlyModifies(act.consequences)) this.judge.valued(recorded, act.values, "diff");
      this.locate(recorded);
    }
    // Left or possibly left, as settlement answers it (header, t772 w7); a possibly lasting act is answered under `possiblyInPlace` (header).
    return this.acts.filter((act) => LEFT_BY_TRIAL.has(this.leftOf(act).standing)).map((act) => this.named(act));
  }

  /** This build's acts still to undo, as the model is shown them; an open strict act says under `settle` what settles it (header, L1). */
  inPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.acts.filter((act) => this.leftOf(act).standing === "in_place").map((act) => this.named(act));
  }

  /** This build's acts no call can settle (`gate_unsatisfiable`, header, t743), each with the closed condition it failed; never among `inPlace`. */
  unsatisfiable(): AutomationStudioSiteResetUnsettleableAct[] {
    return this.acts.flatMap((act) => {
      const left = this.leftOf(act);
      return left.standing === "unsettleable" ? [{ act: act.id, did: act.did, ...(act.call ? { call: act.call } : {}), reason: "gate_unsatisfiable" as const, failed: left.failed }] : [];
    });
  }

  /** This build's possibly lasting acts that may still be on the site (header, t593): never asked for, each marked `possible`. */
  possiblyInPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.acts.filter((act) => this.leftOf(act).standing === "possible").map(namedAct);
  }

  /**
   * Where one act stands (L1), for words said about it: `in_place` still the model's, `restored` undone or taken back,
   * `unchanged` settled with no change seen (or, legacy, its page showed nothing of it), `unsettleable` closed as one no call
   * can settle (t743), `kept` a legacy act the site cannot undo, `possible` possibly lasting (t593), `irreversible` one no
   * control takes back; undefined for an id this ledger never gave. Read off `leftover` (header, t772 w7).
   */
  standing(actId: string): AutomationStudioSiteResetLeftover["standing"] | undefined {
    return this.leftover(actId)?.standing;
  }

  /** Whether one act is left on the site, as its settlement answers it (header, t772 w7, `./leftover.ts`); undefined for an id this ledger never gave. */
  leftover(actId: string): AutomationStudioSiteResetLeftover | undefined {
    const act = this.acts.find((entry) => entry.id === actId);
    return act ? this.leftOf(act) : undefined;
  }

  /** The lists named for a settled act that Core could not read again (t743, t783), for words said about it: the same ones its `startedWith` words name; undefined where none, or for an id this ledger never gave. */
  unreadOf(actId: string): readonly string[] | undefined {
    return this.acts.find((entry) => entry.id === actId)?.unread;
  }

  /** Whether any read after the act ever showed a change it made, for words said about it (t738); undefined for an id this ledger never gave. */
  changeSeen(actId: string): boolean | undefined {
    return this.acts.find((entry) => entry.id === actId)?.changeSeen;
  }

  /**
   * Where an act's effect may show (header, t751 R1): its witness groups are touched, so no first read of them becomes an
   * original; a legacy unscoped act seals every group (a strict act with none seals nothing, t775). A possibly lasting act
   * does neither.
   */
  private locate(act: Act): void {
    if (act.possible) return;
    const resources = [...new Set(act.destinations.map((destination) => this.createBaselines.resourceOf(destination.scope)).filter((resource): resource is string => resource !== undefined))];
    if (act.spot?.resource !== undefined || !resources.length) this.controlWitnesses.touchedAt(act.spot);
    else for (const resource of resources) this.controlWitnesses.touchedAt({ resource });
    // A strict act with no witness seals nothing (t775): originals serve only a targeted undo, and a list read after it must
    // still issue a ref a later step can name where its change shows. Only a legacy unscoped act seals every group.
    if (!act.strictReset) this.createBaselines.seal();
    else this.createBaselines.touch(this.witnessGroups(act));
  }

  /** The list groups an act counts among its witnesses (header, t751 R1): destinations, those its repeats lend, a transfer's, its subject undo's and its own list read before it. */
  private witnessGroups(act: Act): string[] {
    const groups = [...act.destinations, ...this.judge.lent(act)].map((entry) => entry.group);
    if (act.transfer) groups.push(act.transfer.group);
    if (act.subjectUndo) groups.push(act.subjectUndo.group);
    const scope = act.spot?.scope;
    const own = scope === undefined ? undefined : this.seen.originals.get(scope);
    if (own && own.beforeAct < this.acts.indexOf(act) + 1) groups.push(own.group);
    const original = scope !== undefined && act.spot?.resource !== undefined ? this.createBaselines.known().original(scope, act.spot.resource) : undefined;
    if (original) groups.push(original.group);
    return [...new Set(groups)];
  }

  /** The build's explored acts, every brief's in a project build (header, L1). */
  private buildExplored(): readonly AutomationStudioSiteResetExploredAct[] {
    return this.options.buildExplored ? this.options.buildExplored() : this.exploredActs();
  }

  /** Still on the site, and still the model's to undo: never one no call can settle (header, t743). */
  private toUndo(act: Act): boolean {
    return this.leftOf(act).standing === "in_place";
  }

  /** Whether `act` is left, settled first where it can be: the one answer every leftover and settlement answer reads (header, t772 w7). */
  private leftOf(act: Act): AutomationStudioSiteResetLeftover {
    this.settledNow(act);
    return leftoverOf(act, act.consequences.some((consequence) => IRREVERSIBLE.has(consequence)), () => this.unmet(act));
  }

  /** The closed condition an open strict act fails where no call can settle it (header, t743, t748); none otherwise. */
  private unmet(act: Act): ReturnType<AutomationStudioSiteResetSettlementJudge["unmet"]> {
    return this.open(act) && this.claimable(act) ? this.judge.unmet(act, undoReach(this.reachable, act)) : undefined;
  }

  /** A strict act that may still settle (header, L1). */
  private open(act: Act): boolean {
    return act.strictReset && act.undoable && !act.undone && !act.possible && act.settled === undefined;
  }

  /** Settled for good, judged now where it is still open (header, L1); `restored` marks it undone, and lists Core could not read again are kept for the judge (t743). */
  private settledNow(act: Act): "restored" | "unchanged" | undefined {
    if (act.settled || !this.open(act)) return act.settled;
    const decision = this.judge.evaluate(act);
    if (decision.kind !== "settled") return undefined;
    act.settled = decision.how;
    if (decision.unread) act.unread = [...decision.unread];
    if (decision.how === "restored") act.undone = true;
    return decision.how;
  }

  /** An act as the model is shown it: an open strict act with what settles it (header, L1). */
  private named(act: Act): AutomationStudioSiteResetNamedAct {
    const said = namedAct(act);
    const settle = this.open(act) ? this.judge.settle(act) : undefined;
    return settle ? { ...said, settle } : said;
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
    this.acts.push(act);
    this.next += 1;
    // A possibly lasting act never makes a comparison due (header).
    if (lasting) this.recordedInPhase += 1;
    this.options.sink?.({ ...namedAct(act), ...(this.options.owner !== undefined ? { owner: this.options.owner } : {}), ref, undoable });
    return act;
  }
}

/** `, pass K of N` for a well-formed pass of a step that ran more than once (header, t748); nothing otherwise. */
function passWords(pass: AutomationStudioSiteResetTrialAct["pass"]): string {
  return pass && Number.isSafeInteger(pass.number) && Number.isSafeInteger(pass.of) && pass.of > 1 && pass.number >= 1 && pass.number <= pass.of ? `, pass ${pass.number} of ${pass.of}` : "";
}

/** Freeze only a pure, unambiguous immediate transition (`../reset-settlement/transfer-witness.ts`); no later current observation establishes ownership. `sequence`: the act's 1-based place among its ledger's acts. */
function witnessTransfer(act: Act, witness: AutomationStudioSiteResetPlace["collections"], seen: AutomationStudioSiteResetObservations, sequence: number): void {
  if (act.transfer) return;
  const transfer = transferWitness({ consequences: act.consequences, spot: act.spot, witness, originals: seen.originals, sequence });
  if (transfer) act.transfer = transfer;
}

/**
 * What `act` changed on its page that is still there now. With the domain's
 * lines: each line it added still present, and each line it removed still
 * gone -- unless another act of this build added that line, as when two acts
 * each change one total: the later act's "removal" of the total the earlier
 * one wrote is that earlier act's to undo, not its own. Without them, each of
 * its worded changes that is still a difference.
 */
function stillThere(acts: readonly Act[], act: Act, place: AutomationStudioSiteResetPlace, looked: AutomationStudioSiteResetComparison): string[] {
  const addedByOthers = new Set(acts.filter((other) => other !== act).flatMap((other) => other.place?.lines?.added ?? []));
  if (place.lines && looked.lines) return [...place.lines.added.filter((line) => looked.lines!.added.includes(line)), ...place.lines.gone.filter((line) => looked.lines!.gone.includes(line) && !addedByOthers.has(line))];
  return place.changed.filter((change) => (looked.differs ?? []).includes(change));
}

/** A spot's tokens, copied, or none when it named none of them. */
function spotOf(spot: AutomationStudioSiteResetSpot | undefined): AutomationStudioSiteResetSpot | undefined {
  const copied: AutomationStudioSiteResetSpot = {};
  for (const key of ["item", "dialog", "subject", "page", "scope", "resource", "place", "state"] as const) if (spot?.[key] !== undefined) copied[key] = spot[key];
  return Object.keys(copied).length > 0 ? copied : undefined;
}

/** Whether any class declared is lasting: one the site's controls can reverse, or one none takes back. */
function lastingClasses(consequences: readonly AutomationStudioActionConsequence[]): boolean {
  return consequences.some((consequence) => UNDOABLE.has(consequence) || IRREVERSIBLE.has(consequence));
}

/** Whether an act declared exactly `modify_existing`: the only act a toggle witnesses (header, L1). */
function onlyModifies(consequences: readonly AutomationStudioActionConsequence[]): boolean {
  return consequences.length === 1 && consequences[0] === "modify_existing";
}

/** An act as the model is shown it. */
function namedAct(act: Act): AutomationStudioSiteResetNamedAct {
  return { act: act.id, did: act.did, ...(act.call ? { call: act.call } : {}), ...(act.stillThere?.length ? { stillThere: [...act.stillThere] } : {}), ...(act.possible ? { possible: true as const } : {}) };
}
