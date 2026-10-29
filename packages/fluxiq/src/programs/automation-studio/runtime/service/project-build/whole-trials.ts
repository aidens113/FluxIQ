import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import { automationStudioCandidateTrialOffline, type AutomationStudioCandidateTrialPort } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmProvider } from "../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../result-verification/index.ts";
import { automationStudioCandidateTrialPort, type AutomationStudioCandidateTrialPorts } from "../candidate-trial/index.ts";
import { AutomationStudioOfflineTrialInstallation, automationStudioOfflineFirstWhole } from "../offline-first/index.ts";
import type { AutomationStudioOfflineTrialPhase } from "../offline-trial/index.ts";
import { automationStudioWholeTrialPorts } from "../trial-ports/index.ts";
import { AutomationStudioProjectBuildActsRecord } from "./acts-record.ts";
import { AutomationStudioProjectBuildPhaseStart } from "./phase-start.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER } from "./supervisor-ledger.ts";
import { AutomationStudioProjectBuildTaskChecklist } from "./task-checklist.ts";
import { AutomationStudioProjectBuildTogglesRecord } from "../project-build-toggles/index.ts";

// The whole candidate's trial runner and judge, once per build (t340; unit
// A5c moved them out of `service.ts`): each trial runs the exact submitted
// candidate once, from its declared start (the deployment's start hook first,
// when set: `prepareStart`), in a session of its own, and the build-test judge
// sees only that run. A candidate build and a project build use the same one.
//
// **A project build's whole trials leave acts under the supervisor.** Given
// the project ledger, every lasting act a whole trial reports is recorded in
// the supervisor's own ledger of it, so the build's snapshot -- which the
// supervisor's trial refusal and a reset brief read -- holds it until a reset
// has undone it (A5a report, open question 3), and written into the build
// record with each step's classes (`./acts-record.ts`).
//
// **A project build's whole trials are judged against its task checklist**
// (unit A9): the build record's latest task spec, every part and what nobody
// asked for, sent beside the instructions (`./task-checklist.ts`, which says
// how these trials find the record). A candidate build's judge is sent exactly
// what it always was.
//
// **A project build's whole trial is told its start (t593).** Its feedback says
// under `phaseStart`, in the words every phase of the build is told
// (`./phase-start.ts`), whether the deployment's start hook ran and whether
// the run opened by loading the build's start location -- which the assembled
// Flow's first step does (`project-agents/supervisor/assembly.ts`). On A8
// bigbox `run-mv8c7unr-42a8456d` the whole trial was told only `start: reset`
// while it ran on the page the last subflow trial left. A candidate build's
// feedback is as it was.
//
// **The wrapped port keeps the inner port's environment kind (traces and
// offline trials, U7).** The port returned here carries the inner port's
// `environmentKind`, so the trial gate still sees an offline trial as offline
// (no start hook, no site reset, its yes evidence only). An offline trial's
// acts never happened on the site, so they are written to neither ledger
// (Decision 6).
//
// **Offline-first trials (P6, t769; D48, revising D40).** Every whole port
// carries the offline-first factory's `offlineFirst`, a project build's beside
// its start hook and environment kind, and the factory's judge spend joins the
// trials' (`../offline-first/`). The trial gate asks it before admission, the
// start hook and any reset; a failure the recording shows is kept and never
// reaches the port, so it writes nothing to either ledger -- nothing happened
// on the site. An offline yes never stands: the gate runs the trial live
// after it, so the final judged run is always a live yes.

/** What every trial is run with, from the service: the run, its session and its reads, without the judge. */
export type AutomationStudioProjectBuildTrialEnvironment = Omit<AutomationStudioCandidateTrialPorts, "judge" | "execute" | "readEndView" | "clearedControlHandles" | "deniedEvidenceKeys">;

export type AutomationStudioProjectBuildWholeTrials = ReturnType<typeof automationStudioCandidateTrialPort>;

export function automationStudioProjectBuildWholeTrials(input: {
  candidateId: string;
  environment: AutomationStudioProjectBuildTrialEnvironment;
  binding: AutomationStudioLlmEvidenceRuntimeBinding;
  /** The build's provider and per-call timeout: the judge's calls run under the build's, as its decisions do (t473). */
  judge: { provider: AutomationStudioLlmProvider; timeoutMs?: number | undefined; instructions: readonly AutomationStudioFlowInstruction[]; signal?: AbortSignal | undefined };
  /** A project build's lasting-act ledger; absent for a candidate build, whose trial gate keeps its own (`flow-bootstrap/site-reset/`). */
  ledger?: AutomationStudioSiteResetProjectLedger | undefined;
  /** `repair` for a repair build, else `test` (the default): the phase the offline-first trials run under (header). */
  phase?: AutomationStudioOfflineTrialPhase | undefined;
}): AutomationStudioProjectBuildWholeTrials {
  const { environment, binding } = input;
  const { projectId, flowId } = environment;
  const asked = automationStudioBuildTestJudge({ provider: input.judge.provider, timeoutMs: input.judge.timeoutMs, instructions: input.judge.instructions, deniedEvidenceKeys: binding.deniedEvidenceKeys, projectId, flowId, signal: input.judge.signal });
  const judge: typeof asked = async (judged) => {
    const taskChecklist = await AutomationStudioProjectBuildTaskChecklist.whole(environment);
    return await asked(taskChecklist ? { ...judged, taskChecklist } : judged);
  };
  // The whole ports, as the trial-ports seam a host uses outside a build makes them (`../trial-ports/whole-ports.ts`).
  const ports = automationStudioWholeTrialPorts({ environment, binding, judge });
  const trials = automationStudioCandidateTrialPort(input.candidateId, ports);
  // Every build's whole trials are offline-first (header, D48).
  const offlineFirst = automationStudioOfflineFirstWhole({ candidateId: input.candidateId, ports, installation: AutomationStudioOfflineTrialInstallation.current(), phase: input.phase ?? "test", liveRecords: () => trials.records() });
  // The offline judge's spend counts with the live trials'; `records` stays the live port's.
  const spent = () => sumSpend(trials.spent(), offlineFirst.spent());
  const ledger = input.ledger;
  if (!ledger) return { ...trials, port: Object.assign(trials.port, { offlineFirst: offlineFirst.offlineFirst }), spent };
  const arrival = AutomationStudioProjectBuildPhaseStart.arrival(binding.runsNodes?.arrival, environment);
  // An offline trial's acts never happened on the site (header, Decision 6).
  const offline = automationStudioCandidateTrialOffline(trials.port);
  // The build's one record of toggles, which the whole trials' presses are told to through the environment (`../project-build-toggles/toggles-record.ts`, t792).
  const togglesWritten = AutomationStudioProjectBuildTogglesRecord.of(AutomationStudioProjectBuildTogglesRecord.toggles(environment));
  const run: AutomationStudioCandidateTrialPort = async (request) => {
    let result: Awaited<ReturnType<AutomationStudioCandidateTrialPort>>;
    try {
      result = await trials.port(request);
    } finally {
      // What its presses told that record, written into the build record (t792).
      togglesWritten.sync();
    }
    if (!offline && result.acts?.length) {
      // Refresh original pre-effect scope authority without overwriting current evidence.
      ledger.forBrief(AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER).trialRan(result.acts, result.trialRunId);
      AutomationStudioProjectBuildActsRecord.of(ledger).trialRan(result.acts, result.trialRunId);
    }
    // How its start was made, as every phase of the build is told (header).
    const phaseStart = AutomationStudioProjectBuildPhaseStart.trialStart({ phase: "whole_trial", feedback: result.feedback, arrival, startLocation: environment.startLocation });
    return { ...result, feedback: { ...result.feedback, phaseStart } };
  };
  // The start hook stays on the port, so the supervisor's trial gate runs it before each whole trial as a candidate build's does.
  // The inner port's environment kind stays on it too, for the trial gate to read (header, U7), and so does the offline-first check (header, D48).
  const environmentKind = trials.port.environmentKind;
  const prepareStart = trials.port.prepareStart;
  const port: AutomationStudioCandidateTrialPort = Object.assign(run, { environmentKind, offlineFirst: offlineFirst.offlineFirst }, prepareStart ? { prepareStart } : {});
  return { ...trials, port, spent };
}

type Spend = AutomationStudioProjectBuildWholeTrials["spent"] extends () => infer S ? S : never;

const sumSpend = (a: Spend, b: Spend): Spend => ({
  calls: a.calls + b.calls, inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens,
  totalTokens: a.totalTokens + b.totalTokens, estimatedCostUsd: a.estimatedCostUsd + b.estimatedCostUsd
});
