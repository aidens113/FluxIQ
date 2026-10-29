// The ledger of this build's own lasting acts (t462; t775: a trial is judged
// against the state recorded just before it and the change asked for, so the
// site is reset as rarely as possible; user, 2026-10-27).
//
// **A facade over three collaborators (t797, no change in behaviour).** This
// ledger keeps its public surface, its admission doors, its reads and the
// trial gate (`beforeTrial`); what it records of the calls and trials that
// reach it is `../reset-ledger/recording.ts`, its settlement answers are
// `../reset-ledger/answers.ts`, and its answers to a call under `undoes` are
// `../reset-ledger/claims.ts`, each with the header paragraphs of the code it holds.
// They share one state (`../reset-ledger/state.ts`); a collaborator asks one of this
// ledger's public answers through the ledger, never another collaborator. They
// sit beside site-reset, not inside it, as `../reset-settlement/` does (t743): a
// directory inside site-reset would pass the path depth limit.
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
// **The one admission (rerun round 2, t751 R3; t775, t791).** The exploration
// door (`createBaseline`, with the build's explored acts it may repeat) admits a
// press with no witness, and a `resetDestination` no receipt printed is refused
// before its call runs, here under `undoes` (`claim`) too; a ref showing nothing of
// the press's change gets a note (`./press-notes.ts`, t791 fix 3). A plan step is
// asked at submission (`admitStep`): its stamp is what its trial act takes
// (`trialRan`, `../reset-ledger/trial-stamp.ts`), and with none `ask.gap` says whether a call in
// its own tab can make one (`../reset-admission/step-gaps.ts`, t791 fix 2).
//
// **A page read whole is a destination (t791, `./page-collection.ts`)**, every read paged first (`observed`).
//
// **An undo is paired by its effect; `undoes` is a hint (P4, CC4).** A press
// that names no act but reverses an open act's recorded effect at the same
// witness is recorded as that act's undo, not as an act
// (`../reset-ledger/recording.ts`, `../reset-undo/claims.ts`): asked on every
// read once the tracker has taken it (`observed`), and on the client's effect
// record with an act's place (`placed`).
//
// A phase runs from the build's start, or from one trial to the next: the start
// is compared again before a trial only once something was recorded in it.

import { AutomationStudioSiteResetCreateBaselines } from "./create-baselines.ts";
import { AutomationStudioSitePressNotes } from "./press-notes.ts";
import {
  AutomationStudioSiteResetStepGaps,
  automationStudioSiteResetAdmission as admission,
  automationStudioSiteResetWitnessStampOf as stampOf,
  type AutomationStudioSiteResetAdmissionDeclared, type AutomationStudioSiteResetStepAsk,
  type AutomationStudioSiteResetWitnessStamp
} from "../reset-admission/index.ts";
import { automationStudioSiteResetRefusal as refusal } from "../reset-answers/index.ts";
import {
  AutomationStudioSiteResetControlTracker,
  AutomationStudioSiteResetObservations,
  AutomationStudioSiteResetReach,
  AutomationStudioSiteResetSettlementJudge,
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
import {
  AutomationStudioSiteResetLedgerAnswers,
  AutomationStudioSiteResetLedgerClaims,
  AutomationStudioSiteResetLedgerRecording,
  automationStudioSiteResetLedgerNamedAct as namedAct,
  type AutomationStudioSiteResetLedgerAct,
  type AutomationStudioSiteResetLedgerState,
  type AutomationStudioSiteResetLeftover
} from "../reset-ledger/index.ts";
import { automationStudioSiteResetTrialPolicy } from "./trial-policy.ts";
import type { AutomationStudioTrialChangeAsk, AutomationStudioTrialChangeLedgerPort } from "../trial-change/index.ts";
import { AutomationStudioSiteResetTrialChange } from "./trial-change-port.ts";
import type { AutomationStudioSiteResetUndoDeclared } from "../reset-undo/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";
import { AutomationStudioSiteResetControlWitnesses } from "./control-witnesses.ts";

/** Reset attempts before an act with a subject undo is kept unresolved; being strict, it still refuses ordinary trials. */
const ASKED_BEFORE_KEPT = 2;

/** One act of this build as the ledger keeps it (`../reset-ledger/act.ts`). */
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
  /** Records a press with an effect but no lasting class as possibly lasting (`../reset-ledger/recording.ts`, t593); absent, it is not recorded, as before. */
  possible?: boolean;
  /** Shared original receipts for every owner of one project build. */
  createBaselines?: AutomationStudioSiteResetCreateBaselines;
  controlWitnesses?: AutomationStudioSiteResetControlWitnesses;
  /** Every explored act of the build this ledger belongs to, asked whenever a trial act is matched or judged (`../reset-ledger/answers.ts`, L1); absent, this ledger's own. */
  buildExplored?: () => readonly AutomationStudioSiteResetExploredAct[];
  /** The lists Core cannot read again, shared by every ledger of one build (`../reset-settlement/reach.ts`, t743); absent, this ledger's own. */
  reach?: AutomationStudioSiteResetReach;
};

/**
 * One explored act as a trial act of the same build is matched against and lent destinations by (`../reset-ledger/answers.ts`, L1); `witnessed`,
 * it has a witness of its own -- a list group or an observed toggle -- to lend an action that repeats it (t751 R3).
 */
export type AutomationStudioSiteResetExploredAct = { id: string; consequences: readonly AutomationStudioActionConsequence[]; operation?: string; spot?: AutomationStudioSiteResetSpot; destinations: ReadonlyArray<{ scope: string; group: string }>; witnessed: boolean };

/** One act as a ledger recorded it, for its sink. */
export type AutomationStudioSiteResetRecordedAct = AutomationStudioSiteResetNamedAct & { owner?: string; ref: string; undoable: boolean };

export class AutomationStudioSiteResetLedger implements AutomationStudioSiteResetCalls {
  private readonly stepGaps: AutomationStudioSiteResetStepGaps;
  /** This ledger as a trial's readings see it, with the read log they read (header, t775; `./trial-change-port.ts`). */
  private readonly change: AutomationStudioSiteResetTrialChange;
  private readonly options: AutomationStudioSiteResetLedgerOptions;
  /** What this ledger shares with its collaborators: its acts, reads, receipts, judge and counters (`../reset-ledger/state.ts`). */
  private readonly state: AutomationStudioSiteResetLedgerState;
  /** Its settlement answers (`../reset-ledger/answers.ts`). */
  private readonly answers: AutomationStudioSiteResetLedgerAnswers;
  /** Its answers to a call under `undoes` (`../reset-ledger/claims.ts`). */
  private readonly claims: AutomationStudioSiteResetLedgerClaims;
  /** What it records of the calls and trials that reach it (`../reset-ledger/recording.ts`). */
  private readonly recording: AutomationStudioSiteResetLedgerRecording;

  constructor(options: AutomationStudioSiteResetLedgerOptions = {}) {
    this.options = { ...options };
    const acts: Act[] = [];
    const seen = new AutomationStudioSiteResetObservations();
    const tracker = new AutomationStudioSiteResetControlTracker();
    const createBaselines = options.createBaselines ?? new AutomationStudioSiteResetCreateBaselines();
    this.stepGaps = new AutomationStudioSiteResetStepGaps(createBaselines);
    this.state = {
      acts,
      options: this.options,
      createBaselines,
      pressNotes: new AutomationStudioSitePressNotes(createBaselines.known()),
      controlWitnesses: options.controlWitnesses ?? new AutomationStudioSiteResetControlWitnesses(),
      seen,
      tracker,
      judge: new AutomationStudioSiteResetSettlementJudge({
        seen,
        tracker,
        reach: options.reach ?? new AutomationStudioSiteResetReach(),
        receipts: createBaselines,
        acts: () => acts,
        clock: () => this.state.clock,
        explored: () => this.recording.buildExplored()
      }),
      next: 1,
      clock: 0,
      recordedInPhase: 0
    };
    this.answers = new AutomationStudioSiteResetLedgerAnswers(this.state);
    // This ledger's own public answers reach a collaborator through the ledger, so an override of them is honoured (header).
    this.claims = new AutomationStudioSiteResetLedgerClaims(this.state, this.answers, { inPlace: () => this.inPlace(), unsatisfiable: () => this.unsatisfiable(), locate: (act) => this.recording.locate(act), pressed: (place) => this.recording.pressedUnder(place) });
    this.recording = new AutomationStudioSiteResetLedgerRecording(this.state, this.answers, this.claims, { exploredActs: () => this.exploredActs() });
    this.change = new AutomationStudioSiteResetTrialChange({ acts: () => acts, clock: () => this.state.clock, createBaselines, controlWitnesses: this.state.controlWitnesses, explored: () => this.recording.buildExplored(), standing: (act) => this.answers.leftOf(act).standing, groups: (act) => this.recording.witnessGroups(act), controlStart: (place) => tracker.start(place) });
  }

  /** The exploration door of the one admission (header, t751 R3), with the build's explored acts an action may repeat. */
  createBaseline(declared: Pick<AutomationStudioSiteResetDeclared, "effect" | "consequences" | "control">, reference: unknown) {
    const { createBaselines, controlWitnesses } = this.state;
    const verdict = admission({ declared, reference, door: "exploration", requireIdentity: this.options.owner !== undefined }, { ...createBaselines.known(), controlOriginal: (control) => controlWitnesses.proven(control), controlOriginalCanBeRead: (control) => controlWitnesses.canRead(control), explored: () => this.recording.buildExplored() });
    this.state.pressNotes.asked(declared, reference, verdict.kind === "admit" && verdict.witness !== undefined);
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
    const { createBaselines, controlWitnesses } = this.state;
    const verdict = admission({ declared, door: "step", requireIdentity: this.options.owner !== undefined, ...(operation !== undefined ? { operation } : {}) }, { ...createBaselines.known(), controlOriginal: (control) => controlWitnesses.proven(control), controlOriginalCanBeRead: (control) => controlWitnesses.canRead(control), explored: () => this.recording.buildExplored() });
    if (verdict.kind !== "admit" || !verdict.witness) return undefined;
    if (verdict.witness.via === "own_list") {
      const original = createBaselines.described(verdict.witness.scope);
      return original ? { via: "destination", ref: original.ref } : undefined;
    }
    if (verdict.witness.via === "control") return controlWitnesses.stamp(declared.control);
    if (verdict.witness.via === "repeats") {
      const repeatedId = verdict.witness.act;
      const repeated = this.recording.buildExplored().find((act) => act.id === repeatedId);
      if (repeated && !repeated.destinations.length) {
        // A control-only repeat needs the exact retained place, not merely another control about the same subject.
        if (declared.control.place === undefined || declared.control.resource === undefined || declared.control.place !== repeated.spot?.place || declared.control.resource !== repeated.spot.resource) return undefined;
        return controlWitnesses.stamp(declared.control);
      }
    }
    return stampOf(verdict.witness);
  }

  destinationReceipts() { return this.state.createBaselines.receipts(); }

  /** Every destination ref the model was shown, with how many items its list held and where it was read (t743: for Core's own wiring). */
  issuedRefs(): AutomationStudioSiteResetIssuedRef[] {
    return this.state.createBaselines.issuedRefs();
  }

  /** Original project evidence predates every lasting act; adoption never changes current observations. */
  adoptOriginalCollections(collections: NonNullable<AutomationStudioSiteResetRead["collections"]>): void {
    this.state.seen.adopt(collections);
  }

  /** A passive whole-scope observation; the first read is a baseline only for later acts. It feeds the lists, the controls and the clock's freshness (`../reset-ledger/answers.ts`, L1). */
  observed(given: AutomationStudioSiteResetRead, baseline = true): void {
    const { acts, createBaselines, judge } = this.state;
    const read = createBaselines.paged(given); // A page read whole among its lists, for every reader below (header, t791).
    this.state.controlWitnesses.observed(read);
    // A read after an act showing one of its witnesses changed is a change seen (`restored`, not `unchanged`): judged on the
    // latest read before this one too, so a witness named since that read counts what it showed.
    for (const act of acts) if (this.answers.open(act)) judge.evaluate(act);
    createBaselines.observed(read, baseline);
    // The per-group seal (`../reset-ledger/recording.ts`, t751 R1): a group an act touched, or every group once one is sealed, takes no original.
    this.state.seen.observe(read, baseline, acts.length, this.state.clock, (group) => createBaselines.closed(group));
    this.state.tracker.read(read, this.state.clock);
    // A read reached this ledger: a look of Core's that ran meanwhile landed (`../reset-settlement/judge.ts`, t743).
    judge.read(read);
    // A press this read filled that flipped back what an open act set is that act's undo, before anything settles (header, P4).
    this.recording.pairPressed();
    // Settled by this read, for good: a later trial makes the read stale, not the act open again (`../reset-ledger/answers.ts`, L1).
    for (const act of acts) this.answers.settledNow(act);
    // Kept for a trial's readings, at the clock now (header, t775).
    this.change.readLog.observed(read, this.state.clock);
  }

  /** How a call's `undoes` value reads (`../reset-ledger/claims.ts`). */
  claim(undoes: unknown, resetDestination?: unknown): AutomationStudioSiteResetClaim {
    return this.claims.claim(undoes, resetDestination);
  }

  /** Whether an undo of `actId` may act on the control the domain declared, read before it acts (`../reset-ledger/claims.ts`). */
  target(actId: string, declared: AutomationStudioSiteResetUndoDeclared): AutomationStudioSiteResetTarget {
    return this.claims.target(actId, declared);
  }

  /** An exploration call ran (`../reset-ledger/recording.ts`). */
  explored(call: AutomationStudioSiteResetExplored): void {
    this.recording.explored(call);
  }

  /** The act the exploration call `callId` made, if it made one (`../reset-ledger/recording.ts`). */
  actOf(callId: string): string | undefined {
    return this.recording.actOf(callId);
  }

  /** This ledger's explored acts (`../reset-ledger/recording.ts`). */
  exploredActs(): AutomationStudioSiteResetExploredAct[] {
    return this.recording.exploredActs();
  }

  /** Where `act` was made (`../reset-ledger/recording.ts`). */
  placed(act: string, place: AutomationStudioSiteResetPlace): void {
    this.recording.placed(act, place);
  }

  /** An unchanged source (`../reset-ledger/recording.ts`). */
  noEffect(act: string): void {
    this.recording.noEffect(act);
  }

  /** What an undo of `act` did to the page it ran on (`../reset-ledger/recording.ts`). */
  undoSeen(act: string, changedInPlace: boolean): void {
    this.recording.undoSeen(act, changedInPlace);
  }

  /**
   * Before a trial (header, t775): cannotUndo keeps unresolved legacy acts; a start already in an asked end state by this
   * build's own act made with another step is refused, naming just that act; otherwise Core looks at its open acts' stale
   * witnesses, takes the trial's before readings where `options.change` asks, returns the target to the start once
   * something moved it or was recorded, and admits the trial with what of the build is on the site said under
   * `startedWith`. After a start hook (`startReset`), every act counts undone and nothing is compared (t479).
   */
  async beforeTrial(checks: AutomationStudioSiteResetChecks | AutomationStudioSiteResetChecks["compare"], cannotUndo?: readonly string[], options: AutomationStudioSiteResetBeforeTrialOptions = {}): Promise<AutomationStudioSiteResetDecision> {
    const { acts } = this.state;
    const asked: AutomationStudioSiteResetChecks = typeof checks === "function" ? { compare: checks } : checks;
    for (const act of acts) act.chain = undefined;
    for (const id of cannotUndo ?? []) {
      const act = acts.find((entry) => entry.id === id);
      // Only an act a reset has already asked for: the model has seen it listed, and had the chance to try.
      if (act && this.answers.toUndo(act) && act.askedFor > 0) act.kept = true;
    }
    if (options.startReset === true) {
      // The hook put the whole site back: no act of this build is on it, and the model is asked for nothing (header).
      // Each act it took back is answered, never erased in silence (t504).
      const absorbed: AutomationStudioSiteResetAbsorbedAct[] = [];
      for (const act of acts) {
        // The hook took back whatever a list Core could not read again would have shown: nothing more for a judge (`../reset-ledger/answers.ts`, t743).
        delete act.unread;
        if (!act.undoable || act.undone) continue;
        act.undone = true;
        delete act.stillThere;
        // A possibly lasting act is taken back unnamed (`../reset-ledger/recording.ts`, t593).
        // With who recorded it and the control it acted on, for Core's own reading (t647, `./explored-on-absorbed.ts`).
        if (!act.possible) absorbed.push({ ...namedAct(act), ...(this.options.owner !== undefined ? { owner: this.options.owner } : {}), ...(act.control ? { control: act.control } : {}) });
      }
      this.state.recordedInPhase = 0;
      const change = await this.change.begin(options.change, asked);
      return { kind: "admit", ...(absorbed.length > 0 ? { absorbedByStartReset: absorbed } : {}), ...(change ? { change } : {}) };
    }
    // The one refusal left (header, t775): just the acts that already show an asked end state another step made.
    const clash = options.change ? this.endStateClash(options.change) : [];
    if (clash.length) return this.startsInEndState(clash);
    // Core looks at every stale witness's place itself, so what is said of each act is as fresh as a look makes it (`../reset-ledger/answers.ts`, L1).
    if (asked.lookAt) await this.state.judge.lookFirst(acts.filter((act) => this.answers.open(act)), asked.lookAt);
    for (const act of acts.filter((entry) => this.answers.claimable(entry) || (entry.strictReset && entry.undoable && !entry.undone && entry.kept))) {
      // Settled by fresh complete reads of everything it could change (`../reset-ledger/answers.ts`, L1); never by source-page lines.
      if (act.strictReset && this.answers.settledNow(act)) continue;
      if (act.subjectUndo) {
        if (act.askedFor >= ASKED_BEFORE_KEPT) act.kept = true;
        continue;
      }
      const looked = act.place && asked.compareAt ? await asked.compareAt(act.place) : undefined;
      if (looked?.differs && act.place) {
        act.stillThere = stillThere(acts, act, act.place, looked);
        if (!act.strictReset && !act.stillThere.length) act.undone = true;
      } else if (!act.strictReset && act.attempts > 0 && act.undoChanged !== false) {
        act.undone = true;
      }
    }
    // The trial's before readings (header, t775), then back to the start once anything was recorded or is on the site.
    const change = await this.change.begin(options.change, asked);
    const due = this.state.recordedInPhase > 0 || acts.some((act) => this.answers.claimable(act)) || change !== undefined;
    const comparison = due ? await asked.compare() : undefined;
    // Kept: a legacy act the site cannot undo, a strict act settled with no change seen, or one settled with a list Core could not read again (`../reset-ledger/answers.ts`, L1, t743).
    const kept = acts.filter((act) => act.undoable && (act.unread !== undefined || (!act.undone && ((act.kept && !act.strictReset) || act.settled === "unchanged")))).map((act) => (act.settled ? { ...namedAct(act), did: `${act.did} (${WORDS.settledAs(act.settled, act.unread)})` } : namedAct(act)));
    const answer = automationStudioSiteResetTrialPolicy({ inPlace: this.inPlace(), kept, unsettleable: this.unsatisfiable(), differs: comparison?.differs ?? [] });
    // Each act said in place has now been shown to the model, which may name it under cannotUndo from here (t471).
    for (const act of acts) if (this.answers.toUndo(act)) act.askedFor += 1;
    return { kind: "admit", ...(answer.startedWith ? { startedWith: answer.startedWith } : {}), ...(change ? { change } : {}) };
  }

  /** This ledger as a trial's readings read it (header, t775; `./trial-change-port.ts`). */
  trialChange(): AutomationStudioTrialChangeLedgerPort {
    return this.change.port();
  }

  /** The in-place acts already showing an asked end state another step made, as the model is shown them (header, t775). */
  endStateClash(ask: AutomationStudioTrialChangeAsk, carried?: (step: AutomationStudioTrialChangeAsk["steps"][number]) => boolean): AutomationStudioSiteResetNamedAct[] {
    return this.change.endStateClash(ask, carried).map((act) => this.answers.named(act));
  }

  /** The targeted refusal (header, t775): only the acts named, each asked for once more. */
  startsInEndState(acts: readonly AutomationStudioSiteResetNamedAct[]): AutomationStudioSiteResetDecision {
    for (const act of this.state.acts) if (acts.some((named) => named.act === act.id)) act.askedFor += 1;
    return { kind: "refuse", moved: false, evidence: refusal("candidate.trial_starts_in_end_state", { failed: "starts_in_end_state", canMeet: "another_page", actsToUndo: acts.map((act) => ({ ...act })), instruction: WORDS.startsInEndState() }) };
  }

  /** A trial ran; its own acts are recorded and what is left is answered (`../reset-ledger/recording.ts`). */
  trialRan(acts: readonly AutomationStudioSiteResetTrialAct[], trialRunId?: string): AutomationStudioSiteResetNamedAct[] {
    return this.recording.trialRan(acts, trialRunId);
  }

  /** This build's acts still to undo (`../reset-ledger/answers.ts`). */
  inPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.answers.inPlace();
  }

  /** This build's acts no call can settle (`../reset-ledger/answers.ts`). */
  unsatisfiable(): AutomationStudioSiteResetUnsettleableAct[] {
    return this.answers.unsatisfiable();
  }

  /** This build's possibly lasting acts that may still be on the site (`../reset-ledger/answers.ts`). */
  possiblyInPlace(): AutomationStudioSiteResetNamedAct[] {
    return this.answers.possiblyInPlace();
  }

  /**
   * Where one act stands (L1), for words said about it: `in_place` still the model's, `restored` undone or taken back,
   * `unchanged` settled with no change seen (or, legacy, its page showed nothing of it), `unsettleable` closed as one no call
   * can settle (t743), `kept` a legacy act the site cannot undo, `possible` possibly lasting (t593), `irreversible` one no
   * control takes back; undefined for an id this ledger never gave. Read off `leftover` (`../reset-ledger/answers.ts`, t772 w7).
   */
  standing(actId: string): AutomationStudioSiteResetLeftover["standing"] | undefined {
    return this.leftover(actId)?.standing;
  }

  /** Whether one act is left on the site (`../reset-ledger/answers.ts`). */
  leftover(actId: string): AutomationStudioSiteResetLeftover | undefined {
    return this.answers.leftover(actId);
  }

  /** The lists named for a settled act that Core could not read again (`../reset-ledger/answers.ts`). */
  unreadOf(actId: string): readonly string[] | undefined {
    return this.answers.unreadOf(actId);
  }

  /** Whether any read after the act ever showed a change it made (`../reset-ledger/answers.ts`). */
  changeSeen(actId: string): boolean | undefined {
    return this.answers.changeSeen(actId);
  }
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
