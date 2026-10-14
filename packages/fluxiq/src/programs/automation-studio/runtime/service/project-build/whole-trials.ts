import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import type { AutomationStudioCandidateTrialPort } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSiteResetProjectLedger } from "../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmProvider } from "../../llm/index.ts";
import { automationStudioBuildTestJudge } from "../../result-verification/index.ts";
import { automationStudioCandidateTrialPort, type AutomationStudioCandidateTrialPorts } from "../candidate-trial/index.ts";
import { AutomationStudioProjectBuildActsRecord } from "./acts-record.ts";
import { AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER } from "./supervisor-ledger.ts";
import { AutomationStudioProjectBuildTaskChecklist } from "./task-checklist.ts";
import { automationStudioProjectBuildTrialReads } from "./trial-reads.ts";

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
}): AutomationStudioProjectBuildWholeTrials {
  const { environment, binding } = input;
  const { projectId, flowId } = environment;
  const asked = automationStudioBuildTestJudge({ provider: input.judge.provider, timeoutMs: input.judge.timeoutMs, instructions: input.judge.instructions, deniedEvidenceKeys: binding.deniedEvidenceKeys, projectId, flowId, signal: input.judge.signal });
  const judge: typeof asked = async (judged) => {
    const taskChecklist = await AutomationStudioProjectBuildTaskChecklist.whole(environment);
    return await asked(taskChecklist ? { ...judged, taskChecklist } : judged);
  };
  const trials = automationStudioCandidateTrialPort(input.candidateId, { ...environment, ...automationStudioProjectBuildTrialReads(binding, projectId, flowId), judge });
  const ledger = input.ledger;
  if (!ledger) return trials;
  const supervisor = ledger.forBrief(AUTOMATION_STUDIO_PROJECT_BUILD_SUPERVISOR_LEDGER);
  const run: AutomationStudioCandidateTrialPort = async (request) => {
    const result = await trials.port(request);
    if (result.acts?.length) {
      supervisor.trialRan(result.acts, result.trialRunId);
      AutomationStudioProjectBuildActsRecord.of(ledger).trialRan(result.acts, result.trialRunId);
    }
    return result;
  };
  // The start hook stays on the port, so the supervisor's trial gate runs it before each whole trial as a candidate build's does.
  const port: AutomationStudioCandidateTrialPort = trials.port.prepareStart ? Object.assign(run, { prepareStart: trials.port.prepareStart }) : run;
  return { ...trials, port };
}
