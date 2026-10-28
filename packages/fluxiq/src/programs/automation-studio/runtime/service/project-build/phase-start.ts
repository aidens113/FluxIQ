import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../nodes/index.ts";
import {
  AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS,
  AutomationStudioSiteResetStartCheck,
  automationStudioSiteResetProjectReset,
  type AutomationStudioSiteResetChecks,
  type AutomationStudioSiteResetLiveCheck,
  type AutomationStudioSiteResetLedger,
  type AutomationStudioSiteResetNamedAct,
  type AutomationStudioSiteResetProjectLedger,
  type AutomationStudioSiteResetTrialReset
} from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { runAutomationStudioDetachedSubflow } from "../../flow-bootstrap/verification/index.ts";
import { automationStudioHarnessOptionRegistry, type AutomationStudioLlmEvidenceRuntimeBinding } from "../../llm/index.ts";
import { automationStudioCandidateTrialStart, type AutomationStudioCandidateTrialStart } from "../candidate-trial/index.ts";
import type { AutomationStudioBuildCancellation } from "../flow-bootstrap-commands/index.ts";
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
//
// **The judged whole run is read like a builder's trial (t775 D5; user,
// 2026-10-27: a trial is judged against the state recorded just before it and
// the change asked for).** A builder looks at a place through its own start
// check, made over its evidence loop (`./brief-ports.ts`). The supervisor has
// no loop that acts on the site, so its reset had no look, and the whole run --
// the user's own example, a cart line at 9 that is 10 after "add 1" -- got no
// reading at all. `look` makes the same look outside any loop: a start check
// over the build's registry binding, the binding and run-node option a
// builder's calls go through, framed in the build (its evidence frame) and as
// Core's own move (`start-check.ts`). Its calls carry no permission, so it can
// only arrive and read. Each read reaches every ledger holding an act, never as
// a baseline, as a read around another brief's call does (`./reset-calls.ts`).
// There is a look only where a run Core makes arrives at the build's start
// location (c), so the whole run's first step takes the tab back from wherever
// a look left it. Without that arrival, or without the domain's `startState`,
// there is no look and the whole run gets no readings, as before.
//
// **An act no call can settle is told as on the site, and not to undo (t743,
// S2).** The project ledger's `unsatisfiable()` acts leave its acts in place,
// since no reset is asked to undo them, so a phase was told nothing of them
// though they are still on the site. A phase that explores is now told them
// apart, under `actsUnsettleable` beside `phaseStart`'s words: still on the
// site, nothing can check or put them back, so no call should try, and no trial
// can run while they are there.

/** What a phase is told of the acts no call can settle (header, t743): generic, naming no site. */
const UNSETTLEABLE_SAID = "These acts of this build are still on the site, and nothing can check or put them back, so do not try to undo them; no trial can run while they are there:";

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

  /**
   * Core's own look at a place for the supervisor's judged whole run (header, t775 D5): over the build's registry
   * binding, each read handed to every ledger holding an act. Undefined where no run Core makes arrives at the build's
   * start location, or the domain cannot read its state. `liveCheck` is replaced only by tests.
   */
  static look(input: {
    binding: AutomationStudioLlmEvidenceRuntimeBinding;
    environment: Pick<AutomationStudioProjectBuildTrialEnvironment, "projectId" | "flowId" | "startLocation" | "registry" | "resolution">;
    ledger: Pick<AutomationStudioSiteResetProjectLedger, "snapshot" | "forBrief">;
    cancellation?: Pick<AutomationStudioBuildCancellation, "tool"> | undefined;
    liveCheck?: AutomationStudioSiteResetLiveCheck | undefined;
  }): ((signal: AbortSignal | undefined) => NonNullable<AutomationStudioSiteResetChecks["lookAt"]>) | undefined {
    const { binding, environment, ledger } = input;
    if (!binding.startState || !AutomationStudioProjectBuildPhaseStart.arrival(binding.runsNodes?.arrival, environment)) return undefined;
    const { projectId, flowId, startLocation, resolution } = environment;
    const registry = environment.registry ?? new AutomationStudioNodeRegistry();
    const harness = automationStudioHarnessOptionRegistry({ binding, nodeIds: registry.list(resolution).map((definition) => definition.id), startLocation }).evidenceLoopBinding({ projectId, flowId }, { ...resolution, allowSideEffectsWithoutPolicy: true });
    const execute = input.cancellation ? input.cancellation.tool(harness.executeTool) : harness.executeTool;
    const reader = new AutomationStudioSiteResetStartCheck({ binding, projectId, flowId, tools: harness.tools, executeTool: (call) => execute(call), liveCheck: input.liveCheck ?? { settleMs: AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS } });
    return (signal) => async (location, start) => {
      const read = await reader.lookAt(location, signal, start);
      if ("unread" in read) return;
      for (const owner of new Set(ledger.snapshot().acts.map((act) => act.owner))) ledger.forBrief(owner).observed(read, false);
    };
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

  /**
   * (b) What of this build is on the site now: the acts still to undo, the acts no call can settle (header, t743), and the
   * possibly lasting presses that may be there.
   */
  onSite(): { still: AutomationStudioSiteResetNamedAct[]; unsettleable: AutomationStudioSiteResetNamedAct[]; possibly: AutomationStudioSiteResetNamedAct[] } {
    const { ledger } = this.input;
    const acts = ledger.snapshot().acts;
    const still = acts.filter((act) => act.inPlace).map(({ act, did }) => ({ act, did }));
    const unsettleable = ledger.unsatisfiable().map(({ act, did }) => ({ act, did }));
    const owners = [...new Set(acts.map((act) => act.owner))];
    const possibly = owners.flatMap((owner) => ledger.forBrief(owner).possiblyInPlace()).map(({ act, did }) => ({ act, did }));
    return { still, unsettleable, possibly };
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
    const admission = phase === "reset" ? undefined : this.reset(own, () => UNLOOKED).admit?.(automationStudioSiteResetTrialSteps(proposals.predecessors(scope).flatMap((proposal) => proposal.subflows)));
    if (admission?.kind === "refuse") {
      const record: AutomationStudioProjectBuildPhaseStartRecord = { phase, hook: "none", arrival: "not_run", predecessors: { keys: [...scope.predecessors], prepared: false, code: admission.evidence.code } };
      return { record, entry: { kind: "unprepared", predecessors: [...scope.predecessors], code: admission.evidence.code, acts: [] }, told: { ...automationStudioProjectBuildPhaseStartTold(record), admission: admission.evidence } };
    }
    // (a) The hook, for every phase alike (header).
    const start = await this.hook({ candidateId: `start.${phase}.${scope.buildId}.${scope.briefId}`, revision: 0, digest: "phase-start", signal });
    // (b) After it, every ledger counts this build's acts undone and names them; without it, what is still there is told.
    const putBack = start.status === "reset" ? await this.putBack(own, signal) : [];
    const onSite = this.onSite();
    // (d) A reset begins after nothing; a builder or repair after its predecessors, run once from the start location.
    const blocked = onSite.still.length > 0 || onSite.unsettleable.length > 0 || onSite.possibly.length > 0;
    const entry: AutomationStudioProjectBuildEntry = phase !== "reset" && scope.predecessors.length > 0 && blocked
      ? { kind: "unprepared", predecessors: [...scope.predecessors], code: "project.entry_site_not_reset", acts: [] }
      : phase === "reset"
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
    // (e), with the acts no call can settle told apart (header, t743).
    return { record, entry, told: withUnsettleable(automationStudioProjectBuildPhaseStartTold(record), onSite.unsettleable) };
  }

  /** (b) after the hook: every ledger counts this build's acts undone, and what it took back is answered (header). */
  private async putBack(own: AutomationStudioSiteResetLedger, signal: AbortSignal): Promise<AutomationStudioSiteResetNamedAct[]> {
    const decision = await this.reset(own, () => UNLOOKED).beforeTrial(signal, undefined, { startReset: true });
    return decision.kind === "admit" ? (decision.absorbedByStartReset ?? []).map(({ act, did }) => ({ act, did })) : [];
  }
}

/** `told` with the acts no call can settle under `actsUnsettleable` and said after its note (header, t743); as it is when there are none. */
function withUnsettleable(told: JsonObject, acts: readonly AutomationStudioSiteResetNamedAct[]): JsonObject {
  if (!acts.length) return told;
  const said = `${UNSETTLEABLE_SAID} ${acts.map((act) => act.act).join(", ")}.`;
  return { ...told, actsUnsettleable: acts.map((act) => ({ act: act.act, did: act.did })), note: typeof told.note === "string" && told.note ? `${told.note} ${said}` : said };
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
import { automationStudioSiteResetTrialSteps } from "../../flow-bootstrap/reset-admission/index.ts";
