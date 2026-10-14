import { observeAutomationStudioEvidenceLoop } from "../../activity/index.ts";
import { AutomationStudioFlowBootstrapGenerationError, flowBootstrapEvidenceLoopFailure, flowBootstrapEvidenceUnusableDecisionFailure, flowBootstrapPhaseFailure } from "../../flow-bootstrap/index.ts";
import type { AutomationStudioCandidateTrialResult } from "../../flow-bootstrap/candidate/index.ts";
import { automationStudioProjectActiveInstructionSources, automationStudioProjectDigest, automationStudioProjectHostLeaseScope, createAutomationStudioProjectDispatcher, runAutomationStudioProjectSupervisorLoop, type AutomationStudioProjectBuildRef } from "../../project-agents/index.ts";
import { automationStudioCandidateStallCode } from "../candidate-failure/index.ts";
import type { AutomationStudioFlowCandidateDraftRecord } from "../candidate-drafts/index.ts";
import { automationStudioFlowBootstrapUnusableDecisions, type generateAutomationStudioFlowCandidateDraft } from "../flow-bootstrap-commands/index.ts";
import { AutomationStudioProjectBuildActsRecord } from "./acts-record.ts";
import { automationStudioProjectBuildBriefCalls } from "./brief-calls.ts";
import { automationStudioProjectBuildBriefPorts } from "./brief-ports.ts";
import { AutomationStudioProjectBuildDecisions } from "./decisions.ts";
import { automationStudioProjectBuildDraftRecord } from "./draft-record.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_LOCAL_HOST } from "./local-host.ts";
import { AutomationStudioProjectBuildProposals } from "./proposals.ts";
import { automationStudioProjectBuildRecords } from "./records.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE } from "./reserve.ts";
import { automationStudioProjectBuildSubflowTrials } from "./subflow-trials.ts";
import { AutomationStudioProjectBuildTaskChecklist } from "./task-checklist.ts";
import type { AutomationStudioProjectBuildPorts } from "./types.ts";

// A project build (automation-project-agents-plan, unit A5c): the project
// supervisor (`project-agents/supervisor/`) plans the Flow's subflows, the
// dispatcher (`project-agents/dispatch/`) runs a bounded builder per brief, and
// the supervisor assembles their proposals into one whole candidate and tests
// that exact revision. It takes the candidate build's own input and answers
// as the candidate build does -- the saved draft and the whole trial it stands
// on -- so the service promotes it through the same path, unchanged.
//
// Shared once per build: the activity, cancellation root, project database
// hold and generation lock (all around the call), the binding, instruction
// authority, provider, loop limits and creation purse (in `draft`), the project
// ledger, the whole candidate's trial port and judge (`draft.trial`), the build
// record and one host scheduler per host port. Per brief: everything in
// `./brief-ports.ts`. Builders are never started through the service's
// generation entry: its generation lock is not re-entrant.
//
// How it ends. A completion on a yes for the latest assembled revision is
// saved as the draft with that trial, for the caller to promote. A supervisor
// that ended honestly, or stopped, with an assembled candidate keeps it as a
// draft too, with no yes to promote on. With none, the build fails as the
// candidate build does: the loop's own failure, or Core's account of the
// ending. A cancel is a cancel. Only a written Flow from nothing: a repair's
// re-author is refused until A7.
//
// The supervisor keeps back the judged whole run and one repair round
// (`./reserve.ts`), which no brief's allowance can be carved from. Every
// lasting act the project ledger records is written into the build record as
// it is recorded (`./acts-record.ts`); the build waits for those writes before
// it saves its draft, so a record that could not be written fails the build as
// a dispatcher's record write does.

type DraftInput = Parameters<typeof generateAutomationStudioFlowCandidateDraft>[0];
type DraftResult = { record: AutomationStudioFlowCandidateDraftRecord; trial: AutomationStudioCandidateTrialResult | undefined };

export async function runAutomationStudioProjectBuild(project: AutomationStudioProjectBuildPorts, draft: DraftInput): Promise<DraftResult> {
  if (project.repair) throw new Error("Project authoring cannot repair a run yet.");
  if (!draft.trial || !draft.candidateId) throw new Error("A project build needs the whole candidate's trial runner.");
  const purse = draft.loop.purse;
  if (!purse) throw new Error("A project build runs under the Flow's creation purse.");
  const { projectId, flowId } = draft.submission;
  const candidateId = draft.candidateId;
  const ref: AutomationStudioProjectBuildRef = { projectId, flowId, buildId: project.buildId };
  const records = automationStudioProjectBuildRecords(project);
  const host = project.host ?? AUTOMATION_STUDIO_PROJECT_BUILD_LOCAL_HOST;
  const proposals = new AutomationStudioProjectBuildProposals();
  const { binding } = project;
  let running = true;
  const judge = { provider: draft.harness.provider, timeoutMs: draft.harness.timeoutMs, signal: draft.loop.signal };
  const subflowTrials = automationStudioProjectBuildSubflowTrials({ ref, environment: project.trialEnvironment, binding, judge, records, proposals, leases: automationStudioProjectHostLeaseScope(host).scheduler, running: () => running });
  const decisions = new AutomationStudioProjectBuildDecisions(draft, () => [draft.trialSpend?.(), subflowTrials.spent()]);
  const acts = AutomationStudioProjectBuildActsRecord.of(project.ledger);
  acts.bind(records, ref);
  // The whole trials' judge reads the task checklist from this build's record (unit A9, `./task-checklist.ts`).
  AutomationStudioProjectBuildTaskChecklist.bind(project.trialEnvironment, { records, ref });
  const accounting = () => decisions.accounting();
  const dispatch = createAutomationStudioProjectDispatcher({
    record: { store: records, ref }, purse, cancellation: project.cancellation, host, ledger: project.ledger,
    ports: automationStudioProjectBuildBriefPorts({ project, draft, decisions, subflowTrial: subflowTrials.port, accounting, acts }),
    maxCalls: automationStudioProjectBuildBriefCalls
  });
  const sources = automationStudioProjectActiveInstructionSources(project.instructions);
  const { purse: _purse, signal: _signal, budget: _budget, ...loop } = draft.loop;
  const maxIterations = loop.maxIterations;
  const decide = (completionSchema: Parameters<AutomationStudioProjectBuildDecisions["decide"]>[0]["completionSchema"]) => decisions.decide({ runHarness: draft.runHarness, wrapDecision: draft.wrapDecision, completionSchema });
  const unusableDecisions = automationStudioFlowBootstrapUnusableDecisions({
    maxConsecutiveUnusableDecisions: draft.maxConsecutiveUnusableDecisions, maxIterations, callerEnding: (progress) => draft.ending(progress, accounting()),
    stalled: (progress) => flowBootstrapEvidenceUnusableDecisionFailure(progress, accounting(), automationStudioCandidateStallCode(progress.issueCodes))
  });
  const outcome = await runAutomationStudioProjectSupervisorLoop({
    ports: {
      build: ref, record: records, instructionDigest: automationStudioProjectDigest("project.instructions.v1", sources), sources, dispatch,
      proposals: (proposal) => proposals.byRef(proposal), projectLedger: project.ledger, submission: draft.submission,
      trial: { candidateId, port: draft.trial }, purse,
      reserve: { calls: AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE.calls, unpriced: { ...AUTOMATION_STUDIO_PROJECT_BUILD_RESERVE.unpriced } },
      ...(draft.loop.signal ? { signal: draft.loop.signal } : {})
    },
    loop: { ...loop, unusableDecisions, decide: decide(undefined) },
    observe: (observed) => observeAutomationStudioEvidenceLoop({ ...observed, decide: decide(observed.completionSchema) })
  }).finally(() => {
    running = false;
  });
  const spent = accounting();
  draft.progress(spent, "post_provider_validation");
  if (outcome.ending?.outcome === "cancelled" || draft.loop.signal?.aborted) throw new DOMException("Build stopped. The Flow was not promoted.", "AbortError");
  // The whole trials' acts, recorded under the supervisor, are written last of all (`./acts-record.ts`).
  acts.sync();
  await acts.flushed();
  const candidate = outcome.candidate;
  if (!candidate) {
    if (outcome.loop && !outcome.loop.ok) throw draft.ending(outcome.loop, spent) ?? flowBootstrapEvidenceLoopFailure(outcome.loop, spent);
    const failure = flowBootstrapPhaseFailure("post_provider_validation", spent, "flow_bootstrap.post_provider_validation_failed");
    throw new AutomationStudioFlowBootstrapGenerationError({ ...failure.diagnostic, issueCodes: [`project.build_${outcome.ending?.outcome ?? "blocked"}`] });
  }
  const current = await draft.currentBinding();
  if (current.executionDigest !== candidate.baseDependencyDigest || current.settingsRevision !== draft.baseSettingsRevision) throw new Error("FLOW_BOOTSTRAP_STALE: Flow or settings changed during candidate generation.");
  draft.progress(spent, "persistence");
  const record = await draft.store.save(automationStudioProjectBuildDraftRecord({
    candidateId, projectId, flowId, candidate, accounting: spent, sourceInstructionIds: draft.sourceInstructionIds, instructionText: draft.submission.instructionText ?? "",
    baseSettingsRevision: draft.baseSettingsRevision, ...(draft.originalSource ? { originalSource: draft.originalSource } : {})
  }), draft.loop.signal);
  // Only a completion stands on its yes: a supervisor that ended without completing promotes nothing, whatever its last trial said.
  const trial = outcome.status === "candidate" || outcome.trial?.verdict !== "yes" ? outcome.trial : undefined;
  return { record, trial };
}
