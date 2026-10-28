// One offline trial of a subflow builder's proposal (t769 P6, F2): the
// partial trial runner, unchanged, with its environment a recorded trace --
// the twin of the whole candidate's offline trial (`./run.ts`).
//
// 1. The session. Exactly the whole candidate's (`./matcher-session.ts`):
//    never in exploration (`offline_not_allowed_in_phase`), never on a derived
//    source (`source_not_live`), the session view the trace recorded, else the
//    one the caller supplied (a declared normalization), else refused
//    (`incomplete_capture`), and the caller's reevaluator, if any -- all
//    decided before anything runs or any judge is paid.
// 2. The run. `runAutomationStudioSubflowTrial` with `ports.environment` set
//    to that environment and its clock: the same code path as a live partial
//    trial (`../subflow-trial/run.ts`, U7). Its predecessors' proposals and
//    then the brief's own run in the trace environment, every command reaches
//    the matcher through the trial's gateway, and the scoped judge is asked
//    about the new run's evidence (T22). It runs no start hook for a non-live
//    environment (Decision 6) and is handed no prepared start: no site reset
//    precedes an offline trial. The trial's episode records a derived trace
//    naming this source (T24).
// 3. The end. The answer is the partial trial's outcome beside the trial
//    evidence result (`./evidence-result.ts`, U5), bound to the brief's
//    structure plan digest unless the caller names a goal contract: the scoped
//    judge asks about that plan's parts and success check. A command the trace
//    cannot answer (an added or changed command, T09) is a gap there, and any
//    gap leaves the result inconclusive; nothing recorded after it is fed.
//
// A cancelled build is not a verdict: the abort the runner throws goes on.

import { runAutomationStudioSubflowTrial } from "../subflow-trial/index.ts";
import type { AutomationStudioOfflineSubflowTrialInput, AutomationStudioOfflineSubflowTrialOutcome } from "./contracts.ts";
import { automationStudioOfflineTrialEvidenceResult } from "./evidence-result.ts";
import { automationStudioOfflineTrialMatcherSession } from "./matcher-session.ts";

export async function runAutomationStudioOfflineSubflowTrial(input: AutomationStudioOfflineSubflowTrialInput): Promise<AutomationStudioOfflineSubflowTrialOutcome> {
  const { request, ports } = input;
  request.signal.throwIfAborted();
  const session = await automationStudioOfflineTrialMatcherSession(input, (environment) => runAutomationStudioSubflowTrial(request, { ...ports, environment, now: environment.now }, undefined, input.judgeInputTokens));
  if (session.status === "refused") return session;
  const { trial, matcher, sessionView, normalizations, supported, reevaluated, sourceEpisodeId } = session;
  const evidence = automationStudioOfflineTrialEvidenceResult({
    trial,
    matcher,
    sourceEpisodeId,
    goalContractVersion: input.goalContractVersion ?? request.scope.planDigest
  });
  return { status: "ran", trial, evidence, matcher, sessionView, normalizations, supported, reevaluated };
}
