import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioSiteResetProjectReset,
  type AutomationStudioSiteResetChecks,
  type AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetNamedAct,
  type AutomationStudioSiteResetProjectLedger,
  type AutomationStudioSiteResetTrialReset
} from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { runAutomationStudioDetachedSubflow } from "../../flow-bootstrap/verification/index.ts";
import { automationStudioCandidateTrialStart, type AutomationStudioCandidateTrialStart } from "../candidate-trial/index.ts";
import { AutomationStudioProjectBuildActsRecord } from "./acts-record.ts";
import { automationStudioProjectBuildPrepareEntry, type AutomationStudioProjectBuildEntry, type AutomationStudioProjectBuildKeptProposals } from "./entry-preparation.ts";
import { automationStudioProjectBuildPhaseStartTold, type AutomationStudioProjectBuildPhaseStartRecord } from "./phase-start-told.ts";
import type { AutomationStudioProjectBuildProposals } from "./proposals.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "./whole-trials.ts";

// The one start every phase of a project build begins from (t593).
//
// **Why one.** The same failure came back five times in A8, each time in a new
// phase: a subflow trial on a stale tab (t578), a builder never counted arrived
// on its prepared entry (t585), a whole trial without the start hook (t586), a
// whole trial without the arrival, and a builder with no predecessors exploring
// whatever the last trial left (A8 bigbox `run-mv8c7unr-42a8456d`). Each phase
// prepared its own start, and each missed a step. So the start is made here,
// once, and every phase takes it:
//
// - (a) **the deployment's start hook**, where there is one
//   (`automationStudioCandidateTrialStart`, the one hook call in Core);
// - (b) **the build's site reset**: after the hook every brief's ledger counts
//   this build's acts undone and names what it took back
//   (`flow-bootstrap/site-reset/project-reset.ts`); never what was there before
//   the build began (the user's rule of 2026-10-12). Without a hook nothing
//   can put the site back unasked, so the acts still in place, and the
//   possibly lasting presses that may be (`flow-bootstrap/site-reset/ledger.ts`),
//   are what the phase is told;
// - (c) **the arrival at the build's start location**, through the domain's
//   arrival node (`runsNodes.arrival`, only with a start location): a run
//   Core makes opens with it (`flow-bootstrap/verification/arrival-node.ts`),
//   and a phase a model explores in opens with the domain's own arriving look;
// - (d) **for a phase that begins after predecessors**, their latest passing
//   proposals, run once to its entry (`./entry-preparation.ts`), whose acts go
//   into the phase's own ledger and the build record;
// - (e) **the phase is told** which of these ran and on what page it stands
//   (`./phase-start-told.ts`), under `phaseStart`.
//
// Which phase takes which:
//
// - a builder's, a repair's and a reset's exploration: all five, here
//   (`explore`), before its first look (`./brief-ports.ts`). A reset after a
//   hook usually finds nothing left to undo, and completes;
// - a builder's subflow trial: its gate runs (a) and (b) through the port's
//   `prepareStart` and the reset `reset` makes here; the run makes (c) and (d)
//   (`../subflow-trial/run.ts`, given `arrival()`); (e) is read off the
//   trial's own feedback (`trialStart`, `./subflow-trials.ts`);
// - the whole trial: its gate runs (a) and the supervisor's reset (b) over the
//   same project reset; (c) is the assembled Flow's first step
//   (`project-agents/supervisor/assembly.ts`); (e) as for a subflow trial
//   (`./whole-trials.ts`).

/** A phase's start as the phase that explores in it takes it (`explore`). */
export type AutomationStudioProjectBuildPhaseStarted = {
  record: AutomationStudioProjectBuildPhaseStartRecord;
  /** What step (d) came to; `start` for a phase with no predecessors. */
  entry: AutomationStudioProjectBuildEntry;
  /** What the phase is told (e), beside its opening look. */
  told: JsonObject;
};

/** A start's comparison where nothing is looked at: after the hook the ledgers ask for nothing. */
const UNLOOKED: AutomationStudioSiteResetChecks = { compare: async () => ({ moved: false }) };
const START_ID = "builtin.control.start";

export class AutomationStudioProjectBuildPhaseStart {
  constructor(private readonly input: {
    environment: AutomationStudioProjectBuildTrialEnvironment;
    /** The domain's arrival node (`runsNodes.arrival`). */
    arrival: { node: string; parameter: string } | undefined;
    ledger: AutomationStudioSiteResetProjectLedger;
    proposals: Pick<AutomationStudioProjectBuildProposals, "predecessors"> & Partial<AutomationStudioProjectBuildKeptProposals>;
    /** The detached runner; replaced only by tests. */
    execute?: typeof runAutomationStudioDetachedSubflow | undefined;
    newRunId?: (() => string) | undefined;
  }) {}

  /** (c) The arrival a run Core makes opens with: the domain's arrival node, only where the build has a start location (header). */
  static arrival(arrival: { node: string; parameter: string } | undefined, environment: Pick<AutomationStudioProjectBuildTrialEnvironment, "startLocation">): { node: string; parameter: string } | undefined {
    return arrival && environment.startLocation ? { ...arrival } : undefined;
  }

  /** (e) for a trial: its start read off its own feedback -- how its start was made and its first step -- as every phase is told (header). */
  static trialStart(input: {
    phase: "subflow_trial" | "whole_trial";
    feedback: JsonObject;
    arrival: { node: string; parameter: string } | undefined;
    startLocation?: string | undefined;
    predecessors?: { keys: readonly string[]; prepared: boolean } | undefined;
  }): JsonObject {
    const { feedback } = input;
    const hook = feedback.start === "reset" ? "ran" : feedback.start === "not_reset" ? "none" : feedback.start === "failed" ? "failed" : "unknown";
    const steps = Array.isArray(feedback.steps) ? feedback.steps.filter(isObject) : [];
    const first = steps.find((step) => step.definitionId !== START_ID);
    const arrived = input.arrival !== undefined && first?.definitionId === input.arrival.node && first.status === "succeeded";
    const record: AutomationStudioProjectBuildPhaseStartRecord = {
      phase: input.phase,
      hook,
      ...(hook === "failed" && typeof feedback.code === "string" ? { hookCode: feedback.code } : {}),
      arrival: arrived ? "loaded" : steps.length ? "none" : "not_run",
      ...(input.predecessors?.keys.length ? { predecessors: { keys: [...input.predecessors.keys], prepared: input.predecessors.prepared } } : {}),
      ...(input.startLocation ? { startLocation: input.startLocation } : {})
    };
    return automationStudioProjectBuildPhaseStartTold(record);
  }

  /** (c) This build's arrival (header). */
  arrival(): { node: string; parameter: string } | undefined {
    return AutomationStudioProjectBuildPhaseStart.arrival(this.input.arrival, this.input.environment);
  }

  /** (a) The deployment's start hook for one phase, under `candidateId`; `not_reset` without one. Never judged. */
  async hook(request: { candidateId: string; revision: number; digest: string; signal: AbortSignal }): Promise<AutomationStudioCandidateTrialStart> {
    return await automationStudioCandidateTrialStart(request, { ...this.input.environment, judge: async () => { throw new Error("A phase's start is never judged."); } });
  }

  /** (b) The build's one reset over every brief's ledger, `own` first, under `checks` (header). */
  reset(own: AutomationStudioSiteResetLedger | undefined, checks: (signal: AbortSignal | undefined) => AutomationStudioSiteResetChecks): AutomationStudioSiteResetTrialReset {
    return automationStudioSiteResetProjectReset({ project: this.input.ledger, ...(own ? { own } : {}), checks });
  }

  /** (b) What of this build is on the site now: the acts still to undo, and the possibly lasting presses that may be there. */
  onSite(): { still: AutomationStudioSiteResetNamedAct[]; possibly: AutomationStudioSiteResetNamedAct[] } {
    const { ledger } = this.input;
    const acts = ledger.snapshot().acts;
    const still = acts.filter((act) => act.inPlace).map(({ act, did }) => ({ act, did }));
    const owners = [...new Set(acts.map((act) => act.owner))];
    const possibly = owners.flatMap((owner) => ledger.forBrief(owner).possiblyInPlace()).map(({ act, did }) => ({ act, did }));
    return { still, possibly };
  }

  /**
   * The whole start of a phase a model explores in (header): a builder's, a
   * repair's or a reset's, before its first look. `openingArrives`: the
   * domain's opening look goes to the start location itself.
   */
  async explore(request: {
    phase: "builder" | "repair" | "reset";
    scope: AutomationStudioSubflowScope;
    own: AutomationStudioSiteResetLedger;
    signal: AbortSignal;
    openingArrives: boolean;
  }): Promise<AutomationStudioProjectBuildPhaseStarted> {
    const { phase, scope, own, signal } = request;
    const { environment, ledger, proposals } = this.input;
    signal.throwIfAborted();
    // (a) The hook, for every phase alike (header).
    const start = await this.hook({ candidateId: `start.${phase}.${scope.buildId}.${scope.briefId}`, revision: 0, digest: "phase-start", signal });
    // (b) After it, every ledger counts this build's acts undone and names them; without it, what is still there is told.
    const putBack = start.status === "reset" ? await this.putBack(own, signal) : [];
    const onSite = this.onSite();
    // (d) A reset begins after nothing; a builder or repair after its predecessors, run once from the start location.
    const entry: AutomationStudioProjectBuildEntry = phase === "reset"
      ? { kind: "start" }
      : await automationStudioProjectBuildPrepareEntry({ scope, proposals, environment, start, signal, arrival: this.arrival(), ...(this.input.execute ? { execute: this.input.execute } : {}), ...(this.input.newRunId ? { newRunId: this.input.newRunId } : {}) });
    if (entry.kind !== "start" && entry.acts.length) {
      own.trialRan(entry.acts, entry.runId);
      AutomationStudioProjectBuildActsRecord.of(ledger).trialRan(entry.acts, entry.runId);
    }
    // (c) A prepared entry was reached through the arrival; any other phase's opening look arrives, where it can.
    const arrival = entry.kind === "prepared" ? (this.arrival() ? "loaded" : "none") : request.openingArrives ? "opening" : "none";
    const record: AutomationStudioProjectBuildPhaseStartRecord = {
      phase,
      hook: start.status === "reset" ? "ran" : start.status === "failed" ? "failed" : "none",
      ...(start.status === "failed" ? { hookCode: start.code } : {}),
      putBack,
      stillOnSite: onSite.still,
      possiblyOnSite: onSite.possibly,
      arrival,
      ...(entry.kind !== "start" ? { predecessors: { keys: [...entry.predecessors], prepared: entry.kind === "prepared", ...(entry.kind === "unprepared" ? { code: entry.code } : {}) } } : {}),
      ...(environment.startLocation ? { startLocation: environment.startLocation } : {})
    };
    // (e)
    return { record, entry, told: automationStudioProjectBuildPhaseStartTold(record) };
  }

  /** (b) after the hook: every ledger counts this build's acts undone, and what it took back is answered (header). */
  private async putBack(own: AutomationStudioSiteResetLedger, signal: AbortSignal): Promise<AutomationStudioSiteResetNamedAct[]> {
    const decision = await this.reset(own, () => UNLOOKED).beforeTrial(signal, undefined, { startReset: true });
    return decision.kind === "admit" ? (decision.absorbedByStartReset ?? []).map(({ act, did }) => ({ act, did })) : [];
  }
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
