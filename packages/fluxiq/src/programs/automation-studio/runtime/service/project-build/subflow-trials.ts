import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioSubflowScope, AutomationStudioSubflowTrialPreparingPort, AutomationStudioSubflowTrialRequest, AutomationStudioSubflowTrialResult } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmProvider } from "../../llm/index.ts";
import { AutomationStudioHostLeaseScope, type AutomationStudioHostResourceScheduler, type AutomationStudioProjectBuildRecordStore, type AutomationStudioProjectBuildRef } from "../../project-agents/index.ts";
import { automationStudioBuildTestJudge } from "../../result-verification/index.ts";
import { AutomationStudioOfflineTrialInstallation, automationStudioOfflineFirstSubflow } from "../offline-first/index.ts";
import type { AutomationStudioOfflineTrialPhase } from "../offline-trial/index.ts";
import { admitAutomationStudioBuildTrialSession } from "../runtime-session/index.ts";
import { automationStudioSubflowTrialPort, type AutomationStudioSubflowTrialJudgeInput, type AutomationStudioSubflowTrialPorts } from "../subflow-trial/index.ts";
import type { AutomationStudioProjectBuildKeptProposals } from "./entry-preparation.ts";
import { AutomationStudioProjectBuildPhaseStart } from "./phase-start.ts";
import type { AutomationStudioProjectBuildProposals } from "./proposals.ts";
import { AutomationStudioProjectBuildTaskChecklist } from "./task-checklist.ts";
import { automationStudioProjectBuildTrialReads } from "./trial-reads.ts";
import type { AutomationStudioProjectBuildTrialEnvironment } from "./whole-trials.ts";

// A project build's partial trials (unit A5c over A4b's runner): one port for
// the build, shared by every brief, made from the same trial environment the
// whole candidate's trials are run with, and three things of the project's:
//
// - **Admission.** Each trial's session opens through
//   `admitAutomationStudioBuildTrialSession`: only while this build runs and
//   only under the host-resource lease of the brief that asked, read from the
//   lease scope the dispatcher runs each brief in. A stale builder's late trial
//   never opens a session.
// - **The scoped judge.** The build-test judge, asked about the brief's parts
//   alone: its instructions are one instruction holding the parts' own words
//   and the subflow's success check -- the plan's, or where the plan gives
//   none the one its builder proposed (t569) -- never the whole task; beside it, the
//   task checklist of those parts and of what nobody asked for (unit A9,
//   `./task-checklist.ts`).
// - **Proposals.** Every proposal tried is kept by brief, revision and digest
//   (`./proposals.ts`), so the supervisor can assemble a done return's
//   proposal and a later subflow's trial can run its predecessors' latest
//   passing proposals to reach its entry. Its verdict is the one the brief's
//   gate weighed (t634): this port answers before the gate weighs the trial,
//   and the gate may hold a no unsure (a no the build's own record
//   contradicts, t633), so each trial this port answered is told to the
//   proposals when the gate tells the port what it kept (`weighed`, chained
//   by the dispatcher's `project-agents/dispatch/trial-port.ts`).
// - **The start page and the start hook** (t578). Each trial's run goes to the
//   build's start location first, through the domain's arrival node
//   (`runsNodes.arrival`), and the port keeps the inner port's `prepareStart`,
//   so a builder's gate runs the deployment's start hook ahead of its site
//   reset (`flow-bootstrap/subflow-candidate/subflow-trial-gate.ts`).
// - **The build's one start (t593).** The arrival is the one every phase of
//   the build takes (`./phase-start.ts`), and each trial's feedback says under
//   `phaseStart` how its start was made, in the words every phase is told:
//   whether the hook ran, whether the run opened by loading the start
//   location, and whether its predecessors ran it to its entry.
// - **The entry is setup, not this subflow's work (t599).** A trial runs its
//   predecessors' passing proposals inside it, so its summary carries their
//   reads and presses (A8 social `run-mv8ic6mk-09bf12ff`: every yes over a
//   correct read was held to quote for the predecessor's rows, and judges
//   answered no to the predecessor's presses as out of scope). The judge's
//   checklist names them (`entry`, `./task-checklist.ts`), and the
//   instruction no longer says the trial ran only this subflow.
// - **The environment kind (traces and offline trials, U7).** The port carries
//   the inner port's `environmentKind`, so the subflow trial gate still sees an
//   offline trial as offline.

export function automationStudioProjectBuildSubflowTrials(input: {
  ref: AutomationStudioProjectBuildRef;
  environment: AutomationStudioProjectBuildTrialEnvironment;
  binding: AutomationStudioLlmEvidenceRuntimeBinding;
  judge: { provider: AutomationStudioLlmProvider; timeoutMs?: number | undefined; signal?: AbortSignal | undefined };
  records: Pick<AutomationStudioProjectBuildRecordStore, "read">;
  proposals: AutomationStudioProjectBuildProposals & Partial<AutomationStudioProjectBuildKeptProposals>;
  leases: Pick<AutomationStudioHostResourceScheduler, "assertCurrent">;
  /** Whether the build is still running: a trial asked after it ended is refused. */
  running(): boolean;
  /** `repair` for a repair build, else `test` (the default): the phase its offline-first trials run under. */
  phase?: AutomationStudioOfflineTrialPhase | undefined;
}): ReturnType<typeof automationStudioSubflowTrialPort> {
  const { ref, environment, binding } = input;
  const { projectId, flowId } = environment;
  const source = { records: input.records, ref };
  // The arrival every phase of the build takes (header).
  const arrival = AutomationStudioProjectBuildPhaseStart.arrival(binding.runsNodes?.arrival, environment);
  const ports: AutomationStudioSubflowTrialPorts = {
    ...environment,
    ...automationStudioProjectBuildTrialReads(binding, projectId, flowId),
    // Every trial's run goes to the build's start first, so it starts on a loaded start page (header, t578).
    ...(arrival ? { arrival } : {}),
    openSession: async ({ runId, metadata }) => await admitAutomationStudioBuildTrialSession({
      knownBuild: (buildId) => buildId === ref.buildId && input.running(),
      leases: input.leases,
      startRuntimeSession: () => environment.openSession({ runId, metadata })
    }, { buildId: ref.buildId, briefId: briefOf(metadata), lease: AutomationStudioHostLeaseScope.current() }),
    predecessorProposals: async (scope) => input.proposals.predecessors(scope),
    // A predecessor proposal an amendment kept still prepares the entry (t590).
    keptUnder: (subflowKey, madeUnder, planDigest) => input.proposals.keptUnder?.(subflowKey, madeUnder, planDigest) === true,
    currentPlanDigest: async (buildId) => buildId === ref.buildId ? (await input.records.read(ref))?.record.plans.at(-1)?.plan.digest ?? null : null,
    judge: async ({ summary, scope, successCheck, possiblyLasting }) => {
      // The steps that prepared the entry, where predecessors ran in the trial (header, t599).
      const entry = AutomationStudioProjectBuildTaskChecklist.entry(summary, scope.predecessors.length ? input.proposals.predecessors(scope) : []);
      return await automationStudioBuildTestJudge({
        provider: input.judge.provider, timeoutMs: input.judge.timeoutMs, instructions: [scopeInstruction(scope, successCheck, projectId, flowId, entry !== undefined)],
        deniedEvidenceKeys: binding.deniedEvidenceKeys, projectId, flowId, signal: input.judge.signal
      })({ summary, taskChecklist: await AutomationStudioProjectBuildTaskChecklist.subflow(source, scope, entry, possiblyLasting) });
    }
  };
  const trials = automationStudioSubflowTrialPort(ref.buildId, ports);
  // The offline-first factory beside the live port, over the same ports (header, P6); it reads the live records.
  const offline = automationStudioOfflineFirstSubflow({ buildId: ref.buildId, ports, installation: AutomationStudioOfflineTrialInstallation.current(), phase: input.phase ?? "test", liveRecords: () => trials.records() });
  // Each trial this port answered, until its gate tells the verdict it kept (header, t634).
  const answered = new Map<string, Pick<AutomationStudioSubflowTrialRequest, "scope" | "proposal">>();
  const answer = (request: Pick<AutomationStudioSubflowTrialRequest, "scope" | "proposal">): void => {
    const at = trialKey(request.scope.briefId, request.proposal.revision, request.proposal.digest);
    answered.delete(at);
    answered.set(at, { scope: request.scope, proposal: request.proposal });
    while (answered.size > MAX_ANSWERED) answered.delete(answered.keys().next().value!);
  };
  const run = async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => {
    const result = await trials.port(request);
    answer(request);
    // How its start was made, as every phase is told (header).
    const predecessors = request.scope.predecessors.length ? { keys: request.scope.predecessors, prepared: result.entryPrepared } : undefined;
    const phaseStart = AutomationStudioProjectBuildPhaseStart.trialStart({ phase: "subflow_trial", feedback: result.feedback, arrival, startLocation: environment.startLocation, predecessors });
    return { ...result, feedback: { ...result.feedback, phaseStart } };
  };
  // The inner port's environment kind, written as the port is made, for the gate to read (header, U7).
  const environmentKind = trials.port.environmentKind;
  // A failure the gate keeps from the recording is a trial this build answered too: the proposals learn its verdict (header, P6).
  const offlineFirst: AutomationStudioSubflowTrialPreparingPort["offlineFirst"] = async (request) => {
    const offered = await offline.offlineFirst(request);
    if (offered.kind === "kept") answer(request);
    return offered;
  };
  const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(run, { environmentKind, offlineFirst });
  // The start hook, ahead of the gate's reset check, is the inner port's (`../subflow-trial/port.ts`).
  if (trials.port.prepareStart) port.prepareStart = trials.port.prepareStart;
  port.admissionPredecessors = (scope) => input.proposals.predecessors(scope).flatMap((proposal) => proposal.subflows);
  // The gate's verdict of a trial this port answered is the one the proposals keep (header, t634).
  port.weighed = ({ answer }) => {
    const at = trialKey(answer.identity.briefId, answer.revision, answer.digest);
    const asked = answered.get(at);
    if (!asked) return;
    answered.delete(at);
    input.proposals.trialled(asked.scope, asked.proposal, answer.verdict);
  };
  // The offline judge's spend counts with the live trials' (header, P6); `records` stays the live port's.
  const spent = (): ReturnType<typeof trials.spent> => sumSpend(trials.spent(), offline.spent());
  return { ...trials, port, spent };
}

type Spend = ReturnType<typeof automationStudioSubflowTrialPort>["spent"] extends () => infer S ? S : never;

const sumSpend = (a: Spend, b: Spend): Spend => ({
  calls: a.calls + b.calls, inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens,
  totalTokens: a.totalTokens + b.totalTokens, estimatedCostUsd: a.estimatedCostUsd + b.estimatedCostUsd
});

/** The most trials awaiting their gate's verdict at once; a brief's gate tells each before its next trial. */
const MAX_ANSWERED = 200;

const trialKey = (briefId: string, revision: number, digest: string): string => JSON.stringify([briefId, revision, digest]);

/** The brief a partial trial's session is marked with (`../subflow-trial/run.ts`, `metadata.subflowTrial`). */
function briefOf(metadata: Record<string, unknown>): string {
  const marker = metadata.subflowTrial;
  const briefId = marker && typeof marker === "object" && !Array.isArray(marker) ? (marker as Record<string, unknown>).briefId : undefined;
  return typeof briefId === "string" ? briefId : "";
}

/** The one instruction the scoped judge reads: the brief's parts in the person's own words, and the subflow's success check, saying whose it is; and, where `entered`, that earlier subflows prepared its entry. */
function scopeInstruction(scope: AutomationStudioSubflowScope, successCheck: AutomationStudioSubflowTrialJudgeInput["successCheck"], projectId: string, flowId: string, entered: boolean): AutomationStudioFlowInstruction {
  const parts = scope.parts.map((part) => `- ${part.text}`).join("\n");
  const check = !successCheck ? "" : successCheck.from === "plan"
    ? `\nIts success check: ${JSON.stringify(successCheck.check)}`
    : `\nIts success check, as its builder proposed it (the plan gives none): ${JSON.stringify(successCheck.check)}`;
  // With predecessors whose steps are in the trial, it ran them first to prepare its entry (header, t599).
  const ran = entered
    ? `This trial ran the subflow "${scope.subflowKey}" of a larger Flow, after the earlier subflows that prepare its entry (taskChecklist.entry), which are not judged here.`
    : `This trial ran only the subflow "${scope.subflowKey}" of a larger Flow.`;
  return {
    schemaVersion: "0.1", instructionId: `project-scope.${scope.briefId}`, title: `Subflow ${scope.subflowKey}`,
    body: `${ran} Judge only whether it did these parts of the task:\n${parts}${check}`,
    scope: { kind: "flow", projectId, flowId }, priority: 100, status: "active", requirement: "required", createdAt: 0, updatedAt: 0
  };
}
